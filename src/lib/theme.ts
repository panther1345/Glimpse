import { getSettings, type Settings } from './storage';
export function applyTheme(t: Settings['theme']) {
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
export function watchTheme() {
  getSettings().then((s) => applyTheme(s.theme));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => getSettings().then((s) => applyTheme(s.theme)));
  chrome.storage.onChanged.addListener((c) => { if (c.settings) applyTheme((c.settings.newValue as any)?.theme ?? 'system'); });
}
