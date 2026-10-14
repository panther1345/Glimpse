import { type Provider, checkResponse, doFetch, sse, splitDataUrl } from './types';
let searchBlockedUntil = 0;
export const gemini: Provider = { id: 'gemini', label: 'Google Gemini', defaultModel: 'gemini-3.5-flash',
  async *send(req) {
    const sys = req.messages.filter((m) => m.role === 'system').map((m) => m.text).join('\n');
    const contents = req.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [
      ...(m.images || []).map((d) => { const { mime, b64 } = splitDataUrl(d); return { inline_data: { mime_type: mime, data: b64 } }; }),
      { text: m.text || ' ' }] }));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`;
    const call = (search: boolean) => doFetch(url, { method: 'POST', signal: req.signal, headers: { 'Content-Type': 'application/json', 'x-goog-api-key': req.apiKey },
      body: JSON.stringify({ contents, ...(sys ? { systemInstruction: { parts: [{ text: sys }] } } : {}), ...(search ? { tools: [{ google_search: {} }] } : {}) }) });
    const useSearch = !!req.webSearch && Date.now() > searchBlockedUntil;
    let r = await call(useSearch);
    let note = '';
    // Fallback: some models/keys reject the search tool or have no grounding quota (429); retry once without it.
    if (!r.ok && useSearch && [400, 403, 404, 429].includes(r.status)) {
      console.warn('Gemini web search rejected, retrying without it', r.status);
      searchBlockedUntil = Date.now() + 10 * 60_000;
      note = r.status === 429 ? '\n\n_Web search is unavailable for this API key right now (no search quota), so this answer is from the model alone._' : '\n\n_Web search was rejected by the API, so this answer is from the model alone._';
      r = await call(false);
    }
    for (let i = 0; i < 2 && r.status === 503; i++) { await new Promise((ok) => setTimeout(ok, 2500 * (i + 1))); r = await call(useSearch && !note); }
    await checkResponse(r);
    const sources = new Map<string, string>();
    for await (const d of sse(r)) {
      try {
        const c = JSON.parse(d).candidates?.[0];
        for (const p of c?.content?.parts || []) if (p.text && !p.thought) yield p.text as string;
        for (const g of c?.groundingMetadata?.groundingChunks || []) if (g.web?.uri) sources.set(g.web.uri, g.web.title || g.web.uri);
      } catch { /* skip */ }
    }
    if (note) yield note;
    if (sources.size) yield `\n\n**Sources:** ${[...sources].slice(0, 5).map(([u, t]) => `[${t}](${u})`).join(' · ')}`;
  } };
