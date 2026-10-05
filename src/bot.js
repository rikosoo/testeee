import { ollamaChat } from './ai.js';
import * as db from './db.js';
import { upcomingAvailability, validateBooking, weekdayName, fmtDate } from './schedule.js';

const OUTPUT_RULES = `
Responda SEMPRE com um JSON válido, sem texto fora dele, neste formato:
{"reply": "texto para o paciente", "action": null}
"action" pode ser:
- {"type":"book","name":"Nome do paciente","date":"YYYY-MM-DD","time":"HH:MM"}  -> SOMENTE quando o paciente já escolheu dia e horário e informou o nome.
- {"type":"cancel"} -> quando o paciente pedir para cancelar a consulta dele.
- {"type":"handoff"} -> quando o paciente pedir atendente/humano ou o assunto fugir do seu alcance.
Use apenas horários que estão na lista de horários livres. Nunca invente horários.`;

function buildSystem(now = new Date()) {
  const s = db.getSettings();
  return `${s.systemPrompt}

Hoje é ${fmtDate(now)} (${weekdayName(fmtDate(now))}), ${now.toTimeString().slice(0, 5)}.
Duração de cada consulta: ${s.slotMinutes} minutos.
Horários livres (data: horas):
${upcomingAvailability(now)}
${OUTPUT_RULES}`;
}

function parseJson(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return { reply: text.trim(), action: null };
}

/** Processa uma mensagem do paciente e devolve o texto a enviar (ou null para ficar em silêncio). */
export async function handleIncoming(jid, text, now = new Date()) {
  const history = db.recentMessages(jid, 12).map((m) => ({
    role: m.role === 'patient' ? 'user' : 'assistant',
    content: m.text,
  }));
  // a mensagem atual já foi salva em history
  const raw = await ollamaChat([{ role: 'system', content: buildSystem(now) }, ...history], { json: true });
  const out = parseJson(raw);
  let reply = String(out.reply ?? '').trim();
  const action = out.action && typeof out.action === 'object' ? out.action : null;

  if (action?.type === 'book') {
    const err = validateBooking(action.date, action.time, now);
    if (err || !action.name) {
      reply = err
        ? `Desculpe, esse horário não está disponível. Pode escolher outro?\n\n${upcomingAvailability(now).split('\n').slice(0, 3).join('\n')}`
        : 'Para confirmar, qual o seu nome completo?';
    } else {
      db.addAppointment({ jid, name: action.name, date: action.date, time: action.time, phone: jid.split('@')[0] });
      db.setContact(jid, { name: action.name });
      const [y, mo, d] = action.date.split('-');
      reply = reply || `Consulta confirmada para ${d}/${mo}/${y} às ${action.time}. Até lá!`;
    }
  } else if (action?.type === 'cancel') {
    const mine = db.listAppointments().find((a) => a.jid === jid && a.status === 'agendada' && a.date >= fmtDate(now));
    if (mine) db.cancelAppointment(mine.id);
    reply = reply || (mine ? 'Consulta cancelada. Se quiser remarcar é só avisar.' : 'Não encontrei consulta agendada no seu número.');
  } else if (action?.type === 'handoff') {
    db.setContact(jid, { botPaused: true });
    reply = reply || 'Certo, vou chamar alguém da recepção para continuar o atendimento.';
  }
  return reply || null;
}
