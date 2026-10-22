import { openDB, type IDBPDatabase } from 'idb';
import type { Msg } from './messages';

export type ProviderId = 'openai' | 'anthropic' | 'gemini' | 'custom';
export type Settings = {
  provider: ProviderId; apiKeys: Partial<Record<ProviderId, string>>; models: Partial<Record<ProviderId, string>>;
  baseUrl: string; translateLang: string; theme: 'system' | 'light' | 'dark'; launcher: boolean; launcherHiddenSites: string[]; selectionToolbar: boolean; selectionInInputs: boolean; answerInPopup: boolean;
  webSearch: boolean; pinned: string[]; voice: string;
};
export const DEFAULT_SETTINGS: Settings = {
  provider: 'openai', apiKeys: {}, models: {}, baseUrl: 'http://localhost:11434/v1', translateLang: 'English',
  theme: 'system', launcher: true, launcherHiddenSites: [], selectionToolbar: true, selectionInInputs: false, answerInPopup: true,
  webSearch: true, pinned: ['copy', 'highlight', 'explain'], voice: '',
};
export async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}
export async function saveSettings(patch: Partial<Settings>) {
  const s = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: s });
  return s;
}

export type Chat = { id: string; title: string; createdAt: number; updatedAt: number; model: string; messages: Msg[] };
let dbp: Promise<IDBPDatabase> | null = null;
const db = () => (dbp ??= openDB('glimpse', 1, { upgrade(d) { const s = d.createObjectStore('chats', { keyPath: 'id' }); s.createIndex('updatedAt', 'updatedAt'); } }));
export async function saveChat(c: Chat) { await (await db()).put('chats', c); }
export async function getChat(id: string) { return (await (await db()).get('chats', id)) as Chat | undefined; }
export async function listChats(): Promise<Chat[]> { return ((await (await db()).getAll('chats')) as Chat[]).sort((a, b) => b.updatedAt - a.updatedAt); }
export async function deleteChat(id: string) { await (await db()).delete('chats', id); }
export async function clearChats() { await (await db()).clear('chats'); }
export function searchChats(chats: Chat[], q: string) {
  const t = q.trim().toLowerCase();
  if (!t) return chats;
  return chats.filter((c) => c.title.toLowerCase().includes(t) || c.messages.some((m) => m.text.toLowerCase().includes(t)));
}
export const makeTitle = (s: string) => { const x = s.replace(/\s+/g, ' ').trim() || 'Screenshot question'; return x.length > 60 ? x.slice(0, 60) + '…' : x; };

/** Downscale to max 1600px long edge, JPEG 0.85 (for storage / sending). */
export async function downscale(dataUrl: string, max = 1600): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  const out = await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  return blobToDataUrl(out);
}
export function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(b); });
}
