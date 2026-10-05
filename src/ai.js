import { getSettings } from './db.js';

export async function ollamaChat(messages, { json = false } = {}) {
  const s = getSettings();
  const res = await fetch(`${s.ollamaUrl.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: s.model,
      messages,
      stream: false,
      ...(json ? { format: 'json' } : {}),
      options: { temperature: 0.3 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Ollama respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return data.message?.content ?? '';
}

export async function ollamaStatus() {
  const s = getSettings();
  try {
    const res = await fetch(`${s.ollamaUrl.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    const models = (data.models || []).map((m) => m.name);
    return { online: true, models, hasModel: models.some((m) => m === s.model || m.startsWith(s.model + ':')) };
  } catch {
    return { online: false, models: [], hasModel: false };
  }
}
