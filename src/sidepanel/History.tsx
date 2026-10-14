import { useEffect, useMemo, useState } from 'react';
import { type Chat, listChats, deleteChat, clearChats, searchChats } from '../lib/storage';
import { IcBack, IcTrash } from './icons';

function group(ts: number) {
  const d = new Date(ts), today = new Date(); today.setHours(0, 0, 0, 0);
  if (d >= today) return 'Today';
  if (d.getTime() >= today.getTime() - 86400000) return 'Yesterday';
  return 'Earlier';
}
export function History({ currentId, onOpen, onBack, onDeleted }: { currentId: string; onOpen: (c: Chat) => void; onBack: () => void; onDeleted: (id: string) => void }) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [q, setQ] = useState('');
  const reload = () => listChats().then(setChats);
  useEffect(() => { reload(); }, []);
  const groups = useMemo(() => {
    const g: Record<string, Chat[]> = {};
    for (const c of searchChats(chats, q)) (g[group(c.updatedAt)] ??= []).push(c);
    return g;
  }, [chats, q]);
  return (
    <main className="history">
      <div className="hbar">
        <button className="icon" onClick={onBack} title="Back"><IcBack /></button>
        <input autoFocus placeholder="Search chats" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn" disabled={!chats.length} onClick={async () => { if (confirm('Delete all chats? This cannot be undone.')) { await clearChats(); onDeleted('*'); reload(); } }}>Clear all</button>
      </div>
      {!chats.length && <p className="muted center">No chats yet.</p>}
      {chats.length > 0 && !Object.keys(groups).length && <p className="muted center">No matches.</p>}
      {['Today', 'Yesterday', 'Earlier'].filter((k) => groups[k]).map((k) => (
        <section key={k}>
          <h4>{k}</h4>
          {groups[k].map((c) => (
            <div key={c.id} className={`hitem ${c.id === currentId ? 'cur' : ''}`} onClick={() => onOpen(c)}>
              <div className="ht"><div className="title">{c.title}</div><div className="muted small">{new Date(c.updatedAt).toLocaleString()} · {c.messages.length} msgs</div></div>
              <button className="icon" title="Delete" onClick={async (e) => { e.stopPropagation(); if (confirm(`Delete “${c.title}”?`)) { await deleteChat(c.id); onDeleted(c.id); reload(); } }}><IcTrash /></button>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
