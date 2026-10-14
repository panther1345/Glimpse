import type { Settings } from '../lib/storage';
export async function loadSettings(): Promise<Partial<Settings>> {
  try { const { settings } = await chrome.storage.local.get('settings'); return settings || {}; } catch { return {}; }
}
export function host(id: string) {
  document.getElementById(id)?.remove();
  const el = document.createElement('div'); el.id = id;
  el.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:0;left:0;';
  (document.documentElement || document.body).appendChild(el);
  return { el, root: el.attachShadow({ mode: 'open' }) };
}
export const send = (m: unknown) => { try { chrome.runtime.sendMessage(m).catch(() => {}); } catch { /* context invalidated */ } };
export async function saveSettingsPatch(patch: Record<string, unknown>) {
  const s = await loadSettings(); await chrome.storage.local.set({ settings: { ...s, ...patch } });
}
export function speak(text: string, voiceName?: string) {
  const ss = window.speechSynthesis; if (!ss) return;
  if (ss.speaking) { ss.cancel(); return; }
  const u = new SpeechSynthesisUtterance(text.replace(/[*_#`>]/g, ''));
  const v = ss.getVoices().find((x) => x.name === voiceName); if (v) { u.voice = v; u.lang = v.lang; }
  ss.speak(u);
}
const svg = (d: string) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const ICONS: Record<string, string> = {
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  highlight: svg('<path d="M4 20h7"/><path d="m14.5 4.5 5 5L11 18H6v-5z"/>'),
  read: svg('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>'),
  explain: svg('<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.4"/><path d="M12 17h.01"/>'),
  translate: svg('<path d="M4 6h9M8.5 4v2c0 4-2 7-4.5 8.5"/><path d="M6 10c1 2 3 3.5 5 4"/><path d="m13 20 4-9 4 9M14.3 17h5.4"/>'),
  summarize: svg('<path d="M5 6h14M5 10h14M5 14h9M5 18h6"/>'),
  answer: svg('<path d="M5 5h14v10H9l-4 4z"/><path d="M12 8v3M12 13h.01"/>'),
  code: svg('<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12"/>'),
  more: svg('<circle cx="12" cy="5.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="18.5" r="1.2" fill="currentColor"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  pin: svg('<path d="M9 4h6l-1 5 3 3v2H7v-2l3-3z"/><path d="M12 14v6"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>'),
  regen: svg('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>'),
  chat: svg('<path d="M4 5h16v11H8l-4 4z"/>'),
  enter: svg('<path d="M19 6v5a3 3 0 0 1-3 3H6"/><path d="m9 10-4 4 4 4"/>'),
  spark: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
};
