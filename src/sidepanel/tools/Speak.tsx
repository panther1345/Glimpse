import { useEffect, useRef, useState } from 'react';
import { pageSelection } from './llm';
import { getSettings } from '../../lib/storage';
import { AI_VOICES, aiSpeech } from './aivoice';
export function Speak({ defaultVoice }: { defaultVoice?: string }) {
  const [text, setText] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [engine, setEngine] = useState<'browser' | 'ai'>('browser');
  const [provider, setProvider] = useState('');
  const [voice, setVoice] = useState(defaultVoice || '');
  const [aiVoice, setAiVoice] = useState('');
  const [rate, setRate] = useState(1);
  const [speaking, setSpeaking] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [audio, setAudio] = useState('');
  const aRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const l = () => setVoices(speechSynthesis.getVoices()); l(); speechSynthesis.onvoiceschanged = l;
    getSettings().then((s) => { setProvider(s.provider); if (AI_VOICES[s.provider]) setTimeout(() => { if (!speechSynthesis.getVoices().length) setEngine('ai'); }, 600); });
    return () => { speechSynthesis.cancel(); };
  }, []);
  const play = async () => {
    setErr('');
    if (engine === 'ai') {
      setBusy(true);
      try { const u = await aiSpeech(text, aiVoice); setAudio(u); setTimeout(() => { if (aRef.current) { aRef.current.playbackRate = rate; aRef.current.play().catch(() => {}); } }, 50); }
      catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
      return;
    }
    if (!voices.length) { setErr('No browser voices are installed on this system. Switch Engine to "AI voice".'); return; }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = voices.find((x) => x.name === voice); if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = rate; u.onend = u.onerror = () => setSpeaking(false);
    setSpeaking(true); speechSynthesis.speak(u);
  };
  return (
    <div className="tool">
      <textarea rows={8} value={text} placeholder="Text to read aloud…" onChange={(e) => setText(e.target.value)} />
      <div className="row left"><button className="btn" onClick={async () => setText((await pageSelection()) || text)}>Use page selection</button></div>
      <label className="opt">Engine<select value={engine} onChange={(e) => setEngine(e.target.value as 'browser' | 'ai')}><option value="browser">Browser voice (offline)</option><option value="ai" disabled={!AI_VOICES[provider]}>AI voice ({provider === 'openai' ? 'OpenAI' : 'Gemini'})</option></select></label>
      {engine === 'browser'
        ? <label className="opt">Voice<select value={voice} onChange={(e) => setVoice(e.target.value)}><option value="">Default</option>{voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}</select></label>
        : <label className="opt">Voice<select value={aiVoice} onChange={(e) => setAiVoice(e.target.value)}>{(AI_VOICES[provider] || []).map((v) => <option key={v}>{v}</option>)}</select></label>}
      <label className="opt">Speed {rate.toFixed(1)}×<input type="range" min={0.5} max={2} step={0.1} value={rate} onChange={(e) => setRate(+e.target.value)} /></label>
      <div className="row left">
        {speaking ? <><button className="btn" onClick={() => speechSynthesis.pause()}>Pause</button><button className="btn" onClick={() => speechSynthesis.resume()}>Resume</button><button className="btn" onClick={() => { speechSynthesis.cancel(); setSpeaking(false); }}>Stop</button></>
          : <button className="btn primary" disabled={!text.trim() || busy} onClick={play}>{busy ? 'Generating voice…' : 'Speak'}</button>}
      </div>
      {err && <div className="error"><span>{err}</span></div>}
      {audio && engine === 'ai' && <><audio ref={aRef} src={audio} controls style={{ width: '100%' }} /><a className="btn" href={audio} download="glimpse-speech.wav">Download audio</a></>}
    </div>
  );
}
