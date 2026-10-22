import { useEffect, useRef, useState } from 'react';
import { runLLM } from './llm';
import { toast } from '../toast';
import { type Row, isWeb, targetTab, toCSV, download, parseJSON } from './WebControl';
import { pgOverlay, pgObserve, pgAct, pgScroll, pgElemInfo } from './agentPage';

const MAX_STEPS = 25;
const RISKY = /\b(pay|payment|buy|purchase|place order|checkout|check out|submit|confirm|send|apply|sign ?up|register|book|subscribe|delete|transfer|donate)\b/i;
type Log = { t: string; kind?: 'err' | 'ok' | 'ask' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** One LLM call with retries on empty replies / rate limits (free-tier keys hit these often). */
async function askJSON(text: string, sys: string | null, setStop: (f: () => void) => void, stopped: () => boolean, note: (s: string) => void) {
  for (let i = 0; i < 4 && !stopped(); i++) {
    const r = runLLM(sys ? [{ role: 'system', text: sys }, { role: 'user', text }] : [{ role: 'user', text }], () => {});
    setStop(r.stop);
    try { const out = await r.done; if (out.trim()) return parseJSON(out); note('AI returned nothing, retrying…'); }
    catch (e) { const m = (e as Error).message; if (!/rate|quota|503|overload|demand|JSON/i.test(m)) throw e; note(/JSON/.test(m) ? 'AI reply was not JSON, retrying…' : 'AI is busy / rate-limited, retrying…'); }
    await sleep(6000 * (i + 1));
  }
  throw new Error('AI did not respond after several tries');
}

const SYSTEM = `You are Glimpse, a browser agent controlling ONE Chrome tab for the user. Reach the user's GOAL step by step.
Each turn you get the current page (URL, title, numbered interactive elements, visible text) and your previous steps.
Reply with ONLY one JSON object, no prose:
{"thought":"short reasoning","action":"open|search|click|type|scroll|extract|back|wait|done","url":"...","query":"...","id":0,"text":"...","enter":true,"dir":"down|up","what":"what to extract","status":"short status for the user, e.g. Clicking 'Search'"}
- open: go to url. search: web search for query (ALWAYS use search for web searches — never type into Google/Bing/DuckDuckGo boxes). click: element id. type: put text in element id (enter:true to submit a SEARCH box).
- extract: pull structured rows from the current page; "what" describes columns (e.g. "product name and price"). You may extract on several pages; rows accumulate.
- done: finish; "text" = short final answer/summary for the user.
Rules: Never enter passwords, card numbers, OTPs or personal IDs. Never complete a payment or purchase. Prefer extract once the data is visible. Do not repeat the same failing action. Keep it under ${MAX_STEPS} steps.`;

async function waitLoad(tabId: number) {
  for (let i = 0; i < 40; i++) { await sleep(300); const t = await chrome.tabs.get(tabId).catch(() => null); if (!t || t.status === 'complete') break; }
  await sleep(600);
}
async function exec<A extends any[], T>(tabId: number, func: (...a: A) => T, ...args: A): Promise<Awaited<T>> {
  const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: func as any, args });
  return r?.result as Awaited<T>;
}

export function Agent({ initialGoal = '' }: { initialGoal?: string }) {
  const [goal, setGoal] = useState(initialGoal);
  const [phase, setPhase] = useState<'idle' | 'confirm' | 'running' | 'done'>('idle');
  const [log, setLog] = useState<Log[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [answer, setAnswer] = useState('');
  const [ask, setAsk] = useState<{ q: string; res: (ok: boolean) => void } | null>(null);
  const stopRef = useRef(false); const llmStop = useRef<() => void>(() => {}); const tabRef = useRef<number | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);
  const add = (t: string, kind?: Log['kind']) => setLog((l) => [...l, { t, kind }]);
  useEffect(() => { logEnd.current?.scrollIntoView({ block: 'end' }); }, [log, ask]);
  useEffect(() => {
    const l = (m: any) => { if (m?.type === 'AGENT_STOP') stop(); };
    chrome.runtime.onMessage.addListener(l); return () => { chrome.runtime.onMessage.removeListener(l); stop(); };
  }, []);
  const stop = () => { if (stopRef.current) return; stopRef.current = true; llmStop.current(); ask?.res(false); const id = tabRef.current; if (id != null) exec(id, pgOverlay, false, '').catch(() => {}); };

  const allow = async () => {
    const ok = (await chrome.permissions.contains({ origins: ['<all_urls>'] }).catch(() => false)) || (await chrome.permissions.request({ origins: ['<all_urls>'] }).catch(() => false));
    if (!ok) { setPhase('idle'); return toast('Site access is needed to control the browser'); }
    run();
  };
  const confirmUser = (q: string) => new Promise<boolean>((res) => setAsk({ q, res: (v) => { setAsk(null); res(v); } }));

  const run = async () => {
    stopRef.current = false; setPhase('running'); setLog([]); setRows([]); setAnswer('');
    let acc: Row[] = []; const steps: string[] = [];
    let t = await targetTab();
    if (!t?.id || !isWeb(t.url)) t = await chrome.tabs.create({ url: 'about:blank', active: true });
    const tabId = t.id!; tabRef.current = tabId;
    const overlay = (s: string) => exec(tabId, pgOverlay, true, s).catch(() => {});
    add('Taking over the browser…');
    try {
      for (let step = 1; step <= MAX_STEPS && !stopRef.current; step++) {
        const cur = await chrome.tabs.get(tabId);
        let obs: Awaited<ReturnType<typeof pgObserve>> | null = null;
        if (isWeb(cur.url)) { await overlay('Reading page…'); obs = await exec(tabId, pgObserve).catch(() => null); }
        const page = obs ? `URL: ${obs.url}\nTITLE: ${obs.title}\nSCROLL: ${obs.scrollY}/${obs.height}\nELEMENTS:\n${obs.elements}\nTEXT:\n${obs.text}` : `URL: ${cur.url || 'about:blank'} (blank or restricted page – use open or search)`;
        let a: any;
        try { a = await askJSON(`GOAL: ${goal}\nROWS EXTRACTED SO FAR: ${acc.length}${acc.length ? ` (columns: ${Object.keys(acc[0]).join(', ')}) – if they satisfy the goal, finish with done` : ''}\nPREVIOUS STEPS:\n${steps.slice(-12).join('\n') || '(none)'}\n\nCURRENT PAGE:\n${page}\n\nStep ${step}/${MAX_STEPS}. Next action JSON:`, SYSTEM, (f) => (llmStop.current = f), () => stopRef.current, (m) => add(m)); }
        catch (e) { if (stopRef.current) break; add(`AI error: ${(e as Error).message.slice(0, 160)}`, 'err'); break; }
        if (stopRef.current) break;
        const status = String(a.status || a.action);
        const say = (s: string) => { add(s); overlay(s); };
        if (a.action === 'done') { setAnswer(String(a.text || '')); add('Done ✓', 'ok'); break; }
        if (a.action === 'open' || a.action === 'search') {
          const url = a.action === 'search' ? `https://duckduckgo.com/?q=${encodeURIComponent(a.query || a.text || '')}&ia=web` : /^https?:/.test(a.url) ? a.url : `https://${a.url}`;
          say(a.action === 'search' ? `Searching “${a.query || a.text}”…` : `Opening ${new URL(url).hostname}…`);
          await chrome.tabs.update(tabId, { url }); await waitLoad(tabId); steps.push(`step ${step}: ${a.action} ${url}`);
        } else if (a.action === 'click' || a.action === 'type') {
          const info = await exec(tabId, pgElemInfo, Number(a.id)).catch(() => null);
          if (!info) { add(`Element [${a.id}] not found`, 'err'); steps.push(`step ${step}: ${a.action} [${a.id}] FAILED not found`); continue; }
          const label = info.text || `element ${a.id}`;
          if ((a.action === 'click' && (RISKY.test(label) || (info.type === 'submit' && info.inForm))) || (a.action === 'type' && a.enter && info.formHasPassword)) {
            add(`Needs your OK: ${a.action} “${label}”`, 'ask');
            if (!(await confirmUser(`Glimpse wants to ${a.action === 'click' ? `click “${label}”` : 'submit this form'}. This may submit a form or make a purchase. Allow?`))) { steps.push(`step ${step}: user DENIED ${a.action} "${label}" – choose another way or finish`); add('You declined – skipping.'); if (stopRef.current) break; continue; }
          }
          say(a.action === 'click' ? `Clicking “${label}”…` : `Typing “${String(a.text).slice(0, 40)}”…`);
          const res = await exec(tabId, pgAct, a.action, Number(a.id), String(a.text ?? ''), !!a.enter).catch((e) => ({ ok: true, msg: String(e) }));
          if (!res.ok) add(res.msg, 'err');
          await waitLoad(tabId);
          const moved = (await chrome.tabs.get(tabId)).url !== cur.url;
          steps.push(`step ${step}: ${a.action} [${a.id}] "${label}"${a.text ? ` text="${a.text}"` : ''} ${res.ok ? 'ok' : 'FAILED ' + res.msg}${a.action === 'type' && a.enter && !moved ? ' (page did not change – click the submit/search button, or use the search action)' : ''}`);
        } else if (a.action === 'scroll') { say(`Scrolling ${a.dir || 'down'}…`); await exec(tabId, pgScroll, a.dir || 'down'); await sleep(800); steps.push(`step ${step}: scroll ${a.dir || 'down'}`); }
        else if (a.action === 'back') { say('Going back…'); await chrome.tabs.goBack(tabId).catch(() => {}); await waitLoad(tabId); steps.push(`step ${step}: back`); }
        else if (a.action === 'wait') { say('Waiting…'); await sleep(1500); steps.push(`step ${step}: wait`); }
        else if (a.action === 'extract') {
          say(`Extracting ${a.what || 'data'}…`);
          if (!obs) { steps.push(`step ${step}: extract FAILED no page`); continue; }
          try {
            const arr = await askJSON(`From this web page extract: ${a.what || goal}. Apply any filters from the user's goal ("${goal}"). Return ONLY a JSON array of flat objects with consistent short keys. [] if none.\nURL: ${obs.url}\n\n${obs.fullText}`, null, (f) => (llmStop.current = f), () => stopRef.current, (m) => add(m));
            const got: Row[] = (Array.isArray(arr) ? arr : [arr]).map((o: any) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : String(v)])));
            const seen = new Set(acc.map((r) => JSON.stringify(r))); const fresh = got.filter((r) => !seen.has(JSON.stringify(r)));
            acc = [...acc, ...fresh]; setRows(acc); add(`Extracted ${got.length} rows (${fresh.length} new, total ${acc.length})`, 'ok'); overlay(`Extracted ${got.length} rows`);
            steps.push(`step ${step}: extract "${a.what}" -> ${got.length} rows (${fresh.length} new)${fresh.length ? '' : ' – nothing new, do not extract again here'}`);
          } catch (e) { add('Extraction failed: ' + (e as Error).message.slice(0, 120), 'err'); steps.push(`step ${step}: extract FAILED`); }
        } else { steps.push(`step ${step}: unknown action ${a.action}`); }
        if (step === MAX_STEPS) add(`Reached the ${MAX_STEPS}-step limit.`, 'err');
      }
      if (stopRef.current) add('Stopped by you.', 'err');
    } catch (e) { add('Error: ' + (e as Error).message, 'err'); }
    finally { exec(tabId, pgOverlay, false, '').catch(() => {}); setPhase('done'); stopRef.current = true; }
  };

  const cols = [...new Set(rows.flatMap(Object.keys))];
  return (
    <div className="tool">
      <textarea rows={3} value={goal} disabled={phase === 'running'} placeholder='Goal, e.g. "search best laptops under 50k and scrape names + prices"' onChange={(e) => setGoal(e.target.value)} />
      {phase !== 'running' && phase !== 'confirm' && <div className="row left"><button className="btn primary" disabled={!goal.trim()} onClick={() => setPhase('confirm')}>🕹 Take over browser</button></div>}
      {phase === 'confirm' && <div className="takeover"><b>Glimpse wants to take over your browser</b>
        <p className="small">It will open pages, click, type and scroll in a tab to reach your goal (max {MAX_STEPS} steps). You'll see a glowing border and a Stop button on the page. It never enters passwords or card details, and asks you before submitting forms or buying anything.</p>
        <div className="row left"><button className="btn primary" onClick={allow}>Allow</button><button className="btn" onClick={() => setPhase('idle')}>Stop</button></div></div>}
      {phase === 'running' && <div className="row left"><span className="live">● Controlling the browser</span><button className="btn danger" onClick={stop}>■ Stop</button></div>}
      {!!log.length && <div className="steplog">{log.map((l, i) => <div key={i} className={l.kind || ''}>{l.t}</div>)}<div ref={logEnd} /></div>}
      {ask && <div className="takeover"><b>{ask.q}</b><div className="row left"><button className="btn primary" onClick={() => ask.res(true)}>Allow once</button><button className="btn" onClick={() => ask.res(false)}>Deny</button></div></div>}
      {answer && <div className="out small">{answer}</div>}
      {!!rows.length && <>
        <div className="row left"><b>{rows.length} rows</b>
          <button className="btn" onClick={() => download('glimpse-agent.csv', toCSV(rows), 'text/csv')}>CSV</button>
          <button className="btn" onClick={() => download('glimpse-agent.json', JSON.stringify(rows, null, 2), 'application/json')}>JSON</button>
          <button className="btn" onClick={() => navigator.clipboard.writeText(toCSV(rows)).then(() => toast('Copied'))}>Copy</button></div>
        <div className="gtable"><table><thead><tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c}>{r[c]}</td>)}</tr>)}</tbody></table></div>
      </>}
    </div>
  );
}
