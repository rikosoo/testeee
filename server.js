import express from 'express';
import * as db from './src/db.js';
import * as wa from './src/whatsapp.js';
import { ollamaStatus } from './src/ai.js';
import { freeSlots } from './src/schedule.js';

db.load();
const app = express();
app.use(express.json());
app.use(express.static('public'));

// Proteção opcional por senha (recomendado ao expor na internet)
const PASS = process.env.PANEL_PASSWORD;
app.use('/api', (req, res, next) => {
  if (!PASS) return next();
  const [, b64] = (req.headers.authorization || '').split(' ');
  const pw = Buffer.from(b64 || '', 'base64').toString().split(':').slice(1).join(':');
  if (pw === PASS) return next();
  res.set('WWW-Authenticate', 'Basic realm="painel"').status(401).end();
});

app.get('/api/status', async (_req, res) => res.json({ wa: wa.publicStatus(), ollama: await ollamaStatus() }));

// SSE: atualizações em tempo real (QR, status, mensagens)
app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (ev) => (data) => res.write(`event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`);
  const onStatus = send('status'), onMsg = send('message');
  wa.events.on('status', onStatus);
  wa.events.on('message', onMsg);
  onStatus(wa.publicStatus());
  const ka = setInterval(() => res.write(': ka\n\n'), 25000);
  req.on('close', () => { clearInterval(ka); wa.events.off('status', onStatus); wa.events.off('message', onMsg); });
});

app.post('/api/connect', async (_req, res) => { await wa.connect(); res.json(wa.publicStatus()); });
app.post('/api/logout', async (_req, res) => { await wa.logout(); res.json(wa.publicStatus()); });
app.post('/api/bot', (req, res) => {
  if (req.body.on && wa.status.state !== 'connected') return res.status(400).json({ error: 'Conecte o WhatsApp primeiro.' });
  wa.setBot(req.body.on);
  res.json(wa.publicStatus());
});

app.get('/api/settings', (_req, res) => res.json(db.getSettings()));
app.put('/api/settings', (req, res) => {
  const allowed = ['ollamaUrl', 'model', 'systemPrompt', 'slotMinutes', 'daysAhead', 'replyDelayMs', 'hours'];
  const patch = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  res.json(db.setSettings(patch));
});

app.get('/api/contacts', (_req, res) => res.json(db.listContacts()));
app.patch('/api/contacts/:jid', (req, res) => {
  db.setContact(req.params.jid, { botPaused: !!req.body.botPaused });
  res.json(db.getContact(req.params.jid));
});
app.get('/api/contacts/:jid/messages', (req, res) => res.json(db.listMessages(req.params.jid)));
app.post('/api/contacts/:jid/send', async (req, res) => {
  try { await wa.sendText(req.params.jid, String(req.body.text || '')); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/appointments', (_req, res) => res.json(db.listAppointments()));
app.post('/api/appointments', (req, res) => {
  const { name, phone, date, time } = req.body;
  if (!freeSlots(date).includes(time)) return res.status(400).json({ error: 'Horário indisponível' });
  res.json(db.addAppointment({ name, phone, date, time, jid: phone ? `${phone}@s.whatsapp.net` : '' }));
});
app.delete('/api/appointments/:id', (req, res) => res.json(db.cancelAppointment(req.params.id)));
app.get('/api/slots/:date', (req, res) => res.json(freeSlots(req.params.date)));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Painel em http://localhost:${port}`);
  // Se já houver sessão salva, reconecta sozinho (o bot sempre inicia DESLIGADO)
  import('node:fs').then(({ existsSync }) => {
    if (existsSync((process.env.DATA_DIR || 'data') + '/auth/creds.json')) wa.connect().catch(console.error);
  });
});
