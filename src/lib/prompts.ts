import type { SelAction } from './messages';
export const DEFAULT_SCREENSHOT_Q = "What's in this screenshot? Answer any question it shows.";
export function buildPrompt(action: SelAction, text: string, lang: string): { prompt: string; autoSend: boolean } {
  switch (action) {
    case 'explain': return { prompt: `Explain this clearly and concisely:\n\n${text}`, autoSend: true };
    case 'translate': return { prompt: `Translate into ${lang}. Output only the translation:\n\n${text}`, autoSend: true };
    case 'summarize': return { prompt: `Summarize in a few bullet points:\n\n${text}`, autoSend: true };
    case 'answer': return { prompt: `Answer this question directly and accurately. Give the answer first, then a short explanation. If it is about current facts, use up-to-date information:\n\n${text}`, autoSend: true };
    case 'code': return { prompt: `Explain what this code does, step by step, and point out any bugs:\n\n${text}`, autoSend: true };
    case 'ask': return { prompt: text.split('\n').map((l) => `> ${l}`).join('\n') + '\n\n', autoSend: false };
  }
}
/** Only judges known URLs; unknown URLs are attempted and failures map to restricted_page. */
export const isRestrictedUrl = (url?: string) => !!url && ( /^(chrome|chrome-extension|edge|about|devtools|view-source|chrome-search):/i.test(url) ||
  /^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/i.test(url));

export const DIRECT_ANSWER_Q = 'Answer the question(s) in this screenshot directly. Give the final answer first, then a brief explanation.';
export const ACTION_TITLES: Record<SelAction, string> = { explain: 'Explain', translate: 'Translate', summarize: 'Summarize', ask: 'Ask Glimpse', answer: 'Answer this question', code: 'Explain code' };
