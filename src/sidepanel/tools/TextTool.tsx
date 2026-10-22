import { useRef, useState } from 'react';
import { Markdown } from '../Markdown';
import { runLLM, pageSelection, pageText } from './llm';
import { toast } from '../toast';

export type Opt = { key: string; label: string; values: string[] };
export type TextToolDef = {
  placeholder: string; options?: Opt[]; action: string; allowPage?: boolean; allowEmpty?: boolean;
  build: (input: string, o: Record<string, string>) => string;
};
export function TextTool({ def }: { def: TextToolDef }) {
  const [input, setInput] = useState('');
  const [opts, setOpts] = useState<Record<string, string>>(() => Object.fromEntries((def.options || []).map((o) => [o.key, o.values[0]])));
  const [out, setOut] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const stopRef = useRef<() => void>(() => {});
  const run = async () => {
    if (!input.trim() && !def.allowEmpty) return;
    setErr(''); setOut(''); setBusy(true);
    const r = runLLM([{ role: 'user', text: def.build(input.trim(), opts) }], setOut);
    stopRef.current = r.stop;
    try { await r.done; } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const grab = async (f: () => Promise<string>, what: string) => {
    const g = await chrome.permissions.contains({ origins: ['<all_urls>'] }).catch(() => false);
    if (!g && !(await chrome.permissions.request({ origins: ['<all_urls>'] }).catch(() => false))) return toast('Site access needed');
    const t = await f(); if (t) setInput(t); else toast(`No ${what} found on this page`);
  };
  return (
    <div className="tool">
      <textarea rows={7} value={input} placeholder={def.placeholder} onChange={(e) => setInput(e.target.value)} />
      {def.allowPage !== false && <div className="row left">
        <button className="btn" onClick={() => grab(pageSelection, 'selected text')}>Use page selection</button>
        <button className="btn" onClick={() => grab(pageText, 'text')}>Use whole page</button>
      </div>}
      {(def.options || []).map((o) => (
        <label key={o.key} className="opt">{o.label}
          <select value={opts[o.key]} onChange={(e) => setOpts({ ...opts, [o.key]: e.target.value })}>{o.values.map((v) => <option key={v}>{v}</option>)}</select>
        </label>))}
      <div className="row left">
        {busy ? <button className="btn" onClick={() => stopRef.current()}>Stop</button>
          : <button className="btn primary" disabled={!input.trim() && !def.allowEmpty} onClick={run}>{def.action}</button>}
        {out && !busy && <button className="btn" onClick={() => navigator.clipboard.writeText(out).then(() => toast('Copied'))}>Copy</button>}
      </div>
      {err && <div className="error"><span>{err}</span></div>}
      {out && <div className="md out"><Markdown text={out} /></div>}
    </div>
  );
}
