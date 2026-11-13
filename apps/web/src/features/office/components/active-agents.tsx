import type { LiveAgent } from './office-dashboard';
import { ContextBar } from './context-bar';
import { elapsed } from '../labels';

const ORDER: Record<string, number> = { WAITING: 0, WORKING: 1 };

/** Agents that need attention right now: working or waiting for approval, most urgent first. */
export function ActiveAgents({ agents, now, selectedId, onSelect }: { agents: LiveAgent[]; now: number; selectedId: string | null; onSelect: (id: string) => void }) {
  const active = agents.filter(a => a.presence.status in ORDER)
    .sort((a, b) => ORDER[a.presence.status] - ORDER[b.presence.status] || (a.type === 'MAIN' ? -1 : 1));
  return <div className="panel active-agents">
    <div className="panel-head"><h2>Đang hoạt động</h2><small>{active.length ? `${active.length} agent` : 'Không ai đang làm'}</small></div>
    {active.length ? <ul>{active.map(a => <li key={a.id}>
      <button className={`active-card ${selectedId === a.id ? 'selected' : ''}`} data-s={a.presence.status} onClick={() => onSelect(a.id)}>
        <span className="pulse" aria-hidden="true" />
        <span className="active-body">
          <strong>{a.displayName}<em>{a.presence.label} · tín hiệu {elapsed(a.lastSeenAt, now)} trước</em></strong>
          <span className="active-doing">{a.doing ?? a.mission ?? 'Đang suy nghĩ…'}</span>
          {a.presence.status === 'WORKING' && <span className="work-shimmer" aria-hidden="true" />}
          <ContextBar agent={a} compact />
        </span>
      </button>
    </li>)}</ul> : <p className="panel-empty">Mọi agent đang nghỉ. Panel sẽ sáng lên khi có agent nhận việc.</p>}
  </div>;
}
