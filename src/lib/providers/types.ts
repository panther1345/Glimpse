import type { Msg, ChatError } from '../messages';
export interface SendReq { messages: Msg[]; model: string; signal: AbortSignal; apiKey: string; baseUrl?: string; webSearch?: boolean; onModel?: (m: string) => void; maxTokens?: number }
export interface Provider { id: string; label: string; defaultModel: string; send(req: SendReq): AsyncIterable<string> }
export class ProviderError extends Error { constructor(public code: ChatError['code'], message: string) { super(message); } }

export async function checkResponse(r: Response) {
  if (r.ok) return;
  let detail = '';
  try { detail = (await r.text()).slice(0, 600); } catch { /* ignore */ }
  if (r.status === 401 || r.status === 403) throw new ProviderError('auth', 'The API key was rejected. Check it in Settings.');
  if (r.status === 429 || r.status === 413) {
    const otpm = /Request too large[\s\S]*?\(OTPM\): Limit (\d+)/.exec(detail); if (otpm) throw new ProviderError('rate_limit', `Output token limit ${otpm[1]}/min (OTPM ${otpm[1]}) on this model.`); const m = detail; const wait = /try again in ([\d.]+m?s)/i.exec(m)?.[1]; throw new ProviderError('rate_limit', `Rate limited by the provider${/per minute|TPM|RPM/i.test(m) ? ' (per-minute quota on this model)' : ''}. ${wait ? `Retry in ${wait}.` : 'Wait a moment and retry.'}`); }
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
