import { type Provider, checkResponse, doFetch, sse, splitDataUrl } from './types';
export const anthropic: Provider = { id: 'anthropic', label: 'Anthropic', defaultModel: 'claude-3-5-sonnet-latest',
  async *send(req) {
    const system = req.messages.filter((m) => m.role === 'system').map((m) => m.text).join('\n') || undefined;
    const messages = req.messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: [
      ...(m.images || []).map((d) => { const { mime, b64 } = splitDataUrl(d); return { type: 'image', source: { type: 'base64', media_type: mime, data: b64 } }; }),
      { type: 'text', text: m.text || ' ' }] }));
    const r = await doFetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: req.signal,
      headers: { 'Content-Type': 'application/json', 'x-api-key': req.apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: req.model, max_tokens: 4096, stream: true, system, messages }) });
    await checkResponse(r);
    for await (const d of sse(r)) {
      try { const j = JSON.parse(d); if (j.type === 'content_block_delta' && j.delta?.text) yield j.delta.text as string; } catch { /* skip */ }
    }
  } };
