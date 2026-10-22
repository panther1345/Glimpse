import { useEffect, useState } from 'react';
import { pageSelection } from './llm';
export function Speak({ defaultVoice }: { defaultVoice?: string }) {
  const [text, setText] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voice, setVoice] = useState(defaultVoice || '');
  const [rate, setRate] = useState(1);
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => { const l = () => setVoices(speechSynthesis.getVoices()); l(); speechSynthesis.onvoiceschanged = l; return () => { speechSynthesis.cancel(); }; }, []);
  const play = () => {
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
      <label className="opt">Voice<select value={voice} onChange={(e) => setVoice(e.target.value)}><option value="">Default</option>{voices.map((v) => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}</select></label>
      <label className="opt">Speed {rate.toFixed(1)}×<input type="range" min={0.5} max={2} step={0.1} value={rate} onChange={(e) => setRate(+e.target.value)} /></label>
      <div className="row left">
        {speaking ? <><button className="btn" onClick={() => speechSynthesis.pause()}>Pause</button><button className="btn" onClick={() => speechSynthesis.resume()}>Resume</button><button className="btn" onClick={() => { speechSynthesis.cancel(); setSpeaking(false); }}>Stop</button></>
          : <button className="btn primary" disabled={!text.trim()} onClick={play}>Speak</button>}
      </div>
    </div>
  );
}
