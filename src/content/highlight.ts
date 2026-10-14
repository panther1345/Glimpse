/** Persistent yellow highlights, stored per URL (without hash) as text offsets into the page text. */
const KEY = () => `hl:${location.origin}${location.pathname}${location.search}`;
type Hl = { start: number; end: number; text: string };
function textNodes(): Text[] {
  const out: Text[] = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest('script,style,noscript,[id^="glimpse-"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  while (w.nextNode()) out.push(w.currentNode as Text); return out;
}
function offsetOf(nodes: Text[], node: Node, off: number): number {
  const probe = document.createRange(); probe.setStart(node, off); let acc = 0;
  for (const t of nodes) {
    if (t === node) return acc + off;
    if (probe.comparePoint(t, 0) >= 0) return acc;
    acc += t.data.length;
  }
  return acc;
}
function wrap(nodes: Text[], start: number, end: number) {
  let acc = 0; const segs: [Text, number, number][] = [];
  for (const t of nodes) { const a = acc, b = acc + t.data.length; acc = b; if (b <= start || a >= end) continue; segs.push([t, Math.max(0, start - a), Math.min(t.data.length, end - a)]); }
  for (const [t, s, e] of segs) {
    if (!t.data.slice(s, e).trim()) continue;
    const r = document.createRange(); r.setStart(t, s); r.setEnd(t, e);
    const m = document.createElement('mark'); m.className = 'glimpse-hl'; m.style.cssText = 'background:#ffe14d;color:inherit;padding:0;border-radius:2px';
    try { r.surroundContents(m); } catch { /* skip */ }
  }
}
async function list(): Promise<Hl[]> { const k = KEY(); return ((await chrome.storage.local.get(k))[k] as Hl[]) || []; }
export async function highlightRange(range: Range) {
  const nodes = textNodes(); const all = nodes.map((n) => n.data).join('');
  const start = offsetOf(nodes, range.startContainer, range.startOffset), end = offsetOf(nodes, range.endContainer, range.endOffset);
  if (start < 0 || end <= start) return;
  const h: Hl = { start, end, text: all.slice(start, end) };
  wrap(nodes, start, end);
  const k = KEY(); await chrome.storage.local.set({ [k]: [...(await list()), h] });
}
export async function restoreHighlights() {
  const items = await list(); if (!items.length) return;
  for (const h of items) {
    const nodes = textNodes(); const all = nodes.map((n) => n.data).join('');
    let s = all.slice(h.start, h.end) === h.text ? h.start : -1;
    if (s < 0) { // page shifted: nearest occurrence
      let best = -1, i = all.indexOf(h.text);
      while (i >= 0) { if (best < 0 || Math.abs(i - h.start) < Math.abs(best - h.start)) best = i; i = all.indexOf(h.text, i + 1); }
      s = best;
    }
    if (s >= 0) wrap(nodes, s, s + h.text.length);
  }
}
