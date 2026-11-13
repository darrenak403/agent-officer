'use client';

import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { OfficeAgent, OfficeSnapshot, Runtime } from '@office/contracts';
import { OfficeCanvas } from './office-canvas';
import { TeamList } from './team-list';
import { ActivityFeed } from './activity-feed';
import { ContextBar } from './context-bar';
import { useOfficeHistory, useOfficeLive } from '../hooks';
import { projectPresence, type Presence } from '../presence';
import { agentNames, describeTool, sessionLabel } from '../labels';

type Props = { initialRuntime: Runtime; initialSnapshot: OfficeSnapshot; initialAvailable: boolean; renderedAt: number };
/** An agent as the office shows it: readable name, presence and what it is doing. */
export type LiveAgent = OfficeAgent & { presence: Presence; displayName: string; doing: string | null };

const runtimeName = (runtime: Runtime) => runtime === 'codex' ? 'Codex' : 'Claude';
const DONE = ['STOPPED', 'UNKNOWN', 'FAILED', 'COMPLETED'];

/** Ticks so stale evidence downgrades presence without waiting for a new event. */
function useNow(initial: number, intervalMs = 5000) {
  const [now, setNow] = useState(initial);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(id); }, [intervalMs]);
  return now;
}

/** What to say the agent is doing: the running tool now, otherwise the last thing it did. */
function doingText(agent: OfficeAgent, presence: Presence): string | null {
  if (presence.status === 'WORKING' && agent.currentTool) return describeTool(agent.currentTool, agent.currentActivity);
  if (agent.currentActivity) return `Vừa xong: ${agent.currentActivity}`;
  return null;
}

function Office({ initialRuntime, initialSnapshot, initialAvailable, renderedAt }: Props) {
  const [runtime, setRuntime] = useState<Runtime>(initialRuntime);
  const [selectedId, setSelectedIdRaw] = useState<string | null>(null);
  // Picking an agent on the map also brings its explanation into view in the drawer.
  const setSelectedId = (id: string | null) => {
    setSelectedIdRaw(id);
    if (id) requestAnimationFrame(() => document.getElementById(`agent-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [view, setView] = useState<'office' | 'list'>('office');
  const { snapshot, available, socketConnected } = useOfficeLive(runtime, initialRuntime, initialSnapshot, initialAvailable);
  const now = useNow(renderedAt);

  const sessions = snapshot.sessions;
  const activeSession = sessions.find(s => s.id === sessionId) ?? sessions[0];
  const history = useOfficeHistory(runtime, activeSession?.id ?? null);
  const visibleEvents = history.data ?? snapshot.events.filter(e => !activeSession || e.sessionId === activeSession.id);
  const visibleTasks = snapshot.tasks.filter(t => !activeSession || t.sessionId === activeSession.id);
  const visibleTools = snapshot.tools.filter(t => !activeSession || t.sessionId === activeSession.id);

  // Latest hook per agent decides whether IDLE means "turn ended" or "waiting for teammates".
  const lastHook = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of snapshot.events) if (e.agentId && !map.has(e.agentId)) map.set(e.agentId, e.sourceHook);
    return map;
  }, [snapshot.events]);

  const names = useMemo(() => agentNames(activeSession?.agents ?? []), [activeSession]);
  const liveAgents: LiveAgent[] = useMemo(() => {
    if (!activeSession) return [];
    return activeSession.agents.map(agent => {
      const presence: Presence = available
        ? projectPresence(agent, activeSession, lastHook.get(agent.id) ?? null, now)
        : { status: 'UNKNOWN', label: 'Mất kết nối', detail: 'Không đọc được dữ liệu, trạng thái có thể đã cũ', observed: false };
      return { ...agent, status: presence.status, presence, displayName: names.get(agent.id) ?? 'Agent', doing: doingText(agent, presence) };
    });
  }, [activeSession, lastHook, now, available, names]);

  const count = (test: (a: LiveAgent) => boolean) => liveAgents.filter(test).length;
  const working = count(a => a.presence.status === 'WORKING');
  const waiting = count(a => a.presence.status === 'WAITING');
  const resting = count(a => a.presence.status === 'IDLE');
  const gone = count(a => DONE.includes(a.presence.status));
  const nameOf = (agentId: string | null) => (agentId && names.get(agentId)) || 'Agent chính';
  const health = !available ? { cls: '', text: 'Mất kết nối dữ liệu' } : socketConnected ? { cls: 'online', text: 'Đang cập nhật trực tiếp' } : { cls: 'polling', text: 'Đang cập nhật định kỳ' };

  function chooseRuntime(next: Runtime) {
    if (next === runtime) return;
    setRuntime(next); setSessionId(null); setSelectedId(null);
    const url = new URL(window.location.href);
    url.searchParams.set('runtime', next);
    window.history.replaceState(null, '', url);
  }

  const waitingAgents = liveAgents.filter(a => a.presence.status === 'WAITING');
  const mainContext = activeSession?.agents.find(a => a.type === 'MAIN');

  return <div className="app" data-runtime={runtime}>
    <header className="topbar">
      <div className="brand"><span className="brand-mark" aria-hidden="true" /><strong>Agent Office</strong></div>
      <div className="switch" role="group" aria-label="Chọn môi trường code">
        <button aria-pressed={runtime === 'claude_code'} onClick={() => chooseRuntime('claude_code')}>Claude Code</button>
        <button aria-pressed={runtime === 'codex'} onClick={() => chooseRuntime('codex')}>Codex</button>
      </div>
      <label className="session-pick">
        <span className="sr-only">Phiên làm việc</span>
        <select value={activeSession?.id ?? ''} onChange={e => { setSessionId(e.target.value); setSelectedId(null); }} disabled={!sessions.length}>
          {sessions.length ? sessions.map(s => { const l = sessionLabel(s); return <option key={s.id} value={s.id}>{l.title} · {l.meta}</option>; })
            : <option value="">Chưa có phiên nào</option>}
        </select>
      </label>
      <span className={`health ${health.cls}`}>{health.text}</span>
    </header>

    <div className="stage">
      <section className="hero" aria-label="Sơ đồ văn phòng">
        <div className="hero-bar">
          <div className="stats">
            <span data-s="WORKING"><b key={`w${working}`}>{working}</b>đang làm</span>
            <span data-s="WAITING"><b key={`a${waiting}`}>{waiting}</b>chờ duyệt</span>
            <span data-s="IDLE"><b key={`r${resting}`}>{resting}</b>đang nghỉ</span>
            <span data-s="STOPPED"><b key={`g${gone}`}>{gone}</b>đã rời</span>
          </div>
          {mainContext && <div className="hero-context"><ContextBar agent={mainContext} compact /></div>}
          <div className="view-switch"><button aria-pressed={view === 'office'} onClick={() => setView('office')}>Bản đồ</button><button aria-pressed={view === 'list'} onClick={() => setView('list')}>Danh sách</button></div>
        </div>
        {waitingAgents.length > 0 && <div className="alert" role="status"><b>!</b>{waitingAgents.map(a => a.displayName).join(', ')} đang chờ bạn duyệt trong terminal</div>}
        {view === 'office' ? <div className="room">
          <OfficeCanvas key={runtime} runtime={runtime} agents={liveAgents} selectedId={selectedId} onSelect={setSelectedId} />
          {!liveAgents.length && <div className="room-empty">Văn phòng đang chờ agent<small>Bản đồ sẽ cập nhật khi có agent bắt đầu làm việc.</small></div>}
        </div> : <div className="agent-list">
          {liveAgents.length ? liveAgents.map(a => <button key={a.id} className={selectedId === a.id ? 'selected' : ''} onClick={() => setSelectedId(a.id)}>
            <strong>{a.displayName} · {a.presence.label}</strong><span>{a.doing ?? a.mission ?? a.presence.detail}</span>
            <ContextBar agent={a} compact />
          </button>) : <p className="empty">Chưa có agent trong phiên này.</p>}
        </div>}
        <p className="legend">Bàn làm việc: đang làm · Khu nghỉ: đã trả lời xong · Cửa ra: đã rời hoặc mất tín hiệu 5 phút</p>
      </section>

      <aside className="drawer">
        <TeamList agents={liveAgents} tools={visibleTools} now={now} selectedId={selectedId} onSelect={setSelectedId} />
        <ActivityFeed tools={visibleTools} events={visibleEvents} tasks={visibleTasks} nameOf={nameOf} />
      </aside>
    </div>
  </div>;
}

export function OfficeDashboard(props: Props) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true } } }));
  return <QueryClientProvider client={client}><Office {...props} /></QueryClientProvider>;
}
