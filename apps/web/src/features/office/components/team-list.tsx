'use client';

import { useState } from 'react';
import type { LiveAgent } from './office-dashboard';
import type { OfficeSnapshot } from '@office/contracts';
import { ContextBar } from './context-bar';
import { AgentFocus } from './agent-focus';

const RANK: Record<string, number> = { WAITING: 0, WORKING: 1, IDLE: 2, DISCOVERED: 3 };

/** Main agent first, its subagents under it; urgent states rise to the top of each group. */
export function TeamList({ agents, tools, now, selectedId, onSelect }: { agents: LiveAgent[]; tools: OfficeSnapshot['tools']; now: number; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const rank = (a: LiveAgent) => RANK[a.presence.status] ?? 9;
  const main = agents.filter(a => a.type === 'MAIN');
  const subs = agents.filter(a => a.type !== 'MAIN').sort((a, b) => rank(a) - rank(b));
  const [showGone, setShowGone] = useState(false);
  // Departed helpers collapse into one line so the list stays about who is here now.
  const gone = subs.filter(a => rank(a) === 9);
  const ordered = [...main, ...subs.filter(a => rank(a) < 9), ...(showGone ? gone : [])];
  const active = agents.filter(a => rank(a) <= 1).length;
  return <section className="drawer-block">
    <header className="block-head"><h2>Đội ngũ</h2><span>{active ? `${active} đang hoạt động` : 'Tất cả đang nghỉ'}</span></header>
    {ordered.length ? <ul className="team">{ordered.map(a => {
      const open = selectedId === a.id;
      return <li key={a.id} id={`agent-${a.id}`} data-s={a.presence.status} data-sub={a.type !== 'MAIN' || undefined}>
        <button className={open ? 'open' : ''} aria-expanded={open} onClick={() => onSelect(open ? null : a.id)}>
          <span className="dot" aria-hidden="true" />
          <span className="who"><strong>{a.displayName}</strong><em>{a.presence.label}</em></span>
          <span className="doing">{a.doing ?? a.mission ?? a.presence.detail}</span>
          <ContextBar agent={a} compact />
        </button>
        {open && <AgentFocus agent={a} tools={tools} now={now} />}
      </li>;
    })}{gone.length > 0 && <li className="gone-toggle"><button onClick={() => setShowGone(v => !v)}>{showGone ? 'Ẩn' : 'Xem'} {gone.length} trợ lý đã rời</button></li>}</ul> : <p className="empty">Chưa có agent trong phiên này.</p>}
  </section>;
}
