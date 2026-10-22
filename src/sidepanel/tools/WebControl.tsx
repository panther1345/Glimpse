import { Agent } from './Agent';
import { useEffect, useState } from 'react';
import { runLLM } from './llm';
import { toast } from '../toast';

export type Row = Record<string, string>;
export const isWeb = (u?: string) => !!u && /^(https?|file):/.test(u);
/** The web page the user is looking at (the side panel itself is never the target). */
export async function targetTab(): Promise<chrome.tabs.Tab | undefined> {
  const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (isWeb(t?.url)) return t;
  const all = (await chrome.tabs.query({ active: true })).filter((x) => isWeb(x.url));
  return all.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0];
}
export async function access() {
  return (await chrome.permissions.contains({ origins: ['<all_urls>'] }).catch(() => false)) || chrome.permissions.request({ origins: ['<all_urls>'] }).catch(() => false);
}
async function inPage<T, A extends any[]>(func: (...a: A) => T, ...args: A): Promise<T> {
  const t = await targetTab(); if (!t?.id) throw new Error('Open a normal web page in the active tab first.');
  const [r] = await chrome.scripting.executeScript({ target: { tabId: t.id }, func: func as any, args });
  return r.result as T;
}
export const toCSV = (rows: Row[]) => { const cols = [...new Set(rows.flatMap(Object.keys))]; const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`; return [cols.map(q).join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n'); };
export const download = (name: string, data: string, type: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); };
export const parseJSON = (t: string) => { const m = /```(?:json)?\s*([\s\S]*?)```/.exec(t); const s = (m ? m[1] : t).trim(); const i = Math.min(...['[', '{'].map((c) => (s.indexOf(c) + 1 || 1e9) - 1)); return JSON.parse(s.slice(i)); };

/* ---------- presets run inside the page ---------- */
function domPreset(kind: string): { cols: string[]; data: string[][] } {
  const rows = domPresetRows(kind); const cols: string[] = [];
  rows.forEach((r) => Object.keys(r).forEach((k) => { if (!cols.includes(k)) cols.push(k); }));
  return { cols, data: rows.map((r) => cols.map((c) => r[c] ?? '')) };
  function domPresetRows(kind: string): Record<string, string>[] {
  const abs = (u: string) => { try { return new URL(u, location.href).href; } catch { return u; } };
  if (kind === 'tables') {
    const out: Row[] = [];
    document.querySelectorAll('table').forEach((t, ti) => {
      const rows = [...t.querySelectorAll('tr')]; if (!rows.length) return;
      const head = [...rows[0].querySelectorAll('th,td')].map((c, i) => (c as HTMLElement).innerText.trim() || `col${i + 1}`);
      rows.slice(1).forEach((r) => { if (document.querySelectorAll('table').length > 1) void 0; const o: Record<string, string> = {}; [...r.querySelectorAll('th,td')].forEach((c, i) => (o[head[i] || `col${i + 1}`] = (c as HTMLElement).innerText.trim())); if (document.querySelectorAll('table').length > 1) o.table = String(ti + 1); out.push(o); });
    });
    return out;
  }
  if (kind === 'links') return [...document.querySelectorAll('a[href]')].map((a) => ({ text: (a as HTMLElement).innerText.trim().slice(0, 120), url: abs(a.getAttribute('href')!) })).filter((x) => !x.url.startsWith('javascript:'));
  if (kind === 'emails') return [...new Set((document.body.innerText + ' ' + [...document.querySelectorAll('a[href^="mailto:"]')].map((a) => a.getAttribute('href')!.slice(7)).join(' ')).match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [])].map((email) => ({ email }));
  if (kind === 'headings') return [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => ({ level: h.tagName, text: (h as HTMLElement).innerText.trim() }));
  if (kind === 'images') return [...document.images].filter((i) => i.src).map((i) => ({ alt: i.alt, src: i.src, size: `${i.naturalWidth}x${i.naturalHeight}` }));
  return [];
  }
}
function pageForAI() {
  const clone = document.body.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script,style,noscript,svg,iframe').forEach((e) => e.remove());
  return { url: location.href, title: document.title, text: clone.innerText.replace(/\n{3,}/g, '\n\n').slice(0, 60000) };
}

function Scraper() {
  const [prompt, setPrompt] = useState(''); const [rows, setRows] = useState<Row[]>([]); const [order, setOrder] = useState<string[]>([]); const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const preset = async (k: string) => { setErr(''); if (!(await access())) return setErr('Site access is needed.'); try { const x = await inPage(domPreset, k); const r = x.data.map((d) => Object.fromEntries(x.cols.map((c, i) => [c, d[i]]))); setOrder(x.cols); setRows(r); if (!r.length) setErr(`No ${k} found on this page.`); } catch (e) { setErr((e as Error).message); } };
  const ai = async () => {
    setErr(''); setRows([]); setOrder([]); if (!(await access())) return setErr('Site access is needed.');
    try {
      setBusy('Reading page…'); const pg = await inPage(pageForAI);
      setBusy('Extracting with AI…');
      const r = runLLM([{ role: 'user', text: `Extract data from this web page. Request: "${prompt}". Return ONLY a JSON array of flat objects (same keys in each, short key names), no prose. If nothing matches return [].\n\nURL: ${pg.url}\nTITLE: ${pg.title}\nPAGE TEXT:\n${pg.text}` }], () => {});
      const j = parseJSON(await r.done); const arr = Array.isArray(j) ? j : [j];
      setRows(arr.map((o: any) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)]))));
      if (!arr.length) setErr('Nothing matched that request on this page.');
    } catch (e) { setErr((e as Error).message.includes('JSON') ? 'The AI reply was not valid JSON. Try rephrasing.' : (e as Error).message); } finally { setBusy(''); }
  };
  const cols = [...new Set([...order, ...rows.flatMap(Object.keys)])];
  return (
    <div className="tool">
      <textarea rows={3} value={prompt} placeholder='What to extract, e.g. "all product names and prices"' onChange={(e) => setPrompt(e.target.value)} />
      <div className="row left"><button className="btn primary" disabled={!prompt.trim() || !!busy} onClick={ai}>{busy || 'Extract with AI'}</button></div>
      <div className="row left">{['tables', 'links', 'emails', 'headings', 'images'].map((k) => <button key={k} className="btn" onClick={() => preset(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>
      {err && <div className="error"><span>{err}</span></div>}
      {!!rows.length && <>
        <div className="row left"><b>{rows.length} rows</b>
          <button className="btn" onClick={() => download('glimpse-scrape.csv', toCSV(rows), 'text/csv')}>CSV</button>
          <button className="btn" onClick={() => download('glimpse-scrape.json', JSON.stringify(rows, null, 2), 'application/json')}>JSON</button>
          <button className="btn" onClick={() => navigator.clipboard.writeText(toCSV(rows).replace(/","/g, '"\t"')).then(() => toast('Copied (paste into Sheets/Excel)'))}>Copy</button></div>
        <div className="gtable"><table><thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.slice(0, 500).map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{r[c]}</td>)}</tr>)}</tbody></table></div>
      </>}
    </div>
  );
}

/* ---------- form filling ---------- */
type Field = { i: number; label: string; name: string; type: string; options?: string[] };
const PROFILE_KEYS = ['Full name', 'First name', 'Last name', 'Email', 'Phone', 'Address line 1', 'Address line 2', 'City', 'State', 'ZIP / PIN code', 'Country', 'Company', 'Job title', 'Website', 'LinkedIn', 'Date of birth', 'Notes'];
function scanFields(): Field[] {
  const SENSITIVE = /pass|card|cc-|cvv|cvc|ccnum|iban|ssn|aadhaar|pan\b|otp|pin\b|secur/i;
  const els = [...document.querySelectorAll('input,select,textarea')] as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[];
  const out: Field[] = [];
  els.forEach((el, i) => {
    const type = (el as HTMLInputElement).type || el.tagName.toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image', 'file', 'password'].includes(type) || el.disabled || (el as HTMLInputElement).readOnly) return;
    const r = el.getBoundingClientRect(); if (!r.width && !r.height) return;
    const lab = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent) || (() => { const l = el.closest('label'); if (!l) return ''; const c = l.cloneNode(true) as HTMLElement; c.querySelectorAll('input,select,textarea').forEach((x) => x.remove()); return c.textContent; })() || el.getAttribute('aria-label') || (el as HTMLInputElement).placeholder || '';
    const meta = `${lab} ${el.name} ${el.id} ${el.getAttribute('autocomplete') || ''}`;
    if (SENSITIVE.test(meta)) return;
    out.push({ i, label: lab.trim().replace(/\s+/g, ' ').slice(0, 80), name: el.name || el.id, type, ...(el.tagName === 'SELECT' ? { options: [...(el as HTMLSelectElement).options].map((o) => o.text).slice(0, 60) } : {}) });
  });
  return out;
}
function fillFields(values: [number, string][]) {
  const els = [...document.querySelectorAll('input,select,textarea')] as HTMLElement[];
  let n = 0;
  for (const [i, v] of values) {
    const el = els[i] as HTMLInputElement; if (!el) continue;
    if (el.type === 'checkbox' || el.type === 'radio') { const want = /^(true|yes|1|checked|on)$/i.test(v) || el.value === v; if (el.checked !== want) el.click(); }
    else if (el.tagName === 'SELECT') { const s = el as unknown as HTMLSelectElement; const o = [...s.options].find((x) => x.text.trim().toLowerCase() === v.toLowerCase() || x.value.toLowerCase() === v.toLowerCase()); if (!o) continue; s.value = o.value; }
    else { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v); }
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    el.style.outline = '2px solid #7c5cff'; n++;
  }
  return n; // never submits
}
function FormFill() {
  const [profile, setProfile] = useState<Record<string, string>>({}); const [editP, setEditP] = useState(false);
  const [instr, setInstr] = useState(''); const [fields, setFields] = useState<Field[]>([]); const [plan, setPlan] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(''); const [err, setErr] = useState(''); const [done, setDone] = useState('');
  useEffect(() => { chrome.storage.local.get('formProfile').then((x) => setProfile((x.formProfile as Record<string, string>) || {})); }, []);
  const saveP = async (p: Record<string, string>) => { setProfile(p); await chrome.storage.local.set({ formProfile: p }); };
  const analyze = async () => {
    setErr(''); setDone(''); setPlan({}); if (!(await access())) return setErr('Site access is needed.');
    try {
      setBusy('Scanning form…'); const f = await inPage(scanFields); setFields(f);
      if (!f.length) { setBusy(''); return setErr('No fillable fields found on this page.'); }
      setBusy('Matching values with AI…');
      const prof = Object.entries(profile).filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v}`).join('\n') || '(none)';
      const r = runLLM([{ role: 'user', text: `Map values to these web form fields. Use the saved profile and the user's instruction. Return ONLY a JSON object {"<field i>": "<value>"} for fields you can fill confidently; skip others. For selects use one of the listed options exactly. For checkboxes use "true"/"false". Never invent passwords, card numbers or IDs.\n\nPROFILE:\n${prof}\n\nINSTRUCTION: ${instr || '(fill from profile)'}\n\nFIELDS:\n${JSON.stringify(f)}` }], () => {});
      const j = parseJSON(await r.done); setPlan(Object.fromEntries(Object.entries(j).map(([k, v]) => [+k, String(v)])));
    } catch (e) { setErr((e as Error).message.includes('JSON') ? 'The AI reply was not valid JSON. Try again.' : (e as Error).message); } finally { setBusy(''); }
  };
  const fill = async () => { try { const n = await inPage(fillFields, Object.entries(plan).filter(([, v]) => v !== '').map(([k, v]) => [+k, v] as [number, string])); setDone(`Filled ${n} fields. Review the page, then submit it yourself — Glimpse never submits forms.`); } catch (e) { setErr((e as Error).message); } };
  return (
    <div className="tool">
      <div className="row left"><button className="btn" onClick={() => setEditP(!editP)}>{editP ? 'Hide profile' : `Saved profile (${Object.values(profile).filter(Boolean).length} fields)`}</button></div>
      {editP && <div className="profile">{PROFILE_KEYS.map((k) => <label key={k} className="opt">{k}<input value={profile[k] || ''} onChange={(e) => saveP({ ...profile, [k]: e.target.value })} /></label>)}
        <p className="muted small">Stored only in this browser. Passwords, card numbers, OTPs and ID numbers are never stored or filled.</p></div>}
      <textarea rows={3} value={instr} placeholder='Optional instruction, e.g. "Apply for the frontend role, say I can start in January"' onChange={(e) => setInstr(e.target.value)} />
      <div className="row left"><button className="btn primary" disabled={!!busy} onClick={analyze}>{busy || 'Scan form & preview'}</button></div>
      {err && <div className="error"><span>{err}</span></div>}
      {!!fields.length && !busy && <>
        <div className="gtable"><table><thead><tr><th>Field</th><th>Value</th></tr></thead><tbody>{fields.map((f) => <tr key={f.i}><td>{f.label || f.name || f.type}</td>
          <td>{f.options ? <select value={plan[f.i] || ''} onChange={(e) => setPlan({ ...plan, [f.i]: e.target.value })}><option value="">—</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
            : <input value={plan[f.i] || ''} onChange={(e) => setPlan({ ...plan, [f.i]: e.target.value })} />}</td></tr>)}</tbody></table></div>
        <div className="row left"><button className="btn primary" disabled={!Object.values(plan).some(Boolean)} onClick={fill}>Fill</button><span className="muted small">Fills the page only. It does not submit.</span></div>
      </>}
      {done && <p className="small">✅ {done}</p>}
    </div>
  );
}

export function WebControl({ initialGoal }: { initialGoal?: string }) {
  const [tab, setTab] = useState<'agent' | 'scrape' | 'form'>(initialGoal ? 'agent' : 'scrape');
  return (<div className="tool"><div className="row left"><button className={`btn ${tab === 'agent' ? 'primary' : ''}`} onClick={() => setTab('agent')}>🕹 Take over</button><button className={`btn ${tab === 'scrape' ? 'primary' : ''}`} onClick={() => setTab('scrape')}>Web scraping</button><button className={`btn ${tab === 'form' ? 'primary' : ''}`} onClick={() => setTab('form')}>Auto form fill</button></div>
    {tab === 'agent' ? <Agent initialGoal={initialGoal} /> : tab === 'scrape' ? <Scraper /> : <FormFill />}</div>);
}
