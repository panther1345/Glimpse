export function speakText(text: string, voiceName?: string, onEnd?: () => void) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/```[\s\S]*?```/g, ' code block ').replace(/[*_#`>|]/g, ''));
  const v = speechSynthesis.getVoices().find((x) => x.name === voiceName); if (v) { u.voice = v; u.lang = v.lang; }
  u.onend = u.onerror = () => onEnd?.();
  speechSynthesis.speak(u);
}
