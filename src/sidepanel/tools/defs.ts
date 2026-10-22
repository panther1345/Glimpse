import type { TextToolDef } from './TextTool';
const LANGS = ['English', 'Hindi', 'Telugu', 'Tamil', 'Kannada', 'Malayalam', 'Bengali', 'Marathi', 'Spanish', 'French', 'German', 'Japanese', 'Chinese (Simplified)', 'Arabic', 'Portuguese', 'Russian'];
export const TEXT_TOOLS: Record<string, TextToolDef> = {
  code: { placeholder: 'Paste code (or use the page selection)…', action: 'Run', options: [{ key: 'mode', label: 'Task', values: ['Explain', 'Find bugs & fix', 'Optimize', 'Add comments', 'Write tests', 'Convert to Python', 'Convert to JavaScript'] }],
    build: (t, o) => `Task: ${o.mode} the following code. Use Markdown with fenced code blocks.\n\n\`\`\`\n${t}\n\`\`\`` },
  translate: { placeholder: 'Text to translate…', action: 'Translate', options: [{ key: 'lang', label: 'Into', values: LANGS }],
    build: (t, o) => `Translate the following text into ${o.lang}. Output only the translation, keep formatting.\n\n${t}` },
  summarize: { placeholder: 'Text to summarize (or use the whole page)…', action: 'Summarize', options: [{ key: 'len', label: 'Length', values: ['Short (3 bullets)', 'Medium', 'Detailed'] }],
    build: (t, o) => `Summarize the following. Length: ${o.len}. Use bullet points and lead with the key takeaway.\n\n${t}` },
  write: { placeholder: 'What to write (topic / instructions), or paste text to rewrite…', action: 'Write', allowPage: true,
    options: [{ key: 'mode', label: 'Mode', values: ['Compose new', 'Rewrite / improve', 'Make shorter', 'Make longer'] },
      { key: 'type', label: 'Format', values: ['Paragraph', 'Essay', 'Blog post', 'Social post', 'Message', 'Outline', 'Bullet points'] },
      { key: 'tone', label: 'Tone', values: ['Professional', 'Friendly', 'Casual', 'Persuasive', 'Formal', 'Funny', 'Confident'] },
      { key: 'len', label: 'Length', values: ['Medium', 'Short', 'Long'] }],
    build: (t, o) => o.mode === 'Compose new'
      ? `Write a ${o.len.toLowerCase()} ${o.type.toLowerCase()} in a ${o.tone.toLowerCase()} tone about / following these instructions:\n\n${t}\n\nOutput only the text.`
      : `${o.mode} the following text as a ${o.type.toLowerCase()} in a ${o.tone.toLowerCase()} tone (${o.len.toLowerCase()} length). Output only the result.\n\n${t}` },
  grammar: { placeholder: 'Text to check…', action: 'Fix grammar', options: [{ key: 'out', label: 'Show', values: ['Corrected text + list of changes', 'Corrected text only'] }],
    build: (t, o) => `Fix grammar, spelling and punctuation in the text below without changing its meaning or language. ${o.out === 'Corrected text only' ? 'Output only the corrected text.' : 'First output the corrected text, then a short bullet list "Changes:" of what you fixed.'}\n\n${t}` },
  email: { placeholder: 'Paste the email you received (or select it on the page)…\n\nOptional: add a line "My points: …" for what to say.', action: 'Draft reply',
    options: [{ key: 'tone', label: 'Tone', values: ['Professional', 'Friendly', 'Formal', 'Brief'] }, { key: 'intent', label: 'Intent', values: ['Reply appropriately', 'Accept / agree', 'Decline politely', 'Ask for more info', 'Follow up'] }],
    build: (t, o) => `Draft a reply to the email below. Tone: ${o.tone}. Intent: ${o.intent}. Include a subject line ("Subject: Re: …"), greeting and sign-off with a [Your name] placeholder. Do not invent facts; use [placeholders] for unknown details.\n\nEMAIL:\n${t}` },
};
