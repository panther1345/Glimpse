import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { useRef, type ReactNode } from 'react';
import { IcCopy } from './icons';
import { toast } from './toast';

function Pre({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  return (
    <div className="codeblock">
      <button className="icon codecopy" title="Copy code" onClick={() => { navigator.clipboard.writeText(ref.current?.innerText || ''); toast('Copied'); }}><IcCopy /></button>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}
export function Markdown({ text }: { text: string }) {
  return <div className="md"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex, rehypeHighlight]} components={{ pre: Pre, a: (p) => <a {...p} target="_blank" rel="noreferrer" /> }}>{text}</ReactMarkdown></div>;
}
