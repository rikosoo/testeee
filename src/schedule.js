import { getSettings, listAppointments } from './db.js';

const pad = (n) => String(n).padStart(2, '0');
export const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const weekdayName = (dateStr) => DIAS[new Date(dateStr + 'T12:00:00').getDay()];

export function busySet(dateStr) {
  return new Set(
    listAppointments().filter((a) => a.date === dateStr && a.status === 'agendada').map((a) => a.time),
  );
}

/** Horários livres de uma data (YYYY-MM-DD), já descontando agendados e horários passados. */
export function freeSlots(dateStr, now = new Date()) {
  const s = getSettings();
  const day = new Date(dateStr + 'T12:00:00').getDay();
  const range = s.hours[day];
  if (!range) return [];
  const busy = busySet(dateStr);
  const out = [];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = dateStr === fmtDate(now);
  for (let m = toMin(range[0]); m + s.slotMinutes <= toMin(range[1]); m += s.slotMinutes) {
    const t = fromMin(m);
    if (busy.has(t)) continue;
    if (isToday && m <= nowMin + 30) continue;
    out.push(t);
  }
  return out;
}

export function upcomingAvailability(now = new Date()) {
  const s = getSettings();
  const lines = [];
  for (let i = 0; i < s.daysAhead; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const ds = fmtDate(d);
    const slots = freeSlots(ds, now);
    if (slots.length) lines.push(`${ds} (${weekdayName(ds)}): ${slots.join(', ')}`);
  }
  return lines.join('\n') || 'Sem horários livres nos próximos dias.';
}

export function validateBooking(date, time, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || ''))
    return 'data/hora em formato inválido';
  if (!freeSlots(date, now).includes(time)) return 'horário indisponível';
  return null;
}
