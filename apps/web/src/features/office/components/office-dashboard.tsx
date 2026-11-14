'use client';

import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Runtime as RuntimeSchema, type OfficeAgent, type Runtime } from '@office/contracts';
import { OfficeCanvas } from './office-canvas';
import { TeamList } from './team-list';
import { ActivityFeed } from './activity-feed';
import { ContextBar } from './context-bar';
import { PlanLimits } from './plan-limits';
import { SessionPicker } from './session-picker';
import { useOfficeHistory, useOfficeLive, useOfficeAccounts } from '../hooks';
import { projectPresence, type Presence } from '../presence';
import { agentNames, describeTool, sessionLabel } from '../labels';

/** An agent as the office shows it: readable name, presence and what it is doing. */
export type LiveAgent = OfficeAgent & { presence: Presence; displayName: string; doing: string | null };

const runtimeName = (runtime: Runtime) => runtime === 'codex' ? 'Codex' : 'Claude';
const DONE = ['STOPPED', 'UNKNOWN', 'FAILED', 'COMPLETED'];

/** Ticks so stale evidence downgrades presence without waiting for a new event. */
function useNow(intervalMs = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(id); }, [intervalMs]);
  return now;
}

/** What to say the agent is doing: the running tool now, otherwise the last thing it did. */
function doingText(agent: OfficeAgent, presence: Presence): string | null {
  if (presence.status === 'WORKING' && agent.currentTool) return describeTool(agent.currentTool, agent.currentActivity);
  if (agent.currentActivity) return `Vừa xong: ${agent.currentActivity}`;
  return null;
}

/** Runtime chosen in the URL (?runtime=codex), read after mount since the page is prerendered. */
function urlRuntime(): Runtime {
  const parsed = RuntimeSchema.safeParse(new URLSearchParams(window.location.search).get('runtime'));
  return parsed.success ? parsed.data : 'claude_code';
}

function Office() {
  const [runtime, setRuntime] = useState<Runtime>('claude_code');
  useEffect(() => { setRuntime(urlRuntime()); }, []);
  const [selectedId, setSelectedIdRaw] = useState<string | null>(null);
  // Picking an agent on the map also brings its explanation into view in the drawer.
  const setSelectedId = (id: string | null) => {
    setSelectedIdRaw(id);
    if (id) requestAnimationFrame(() => document.getElementById(`agent-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  };
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [view, setView] = useState<'office' | 'list'>('office');
  const { snapshot, available, socketConnected } = useOfficeLive(runtime);
  const now = useNow();
  const accounts = useOfficeAccounts(runtime);

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

  // Sessions opened before the hooks were installed have no SessionStart; fall back to the first event seen.
  const firstSeen = visibleEvents.reduce<number | null>((min, e) => { const t = Date.parse(e.receivedAt); return Number.isFinite(t) && (min == null || t < min) ? t : min; }, null);
  const sessionStart = activeSession?.startedAt ? Date.parse(activeSession.startedAt) : firstSeen;
  const waitingAgents = liveAgents.filter(a => a.presence.status === 'WAITING');

  return <div className="app" data-runtime={runtime}>
    <header className="topbar">
      <div className="brand"><img className="brand-mark" src="/logo-mark.png" alt="" width={28} height={28} /><strong>Agent Office</strong></div>
      <div className="switch" role="group" aria-label="Chọn môi trường code">
        <button aria-pressed={runtime === 'claude_code'} onClick={() => chooseRuntime('claude_code')}>Claude Code</button>
        <button aria-pressed={runtime === 'codex'} onClick={() => chooseRuntime('codex')}>Codex</button>
      </div>
      <SessionPicker sessions={sessions} activeId={activeSession?.id ?? null} onChange={id => { setSessionId(id); setSelectedId(null); }} />
      <PlanLimits limits={snapshot.limits ?? null} info={accounts.data} />
      <span className={`health ${health.cls}`} title={health.text} role="status">{health.text}</span>
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
          {sessionStart != null && <span className="session-time" title="Từ lúc phiên bắt đầu (hoặc sự kiện đầu tiên office nhận được)">Phiên chạy <b>{duration((activeSession?.endedAt ? Date.parse(activeSession.endedAt) : now) - sessionStart)}</b></span>}
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
        <ul className="legend" aria-label="Chú thích bản đồ">
          <li data-s="WORKING"><b>Bàn làm việc</b> đang làm</li>
          <li data-s="IDLE"><b>Khu nghỉ</b> vừa xong việc (15 phút)</li>
          <li data-s="STOPPED"><b>Cửa ra</b> đã rời hoặc mất tín hiệu</li>
        </ul>
      </section>

      <aside className="drawer">
        <TeamList agents={liveAgents} tools={visibleTools} now={now} selectedId={selectedId} onSelect={setSelectedId} />
        <ActivityFeed tools={visibleTools} events={visibleEvents} tasks={visibleTasks} nameOf={nameOf} />
      </aside>
    </div>
  </div>;
}

/** Session length as "2g 05p" or "12 phút". */
function duration(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(m / 60);
  return h ? `${h}g ${String(m % 60).padStart(2, '0')}p` : `${m} phút`;
}

export function OfficeDashboard() {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true } } }));
  return <QueryClientProvider client={client}><Office /></QueryClientProvider>;
}
