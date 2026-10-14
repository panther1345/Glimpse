import type { RuntimeMsg, CaptureReply, PortIn, PortOut, SelAction, ChatError } from '../lib/messages';
import { getSettings } from '../lib/storage';
import { buildPrompt } from '../lib/prompts';
import { PROVIDERS, ProviderError } from '../lib/providers';
import { isRestrictedUrl, DIRECT_ANSWER_Q } from '../lib/prompts';

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  chrome.contextMenus.removeAll(() => {
    const sel: [string, string][] = [['explain', 'Explain'], ['translate', 'Translate'], ['summarize', 'Summarize'], ['ask', 'Ask Glimpse']];
    for (const [id, title] of sel) chrome.contextMenus.create({ id: `sel-${id}`, title: `${title}: “%s”`, contexts: ['selection'] });
    chrome.contextMenus.create({ id: 'cap-region', title: 'Screenshot region & ask', contexts: ['page', 'image', 'link'] });
    chrome.contextMenus.create({ id: 'cap-tab', title: 'Screenshot tab & ask', contexts: ['page', 'image', 'link'] });
  });
});
chrome.runtime.onStartup.addListener(() => { chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {}); });

/* ---------- delivery to panel (queue if panel not open yet) ---------- */
type PanelMsg = Extract<RuntimeMsg, { type: 'CAPTURED' | 'CAPTURE_ERROR' | 'PREFILL' | 'LOAD_CHAT' }>;
async function deliver(msg: PanelMsg) {
  try { const ok = await chrome.runtime.sendMessage(msg); if (ok) return; } catch { /* panel not open */ }
  const pending = ((await chrome.storage.session.get('pending')).pending ?? []) as PanelMsg[];
  await chrome.storage.session.set({ pending: [...pending, msg] });
}
async function takePending(): Promise<PanelMsg[]> {
  const pending = ((await chrome.storage.session.get('pending')).pending ?? []) as PanelMsg[];
  await chrome.storage.session.remove('pending');
  return pending;
}

/* ---------- capture ---------- */
async function activeTab(windowId?: number) {
  const [t] = await chrome.tabs.query(windowId !== undefined ? { active: true, windowId } : { active: true, lastFocusedWindow: true });
  return t;
}
let regionTab: chrome.tabs.Tab | undefined;
let regionMode: 'panel' | 'popup' | 'attach' = 'panel';

/* ---------- in-page popup ---------- */
type PopupShow = { type: 'POPUP_SHOW'; rect?: { x: number; y: number; w: number; h: number }; image?: string; action?: SelAction; source: string; lang?: string; autoSend: boolean };
async function toTab(tabId: number, m: unknown) {
  try { await chrome.tabs.sendMessage(tabId, m); return true; } catch { /* not injected yet */ }
  try { await chrome.scripting.executeScript({ target: { tabId }, files: ['content/popup.js'] }); await chrome.tabs.sendMessage(tabId, m); return true; } catch { return false; }
}
async function showPopup(tab: chrome.tabs.Tab | undefined, m: PopupShow) {
  if (!tab?.id || !(await toTab(tab.id, m))) {
    // fall back to the side panel when the page can't host the popup
    if (m.image) await deliver({ type: 'CAPTURED', image: m.image });
    if (m.source) await deliver({ type: 'PREFILL', prompt: m.action ? buildPrompt(m.action, m.source, m.lang || 'English').prompt : m.source, autoSend: m.autoSend });
  }
}
const popupOn = async () => (await getSettings()).answerInPopup !== false;

async function captureTab(tab?: chrome.tabs.Tab): Promise<CaptureReply> {
  tab ??= await activeTab();
  if (!tab || isRestrictedUrl(tab.url)) return { error: 'restricted_page' };
  try { return { image: await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }) }; }
  catch (e) { console.warn('capture failed', e); return { error: 'restricted_page' }; }
}
async function startRegion(tab?: chrome.tabs.Tab): Promise<CaptureReply> {
  tab ??= await activeTab();
  if (!tab?.id || isRestrictedUrl(tab.url)) return { error: 'restricted_page' };
  try { await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/overlay.js'] }); }
  catch { return { error: 'restricted_page' }; }
  regionTab = tab;
  return { pending: true };
}
async function crop(dataUrl: string, r: { x: number; y: number; w: number; h: number; dpr: number }) {
  const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const sx = Math.max(0, Math.round(r.x * r.dpr)), sy = Math.max(0, Math.round(r.y * r.dpr));
  const sw = Math.min(bmp.width - sx, Math.round(r.w * r.dpr)), sh = Math.min(bmp.height - sy, Math.round(r.h * r.dpr));
  const c = new OffscreenCanvas(sw, sh);
  c.getContext('2d')!.drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
  const blob = await c.convertToBlob({ type: 'image/png' });
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(s)}`;
}
async function deliverCapture(rep: CaptureReply) {
  if (rep.image) await deliver({ type: 'CAPTURED', image: rep.image });
  else if (rep.error) await deliver({ type: 'CAPTURE_ERROR', error: rep.error });
}
function openPanel(tab?: chrome.tabs.Tab) {
  // Must be called synchronously inside the user gesture.
  if (tab?.windowId !== undefined) chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
}

async function selectionAction(action: SelAction, text: string, tab?: chrome.tabs.Tab, popup = false) {
  const { translateLang } = await getSettings();
  const p = buildPrompt(action, text, translateLang);
  if (popup) return showPopup(tab, { type: 'POPUP_SHOW', action, source: text, lang: translateLang, autoSend: action !== 'ask' });
  await deliver({ type: 'PREFILL', ...p });
}
async function tabToPopup(tab?: chrome.tabs.Tab) {
  const r = await captureTab(tab);
  if (!r.image) return deliverCapture(r);
  await showPopup(tab, { type: 'POPUP_SHOW', image: r.image, source: DIRECT_ANSWER_Q, autoSend: true });
}

/* ---------- commands & menus ---------- */
// Cached so the gesture-bound sidePanel.open() can stay synchronous.
let popupCached = true;
getSettings().then((s) => { popupCached = s.answerInPopup !== false; });
chrome.storage.onChanged.addListener((c) => { if (c.settings) popupCached = (c.settings.newValue as any)?.answerInPopup !== false; });

function runCapture(kind: 'region' | 'tab', tab?: chrome.tabs.Tab) {
  const popup = popupCached;
  if (!popup) openPanel(tab);
  regionMode = popup ? 'popup' : 'panel';
  if (kind === 'region') startRegion(tab).then((r) => { if (!r.pending) deliverCapture(r); });
  else if (popup) tabToPopup(tab); else captureTab(tab).then(deliverCapture);
}
chrome.commands.onCommand.addListener((cmd, tab) => {
  if (cmd === 'capture-region') runCapture('region', tab);
  else if (cmd === 'capture-tab') runCapture('tab', tab);
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  const id = String(info.menuItemId);
  if (id.startsWith('sel-')) { const p = popupCached; if (!p) openPanel(tab); selectionAction(id.slice(4) as SelAction, info.selectionText || '', tab, p); }
  else if (id === 'cap-region') runCapture('region', tab);
  else if (id === 'cap-tab') runCapture('tab', tab);
});

/* ---------- runtime messages ---------- */
chrome.runtime.onMessage.addListener((msg: RuntimeMsg | { type: 'TAKE_PENDING' }, sender, reply) => {
  switch (msg.type) {
    case 'CAPTURE':
      regionMode = 'panel';
      activeTab(msg.windowId).then((t) => (msg.mode === 'tab' ? captureTab(t) : startRegion(t))).then(reply);
      return true;
    case 'REGION_SELECTED': {
      const tab = sender.tab ?? regionTab;
      (async () => {
        const mode = regionMode; regionMode = 'panel';
        const shot = await captureTab(tab);
        if (mode === 'attach') return tab?.id && toTab(tab.id, { type: 'POPUP_ATTACH', image: shot.image ? await crop(shot.image, msg) : undefined });
        if (!shot.image) return deliverCapture(shot);
        const image = await crop(shot.image, msg);
        if (mode === 'popup') return showPopup(tab, { type: 'POPUP_SHOW', rect: { x: msg.x, y: msg.y, w: msg.w, h: msg.h }, image, source: DIRECT_ANSWER_Q, autoSend: true });
        await deliver({ type: 'CAPTURED', image });
      })();
      return false;
    }
    case 'REGION_FULL_TAB': {
      const mode = regionMode; regionMode = 'panel';
      if (mode === 'popup') tabToPopup(sender.tab);
      else if (mode === 'attach') (async () => { const r = await captureTab(sender.tab); if (sender.tab?.id) toTab(sender.tab.id, { type: 'POPUP_ATTACH', image: r.image }); })();
      else captureTab(sender.tab).then(deliverCapture);
      return false;
    }
    case 'REGION_CANCELLED':
      if (regionMode === 'attach' && sender.tab?.id) toTab(sender.tab.id, { type: 'POPUP_ATTACH' });
      regionTab = undefined; regionMode = 'panel'; return false;
    case 'SELECTION_ACTION': {
      const p = popupCached;
      if (!p) openPanel(sender.tab);
      selectionAction(msg.action, msg.text, sender.tab, p);
      return false;
    }
    case 'POPUP_CAPTURE':
      regionMode = 'attach';
      startRegion(sender.tab).then((r) => { if (!r.pending && sender.tab?.id) { regionMode = 'panel'; toTab(sender.tab.id, { type: 'POPUP_ATTACH' }); } });
      return false;
    case 'POPUP_TO_PANEL': {
      openPanel(sender.tab);
      if (msg.messages.some((m) => m.role === 'assistant' && m.text)) { deliver({ type: 'LOAD_CHAT', messages: msg.messages }); return false; }
      const img = msg.messages.find((m) => m.images?.length)?.images?.[0];
      const lastUser = [...msg.messages].reverse().find((m) => m.role === 'user');
      (async () => {
        if (img) await deliver({ type: 'CAPTURED', image: img });
        await deliver({ type: 'PREFILL', prompt: lastUser?.text || '', autoSend: !img && !!lastUser });
      })();
      return false;
    }
    case 'OPEN_PANEL': openPanel(sender.tab); return false;
    case 'OPEN_OPTIONS': chrome.runtime.openOptionsPage(); return false;
    case 'TAKE_PENDING': takePending().then(reply); return true;
  }
  return false;
});

/* ---------- streaming chat over Port "chat" ---------- */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'chat') return;
  let ctrl: AbortController | null = null;
  const post = (m: PortOut) => { try { port.postMessage(m); } catch { /* disconnected */ } };
  port.onDisconnect.addListener(() => ctrl?.abort());
  port.onMessage.addListener(async (m: PortIn) => {
    if (m.type === 'stop') { ctrl?.abort(); return; }
    ctrl?.abort(); ctrl = new AbortController(); const signal = ctrl.signal;
    const s = await getSettings();
    const provider = PROVIDERS[s.provider];
    const model = m.model || s.models[s.provider] || provider.defaultModel;
    post({ type: 'meta', model, provider: s.provider });
    const apiKey = s.apiKeys[s.provider] || '';
    if (!apiKey && s.provider !== 'custom') return post({ type: 'error', error: { code: 'no_key', message: 'Add an API key to start.' } });
    try {
      for await (const t of provider.send({ messages: m.messages, model, signal, apiKey, baseUrl: s.baseUrl, webSearch: s.webSearch !== false })) {
        if (signal.aborted) break;
        post({ type: 'chunk', text: t });
      }
      post({ type: 'done' });
    } catch (e) {
      if ((e as Error).name === 'AbortError' || signal.aborted) return post({ type: 'done' });
      const error: ChatError = e instanceof ProviderError ? { code: e.code, message: e.message } : { code: 'other', message: String((e as Error).message || e) };
      post({ type: 'error', error });
    }
  });
});
