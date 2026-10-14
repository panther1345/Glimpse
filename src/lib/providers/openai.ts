import type { Msg } from '../messages';
import { type Provider, type SendReq, checkResponse, doFetch, sse } from './types';
export function toOpenAI(messages: Msg[]) {
  return messages.map((m) => m.images?.length
    ? { role: m.role, content: [{ type: 'text', text: m.text }, ...m.images.map((url) => ({ type: 'image_url', image_url: { url } }))] }
    : { role: m.role, content: m.text });
}
export async function* openAICompatible(base: string, req: SendReq) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (req.apiKey) headers.Authorization = `Bearer ${req.apiKey}`;
  const r = await doFetch(`${base.replace(/\/$/, '')}/chat/completions`, { method: 'POST', signal: req.signal, headers,
    body: JSON.stringify({ model: req.model, stream: true, messages: toOpenAI(req.messages) }) });
  await checkResponse(r);
  for await (const d of sse(r)) {
    if (d === '[DONE]') return;
    try { const t = JSON.parse(d).choices?.[0]?.delta?.content; if (t) yield t as string; } catch { /* skip */ }
  }
}
export const openai: Provider = { id: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini', send: (req) => openAICompatible('https://api.openai.com/v1', req) };
