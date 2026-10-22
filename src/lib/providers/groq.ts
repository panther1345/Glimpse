import { type Provider, type SendReq, ProviderError } from './types';
import { openAICompatible } from './openai';
export const GROQ_BASE = 'https://api.groq.com/openai/v1';
/** Fallback only (used when /models can't be fetched). Real choices come from the key's live model list. */
export const GROQ_FALLBACK = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'llama-3.1-8b-instant'];
export const GROQ_DEFAULT = GROQ_FALLBACK[0];
const NON_CHAT = /whisper|tts|orpheus|playai|guard|safeguard|distil|compound/i;
const VISION = /scout|maverick|vision|vl\b|-vl-|qwen3\.\d+-\d+b/i;
const size = (id: string) => { const m = /(\d+(?:\.\d+)?)b\b/i.exec(id); return m ? +m[1] : 0; };
const fam = (id: string) => (/gpt-oss/i.test(id) ? 3 : /llama/i.test(id) ? 2 : /qwen/i.test(id) ? 1 : 0);
export function pickChat(list: string[]) {
  const c = list.filter((id) => !NON_CHAT.test(id));
  return c.sort((a, b) => fam(b) - fam(a) || size(b) - size(a))[0] || '';
}
export function pickVision(list: string[]) {
  return list.filter((id) => !NON_CHAT.test(id) && VISION.test(id)).sort((a, b) => size(b) - size(a))[0] || '';
}
/** Chat-capable models for this key, live from GET /models. */
export async function groqModels(apiKey: string): Promise<string[]> {
  const r = await fetch(`${GROQ_BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (r.status === 401 || r.status === 403) throw new ProviderError('auth', 'The Groq API key was rejected. Check it in Settings.');
  if (!r.ok) throw new Error(`Groq models error ${r.status}`);
  const all = ((await r.json()).data || []).filter((m: any) => m.active !== false).map((m: any) => m.id as string);
  try { await chrome.storage.local.set({ groqModels: { at: Date.now(), all } }); } catch { /* not in extension */ }
  return all.filter((id: string) => !NON_CHAT.test(id)).sort();
}
async function cached(apiKey: string, fresh = false): Promise<string[]> {
  if (!fresh) { try { const c = (await chrome.storage.local.get('groqModels')).groqModels as { at: number; all: string[] } | undefined; if (c && Date.now() - c.at < 6 * 3600e3) return c.all; } catch { /* */ } }
  await groqModels(apiKey);
  return ((await chrome.storage.local.get('groqModels')).groqModels as { all: string[] }).all;
}
async function saveModel(m: string) {
  try { const { settings } = await chrome.storage.local.get('settings') as any; if (settings) await chrome.storage.local.set({ settings: { ...settings, models: { ...(settings.models || {}), groq: m } } }); } catch { /* */ }
}
const notFound = (e: unknown) => e instanceof ProviderError && /404|model_not_found|does not exist|decommissioned|not have access/i.test(e.message);
// Free-tier Groq models can have tiny output-tokens-per-minute caps (e.g. 1000); the default max_tokens exceeds them.
const otpmCap: Record<string, number> = {};
async function* send(req: SendReq): AsyncIterable<string> {
  const img = req.messages.some((m) => m.images?.length);
  let list: string[] = [];
  try { list = await cached(req.apiKey); } catch (e) { if (e instanceof ProviderError) throw e; }
  const choose = (l: string[]) => {
    if (img) { if (VISION.test(req.model) && (!l.length || l.includes(req.model))) return req.model; return pickVision(l) || req.model; }
    return !l.length || l.includes(req.model) ? req.model : pickChat(l);
  };
  let model = choose(list); req.onModel?.(model);
  if (img && list.length && !pickVision(list) && !VISION.test(model)) throw new ProviderError('other', 'None of the Groq models on this key can read images. Use OpenAI or Gemini for screenshots/OCR.');
  if (!img && model !== req.model && model) { await saveModel(model); yield `_Groq model "${req.model}" isn't available on this key; using ${model}._\n\n`; }
  let started = false;
  try { for await (const t of openAICompatible(GROQ_BASE, { ...req, model, maxTokens: otpmCap[model] })) { started = true; yield t; } }
  catch (e) {
    const cap = !started && e instanceof ProviderError && /\(OTPM (\d+)\)/.exec(e.message);
    if (cap) { const n = Math.floor(+cap[1] * 0.9); otpmCap[model] = n; yield* openAICompatible(GROQ_BASE, { ...req, model, maxTokens: n }); return; }
    const w = !started && e instanceof ProviderError && e.code === 'rate_limit' ? /Retry in ([\d.]+)(m?s)/.exec(e.message) : null;
    const ms = w ? parseFloat(w[1]) * (w[2] === 'ms' ? 1 : 1000) : 0;
    if (w && ms <= 25000) {
      yield `_Groq per-minute limit reached on ${model}; retrying in ${Math.ceil(ms / 1000)}s…_\n\n`;
      await new Promise((r) => setTimeout(r, ms + 500));
      if (req.signal.aborted) return;
      yield* openAICompatible(GROQ_BASE, { ...req, model }); return;
    }
    if (started || !notFound(e)) throw e;
    const l = await cached(req.apiKey, true); const next = choose(l.filter((x) => x !== model));
    if (!next || next === model) throw e;
    if (!img) await saveModel(next);
    req.onModel?.(next); yield `_Groq model "${model}" isn't available; switched to ${next}._\n\n`;
    yield* openAICompatible(GROQ_BASE, { ...req, model: next });
  }
}
export const groq: Provider = { id: 'groq', label: 'Groq', defaultModel: GROQ_DEFAULT, send };
