import { getSettings } from '../../lib/storage';
const pcmToWav = (pcm: Uint8Array, rate: number) => {
  const h = new DataView(new ArrayBuffer(44)); const w = (o: number, t: string) => [...t].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); h.setUint32(4, 36 + pcm.length, true); w(8, 'WAVE'); w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, pcm.length, true);
  return new Blob([h.buffer, pcm as BlobPart], { type: 'audio/wav' });
};
export const AI_VOICES: Record<string, string[]> = { gemini: ['Kore', 'Puck', 'Charon', 'Aoede', 'Fenrir', 'Leda'], openai: ['alloy', 'nova', 'echo', 'shimmer', 'onyx', 'fable'] };
/** Generate speech with the user's provider (Gemini TTS or OpenAI TTS). Returns an object URL for an audio blob. */
export async function aiSpeech(text: string, voice: string): Promise<string> {
  const s = await getSettings(); const key = s.apiKeys[s.provider] || '';
  if (s.provider === 'openai') {
    const r = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: 'tts-1', voice: voice || 'alloy', input: text.slice(0, 4000) }) });
    if (!r.ok) throw new Error(`OpenAI TTS error ${r.status}`);
    return URL.createObjectURL(await r.blob());
  }
  if (s.provider === 'gemini') {
    let err = '';
    for (const model of ['gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts', 'gemini-2.5-flash-preview-tts']) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text: text.slice(0, 4000) }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || 'Kore' } } } } }) });
      if (!r.ok) { err = `Gemini TTS error ${r.status}`; continue; }
      const d = (await r.json()).candidates?.[0]?.content?.parts?.find((x: any) => x.inlineData)?.inlineData;
      if (!d) { err = 'Gemini returned no audio'; continue; }
      const bytes = Uint8Array.from(atob(d.data), (c) => c.charCodeAt(0));
      const mime: string = d.mimeType || '';
      return URL.createObjectURL(/L16|pcm/i.test(mime) ? pcmToWav(bytes, +(/rate=(\d+)/.exec(mime)?.[1] || 24000)) : new Blob([bytes], { type: mime || 'audio/wav' }));
    }
    throw new Error(err || 'Gemini TTS unavailable');
  }
  throw new Error('AI voice needs an OpenAI or Gemini key; use Browser voice instead.');
}
