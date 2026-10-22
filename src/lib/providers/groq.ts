import type { Provider } from './types';
import { openAICompatible } from './openai';
export const GROQ_BASE = 'https://api.groq.com/openai/v1';
export const GROQ_DEFAULT = 'llama-3.3-70b-versatile';
export const GROQ_VISION = 'meta-llama/llama-4-scout-17b-16e-instruct';
const isVision = (m: string) => /llama-4|vision|scout|maverick/i.test(m);
/** Groq (OpenAI-compatible). Requests with images auto-switch to a vision model. */
export const groq: Provider = { id: 'groq', label: 'Groq', defaultModel: GROQ_DEFAULT,
  send: (req) => openAICompatible(GROQ_BASE, { ...req, model: req.messages.some((m) => m.images?.length) && !isVision(req.model) ? GROQ_VISION : req.model }) };
/** Lists chat-capable models available to the key (filters out whisper/tts/guard models). */
export async function groqModels(apiKey: string): Promise<string[]> {
  const r = await fetch(`${GROQ_BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!r.ok) throw new Error(`Groq models error ${r.status}`);
  return ((await r.json()).data || []).map((m: any) => m.id as string).filter((id: string) => !/whisper|tts|orpheus|playai|guard|prompt-guard/i.test(id)).sort();
}
