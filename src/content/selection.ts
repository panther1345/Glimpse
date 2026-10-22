import { host, loadSettings, send, speak, saveSettingsPatch, ICONS, LIGHT_CSS } from './util';
import { highlightRange, restoreHighlights } from './highlight';
import { MODEL_SUGGESTIONS, PROVIDERS } from '../lib/providers';
import type { Settings } from '../lib/storage';
const ID = 'glimpse-selection-host';
let S: Partial<Settings> = {};
const enabled = () => S.selectionToolbar !== false;
loadSettings().then((s) => { S = s; });
chrome.storage.onChanged.addListener((c) => { if (c.settings) S = (c.settings.newValue as Partial<Settings>) || {}; });
{ const go = () => restoreHighlights().catch(() => {}); if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true }); }

const LANGS = ['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Spanish', 'French', 'German', 'Japanese', 'Chinese (Simplified)', 'Arabic', 'Portuguese', 'Russian'];
type Item = { id: string; label: string; icon: string };
const ITEMS: Item[] = [
  { id: 'copy', label: 'Copy', icon: 'copy' }, { id: 'highlight', label: 'Highlight', icon: 'highlight' }, { id: 'read', label: 'Read aloud', icon: 'read' },
  { id: 'explain', label: 'Explain', icon: 'explain' }, { id: 'translate', label: 'Translate into', icon: 'translate' }, { id: 'summarize', label: 'Summarize', icon: 'summarize' },
  { id: 'answer', label: 'Answer this question', icon: 'answer' }, { id: 'code', label: 'Explain code', icon: 'code' },
];
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const CSS = `
*{box-sizing:border-box}
.bar{position:fixed;display:flex;align-items:center;gap:1px;padding:3px;background:#17191f;border:1px solid #2c303a;border-radius:9px;box-shadow:0 6px 20px rgba(0,0,0,.35);font:500 13px system-ui,-apple-system,Segoe UI,sans-serif;color:#e8eaf0}
button{all:unset;cursor:pointer;color:#d6d9e2;display:flex;align-items:center;justify-content:center;border-radius:6px}
.bar>button{width:28px;height:26px}.bar>button:hover{background:#2b2f3a;color:#fff}
.bar .logo img{width:17px;height:17px}.sep{width:1px;height:16px;background:#3a3f4b;margin:0 3px}
.menu{position:fixed;width:280px;background:#1c1f27;border:1px solid #2f3340;border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.45);padding:6px 0;font:500 13.5px system-ui,-apple-system,Segoe UI,sans-serif;color:#e8eaf0}
.row{display:flex;align-items:center;gap:10px;padding:7px 14px;cursor:pointer}.row:hover{background:#272b36}
.row .ic{display:flex;color:#aeb4c2}.row .lb{flex:1;white-space:nowrap;display:flex;align-items:center;gap:6px;min-width:0}
.row .pin{opacity:.25;color:#c9cdd8;width:22px;height:22px}.row .pin.on{opacity:1;color:#f5c542}.row:hover .pin{opacity:.6}.row .pin.on:hover{opacity:1}
select{all:unset;color:#8f96a8;font-size:12.5px;cursor:pointer;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
select option{color:#111;background:#fff}
.div{height:1px;background:#2f3340;margin:5px 0}
.foot{display:flex;align-items:center;justify-content:space-between;padding:6px 10px 2px}
.model{display:flex;align-items:center;gap:6px;background:#272b36;border-radius:999px;padding:4px 10px;color:#e8eaf0}
.model select{color:#e8eaf0;max-width:170px}.foot button{width:28px;height:28px;color:#8f96a8}.foot button:hover{background:#272b36;color:#fff}
.toast{position:fixed;background:#17191f;color:#fff;font:500 12px system-ui;padding:4px 10px;border-radius:6px}
${LIGHT_CSS}
`;
let saved: { text: string; range: Range | null } = { text: '', range: null };
const hide = () => { document.getElementById(ID)?.remove(); };
function isEditable(n: Node | null) {
  const el = (n && (n.nodeType === 1 ? n : n.parentElement)) as HTMLElement | null;
  return !!el?.closest('input,textarea,[contenteditable=""],[contenteditable="true"]');
}
function run(id: string, root: ShadowRoot) {
  const { text, range } = saved;
  if (id === 'copy') { navigator.clipboard.writeText(text).catch(() => {}); flash(root, 'Copied'); if (S.answerOnCopy !== false && text.length >= 2) { send({ type: 'SELECTION_ACTION', action: 'explain', text, url: location.href }); hide(); } return; }
  if (id === 'highlight') { if (range) highlightRange(range).catch(() => {}); getSelection()?.removeAllRanges(); hide(); return; }
  if (id === 'read') { speak(text, S.voice); return; }
  send({ type: 'SELECTION_ACTION', action: id, text, url: location.href }); hide();
}
function flash(root: ShadowRoot, msg: string) {
  const bar = root.querySelector('.bar') as HTMLElement; const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  const r = bar.getBoundingClientRect(); t.style.left = `${r.left}px`; t.style.top = `${r.top - 28}px`; root.appendChild(t); setTimeout(() => t.remove(), 900);
}
function renderBar(root: ShadowRoot) {
  const pinned = S.pinned || ['copy', 'highlight', 'explain'];
  const bar = root.querySelector('.bar') as HTMLElement;
  bar.innerHTML = `<button class="logo" data-a="panel" title="Open Glimpse"><img src="${chrome.runtime.getURL('icons/icon32.png')}" alt=""></button>`
    + ITEMS.filter((i) => pinned.includes(i.id)).map((i) => `<button data-a="${i.id}" title="${i.label}">${ICONS[i.icon]}</button>`).join('')
    + `<button data-a="more" title="More">${ICONS.more}</button><span class="sep"></span><button data-a="close" title="Close">${ICONS.close}</button>`;
}
function renderMenu(root: ShadowRoot) {
  root.querySelector('.menu')?.remove();
  const pinned = S.pinned || ['copy', 'highlight', 'explain'];
  const prov = (S.provider || 'openai') as keyof typeof PROVIDERS;
  const cur = S.models?.[prov] || PROVIDERS[prov].defaultModel;
  const models = [...new Set([cur, ...MODEL_SUGGESTIONS[prov]])];
  const voices = speechSynthesis.getVoices();
  const lang = S.translateLang || 'English';
  const m = document.createElement('div'); m.className = 'menu';
  m.innerHTML = ITEMS.map((i, n) => {
    let extra = '';
    if (i.id === 'read') extra = `<select data-k="voice" title="Voice"><option value="">Default voice</option>${voices.map((v) => `<option ${v.name === S.voice ? 'selected' : ''} value="${esc(v.name)}">${esc(v.name)}</option>`).join('')}</select>`;
    if (i.id === 'translate') extra = `<select data-k="lang" title="Target language">${LANGS.map((l) => `<option ${l === lang ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    return `${n === 3 ? '<div class="div"></div>' : ''}<div class="row" data-a="${i.id}"><span class="ic">${ICONS[i.icon]}</span><span class="lb">${i.label}${extra ? ':' : ''} ${extra}</span><button class="pin ${pinned.includes(i.id) ? 'on' : ''}" data-pin="${i.id}" title="${pinned.includes(i.id) ? 'Unpin from' : 'Pin to'} toolbar">${ICONS.pin}</button></div>`;
  }).join('') + `<div class="div"></div><div class="foot"><label class="model">${ICONS.spark}<select data-k="model" title="Model">${models.map((x) => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label><button data-a="settings" title="Settings">${ICONS.gear}</button></div>`;
  root.appendChild(m);
  const bar = (root.querySelector('.bar') as HTMLElement).getBoundingClientRect();
  const h = m.offsetHeight; const below = bar.bottom + 6 + h < innerHeight;
  m.style.top = `${below ? bar.bottom + 6 : Math.max(4, bar.top - 6 - h)}px`;
  m.style.left = `${Math.max(4, Math.min(innerWidth - 284, bar.left))}px`;
  m.addEventListener('change', (e) => {
    const sel = e.target as HTMLSelectElement; const k = sel.dataset.k;
    if (k === 'lang') saveSettingsPatch({ translateLang: sel.value });
    if (k === 'voice') saveSettingsPatch({ voice: sel.value });
    if (k === 'model') saveSettingsPatch({ models: { ...(S.models || {}), [prov]: sel.value } });
  });
}
function show(text: string, rect: DOMRect, range: Range) {
  saved = { text, range: range.cloneRange() };
  const { el, root } = host(ID);
  root.innerHTML = `<style>${CSS}</style><div class="bar"></div>`;
  renderBar(root);
  const bar = root.querySelector('.bar') as HTMLElement;
  const top = rect.top - 40 < 4 ? rect.bottom + 8 : rect.top - 40;
  bar.style.top = `${top}px`;
  bar.style.left = `${Math.max(4, Math.min(innerWidth - bar.offsetWidth - 4, rect.left + rect.width / 2 - bar.offsetWidth / 2))}px`;
  el.addEventListener('mousedown', (e) => { if (!(e.composedPath()[0] as HTMLElement)?.closest?.('select')) e.preventDefault(); });
  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('select')) return;
    const pin = t.closest('[data-pin]') as HTMLElement | null;
    if (pin) {
      const id = pin.dataset.pin!; const cur = S.pinned || ['copy', 'highlight', 'explain'];
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : ITEMS.map((i) => i.id).filter((x) => x === id || cur.includes(x));
      S = { ...S, pinned: next }; saveSettingsPatch({ pinned: next }); renderBar(root); renderMenu(root); return;
    }
    const a = (t.closest('[data-a]') as HTMLElement | null)?.dataset.a; if (!a) return;
    if (a === 'more') { root.querySelector('.menu') ? root.querySelector('.menu')!.remove() : renderMenu(root); return; }
    if (a === 'close') return hide();
    if (a === 'panel') { send({ type: 'OPEN_PANEL' }); return hide(); }
    if (a === 'settings') { send({ type: 'OPEN_OPTIONS' }); return hide(); }
    run(a, root);
  });
}
document.addEventListener('mouseup', (e) => {
  if (!enabled()) return;
  const id = (e.target as HTMLElement)?.id;
  if (id === ID || id === 'glimpse-answer-host') return;
  setTimeout(() => {
    const sel = window.getSelection(); const text = sel?.toString().trim() || '';
    if (text.length < 2 || !sel?.rangeCount) return hide();
    if (!S.selectionInInputs && (isEditable(sel.anchorNode) || isEditable(document.activeElement))) return hide();
    const range = sel.getRangeAt(0); const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return hide();
    show(text, rect, range);
  }, 10);
});
// Copying page text (Ctrl/Cmd+C or right-click Copy) opens the in-page answer card that explains it.
// Independent of the floating launcher and toolbar; toggle via Settings > "Explain text when I copy it".
let lastCopy = { t: '', at: 0 };
document.addEventListener('copy', () => {
  if (S.answerOnCopy === false || window.top !== window) return;
  const sel = window.getSelection(); const text = sel?.toString().trim() || '';
  if (text.length < 2 || text.length > 8000) return;
  if (isEditable(sel?.anchorNode || null) || isEditable(document.activeElement)) return;
  const now = Date.now(); if (text === lastCopy.t && now - lastCopy.at < 3000) return; lastCopy = { t: text, at: now };
  hide(); send({ type: 'SELECTION_ACTION', action: 'explain', text, url: location.href });
}, true);
document.addEventListener('mousedown', (e) => { if ((e.target as HTMLElement)?.id !== ID) hide(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
window.addEventListener('scroll', hide, { passive: true, capture: true });
speechSynthesis?.addEventListener?.('voiceschanged', () => {});
