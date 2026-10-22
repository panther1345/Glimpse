import { useCallback, useEffect, useRef, useState } from 'react';
import type { Msg, PortOut, ChatError, RuntimeMsg, CaptureReply } from '../lib/messages';
import { type Chat, type Settings, getSettings, saveSettings, saveChat, makeTitle, downscale, blobToDataUrl } from '../lib/storage';
import { PROVIDERS, MODEL_SUGGESTIONS } from '../lib/providers';
import { DEFAULT_SCREENSHOT_Q } from '../lib/prompts';
import { Markdown } from './Markdown';
import { History } from './History';
import { toast } from './toast';
import * as I from './icons';
import { ToolMenu, ToolView, type ToolId } from './tools/Tools';
import { dictate, ensureMic, speechSupported, recordUtterance } from './tools/speech';
import { transcribe } from './tools/extra';
import { aiSpeech } from './tools/aivoice';
import { speakText } from './tools/say';

const newChat = (): Chat => ({ id: crypto.randomUUID(), title: '', createdAt: Date.now(), updatedAt: Date.now(), model: '', messages: [] });
const openOptions = () => chrome.runtime.openOptionsPage();

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [view, setView] = useState<'chat' | 'history' | 'tools'>('chat');
  const [tool, setTool] = useState<ToolId | null>(null);
  const [hands, setHands] = useState(false);
  const [goal, setGoal] = useState('');
  const [interim, setInterim] = useState('');
  const recRef = useRef<{ stop: () => void } | null>(null);
  const handsRef = useRef(false); handsRef.current = hands;
  const [chat, setChat] = useState<Chat>(newChat);
  const [input, setInput] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<ChatError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const chatRef = useRef(chat); chatRef.current = chat;
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getSettings().then(setSettings);
    const l = (c: Record<string, chrome.storage.StorageChange>) => { if (c.settings) getSettings().then(setSettings); };
    chrome.storage.onChanged.addListener(l);
    return () => chrome.storage.onChanged.removeListener(l);
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [chat.messages, streaming]);

  const hasKey = !!settings && (settings.provider === 'custom' || !!settings.apiKeys[settings.provider]);
  const model = settings ? settings.models[settings.provider] || PROVIDERS[settings.provider].defaultModel : '';

  const persist = (c: Chat) => { setChat(c); if (c.messages.length) saveChat(c); };

  const stream = useCallback((history: Msg[], base: Chat) => {
    setError(null); setStreaming(true);
    let acc = '';
    let cur: Chat = { ...base, messages: [...history, { role: 'assistant', text: '' }], updatedAt: Date.now() };
    setChat(cur);
    const port = chrome.runtime.connect({ name: 'chat' }); portRef.current = port;
    const finish = (err?: ChatError) => {
      setStreaming(false); portRef.current = null; try { port.disconnect(); } catch { /* */ }
      const msgs = acc ? cur.messages : history; // drop empty assistant on error
      cur = { ...cur, messages: msgs, updatedAt: Date.now() };
      persist(cur);
      if (err) setError(err);
    };
    port.onMessage.addListener((m: PortOut) => {
      if (m.type === 'chunk') {
        acc += m.text;
        cur = { ...cur, messages: [...history, { role: 'assistant', text: acc }] };
        setChat(cur);
      } else if (m.type === 'done') finish();
      else if (m.type === 'error') finish(m.error);
    });
    port.onDisconnect.addListener(() => { if (portRef.current === port) finish({ code: 'other', message: 'Connection to the background worker was lost.' }); });
    port.postMessage({ type: 'start', messages: history });
  }, []);

  const send = useCallback(async (textArg?: string, imgsArg?: string[]) => {
    if (streaming) return;
    const imgs = imgsArg ?? images;
    let text = (textArg ?? input).trim();
    if (!text && !imgs.length) return;
    if (!text) text = DEFAULT_SCREENSHOT_Q;
    const small = await Promise.all(imgs.map((d) => downscale(d)));
    const c = chatRef.current;
    const msg: Msg = { role: 'user', text, ...(small.length ? { images: small } : {}) };
    const history = [...c.messages, msg];
    const base: Chat = { ...c, title: c.title || makeTitle(textArg ?? input), model: `${settings?.provider}/${model}` };
    setInput(''); setImages([]); setNotice(null);
    stream(history, base);
  }, [streaming, images, input, settings, model, stream]);
  const sendRef = useRef(send); sendRef.current = send;

  const stop = () => portRef.current?.postMessage({ type: 'stop' });
  const regenerate = () => {
    const msgs = chat.messages; if (streaming || !msgs.length) return;
    const lastUser = msgs[msgs.length - 1].role === 'assistant' ? msgs.slice(0, -1) : msgs;
    stream(lastUser, chat);
  };
  const retry = () => { if (chat.messages.length) stream(chat.messages[chat.messages.length - 1].role === 'user' ? chat.messages : chat.messages.slice(0, -1), chat); };

  const addImage = (d: string) => { setImages((x) => [...x, d]); setNotice(null); setTimeout(() => taRef.current?.focus(), 0); };
  const handleCapture = (r: CaptureReply) => {
    if (r.image) addImage(r.image);
    else if (r.error === 'restricted_page') setNotice("Screenshots aren't available on this page.");
    else if (r.error) setNotice('Screenshot failed. Try again.');
  };
  const [askAccess, setAskAccess] = useState<'region' | 'tab' | null>(null);
  const doCapture = async (mode: 'region' | 'tab') => {
    setNotice(null);
    const r: CaptureReply = await chrome.runtime.sendMessage({ type: 'CAPTURE', mode, windowId: (await chrome.windows.getCurrent()).id });
    if (r?.pending) return;
    handleCapture(r || { error: 'failed' });
  };
  // Panel clicks don't grant activeTab, so explain before Chrome's one-time optional site-access prompt.
  const capture = async (mode: 'region' | 'tab') => {
    setNotice(null);
    const granted = await chrome.permissions.contains({ origins: ['<all_urls>'] }).catch(() => false);
    if (granted) return doCapture(mode);
    setAskAccess(mode);
  };
  const continueAccess = () => {
    const mode = askAccess; if (!mode) return;
    setAskAccess(null);
    // Called synchronously from the click handler so the user gesture is preserved.
    chrome.permissions.request({ origins: ['<all_urls>'] })
      .catch(() => false)
      .finally(() => doCapture(mode));
  };

  // Messages pushed from the service worker
  useEffect(() => {
    const onMsg = (m: RuntimeMsg, _s: chrome.runtime.MessageSender, reply: (x: unknown) => void) => {
      if (m.type === 'CAPTURED') { handle(m); reply(true); }
      else if (m.type === 'CAPTURE_ERROR' || m.type === 'PREFILL' || m.type === 'LOAD_CHAT') { handle(m); reply(true); }
    };
    const handle = (m: RuntimeMsg) => {
      setView('chat');
      if (m.type === 'CAPTURED') addImage(m.image);
      else if (m.type === 'CAPTURE_ERROR') handleCapture({ error: m.error });
      else if (m.type === 'LOAD_CHAT') {
        const first = m.messages.find((x) => x.role === 'user');
        const c = { ...newChat(), title: makeTitle(first?.text || ''), messages: m.messages };
        setChat(c); saveChat(c).catch(() => {});
      }
      else if (m.type === 'PREFILL') {
        if (m.autoSend) setTimeout(() => sendRef.current(m.prompt, []), 0);
        else { setInput(m.prompt); setTimeout(() => { const t = taRef.current; if (t) { t.focus(); t.selectionStart = t.selectionEnd = t.value.length; } }, 0); }
      }
    };
    chrome.runtime.onMessage.addListener(onMsg);
    chrome.runtime.sendMessage({ type: 'TAKE_PENDING' }).then((list: RuntimeMsg[]) => (list || []).forEach(handle)).catch(() => {});
    return () => chrome.runtime.onMessage.removeListener(onMsg);
  }, []);

  const onPaste = async (e: React.ClipboardEvent) => {
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return; e.preventDefault();
    for (const f of files) addImage(await blobToDataUrl(f));
  };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    for (const f of [...(e.target.files || [])]) if (f.type.startsWith('image/')) addImage(await blobToDataUrl(f));
    e.target.value = '';
  };
  const copy = (t: string) => { navigator.clipboard.writeText(t).then(() => toast('Copied')); };
  const startNew = () => { stop(); setChat(newChat()); setError(null); setNotice(null); setView('chat'); };

  // Hand: hands-free voice chat (dictate -> send -> read answer aloud -> listen again)
  const listen = async () => {
    const aiStt = settings?.provider === 'openai' || settings?.provider === 'gemini';
    if (aiStt) {
      if (!(await ensureMic())) { setNotice('Allow the microphone in the tab that opened, then press the mic again.'); setHands(false); return; }
      setInterim('Listening…');
      const r = recordUtterance((sp) => setInterim(sp ? 'Listening… (hearing you)' : 'Listening…')); recRef.current = r;
      try {
        const blob = await r.done; recRef.current = null;
        if (!handsRef.current) { setInterim(''); return; }
        if (!blob.size) { setInterim(''); setNotice('Didn\'t hear anything. Press the mic to try again.'); setHands(false); return; }
        setInterim('Transcribing…'); const said = (await transcribe(blob, '')).trim(); setInterim('');
        if (said) sendRef.current(said, []); else { setNotice('Could not understand the audio.'); setHands(false); }
      } catch (e) { setInterim(''); setNotice('Mic error: ' + (e as Error).message); setHands(false); }
      return;
    }
    if (!speechSupported()) { setNotice('Voice input is not supported in this browser.'); setHands(false); return; }
    if (!(await ensureMic())) { setNotice('Allow the microphone in the tab that opened, then press the mic again.'); setHands(false); return; }
    let said = '';
    recRef.current = dictate({ continuous: false, onText: (f, i) => { said = f; setInterim(f + ' ' + i); },
      onError: (m) => { setNotice(m); setHands(false); },
      onEnd: () => { recRef.current = null; setInterim(''); if (said.trim()) sendRef.current(said.trim(), []); else if (handsRef.current) setHands(false); } });
  };
  const toggleHands = () => { if (hands) { setHands(false); recRef.current?.stop(); speechSynthesis.cancel(); } else { setView('chat'); setHands(true); listen(); } };
  const wasStreaming = useRef(false);
  useEffect(() => {
    if (wasStreaming.current && !streaming && handsRef.current) {
      const last = chatRef.current.messages[chatRef.current.messages.length - 1];
      const again = () => { if (handsRef.current) listen(); };
      if (last?.role === 'assistant' && last.text) {
        if (speechSynthesis.getVoices().length) speakText(last.text, settings?.voice, again);
        else aiSpeech(last.text.slice(0, 1500), '').then((u) => { const a = new Audio(u); a.onended = again; a.onerror = again; a.play().catch(again); }).catch(again);
      }
      else setHands(false);
    }
    wasStreaming.current = streaming;
  }, [streaming]);
  const pickTool = (id: ToolId) => { if (id === 'chat') { setTool(null); setView('chat'); } else if (id === 'hand') { setTool(null); if (!hands) toggleHands(); else setView('chat'); } else setTool(id); };

  if (!settings) return null;
  return (
    <div className="app">
      <header>
        <img src="/icons/icon32.png" alt="" className="logo" /><strong>Glimpse</strong>
        <select className="picker" title="Model" value={`${settings.provider}|${model}`}
          onChange={(e) => { const [p, m] = e.target.value.split('|') as [Settings['provider'], string]; saveSettings({ provider: p, models: { ...settings.models, [p]: m } }); }}>
          {(Object.keys(PROVIDERS) as Settings['provider'][]).map((p) => {
            const cur = settings.models[p] || PROVIDERS[p].defaultModel;
            const list = [...new Set([cur, ...MODEL_SUGGESTIONS[p]])];
            return <optgroup key={p} label={PROVIDERS[p].label}>{list.map((m) => <option key={m} value={`${p}|${m}`}>{m}</option>)}</optgroup>;
          })}
        </select>
        <span className="grow" />
        <button className={`icon ${view === 'tools' ? 'on' : ''}`} title="Tools menu" onClick={() => { setTool(null); setView(view === 'tools' ? 'chat' : 'tools'); }}>☰</button>
        <button className="icon" title="New chat" onClick={startNew}><I.IcPlus /></button>
        <button className={`icon ${view === 'history' ? 'on' : ''}`} title="History" onClick={() => setView(view === 'history' ? 'chat' : 'history')}><I.IcHistory /></button>
        <button className="icon" title={settings.launcher === false || (settings.launcherHiddenSites || []).length ? 'Show floating button on all sites' : 'Floating button is shown'} onClick={() => saveSettings({ launcher: true, launcherHiddenSites: [] })} style={{ opacity: settings.launcher === false || (settings.launcherHiddenSites || []).length ? 1 : 0.4 }}>👁</button>
        <button className="icon" title={`Theme: ${settings.theme} (click to change)`} onClick={() => saveSettings({ theme: settings.theme === 'system' ? 'light' : settings.theme === 'light' ? 'dark' : 'system' })}>{settings.theme === 'light' ? '☀' : settings.theme === 'dark' ? '☾' : '◐'}</button>
        <button className="icon" title="Settings" onClick={openOptions}><I.IcGear /></button>
      </header>

      {view === 'tools' ? (tool ? <ToolView id={tool} onBack={() => { setTool(null); setGoal(''); }} voice={settings.voice} goal={goal} /> : <ToolMenu onPick={pickTool} />)
      : view === 'history' ? (
        <History currentId={chat.id} onOpen={(c) => { setChat(c); setError(null); setView('chat'); }} onBack={() => setView('chat')} onDeleted={(id) => { if (id === chat.id || id === '*') setChat(newChat()); }} />
      ) : (
        <>
          <main className="messages">
            {!hasKey && (
              <div className="card">
                <h3>Add an API key to start</h3>
                <p>Glimpse uses your own AI provider key (OpenAI, Anthropic, Gemini or any OpenAI-compatible server). It stays in this browser.</p>
                <button className="btn primary" onClick={openOptions}>Open settings</button>
              </div>
            )}
            {hasKey && !chat.messages.length && (
              <div className="empty">
                <img src="/icons/icon128.png" alt="" width={56} />
                <h3>Ask about anything on screen</h3>
                <p>Grab a region or the whole tab, then type your question. Or select text on a page for quick actions.</p>
                <div className="row"><button className="btn" onClick={() => capture('region')}><I.IcCrop /> Region</button><button className="btn" onClick={() => capture('tab')}><I.IcTab /> Full tab</button></div>
                <p className="hint">Alt+Shift+S region · Alt+Shift+F full tab</p>
              </div>
            )}
            {chat.messages.map((m, i) => {
              const last = i === chat.messages.length - 1;
              return (
                <div key={i} className={`msg ${m.role}`}>
                  {m.images?.map((src, j) => <img key={j} className="shot" src={src} alt="screenshot" />)}
                  {m.role === 'user' ? <div className="bubble">{m.text}</div> : (
                    <>
                      {m.text ? <Markdown text={m.text} /> : <div className="typing"><span /><span /><span /></div>}
                      <div className="actions">
                        {last && streaming ? <button className="icon" onClick={stop}><I.IcStop /> Stop</button> : (
                          <>
                            <button className="icon" title="Copy" onClick={() => copy(m.text)}><I.IcCopy /> Copy</button>
                            {last && <button className="icon" title="Regenerate" onClick={regenerate}><I.IcRegen /> Regenerate</button>}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
            {error && (
              <div className="error">
                <span>{error.message}</span>
                {error.code === 'no_key' || error.code === 'auth' ? <button className="btn" onClick={openOptions}>Settings</button> : null}
                <button className="btn" onClick={retry}>Retry</button>
              </div>
            )}
            <div ref={endRef} />
          </main>

          <footer className="composer">
            {(hands || interim) && <div className="handbar">✋ <span className="grow">{interim || (streaming ? 'Thinking…' : 'Hands-free on — listening / speaking')}</span><button className="btn" onClick={toggleHands}>Stop</button></div>}
            {askAccess && (
              <div className="notice access">
                <span>Glimpse needs access to this page to take a screenshot. Chrome will ask once.</span>
                <span className="row"><button className="btn primary" onClick={continueAccess}>Continue</button><button className="btn" onClick={() => setAskAccess(null)}>Cancel</button></span>
              </div>
            )}
            {notice && <div className="notice">{notice}<button className="icon" onClick={() => setNotice(null)}>×</button></div>}
            {!!images.length && (
              <div className="thumbs">{images.map((src, i) => (
                <div key={i} className="thumb"><img src={src} alt="" /><button title="Remove" onClick={() => setImages(images.filter((_, j) => j !== i))}>×</button></div>
              ))}</div>
            )}
            <textarea ref={taRef} rows={3} value={input} placeholder={images.length ? 'Ask about this screenshot… (Enter to send)' : 'Ask anything… (Enter to send, Shift+Enter for new line)'}
              onChange={(e) => setInput(e.target.value)} onPaste={onPaste}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
            <div className="tools">
              <button className="icon" title="Take over browser: let Glimpse do this task in a tab" onClick={() => { setGoal(input.trim()); setTool('web'); setView('tools'); }}>🕹</button>
              <button className={`icon ${hands ? 'rec' : ''}`} title="Hand: hands-free voice chat" onClick={toggleHands}>🎤</button>
              <button className="icon" title="Screenshot a region (Alt+Shift+S)" onClick={() => capture('region')}><I.IcCrop /></button>
              <button className="icon" title="Screenshot full visible tab (Alt+Shift+F)" onClick={() => capture('tab')}><I.IcTab /></button>
              <label className="icon" title="Attach image"><I.IcImage /><input type="file" accept="image/*" multiple hidden onChange={onFile} /></label>
              <span className="grow" />
              {streaming ? <button className="btn" onClick={stop}><I.IcStop /> Stop</button>
                : <button className="btn primary send" disabled={!hasKey || (!input.trim() && !images.length)} onClick={() => send()}><I.IcSend /> Send</button>}
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
