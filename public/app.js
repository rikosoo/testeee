const $ = (s) => document.querySelector(s);
const api = (url, method = 'GET', body) =>
  fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || r.statusText); return j; });
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
let current = null;

// ---- abas
$('#tabs').onclick = (e) => {
  const t = e.target.dataset.t; if (!t) return;
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('hide', x.id !== t));
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b === e.target));
  ({ chat: loadContacts, agenda: loadAgenda, cfg: loadCfg })[t]?.();
};

// ---- status / QR / bot
function render(s) {
  const map = { connected: 'Conectado', qr: 'Aguardando QR', connecting: 'Conectando…', disconnected: 'Desconectado' };
  $('#pWa').textContent = 'WhatsApp: ' + map[s.state];
  $('#pWa').className = 'pill ' + (s.state === 'connected' ? 'ok' : s.state === 'disconnected' ? 'bad' : '');
  $('#bot').checked = s.botOn;
  $('#bot').disabled = s.state !== 'connected';
  $('#botLbl').textContent = s.botOn ? 'Bot LIGADO' : 'Bot desligado';
  $('#qr').classList.toggle('hide', !s.qr); $('#qrHelp').classList.toggle('hide', !s.qr);
  if (s.qr) $('#qr').src = s.qr;
  $('#btnConnect').classList.toggle('hide', s.state !== 'disconnected');
  $('#btnLogout').classList.toggle('hide', s.state === 'disconnected');
  $('#connMsg').textContent = s.state === 'connected' ? `✅ Conectado como +${s.me}` :
    s.state === 'qr' ? 'Escaneie o QR Code abaixo' : s.state === 'connecting' ? 'Conectando…' : 'Nenhum WhatsApp conectado.';
  $('#err').textContent = s.lastError || '';
}
async function loadAi() {
  const { ollama } = await api('/api/status');
  $('#pAi').textContent = 'IA: ' + (!ollama.online ? 'Ollama offline' : ollama.hasModel ? 'pronta' : 'modelo não baixado');
  $('#pAi').className = 'pill ' + (ollama.online && ollama.hasModel ? 'ok' : 'bad');
  $('#models').innerHTML = ollama.models.map((m) => `<option value="${m}">`).join('');
}
$('#btnConnect').onclick = () => api('/api/connect', 'POST');
$('#btnLogout').onclick = () => confirm('Desconectar o WhatsApp?') && api('/api/logout', 'POST');
$('#bot').onchange = (e) => api('/api/bot', 'POST', { on: e.target.checked }).catch((er) => { alert(er.message); e.target.checked = false; });

const es = new EventSource('/api/stream');
es.addEventListener('status', (e) => render(JSON.parse(e.data)));
es.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.jid === current) addBubble(m);
  if (!$('#chat').classList.contains('hide')) loadContacts();
});
loadAi(); setInterval(loadAi, 15000);

// ---- conversas
const phone = (jid) => jid.split('@')[0];
async function loadContacts() {
  const cs = await api('/api/contacts');
  $('#contacts').innerHTML = cs.map((c) => `<div data-j="${c.jid}" class="${c.jid === current ? 'on' : ''}"><b>${c.name || '+' + phone(c.jid)}</b>${c.botPaused ? ' ⏸' : ''}<br><span class="mut">+${phone(c.jid)}</span></div>`).join('') || '<div class="mut">Sem conversas ainda</div>';
}
$('#contacts').onclick = async (e) => {
  const d = e.target.closest('[data-j]'); if (!d) return;
  current = d.dataset.j; $('#chatName').textContent = d.querySelector('b').textContent;
  const cs = await api('/api/contacts'); $('#pause').checked = cs.find((c) => c.jid === current)?.botPaused;
  $('#msgs').innerHTML = ''; (await api(`/api/contacts/${current}/messages`)).forEach(addBubble); loadContacts();
};
function addBubble(m) {
  const d = document.createElement('div'); d.className = 'b ' + m.role; d.textContent = m.text;
  $('#msgs').append(d); $('#msgs').scrollTop = 1e9;
}
$('#pause').onchange = (e) => current && api(`/api/contacts/${current}`, 'PATCH', { botPaused: e.target.checked }).then(loadContacts);
$('#send').onclick = async () => {
  if (!current || !$('#txt').value.trim()) return;
  try { await api(`/api/contacts/${current}/send`, 'POST', { text: $('#txt').value }); $('#txt').value = ''; } catch (er) { alert(er.message); }
};
$('#txt').onkeydown = (e) => e.key === 'Enter' && $('#send').click();

// ---- agenda
async function loadAgenda() {
  const as = await api('/api/appointments');
  $('#appts').innerHTML = '<tr><th>Data</th><th>Hora</th><th>Paciente</th><th>Telefone</th><th>Status</th><th></th></tr>' +
    as.map((a) => `<tr><td>${a.date.split('-').reverse().join('/')}</td><td>${a.time}</td><td>${a.name}</td><td>${a.phone || ''}</td><td>${a.status}</td><td>${a.status === 'agendada' ? `<button class="s" data-c="${a.id}">Cancelar</button>` : ''}</td></tr>`).join('');
}
$('#appts').onclick = (e) => e.target.dataset.c && api('/api/appointments/' + e.target.dataset.c, 'DELETE').then(loadAgenda);
$('#aDate').onchange = async () => {
  const slots = await api('/api/slots/' + $('#aDate').value);
  $('#aTime').innerHTML = slots.map((s) => `<option>${s}</option>`).join('') || '<option value="">sem horários</option>';
};
$('#aAdd').onclick = async () => {
  try {
    await api('/api/appointments', 'POST', { name: $('#aName').value, phone: $('#aPhone').value.replace(/\D/g, ''), date: $('#aDate').value, time: $('#aTime').value });
    loadAgenda(); $('#aDate').onchange();
  } catch (er) { alert(er.message); }
};

// ---- configurações
async function loadCfg() {
  const s = await api('/api/settings');
  for (const k of ['ollamaUrl', 'model', 'slotMinutes', 'daysAhead', 'replyDelayMs', 'systemPrompt']) $('#' + k).value = s[k];
  $('#hours').innerHTML = DIAS.map((d, i) => `<div><label>${d}</label><input data-h="${i}" value="${s.hours[i] ? s.hours[i].join('-') : ''}"></div>`).join('');
}
$('#saveCfg').onclick = async () => {
  const hours = {};
  document.querySelectorAll('[data-h]').forEach((i) => (hours[i.dataset.h] = i.value.includes('-') ? i.value.split('-').map((x) => x.trim()) : null));
  await api('/api/settings', 'PUT', {
    ollamaUrl: $('#ollamaUrl').value, model: $('#model').value, systemPrompt: $('#systemPrompt').value, hours,
    slotMinutes: +$('#slotMinutes').value, daysAhead: +$('#daysAhead').value, replyDelayMs: +$('#replyDelayMs').value,
  });
  $('#saved').textContent = 'Salvo ✔'; loadAi(); setTimeout(() => ($('#saved').textContent = ''), 2500);
};
