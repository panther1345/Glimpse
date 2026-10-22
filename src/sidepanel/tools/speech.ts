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
