import type { Msg, ChatError } from '../messages';
export interface SendReq { messages: Msg[]; model: string; signal: AbortSignal; apiKey: string; baseUrl?: string; webSearch?: boolean }
export interface Provider { id: string; label: string; defaultModel: string; send(req: SendReq): AsyncIterable<string> }
export class ProviderError extends Error { constructor(public code: ChatError['code'], message: string) { super(message); } }

export async function checkResponse(r: Response) {
  if (r.ok) return;
  let detail = '';
  try { detail = (await r.text()).slice(0, 300); } catch { /* ignore */ }
  if (r.status === 401 || r.status === 403) throw new ProviderError('auth', 'The API key was rejected. Check it in Settings.');
  if (r.status === 429) throw new ProviderError('rate_limit', 'Rate limited by the provider. Wait a moment and retry.');
  throw new ProviderError('other', `Provider error ${r.status}: ${detail}`);
}
export async function doFetch(url: string, init: RequestInit) {
  try { return await fetch(url, init); }
  catch (e) { if ((e as Error).name === 'AbortError') throw e; throw new ProviderError('network', 'Network error. Check your connection and retry.'); }
}
/** Parse SSE stream, yielding each `data:` payload string. */
export async function* sse(r: Response): AsyncIterable<string> {
  const reader = r.body!.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) { const last = buf.trim(); if (last.startsWith('data:')) yield last.slice(5).trim(); break; }
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line.startsWith('data:')) yield line.slice(5).trim();
    }
  }
}
export const splitDataUrl = (d: string) => { const m = /^data:([^;]+);base64,(.*)$/.exec(d)!; return { mime: m[1], b64: m[2] }; };
