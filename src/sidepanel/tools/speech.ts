/** Web Speech API dictation. Mic permission for the extension is granted once via mic.html. */
type Rec = { start(): void; stop(): void; onresult: ((e: any) => void) | null; onend: (() => void) | null; onerror: ((e: any) => void) | null; continuous: boolean; interimResults: boolean; lang: string };
export const speechSupported = () => !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
export async function ensureMic(): Promise<boolean> {
  try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); return true; }
  catch { chrome.tabs.create({ url: chrome.runtime.getURL('mic.html') }); return false; }
}
export function dictate(opts: { lang?: string; continuous?: boolean; onText: (finalText: string, interim: string) => void; onEnd?: () => void; onError?: (m: string) => void }) {
  const C = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const r: Rec = new C(); r.continuous = opts.continuous ?? true; r.interimResults = true; r.lang = opts.lang || navigator.language;
  let fin = '';
  r.onresult = (e) => { let interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) fin += t + ' '; else interim += t; } opts.onText(fin.trim(), interim); };
  r.onerror = (e) => opts.onError?.(e.error === 'not-allowed' ? 'Microphone blocked. Allow it in the tab that just opened, then try again.' : `Speech error: ${e.error}`);
  r.onend = () => opts.onEnd?.();
  r.start();
  return { stop: () => r.stop(), text: () => fin.trim() };
}

/** Record from the mic until ~1.5 s of silence after speech (max 25 s), then return the audio blob. */
export function recordUtterance(onLevel?: (speaking: boolean) => void): { done: Promise<Blob>; stop: () => void } {
  let stopFn = () => {};
  const done = (async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext(); const an = ctx.createAnalyser(); an.fftSize = 1024; ctx.createMediaStreamSource(stream).connect(an);
    const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' }); const chunks: Blob[] = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const ended = new Promise<void>((r) => (rec.onstop = () => r()));
    rec.start(250);
    const buf = new Uint8Array(an.fftSize); const t0 = Date.now(); let heard = false, lastLoud = Date.now();
    const iv = setInterval(() => {
      an.getByteTimeDomainData(buf); let s = 0; for (const v of buf) s += (v - 128) ** 2; const rms = Math.sqrt(s / buf.length);
      if (rms > 6) { heard = true; lastLoud = Date.now(); } onLevel?.(rms > 6);
      if ((heard && Date.now() - lastLoud > 1500) || Date.now() - t0 > 25000 || (!heard && Date.now() - t0 > 10000)) stopFn();
    }, 100);
    stopFn = () => { clearInterval(iv); if (rec.state !== 'inactive') rec.stop(); };
    await ended; stream.getTracks().forEach((t) => t.stop()); ctx.close();
    return heard ? new Blob(chunks, { type: 'audio/webm' }) : new Blob([]);
  })();
  return { done, stop: () => stopFn() };
}
