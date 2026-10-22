import { useEffect, useRef, useState, type ComponentType } from 'react';
import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Markdown } from '../Markdown';
import { toast } from '../toast';
import { runLLM } from './llm';
import { getSettings, blobToDataUrl, downscale } from '../../lib/storage';
import type { Msg } from '../../lib/messages';
import { dictate, ensureMic, speechSupported } from './speech';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast('Copied'));
const Err = ({ e }: { e: string }) => (e ? <div className="error"><span>{e}</span></div> : null);

/* ---------------- OCR ---------------- */
function OCR() {
  const [img, setImg] = useState(''); const [out, setOut] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const shot = async () => {
    const ok = (await chrome.permissions.contains({ origins: ['<all_urls>'] }).catch(() => false)) || (await chrome.permissions.request({ origins: ['<all_urls>'] }).catch(() => false));
    if (!ok) return setErr('Site access is needed to screenshot the tab.');
    try { const w = await chrome.windows.getCurrent(); setImg(await chrome.tabs.captureVisibleTab(w.id!, { format: 'png' })); setErr(''); }
    catch { setErr("Screenshots aren't available on this page."); }
  };
  const run = async () => {
    setBusy(true); setOut(''); setErr('');
    const r = runLLM([{ role: 'user', text: 'Extract ALL text in this image exactly as written (OCR). Preserve line breaks, lists and table layout (use Markdown tables for tables). Output only the extracted text, no commentary. If there is no text, say "No text found."', images: [await downscale(img, 2000)] }], setOut);
    try { await r.done; } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="tool" onPaste={async (e) => { const f = [...e.clipboardData.files].find((x) => x.type.startsWith('image/')); if (f) setImg(await blobToDataUrl(f)); }}>
      <div className="row left">
        <button className="btn" onClick={shot}>Screenshot visible tab</button>
        <label className="btn">Upload image<input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImg(await blobToDataUrl(f)); }} /></label>
      </div>
      <p className="muted small">Or paste an image here (Ctrl+V). For a region, use the crop tool in Chat. Needs a vision model (e.g. gpt-4o-mini, Gemini, Claude).</p>
      {img && <img src={img} className="shot" alt="" />}
      <div className="row left"><button className="btn primary" disabled={!img || busy} onClick={run}>{busy ? 'Extracting…' : 'Extract text'}</button>{out && !busy && <button className="btn" onClick={() => copy(out)}>Copy text</button>}</div>
      <Err e={err} />
      {out && <div className="md out"><Markdown text={out} /></div>}
    </div>
  );
}

/* ---------------- ChatPDF ---------------- */
function ChatPDF() {
  const [doc, setDoc] = useState<{ name: string; pages: number; text: string } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]); const [q, setQ] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const load = async (f: File) => {
    setErr(''); setMsgs([]);
    try {
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      let text = '';
      for (let i = 1; i <= pdf.numPages; i++) { const c = await (await pdf.getPage(i)).getTextContent(); text += `\n[Page ${i}]\n` + c.items.map((x: any) => x.str + (x.hasEOL ? '\n' : ' ')).join(''); }
      if (!text.replace(/\[Page \d+\]/g, '').trim()) setErr('No selectable text in this PDF (it may be scanned). Use OCR on page screenshots instead.');
      setDoc({ name: f.name, pages: pdf.numPages, text: text.slice(0, 150000) });
    } catch (e) { setErr('Could not read this PDF: ' + (e as Error).message); }
  };
  const ask = async (question: string) => {
    if (!doc || !question.trim()) return;
    const hist: Msg[] = [...msgs, { role: 'user', text: question }];
    setMsgs([...hist, { role: 'assistant', text: '' }]); setQ(''); setBusy(true); setErr('');
    const sys: Msg = { role: 'system', text: `You answer questions about the PDF "${doc.name}" (${doc.pages} pages${doc.text.length >= 150000 ? ', truncated' : ''}). Use only the document; cite pages like (p. 3). If the answer is not in it, say so.\n\nDOCUMENT:\n${doc.text}` };
    const r = runLLM([sys, ...hist], (t) => setMsgs([...hist, { role: 'assistant', text: t }]));
    try { await r.done; } catch (e) { setErr((e as Error).message); setMsgs(hist); } finally { setBusy(false); }
  };
  return (
    <div className="tool">
      <label className="btn primary">{doc ? 'Change PDF' : 'Upload PDF'}<input type="file" accept="application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); }} /></label>
      {doc && <p className="muted small">📄 {doc.name} · {doc.pages} pages</p>}
      {doc && !msgs.length && <div className="row left">{['Summarize this document', 'List the key points', 'What questions does this answer?'].map((s) => <button key={s} className="btn" onClick={() => ask(s)}>{s}</button>)}</div>}
      {msgs.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.role === 'user' ? <div className="bubble">{m.text}</div> : <div className="md"><Markdown text={m.text || '…'} /></div>}</div>)}
      <Err e={err} />
      {doc && <div className="row left"><input style={{ flex: 1 }} value={q} placeholder="Ask about the PDF…" onKeyDown={(e) => e.key === 'Enter' && !busy && ask(q)} onChange={(e) => setQ(e.target.value)} /><button className="btn primary" disabled={busy || !q.trim()} onClick={() => ask(q)}>Ask</button></div>}
    </div>
  );
}

/* ---------------- Painter ---------------- */
async function paint(prompt: string, size: string): Promise<string> {
  const s = await getSettings(); const key = s.apiKeys[s.provider] || '';
  if (s.provider === 'openai') {
    const call = (model: string) => fetch('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, prompt, n: 1, size, ...(model === 'dall-e-3' ? { response_format: 'b64_json' } : {}) }) });
    let r = await call('gpt-image-1');
    if (!r.ok && [400, 403, 404].includes(r.status)) r = await call('dall-e-3');
    if (!r.ok) throw new Error(`OpenAI image error ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json(); const d = j.data?.[0];
    return d?.b64_json ? `data:image/png;base64,${d.b64_json}` : d?.url;
  }
  if (s.provider === 'gemini') {
    let last = 0;
    for (const model of ['gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-2.5-flash-image', 'gemini-3-pro-image']) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }) });
      if (r.status === 404 || r.status === 429) { last = r.status; continue; }
      if (!r.ok) throw new Error(`Gemini image error ${r.status}: ${(await r.text()).slice(0, 200)}`);
      const parts = (await r.json()).candidates?.[0]?.content?.parts || [];
      const p = parts.find((x: any) => x.inlineData || x.inline_data); const d = p?.inlineData || p?.inline_data;
      if (d) return `data:${d.mimeType || d.mime_type};base64,${d.data}`;
      throw new Error('Gemini returned no image for this prompt.');
    }
    throw new Error(last === 429 ? 'Your Gemini key has no image-generation quota (free-tier keys get 0 image requests). Enable billing on the key in Google AI Studio, or use an OpenAI key, to use Painter.' : 'No Gemini image model is available for this key.');
  }
  if (s.provider === 'groq') throw new Error('Image generation is not supported by Groq (it has no image API). Switch the provider to OpenAI or Gemini in Settings to use Painter.');
  throw new Error(`Image generation isn't available with ${s.provider === 'anthropic' ? 'Anthropic (Claude has no image generation API)' : 'a custom endpoint'}. Switch the provider to OpenAI or Gemini in Settings to use Painter.`);
}
function Painter() {
  const [p, setP] = useState(''); const [size, setSize] = useState('1024x1024'); const [img, setImg] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => { setBusy(true); setErr(''); setImg(''); try { setImg(await paint(p, size)); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  return (
    <div className="tool paint">
      <textarea rows={4} value={p} placeholder="Describe the image… e.g. a black panther on a neon city rooftop, digital art" onChange={(e) => setP(e.target.value)} />
      <label className="opt">Size (OpenAI)<select value={size} onChange={(e) => setSize(e.target.value)}><option>1024x1024</option><option>1024x1536</option><option>1536x1024</option></select></label>
      <div className="row left"><button className="btn primary" disabled={busy || !p.trim()} onClick={go}>{busy ? 'Painting…' : 'Generate'}</button>
        {img && <a className="btn" href={img} download="glimpse-painter.png">Download</a>}</div>
      <p className="muted small">Works with OpenAI (gpt-image-1 / DALL·E 3) or Gemini image models, using your key from Settings.</p>
      <Err e={err} />{img && <img src={img} alt={p} />}
    </div>
  );
}

/* ---------------- REC Note ---------------- */
type Note = { id: string; at: number; title: string; transcript: string; note: string };
export async function transcribe(blob: Blob, live: string): Promise<string> {
  const s = await getSettings(); const key = s.apiKeys[s.provider] || '';
  if (s.provider === 'openai' && key) {
    const fd = new FormData(); fd.append('file', blob, 'rec.webm'); fd.append('model', 'whisper-1');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd });
    if (r.ok) return (await r.json()).text as string;
  }
  if (s.provider === 'groq' && key) {
    const fd = new FormData(); fd.append('file', blob, blob.type.includes('wav') ? 'rec.wav' : 'rec.webm'); fd.append('model', 'whisper-large-v3-turbo');
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd });
    if (r.ok) return (await r.json()).text as string;
    if (!live.trim()) throw new Error(`Groq Whisper error ${r.status}: ${(await r.text()).slice(0, 160)}`);
  }
  if (s.provider === 'gemini' && key && blob.size < 15e6) {
    const r = runLLM([{ role: 'user', text: 'Transcribe this audio verbatim. Output only the transcript.', images: [await blobToDataUrl(blob)] }], () => {});
    try { const t = await r.done; if (t.trim()) return t; } catch (e) { if (!live.trim()) throw new Error('Transcription failed: ' + (e as Error).message); }
  }
  return live;
}
function RecNote() {
  const [rec, setRec] = useState(false); const [src, setSrc] = useState<'mic' | 'tab' | 'both'>('mic'); const [live, setLive] = useState(''); const [secs, setSecs] = useState(0);
  const [stage, setStage] = useState(''); const [note, setNote] = useState<Note | null>(null); const [notes, setNotes] = useState<Note[]>([]); const [err, setErr] = useState('');
  const mr = useRef<MediaRecorder | null>(null); const chunks = useRef<Blob[]>([]); const streams = useRef<MediaStream[]>([]); const sr = useRef<{ stop: () => void; text: () => string } | null>(null); const timer = useRef(0);
  useEffect(() => { chrome.storage.local.get('recNotes').then((x) => setNotes((x.recNotes as Note[]) || [])); return () => { stopAll(); }; }, []);
  const stopAll = () => { streams.current.forEach((s) => s.getTracks().forEach((t) => t.stop())); streams.current = []; clearInterval(timer.current); };
  const tabStream = async () => {
    const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const id: string = await new Promise((res, rej) => chrome.tabCapture.getMediaStreamId({ targetTabId: t.id }, (x) => (chrome.runtime.lastError ? rej(new Error(chrome.runtime.lastError.message)) : res(x))));
    return navigator.mediaDevices.getUserMedia({ audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: id } } as any });
  };
  const start = async () => {
    setErr(''); setNote(null); setLive(''); chunks.current = [];
    try {
      const ctx = new AudioContext(); const dest = ctx.createMediaStreamDestination();
      if (src !== 'tab') { if (!(await ensureMic())) return setErr('Allow the microphone in the tab that opened, then press Record again.'); const m = await navigator.mediaDevices.getUserMedia({ audio: true }); streams.current.push(m); ctx.createMediaStreamSource(m).connect(dest); }
      if (src !== 'mic') { const t = await tabStream(); streams.current.push(t); const n = ctx.createMediaStreamSource(t); n.connect(dest); n.connect(ctx.destination); /* keep tab audible */ }
      const r = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' }); r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data); r.start(1000); mr.current = r;
      if (src !== 'tab' && speechSupported()) sr.current = dictate({ onText: (f, i) => setLive((f + ' ' + i).trim()) });
      setSecs(0); timer.current = window.setInterval(() => setSecs((x) => x + 1), 1000); setRec(true);
    } catch (e) { stopAll(); setErr('Could not start recording: ' + (e as Error).message + (src !== 'mic' ? ' (tab audio needs a normal web page in the active tab)' : '')); }
  };
  const stop = async () => {
    setRec(false); const liveText = sr.current?.text() || live; sr.current?.stop(); sr.current = null;
    const r = mr.current!; await new Promise((res) => { r.onstop = res; r.stop(); }); stopAll();
    const blob = new Blob(chunks.current, { type: 'audio/webm' });
    try {
      setStage('Transcribing…'); const transcript = (await transcribe(blob, liveText)).trim();
      if (!transcript) { setStage(''); return setErr('No speech was captured. With Anthropic/custom providers only live mic dictation is transcribed; use OpenAI or Gemini for recorded/tab audio.'); }
      setStage('Writing note…');
      const n: Note = { id: crypto.randomUUID(), at: Date.now(), title: '', transcript, note: '' };
      const x = runLLM([{ role: 'user', text: `Turn this recording transcript into a clear note in Markdown: first line "# <short title>", then **Summary** (2-4 sentences), **Key points** (bullets), **Action items** (checkboxes, if any).\n\nTRANSCRIPT:\n${transcript}` }], (t) => setNote({ ...n, note: t }));
      n.note = await x.done; n.title = (/^#\s*(.+)$/m.exec(n.note)?.[1] || 'Recording').slice(0, 80);
      setNote(n); const all = [n, ...notes].slice(0, 50); setNotes(all); await chrome.storage.local.set({ recNotes: all });
    } catch (e) { setErr((e as Error).message); } finally { setStage(''); }
  };
  const mmss = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <div className="tool">
      <label className="opt">Record<select value={src} disabled={rec} onChange={(e) => setSrc(e.target.value as any)}><option value="mic">Microphone</option><option value="tab">Tab audio (meeting/video)</option><option value="both">Tab + microphone</option></select></label>
      <div className="row left">{rec ? <button className="btn primary" onClick={stop}>■ Stop ({mmss})</button> : <button className="btn primary" disabled={!!stage} onClick={start}>● Record</button>}{stage && <span className="muted">{stage}</span>}</div>
      {rec && live && <p className="muted small">{live}</p>}
      <Err e={err} />
      {note && <div className="md out"><Markdown text={note.note || '…'} /><div className="row left"><button className="btn" onClick={() => copy(note.note)}>Copy note</button><button className="btn" onClick={() => copy(note.transcript)}>Copy transcript</button></div></div>}
      {!!notes.length && <><h4 className="muted small">Saved notes</h4>{notes.map((n) => <div key={n.id} className="hitem" onClick={() => setNote(n)}><span className="ht"><span className="title">{n.title}</span><span className="muted small"> · {new Date(n.at).toLocaleString()}</span></span>
        <button className="btn" onClick={async (e) => { e.stopPropagation(); const all = notes.filter((x) => x.id !== n.id); setNotes(all); await chrome.storage.local.set({ recNotes: all }); }}>✕</button></div>)}</>}
    </div>
  );
}

export const EXTRA_TOOLS: Record<string, ComponentType> = { ocr: OCR, pdf: ChatPDF, painter: Painter, rec: RecNote };
