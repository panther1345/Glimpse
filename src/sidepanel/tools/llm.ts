import type { Msg, PortOut } from '../../lib/messages';
/** Stream a one-off completion through the background worker (uses the user's own provider + key from Settings). */
export function runLLM(messages: Msg[], onText: (full: string) => void): { done: Promise<string>; stop: () => void } {
  const port = chrome.runtime.connect({ name: 'chat' });
  let acc = '';
  const done = new Promise<string>((res, rej) => {
    port.onMessage.addListener((m: PortOut) => {
      if (m.type === 'chunk') { acc += m.text; onText(acc); }
      else if (m.type === 'done') { port.disconnect(); res(acc); }
      else if (m.type === 'error') { port.disconnect(); rej(new Error(m.error.message)); }
    });
    port.onDisconnect.addListener(() => res(acc));
  });
  port.postMessage({ type: 'start', messages });
  return { done, stop: () => { try { port.postMessage({ type: 'stop' }); } catch { /* */ } } };
}
/** Read the current text selection of the active tab (needs site access; returns '' if unavailable). */
export async function pageSelection(): Promise<string> {
  try {
    const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!t?.id) return '';
    const [r] = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: () => String(getSelection() || '') });
    return (r?.result as string) || '';
  } catch { return ''; }
}
export async function pageText(): Promise<string> {
  try {
    const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!t?.id) return '';
    const [r] = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: () => document.body?.innerText || '' });
    return ((r?.result as string) || '').slice(0, 60000);
  } catch { return ''; }
}
