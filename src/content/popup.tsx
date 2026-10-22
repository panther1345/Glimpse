import { createRoot, type Root } from 'react-dom/client';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { Msg, PortOut } from '../lib/messages';
import { send, speak, loadSettings, ICONS, LIGHT_CSS, hostThemeAttr } from './util';
import type { SelAction } from '../lib/messages';
import { buildPrompt, ACTION_TITLES } from '../lib/prompts';
import { PROVIDERS, MODEL_SUGGESTIONS } from '../lib/providers';

type Show = { type: 'POPUP_SHOW'; rect?: { x: number; y: number; w: number; h: number }; image?: string; action?: SelAction; source: string; lang?: string; autoSend: boolean };
const ID = 'glimpse-answer-host';
const W = 440;
let pinned = false; let suspendOutside = false;

const CSS = `
:host{all:initial}*{box-sizing:border-box}
.card{position:fixed;width:${W}px;max-height:min(600px,calc(100vh - 16px));display:flex;flex-direction:column;background:#1c1f27;color:#e8eaf0;border-radius:14px;outline:none;
 box-shadow:0 16px 48px rgba(0,0,0,.45),0 0 0 1px #2f3340;font:14px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden}
.card:focus-visible{box-shadow:0 16px 48px rgba(0,0,0,.45),0 0 0 1px #6366f1}
button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:6px;border-radius:7px}
.hd{display:flex;align-items:center;gap:6px;padding:12px 12px 6px 16px;cursor:move;user-select:none}
.hd .t{font-weight:700;font-size:17px;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hd button{width:26px;height:26px;justify-content:center;color:#8f96a8}.hd button:hover{background:#2b2f3a;color:#fff}.hd button.on{color:#f5c542}
.src{margin:4px 14px 2px;display:flex}
.src input{all:unset;flex:1;background:#14161c;border:1px solid #2f3340;border-radius:9px;padding:8px 12px;font-size:13px;color:#c9cdd8;min-width:0}
.src input:focus{border-color:#6366f1;color:#fff}
.body{overflow:auto;padding:8px 16px;flex:1;min-height:60px}
.thumb{max-width:100%;max-height:90px;border-radius:6px;border:1px solid #2f3340;display:block;margin-bottom:6px}
.q{font-size:12px;color:#8f96a8;margin:12px 0 2px;font-weight:600}
.md p{margin:.45em 0}.md a{color:#a5b4fc}.md pre{background:#14161c;padding:8px;border-radius:6px;overflow:auto}.md code{font-family:ui-monospace,Menlo,monospace;font-size:12.5px}
.md table{border-collapse:collapse}.md td,.md th{border:1px solid #3a3f4b;padding:2px 6px}
.md math[display=block]{display:block;margin:.5em 0;overflow-x:auto}
.err{color:#fca5a5}.dots{color:#8f96a8}.dots::after{content:'…';animation:b 1s infinite}@keyframes b{50%{opacity:.2}}
.meta{display:flex;align-items:center;justify-content:space-between;padding:4px 16px 6px;font-size:12px;color:#7d8496;gap:8px}
.smart{position:relative;color:#a5b4fc}.smart select{position:absolute;inset:0;opacity:0;cursor:pointer}
.tb{display:flex;gap:4px;padding:8px 12px;align-items:center}
.tb .sp{flex:1}.tb button{padding:6px 9px;color:#c9cdd8}.tb button:hover{background:#2b2f3a;color:#fff}
.tb .cont{color:#a5b4fc;background:#262a36;padding:7px 12px;border-radius:9px}
.tb .copy{background:#2b2f3a;padding:7px 12px;color:#fff}.tb .copy kbd{display:inline-flex;opacity:.7}
.tb button[disabled]{opacity:.4;cursor:default}
.ask{display:flex;gap:6px;padding:8px 12px 12px;border-top:1px solid #2a2e39;align-items:center}
.ask input{all:unset;flex:1;background:#14161c;border:1px solid #2f3340;border-radius:9px;padding:7px 10px;font-size:13px;color:#e8eaf0}
.ask input:focus{border-color:#6366f1}
.ask button{padding:6px 12px;font-size:13px;background:#4f46e5;color:#fff;border-radius:9px}
.ask button.cam{background:#262a36;color:#c9cdd8;padding:6px 8px}
.ask button[disabled]{opacity:.5;cursor:default}
.att{font-size:11px;color:#a5b4fc;padding:0 12px 6px}
${LIGHT_CSS}
`;

function Md({ text }: { text: string }) {
  return <div className="md" data-len={text.length}><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { output: 'mathml', throwOnError: false }]]}
    components={{ a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>{text}</ReactMarkdown></div>;
}
const I = ({ n }: { n: string }) => <span style={{ display: 'inline-flex' }} dangerouslySetInnerHTML={{ __html: ICONS[n] }} />;

function Card({ init, onClose, setPos }: { init: Show; onClose: () => void; setPos: (el: HTMLDivElement) => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [err, setErr] = useState('');
  const [input, setInput] = useState('');
  const [source, setSource] = useState(init.source);
  const [attach, setAttach] = useState<string | undefined>();
  const [hidden, setHidden] = useState(false);
  const [pin, setPin] = useState(pinned);
  const [model, setModel] = useState('');
  const [models, setModels] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null); const bodyRef = useRef<HTMLDivElement>(null); const inRef = useRef<HTMLInputElement>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null); const voiceRef = useRef('');
  const title = init.action ? ACTION_TITLES[init.action] : init.image ? 'Answer from screenshot' : 'Glimpse';
  const firstPrompt = (src: string): Msg => init.action
    ? { role: 'user', text: buildPrompt(init.action, src, init.lang || 'English').prompt }
    : { role: 'user', text: src || DEFAULT_Q, images: init.image ? [init.image] : undefined };

  const run = (history: Msg[], modelOverride?: string) => {
    portRef.current?.disconnect();
    setErr(''); setStreaming(true);
    setMsgs([...history, { role: 'assistant' as const, text: '' }]);
    const port = chrome.runtime.connect({ name: 'chat' }); portRef.current = port;
    let acc = '';
    port.onMessage.addListener((m: PortOut) => {
      if (m.type === 'meta') setModel(m.model);
      else if (m.type === 'chunk') { acc += m.text; setMsgs([...history, { role: 'assistant', text: acc }]); }
      else if (m.type === 'done') { setStreaming(false); port.disconnect(); }
      else if (m.type === 'error') { setErr(m.error.message); setStreaming(false); port.disconnect(); setMsgs(history.concat(acc ? [{ role: 'assistant', text: acc }] : [])); }
    });
    port.postMessage({ type: 'start', messages: history, model: modelOverride });
  };
  const ask = (text: string, images?: string[]) => {
    const prior = msgs.filter((m) => !(m.role === 'assistant' && !m.text));
    run([...prior, { role: 'user', text, images }]);
  };
  const regen = (modelOverride?: string) => { const h = msgs.filter((m) => m.role === 'user' || m.text); while (h.length && h[h.length - 1].role === 'assistant') h.pop(); if (h.length) run(h, modelOverride); };

  useEffect(() => {
    if (cardRef.current) setPos(cardRef.current);
    loadSettings().then((s) => {
      voiceRef.current = s.voice || '';
      const p = (s.provider || 'openai') as keyof typeof PROVIDERS;
      setModel(s.models?.[p] || PROVIDERS[p].defaultModel);
      setModels([...new Set([s.models?.[p] || PROVIDERS[p].defaultModel, ...MODEL_SUGGESTIONS[p]])]);
    });
    if (init.autoSend) { run([firstPrompt(init.source)]); setTimeout(() => cardRef.current?.focus({ preventScroll: true }), 50); }
    else setTimeout(() => inRef.current?.focus(), 50);
    const onMsg = (m: any) => { if (m?.type === 'POPUP_ATTACH') { suspendOutside = false; setHidden(false); if (m.image) setAttach(m.image); setTimeout(() => inRef.current?.focus(), 50); } };
    chrome.runtime.onMessage.addListener(onMsg);
    return () => { chrome.runtime.onMessage.removeListener(onMsg); portRef.current?.disconnect(); speechSynthesis?.cancel(); };
  }, []);
  useEffect(() => { const b = bodyRef.current; if (b && streaming) b.scrollTop = b.scrollHeight; }, [msgs]);

  const onDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button,input,select')) return;
    const el = cardRef.current!; const r = el.getBoundingClientRect(); const ox = e.clientX - r.left, oy = e.clientY - r.top;
    const mv = (ev: MouseEvent) => { el.style.left = `${clamp(ev.clientX - ox, 4, innerWidth - r.width - 4)}px`; el.style.top = `${clamp(ev.clientY - oy, 4, innerHeight - r.height - 4)}px`; };
    const up = () => { removeEventListener('mousemove', mv, true); removeEventListener('mouseup', up, true); };
    addEventListener('mousemove', mv, true); addEventListener('mouseup', up, true); e.preventDefault();
  };
  const lastA = [...msgs].reverse().find((m) => m.role === 'assistant');
  const copy = () => { if (!lastA?.text) return; navigator.clipboard.writeText(lastA.text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1200); };
  const submit = () => { const t = input.trim(); if ((!t && !attach) || streaming) return; ask(t || DEFAULT_Q, attach ? [attach] : undefined); setInput(''); setAttach(undefined); };
  const stopKeys = { onKeyUp: (e: React.KeyboardEvent) => e.stopPropagation(), onKeyPress: (e: React.KeyboardEvent) => e.stopPropagation() };
  const onCardKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input,select')) return;
    if (e.key === 'Enter' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && !String(getSelection() || '') && !String((cardRef.current?.getRootNode() as any)?.getSelection?.() || ''))) { e.preventDefault(); e.stopPropagation(); copy(); }
    else if (e.key === 'Escape') onClose();
  };
  return (
    <div className="card" ref={cardRef} tabIndex={0} onKeyDown={onCardKey} style={{ visibility: hidden ? 'hidden' : 'visible' }}>
      <div className="hd" onMouseDown={onDown}>
        <span className="t">{title}</span>
        <button className={pin ? 'on' : ''} title={pin ? 'Unpin (closes on outside click)' : 'Pin (keep open)'} onClick={() => { pinned = !pin; setPin(!pin); }}><I n="pin" /></button>
        <button title="Close (Esc)" onClick={onClose}><I n="close" /></button>
      </div>
      <div className="src">
        <input value={source} title="Edit and press Enter to ask again" onChange={(e) => setSource(e.target.value)} {...stopKeys}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && source.trim() && !streaming) run([firstPrompt(source.trim())]); if (e.key === 'Escape') onClose(); }} />
      </div>
      <div className="body" ref={bodyRef}>
        {init.image && <img className="thumb" src={init.image} alt="Screenshot" />}
        {msgs.map((m, i) => m.role === 'user'
          ? (i === 0 ? null : <div key={i} className="q">You: {m.text}{m.images?.length ? ' 📷' : ''}</div>)
          : <div key={i}>{m.text ? <Md text={m.text} /> : (streaming && <span className="dots">Thinking</span>)}</div>)}
        {err && <div className="err">{err}</div>}
        {!msgs.length && !init.autoSend && <div style={{ color: '#8f96a8', fontSize: 13 }}>Ask anything about the selected text below.</div>}
      </div>
      <div className="meta">
        <span>By {model || '…'}</span>
        <span className="smart" title="Re-run with another model"><I n="spark" /> Try a smarter model ▾
          <select value="" disabled={streaming || !msgs.length} onChange={(e) => { if (e.target.value) { setModel(e.target.value); regen(e.target.value); } }}>
            <option value="">Choose a model…</option>{models.filter((x) => x !== model).map((x) => <option key={x}>{x}</option>)}
          </select></span>
      </div>
      <div className="tb">
        <button className="cont" title="Continue this conversation in the side panel" onClick={() => { send({ type: 'POPUP_TO_PANEL', messages: msgs.filter((m) => m.text || m.images) }); onClose(); }}><I n="chat" /> Continue in Chat</button>
        <span className="sp" />
        {streaming ? <button onClick={() => portRef.current?.postMessage({ type: 'stop' })}>Stop</button>
          : <button title="Regenerate" disabled={!msgs.length} onClick={() => regen()}><I n="regen" /></button>}
        <button title="Read aloud" disabled={!lastA?.text} onClick={() => lastA?.text && speak(lastA.text, voiceRef.current)}><I n="read" /></button>
        <button className="copy" title="Copy (Enter / Ctrl+C)" disabled={!lastA?.text} onClick={copy}>{copied ? 'Copied' : 'Copy'} <kbd><I n="enter" /></kbd></button>
      </div>
      {attach && <div className="att">📷 Screenshot attached <a style={{ cursor: 'pointer' }} onClick={() => setAttach(undefined)}>remove</a></div>}
      <div className="ask">
        <button className="cam" title="Add a screenshot to your question" onClick={() => { suspendOutside = true; setHidden(true); setTimeout(() => send({ type: 'POPUP_CAPTURE' }), 60); }}>📷</button>
        <input ref={inRef} placeholder="Ask bot a follow-up…" value={input} onChange={(e) => setInput(e.target.value)} {...stopKeys}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }} />
        <button disabled={streaming || (!input.trim() && !attach)} onClick={submit}>Ask</button>
      </div>
    </div>
  );
}
const DEFAULT_Q = 'Answer the question(s) in this screenshot directly. Give the final answer first, then a brief explanation.';
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

let root: Root | null = null;
function close() { speechSynthesis?.cancel(); root?.unmount(); root = null; document.getElementById(ID)?.remove(); }
function show(m: Show) {
  close();
  const el = document.createElement('div'); el.id = ID; hostThemeAttr(el);
  el.style.cssText = 'all:initial;position:fixed;z-index:2147483646;top:0;left:0;';
  (document.documentElement || document.body).appendChild(el);
  const sh = el.attachShadow({ mode: 'open' });
  const st = document.createElement('style'); st.textContent = CSS; sh.appendChild(st);
  const mount = document.createElement('div'); sh.appendChild(mount);
  // anchor: right of region, else left, else below; default near selection / top-right
  let anchor = m.rect;
  if (!anchor) { const s = getSelection(); if (s?.rangeCount) { const r = s.getRangeAt(0).getBoundingClientRect(); if (r.width || r.height) anchor = { x: r.left, y: r.top, w: r.width, h: r.height }; } }
  const setPos = (card: HTMLDivElement) => {
    const place = () => {
      const h = Math.min(card.offsetHeight || 300, innerHeight - 16);
      let x: number, y: number;
      if (!anchor) { x = innerWidth - W - 20; y = 20; }
      else if (anchor.x + anchor.w + 12 + W < innerWidth) { x = anchor.x + anchor.w + 12; y = anchor.y; }
      else if (anchor.x - 12 - W > 0) { x = anchor.x - 12 - W; y = anchor.y; }
      else { x = anchor.x; y = anchor.y + anchor.h + 10; }
      card.style.left = `${clamp(x, 8, innerWidth - W - 8)}px`; card.style.top = `${clamp(y, 8, innerHeight - h - 8)}px`;
    };
    place();
    let moved = false; card.addEventListener('mousedown', () => { moved = true; }, { once: true });
    new ResizeObserver(() => { if (!moved) place(); else { const r = card.getBoundingClientRect(); if (r.bottom > innerHeight - 8) card.style.top = `${Math.max(8, innerHeight - r.height - 8)}px`; } }).observe(card);
  };
  root = createRoot(mount);
  root.render(<Card init={m} onClose={close} setPos={setPos} />);
}
const w = window as any;
if (!w.__glimpsePopup) {
  w.__glimpsePopup = true;
  chrome.runtime.onMessage.addListener((m: any, _s, reply) => { if (m?.type === 'POPUP_SHOW' && window.top === window) { show(m); reply(true); } return false; });
  document.addEventListener('mousedown', (e) => {
    const h = document.getElementById(ID); if (!h || pinned || suspendOutside) return;
    const t = e.target as HTMLElement;
    if (t === h || t?.id === 'glimpse-selection-host' || t?.id === 'glimpse-region-host') return;
    close();
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById(ID) && !(e.composedPath()[0] as HTMLElement)?.closest?.('input')) close(); });
  addEventListener('resize', () => { const c = document.getElementById(ID)?.shadowRoot?.querySelector('.card') as HTMLElement | null; if (c) { const r = c.getBoundingClientRect(); c.style.left = `${clamp(r.left, 8, innerWidth - r.width - 8)}px`; c.style.top = `${clamp(r.top, 8, innerHeight - r.height - 8)}px`; } });
}
