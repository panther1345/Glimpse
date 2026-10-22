import { useEffect, useState } from 'react';

const originPattern = (url: string) => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? `${u.origin}/*` : null; } catch { return null; } };
import { type Settings, type ProviderId, getSettings, saveSettings } from '../lib/storage';
import { PROVIDERS, MODEL_SUGGESTIONS } from '../lib/providers';
import { groqModels, pickChat } from '../lib/providers/groq';
import type { PortOut } from '../lib/messages';

const LANGS = ['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Spanish', 'French', 'German', 'Japanese', 'Chinese (Simplified)', 'Arabic', 'Portuguese', 'Russian'];

export function Options() {
  const [s, setS] = useState<Settings | null>(null);
  const [show, setShow] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; msg: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [grantShots, setGrantShots] = useState(location.hash === '#grant-shots');
  const [baseDraft, setBaseDraft] = useState('');
  const [declined, setDeclined] = useState(false);
  const [granted, setGranted] = useState<boolean | null>(null); // access state for the saved custom base URL
  useEffect(() => { getSettings().then((x) => { setS(x); setBaseDraft(x.baseUrl); }); }, []);
  const checkAccess = async (url: string) => {
    const o = originPattern(url); if (!o) return setGranted(null);
    const all = await chrome.permissions.contains({ origins: ['<all_urls>'] }).catch(() => false);
    setGranted(all || (await chrome.permissions.contains({ origins: [o] }).catch(() => false)));
  };
  const [groqList, setGroqList] = useState<string[]>([]); const [groqMsg, setGroqMsg] = useState('');
  const loadGroq = async (key: string) => {
    if (!key) return; setGroqMsg('Loading Groq models…');
    try {
      const l = await groqModels(key); setGroqList(l);
      const cur = (await getSettings()).models.groq;
      if (!cur || !l.includes(cur)) { const best = pickChat(l); if (best) { setS((x) => x && ({ ...x, models: { ...x.models, groq: best } })); const cs = await getSettings(); await saveSettings({ models: { ...cs.models, groq: best } }); } }
      setGroqMsg(`${l.length} models available on this key.`);
    } catch (e) { setGroqMsg((e as Error).message); }
  };
  const groqKey = s?.provider === 'groq' ? s.apiKeys.groq || '' : '';
  useEffect(() => { if (!groqKey) return; const t = setTimeout(() => loadGroq(groqKey), 600); return () => clearTimeout(t); }, [groqKey]);
  useEffect(() => { if (s?.provider === 'custom') checkAccess(baseDraft); }, [s?.provider, baseDraft]);
  if (!s) return null;
  const p = s.provider;
  const suggestions = p === 'groq' && groqList.length ? groqList : MODEL_SUGGESTIONS[p];
  const up = async (patch: Partial<Settings>) => { setS({ ...s, ...patch }); setTest(null); await saveSettings(patch); setSaved(true); setTimeout(() => setSaved(false), 1200); };

  /** Must be called synchronously from a click: requests the origin unless all-sites or that origin is already granted. */
  const requestAccess = (url: string): Promise<boolean> => {
    if (p !== 'custom') return Promise.resolve(true);
    const o = originPattern(url);
    if (!o) { setDeclined(false); return Promise.resolve(false); }
    if (granted) { setDeclined(false); return Promise.resolve(true); }
    return chrome.permissions.request({ origins: [o] }).catch(() => false).then((ok) => { setGranted(ok); setDeclined(!ok); return ok; });
  };
  const saveBase = () => {
    const url = baseDraft.trim();
    const req = requestAccess(url); // first, inside the gesture
    up({ baseUrl: url }); // saved even if access is declined
    return req;
  };
  const runTest = () => {
    const req = p === 'custom' ? saveBase() : p === 'groq' ? loadGroq(s.apiKeys.groq || '').then(() => true) : Promise.resolve(true);
    setTest({ ok: true, msg: 'Testing…' });
    req.then((ok) => {
      if (!ok) return setTest({ ok: false, msg: "Glimpse can't reach this endpoint until access is allowed." });
      const port = chrome.runtime.connect({ name: 'chat' });
      let got = '';
      port.onMessage.addListener((m: PortOut) => {
        if (m.type === 'chunk') got += m.text;
        else if (m.type !== 'meta') { port.disconnect(); setTest(m.type === 'done' ? { ok: true, msg: `Connected. Reply: “${got.slice(0, 80) || '(empty)'}”` } : { ok: false, msg: m.error.message }); }
      });
      port.postMessage({ type: 'start', messages: [{ role: 'user', text: 'Reply with the single word: ok' }] });
    });
  };

  return (
    <div className="wrap">
      <h1><img src="/icons/icon48.png" alt="" width={32} /> Glimpse settings {saved && <span className="saved">Saved</span>}</h1>
      {grantShots && <div className="card grant"><p><b>Allow screenshots on web pages</b><br />Chrome only lets Glimpse capture a page from a page button after you allow site access once. (Shortcuts Alt+Shift+S / Alt+Shift+F and the right-click menu work without this.)</p>
        <button className="btn" onClick={() => chrome.permissions.request({ origins: ['<all_urls>'] }).catch(() => false).then((ok) => { if (ok) { setGrantShots(false); if (history.length <= 1) window.close(); } })}>Allow</button></div>}

      <section>
        <h2>AI provider</h2>
        <label>Provider
          <select value={p} onChange={(e) => up({ provider: e.target.value as ProviderId })}>
            {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => <option key={id} value={id}>{PROVIDERS[id].label}</option>)}
          </select>
        </label>
        <label>API key{p === 'custom' && ' (optional)'}
          <div className="inline">
            <input type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={s.apiKeys[p] || ''} placeholder="Paste your key"
              onChange={(e) => up({ apiKeys: { ...s.apiKeys, [p]: e.target.value.trim() } })} />
            <button className="btn" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
          </div>
        </label>
        {p === 'custom' && (<>
          <label>Base URL (OpenAI-compatible, e.g. http://localhost:11434/v1)
            <div className="inline">
              <input value={baseDraft} onChange={(e) => setBaseDraft(e.target.value)} />
              <button className="btn" onClick={() => { saveBase(); }}>Save</button>
            </div>
          </label>
          {declined && !granted && (
            <div className="access-warn">
              <span>Glimpse can't reach this endpoint until access is allowed.</span>
              <button className="btn" onClick={() => { requestAccess(s.baseUrl); }}>Grant access</button>
            </div>
          )}
        </>)}
        <label>Model (must support images for screenshots)
          <input list="models" value={s.models[p] ?? ''} placeholder={PROVIDERS[p].defaultModel} onChange={(e) => up({ models: { ...s.models, [p]: e.target.value.trim() } })} />
          <datalist id="models">{suggestions.map((m) => <option key={m} value={m} />)}</datalist>
        </label>
        {p === 'groq' && <div className="inline"><button className="btn" disabled={!s.apiKeys.groq} onClick={() => loadGroq(s.apiKeys.groq || '')}>Refresh Groq models</button>{groqMsg && <span className="muted">{groqMsg}</span>}</div>}
        <div className="inline"><button className="btn primary" onClick={runTest}>Test connection</button>
          {test && <span className={test.ok ? 'ok' : 'bad'}>{test.msg}</span>}</div>
        <p className="muted">Keys are stored only in this browser (chrome.storage.local) and are sent only to the provider you choose.</p>
      </section>

      <section>
        <h2>Behaviour</h2>
        <label>Translate into
          <select value={s.translateLang} onChange={(e) => up({ translateLang: e.target.value })}>{LANGS.map((l) => <option key={l}>{l}</option>)}</select>
        </label>
        <label>Theme
          <select value={s.theme} onChange={(e) => up({ theme: e.target.value as Settings['theme'] })}>
            <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={s.launcher} onChange={(e) => up({ launcher: e.target.checked })} /> Show floating launcher button on pages</label>
        {(s.launcherHiddenSites || []).length > 0 && <p>Floating button hidden on: {(s.launcherHiddenSites || []).map((h) => <span key={h}> {h} <button className="btn" onClick={() => up({ launcherHiddenSites: (s.launcherHiddenSites || []).filter((x) => x !== h) })}>Show again</button></span>)} <button className="btn" onClick={() => up({ launcher: true, launcherHiddenSites: [] })}>Show on all sites</button></p>}
        <p>Hiding/disabling the floating button only hides it — the selection toolbar, right-click menu, shortcuts and side panel keep working.</p>
        <label className="check"><input type="checkbox" checked={s.selectionToolbar} onChange={(e) => up({ selectionToolbar: e.target.checked })} /> Show toolbar when selecting text</label>
        <label className="check"><input type="checkbox" checked={s.answerOnCopy !== false} onChange={(e) => up({ answerOnCopy: e.target.checked })} /> Explain text when I copy it (shows the answer card)</label>
        <label className="check"><input type="checkbox" checked={s.answerInPopup !== false} onChange={(e) => up({ answerInPopup: e.target.checked })} /> Answer in page popup (screenshots and selected text answer in a floating card instead of the side panel)</label>
        <label className="check"><input type="checkbox" checked={s.webSearch !== false} onChange={(e) => up({ webSearch: e.target.checked })} /> Web search (Gemini only: answers current-fact questions using Google Search grounding; falls back to a normal answer if the API rejects it)</label>
        <label className="check"><input type="checkbox" checked={s.selectionInInputs} onChange={(e) => up({ selectionInInputs: e.target.checked })} /> …also inside text fields</label>
      </section>

      <section>
        <h2>Keyboard shortcuts</h2>
        <p>Alt+Shift+S region screenshot · Alt+Shift+F full tab · Alt+Shift+G open panel.</p>
        <button className="btn" onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}>Change shortcuts</button>
      </section>
    </div>
  );
}
