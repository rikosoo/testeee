import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-'));
const db = await import('../src/db.js');
const { handleIncoming } = await import('../src/bot.js');
const { freeSlots } = await import('../src/schedule.js');

let server, nextReply;
before(async () => {
  server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ message: { content: JSON.stringify(nextReply) } }));
  });
  await new Promise((r) => server.listen(0, r));
  db.load();
  db.setSettings({ ollamaUrl: `http://127.0.0.1:${server.address().port}` });
});
after(() => server.close());

const NOW = new Date('2030-01-07T09:00:00'); // segunda-feira
const JID = '5511999999999@s.whatsapp.net';

test('agenda: segunda tem horários, domingo não', () => {
  assert.ok(freeSlots('2030-01-07', NOW).length > 0);
  assert.equal(freeSlots('2030-01-06', NOW).length, 0);
});

test('bot agenda consulta válida e bloqueia duplicada', async () => {
  db.addMessage(JID, 'patient', 'quero marcar');
  nextReply = { reply: 'Confirmado!', action: { type: 'book', name: 'Maria Silva', date: '2030-01-08', time: '10:00' } };
  assert.equal(await handleIncoming(JID, 'x', NOW), 'Confirmado!');
  assert.equal(db.listAppointments().length, 1);

  const r = await handleIncoming(JID, 'x', NOW); // mesmo horário
  assert.match(r, /não está disponível/);
  assert.equal(db.listAppointments().length, 1);
});

test('bot cancela e faz handoff', async () => {
  nextReply = { reply: '', action: { type: 'cancel' } };
  await handleIncoming(JID, 'cancelar', NOW);
  assert.equal(db.listAppointments()[0].status, 'cancelada');
  nextReply = { reply: '', action: { type: 'handoff' } };
  await handleIncoming(JID, 'atendente', NOW);
  assert.equal(db.getContact(JID).botPaused, true);
});
