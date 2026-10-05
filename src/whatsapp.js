import path from 'node:path';
import { EventEmitter } from 'node:events';
import pino from 'pino';
import QRCode from 'qrcode';
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
} from '@whiskeysockets/baileys';
import * as db from './db.js';
import { handleIncoming } from './bot.js';

const AUTH_DIR = path.join(process.env.DATA_DIR || path.resolve('data'), 'auth');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const events = new EventEmitter();
export const status = { state: 'disconnected', qr: null, me: null, botOn: false, lastError: null };
let sock = null;
const queues = new Map(); // serializa o processamento por contato

function setStatus(patch) {
  Object.assign(status, patch);
  events.emit('status', publicStatus());
}
export const publicStatus = () => ({ ...status });

export function setBot(on) {
  setStatus({ botOn: !!on });
}

export async function connect() {
  if (sock) return;
  setStatus({ state: 'connecting', qr: null, lastError: null });
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: undefined }));
  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: Browsers.appropriate('Bot Clinica'),
    markOnlineOnConnect: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) setStatus({ state: 'qr', qr: await QRCode.toDataURL(qr, { width: 320, margin: 1 }) });
    if (connection === 'open') {
      setStatus({ state: 'connected', qr: null, me: sock.user?.id?.split(':')[0] ?? null });
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      sock = null;
      if (code === DisconnectReason.loggedOut) {
        setStatus({ state: 'disconnected', qr: null, me: null, botOn: false });
      } else {
        setStatus({ state: 'connecting', lastError: `reconectando (${code ?? '?'})` });
        setTimeout(() => connect().catch(console.error), 3000);
      }
    }
  });

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) onMessage(m);
  });
}

export async function logout() {
  try { await sock?.logout(); } catch {}
  sock = null;
  setStatus({ state: 'disconnected', qr: null, me: null, botOn: false });
}

export async function sendText(jid, text) {
  if (!sock) throw new Error('WhatsApp não conectado');
  await sock.sendMessage(jid, { text });
  events.emit('message', db.addMessage(jid, 'bot', text));
}

function onMessage(m) {
  const jid = m.key.remoteJid;
  if (!jid || m.key.fromMe || jid.endsWith('@g.us') || jid === 'status@broadcast' || jid.endsWith('@newsletter')) return;
  const text = m.message?.conversation || m.message?.extendedTextMessage?.text;
  const contact = db.getContact(jid);
  if (m.pushName && !contact.name) db.setContact(jid, { name: m.pushName });

  if (!text) {
    // áudio, imagem etc.: registra e, se o bot estiver ligado, pede texto
    if (status.botOn && !contact.botPaused) enqueue(jid, () => sendText(jid, 'Por enquanto consigo ler apenas mensagens de texto. Pode escrever, por favor?'));
    return;
  }
  events.emit('message', db.addMessage(jid, 'patient', text));
  if (!status.botOn || contact.botPaused) return;

  enqueue(jid, async () => {
    try {
      await sock?.presenceSubscribe(jid);
      await sock?.sendPresenceUpdate('composing', jid);
      const reply = await handleIncoming(jid, text);
      await sleep(db.getSettings().replyDelayMs);
      await sock?.sendPresenceUpdate('paused', jid);
      if (reply) await sendText(jid, reply);
    } catch (e) {
      console.error('Erro no bot:', e.message);
      setStatus({ lastError: `Erro na IA: ${e.message}` });
    }
  });
}

function enqueue(jid, fn) {
  const prev = queues.get(jid) ?? Promise.resolve();
  const next = prev.then(fn).catch(console.error);
  queues.set(jid, next);
  next.finally(() => queues.get(jid) === next && queues.delete(jid));
}
