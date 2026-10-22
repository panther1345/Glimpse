import { useState, type ReactNode } from 'react';
import { TextTool } from './TextTool';
import { TEXT_TOOLS } from './defs';
import { Speak } from './Speak';
import { EXTRA_TOOLS } from './extra';
import { WebControl } from './WebControl';

export type ToolId = 'chat' | 'hand' | 'code' | 'rec' | 'translate' | 'summarize' | 'pdf' | 'write' | 'painter' | 'ocr' | 'grammar' | 'email' | 'tts' | 'web';
export const MENU: { id: ToolId; label: string; icon: string; desc: string }[] = [
  { id: 'chat', label: 'Chat', icon: '💬', desc: 'Chat with AI, screenshots & images' },
  { id: 'hand', label: 'Hand', icon: '✋', desc: 'Hands-free voice chat' },
  { id: 'code', label: 'Code', icon: '</>', desc: 'Explain, fix, convert code' },
  { id: 'rec', label: 'REC Note', icon: '🎙', desc: 'Record, transcribe & summarize' },
  { id: 'translate', label: 'Translate', icon: '🌐', desc: 'Translate text or selection' },
  { id: 'summarize', label: 'Summarize', icon: '≣', desc: 'Summarize text or the page' },
  { id: 'pdf', label: 'ChatPDF', icon: '📄', desc: 'Upload a PDF and ask about it' },
  { id: 'write', label: 'Write', icon: '✍', desc: 'Compose or rewrite with tone & length' },
  { id: 'painter', label: 'Painter', icon: '🎨', desc: 'Generate images from a prompt' },
  { id: 'ocr', label: 'OCR', icon: '🔤', desc: 'Extract text from a screenshot/image' },
  { id: 'grammar', label: 'Grammar', icon: '✔', desc: 'Fix grammar & spelling' },
  { id: 'email', label: 'Email Reply', icon: '✉', desc: 'Draft a reply to an email' },
  { id: 'tts', label: 'Text to Speech', icon: '🔊', desc: 'Read text aloud' },
  { id: 'web', label: 'Web Control', icon: '🕸', desc: 'Scrape page data · auto-fill forms' },
];
export function ToolMenu({ onPick }: { onPick: (id: ToolId) => void }) {
  return <div className="toolmenu">{MENU.map((m) => (
    <button key={m.id} className="titem" onClick={() => onPick(m.id)}>
      <span className="ti">{m.icon}</span><span className="tl"><b>{m.label}</b><small>{m.desc}</small></span><span className="chev">›</span>
    </button>))}</div>;
}
export function ToolView({ id, onBack, voice }: { id: ToolId; onBack: () => void; voice?: string }) {
  const m = MENU.find((x) => x.id === id)!;
  let body: ReactNode;
  if (TEXT_TOOLS[id]) body = <TextTool key={id} def={TEXT_TOOLS[id]} />;
  else if (id === 'web') body = <WebControl />;
  else if (id === 'tts') body = <Speak defaultVoice={voice} />;
  else { const C = EXTRA_TOOLS[id]; body = C ? <C /> : null; }
  return <div className="toolview"><div className="tbar"><button className="btn" onClick={onBack}>‹ Tools</button><b>{m.icon} {m.label}</b></div>{body}</div>;
}
export function useToolState() { return useState<ToolId | null>(null); }
