import fs from 'node:fs';
import path from 'node:path';

const DIR = process.env.DATA_DIR || path.resolve('data');
const FILE = path.join(DIR, 'db.json');

export const DEFAULT_PROMPT = `Você é a assistente virtual da clínica. Atenda os pacientes pelo WhatsApp de forma educada, acolhedora e objetiva, em português do Brasil.

Regras:
- Respostas curtas (no máximo 3 frases), no tom de WhatsApp.
- Nunca dê diagnóstico, receita ou orientação médica. Para isso, oriente a agendar consulta.
- Para agendar, peça o nome completo do paciente e ofereça horários livres da lista fornecida.
- Só confirme uma consulta depois que o paciente escolher dia e horário.
- Se o paciente pedir para falar com uma pessoa, encaminhe para a recepção.

Informações da clínica:
- Nome: Clínica Exemplo
- Endereço: Rua Exemplo, 123 - Centro
- Valor da consulta: R$ 200,00 (particular)
- Formas de pagamento: Pix, cartão e dinheiro`;

export const DEFAULTS = {
  ollamaUrl: process.env.OLLAMA_URL || 'http://127.0.0.1:11434',
  model: process.env.OLLAMA_MODEL || 'llama3.2:3b',
  systemPrompt: DEFAULT_PROMPT,
  slotMinutes: 30,
  daysAhead: 7,
  replyDelayMs: 1500,
  // 0 = domingo ... 6 = sábado. null = fechado
  hours: {
    0: null,
    1: ['08:00', '18:00'],
    2: ['08:00', '18:00'],
    3: ['08:00', '18:00'],
    4: ['08:00', '18:00'],
    5: ['08:00', '17:00'],
    6: null,
  },
};

let state = { settings: {}, contacts: {}, messages: [], appointments: [] };
let timer = null;

export function load() {
  fs.mkdirSync(DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    try {
      state = { ...state, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
    } catch (e) {
      fs.copyFileSync(FILE, FILE + '.corrompido');
      console.error('db.json inválido, backup salvo em db.json.corrompido');
    }
  }
}

export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, FILE);
  }, 200);
}

export const getSettings = () => ({ ...DEFAULTS, ...state.settings });

export function setSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  save();
  return getSettings();
}

// ---------- contatos / mensagens ----------
export function getContact(jid) {
  return (state.contacts[jid] ??= { jid, name: '', botPaused: false, lastAt: 0 });
}
export const listContacts = () =>
  Object.values(state.contacts).sort((a, b) => b.lastAt - a.lastAt);

export function setContact(jid, patch) {
  Object.assign(getContact(jid), patch);
  save();
}

export function addMessage(jid, role, text) {
  const m = { id: Date.now() + Math.random(), jid, role, text, at: Date.now() };
  state.messages.push(m);
  if (state.messages.length > 5000) state.messages.splice(0, state.messages.length - 5000);
  getContact(jid).lastAt = m.at;
  save();
  return m;
}
export const listMessages = (jid) => state.messages.filter((m) => m.jid === jid);
export const recentMessages = (jid, n = 12) => listMessages(jid).slice(-n);

// ---------- agenda ----------
export const listAppointments = () =>
  [...state.appointments].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

export function addAppointment(a) {
  const item = { id: Date.now().toString(36), createdAt: Date.now(), status: 'agendada', ...a };
  state.appointments.push(item);
  save();
  return item;
}
export function cancelAppointment(id) {
  const a = state.appointments.find((x) => x.id === id);
  if (a) { a.status = 'cancelada'; save(); }
  return a;
}
