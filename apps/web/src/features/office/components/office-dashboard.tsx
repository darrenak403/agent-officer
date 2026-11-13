'use client';

import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { OfficeAgent, OfficeSnapshot, Runtime } from '@office/contracts';
import { OfficeCanvas } from './office-canvas';
import { useOfficeHistory, useOfficeLive } from '../hooks';
import { projectPresence, type Presence } from '../presence';
import { formatTime } from '../../../lib/format';

type Props = { initialRuntime: Runtime; initialSnapshot: OfficeSnapshot; initialAvailable: boolean; renderedAt: number };
type LiveAgent = OfficeAgent & { presence: Presence };

const agentLabel = (agent: OfficeAgent) => agent.type === 'MAIN' ? 'Main agent' : agent.name === 'Subagent' ? `Agent ${(agent.runtimeAgentId ?? agent.id).slice(0, 4).toUpperCase()}` : agent.name;
const runtimeName = (runtime: Runtime) => runtime === 'codex' ? 'Codex' : 'Claude';

/** Ticks so stale evidence downgrades presence without waiting for a new event. */
function useNow(initial: number, intervalMs = 15000) {
  const [now, setNow] = useState(initial);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), intervalMs); return () => clearInterval(id); }, [intervalMs]);
  return now;
}

function Office({ initialRuntime, initialSnapshot, initialAvailable, renderedAt }: Props) {
  const [runtime, setRuntime] = useState<Runtime>(initialRuntime);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  // Latest hook per agent decides whether IDLE means "turn ended" or plain idle.
  const lastHook = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of snapshot.events) if (e.agentId && !map.has(e.agentId)) map.set(e.agentId, e.sourceHook);
    return map;
  }, [snapshot.events]);

  const liveAgents: LiveAgent[] = useMemo(() => {
    if (!activeSession) return [];
    return activeSession.agents.map(agent => {
      const presence = available
        ? projectPresence(agent, activeSession, lastHook.get(agent.id) ?? null, now)
        : { status: 'UNKNOWN' as const, label: 'Mất kết nối', detail: 'Không đọc được API, trạng thái có thể đã cũ', observed: false };
      return { ...agent, status: presence.status, presence };
    });
  }, [activeSession, lastHook, now, available]);

  const selected = liveAgents.find(a => a.id === selectedId) ?? null;
  const working = liveAgents.filter(a => a.presence.status === 'WORKING').length;
  const resting = liveAgents.filter(a => a.presence.status === 'IDLE').length;
  const runningTools = visibleTools.filter(t => !t.endedAt).length;
  const health = !available ? { cls: '', text: 'API chưa kết nối' } : socketConnected ? { cls: 'online', text: 'Đang kết nối trực tiếp' } : { cls: 'polling', text: 'Đang cập nhật định kỳ' };

  function chooseRuntime(next: Runtime) {
    if (next === runtime) return;
    setRuntime(next); setSessionId(null); setSelectedId(null);
    const url = new URL(window.location.href);
    url.searchParams.set('runtime', next);
    window.history.replaceState(null, '', url);
  }

  return <div className="shell" data-runtime={runtime}>
    <aside className="rail"><div className="brand"><span className="brand-mark" /><strong>AGENT<br />OFFICE</strong></div><nav><a className="nav-active" href="#office">▦ &nbsp;Văn phòng</a><a href="#sessions">◷ &nbsp;Phiên làm việc</a><a href="#activity">≡ &nbsp;Hoạt động</a></nav><small>LOCAL OBSERVATORY<br />READ ONLY · v0.3</small></aside>
    <main>
      <header className="top"><div><span className="eyebrow">LIVE WORKSPACE / {runtime === 'codex' ? 'CODEX' : 'CLAUDE CODE'}</span><h1>Văn phòng {runtimeName(runtime)}</h1><p>Đang làm = từ lúc nhận prompt đến hook Stop. Đang nghỉ = đã xong lượt. Không có hook trong 5 phút = mất tín hiệu.</p></div><span className={`health ${health.cls}`}>{health.text}</span></header>
      <div className="toolbar"><div className="switch" role="group" aria-label="Chọn môi trường code"><button aria-pressed={runtime === 'claude_code'} onClick={() => chooseRuntime('claude_code')}>Claude Code</button><button aria-pressed={runtime === 'codex'} onClick={() => chooseRuntime('codex')}>Codex</button></div><div className="toolbar-stats"><span><b>{sessions.length}</b> PHIÊN</span><span><b>{working}</b> ĐANG LÀM</span><span><b>{resting}</b> NGHỈ</span><span><b>{liveAgents.length}</b> AGENT</span><span><b>{runningTools}</b> TOOL CHẠY</span></div></div>
      <section className="workspace" id="office">
        <div className="panel sessions" id="sessions"><div className="panel-head"><h2>Phiên làm việc</h2><small>{sessions.length} phiên</small></div>{sessions.length ? sessions.map(s => <button key={s.id} className={`session ${activeSession?.id === s.id ? 'selected' : ''}`} onClick={() => { setSessionId(s.id); setSelectedId(null); }}><strong>{s.runtimeSessionId.slice(0, 17)}</strong><small>{s.status === 'ACTIVE' ? 'Đang mở' : s.status === 'ENDED' ? 'Đã kết thúc' : 'Chưa rõ'} · {s.agents.length} agent · {formatTime(s.startedAt)}</small></button>) : <p className="panel-empty">Chưa có phiên {runtime === 'codex' ? 'Codex được quan sát. Mở /hooks trong Codex để duyệt Office hooks, rồi bắt đầu phiên mới.' : 'Claude Code được quan sát.'}</p>}</div>
        <div className="panel room-panel"><div className="panel-head"><h2>Office floor <small> / {runtimeName(runtime).toUpperCase()}</small></h2><div className="view-switch"><button aria-pressed={view === 'office'} onClick={() => setView('office')}>Bản đồ</button><button aria-pressed={view === 'list'} onClick={() => setView('list')}>Danh sách</button></div></div>{view === 'office' ? <><div className="room"><OfficeCanvas key={runtime} runtime={runtime} agents={liveAgents} selectedId={selectedId} onSelect={setSelectedId} />{!liveAgents.length && <div className="room-empty">Văn phòng đang chờ agent<small>Scene sẽ cập nhật khi runtime gửi sự kiện.</small></div>}</div><div className="legend"><span data-s="WORKING">Bàn làm việc · đang làm {working}</span><span data-s="WAITING">Chờ duyệt {liveAgents.filter(a => a.presence.status === 'WAITING').length}</span><span data-s="IDLE">Khu nghỉ · đã xong lượt {resting}</span><span data-s="STOPPED">Đã rời / mất tín hiệu {liveAgents.filter(a => ['STOPPED', 'UNKNOWN', 'FAILED', 'COMPLETED'].includes(a.presence.status)).length}</span></div></> : <div className="agent-list">{liveAgents.length ? liveAgents.map(a => <button key={a.id} className={selectedId === a.id ? 'selected' : ''} onClick={() => setSelectedId(a.id)}><strong>{agentLabel(a)}</strong><span>{a.presence.label} · {a.currentTool ?? 'Không có tool'}</span></button>) : <p className="panel-empty">Chưa có agent trong phiên này.</p>}</div>}</div>
        <div className="panel inspector"><div className="panel-head"><h2>Agent inspector</h2><small>{selected ? (selected.type === 'MAIN' ? 'MAIN' : 'SUBAGENT') : 'Chưa chọn'}</small></div>{selected ? <dl><dt>Tên</dt><dd>{agentLabel(selected)}</dd><dt>Trạng thái</dt><dd>{selected.presence.label}</dd><dt>Bằng chứng</dt><dd>{selected.presence.observed ? selected.presence.detail : `${selected.presence.detail} (suy luận)`}</dd><dt>Tool hiện tại</dt><dd>{selected.currentTool ?? 'Không có'}</dd><dt>Runtime ID</dt><dd>{selected.runtimeAgentId ?? 'Không có dữ liệu'}</dd><dt>Độ tin cậy ID</dt><dd>{selected.identityConfidence}</dd><dt>Lần cuối ghi nhận</dt><dd>{formatTime(selected.lastSeenAt)}</dd></dl> : <p className="panel-empty">Chọn một agent để xem thông tin và bằng chứng.</p>}</div>
      </section>
      <section className="task-tools">
        <div className="panel"><div className="panel-head"><h2>Tasks</h2><small>{visibleTasks.length} task</small></div>{visibleTasks.length ? <ol>{visibleTasks.map(task => <li key={task.id}><strong>{task.subject ?? task.runtimeTaskId}</strong><span>{task.status}</span></li>)}</ol> : <p className="panel-empty">Runtime chưa cung cấp task cho phiên này.</p>}</div>
        <div className="panel"><div className="panel-head"><h2>Tool executions</h2><small>{visibleTools.length} lần gọi · {runningTools} đang chạy</small></div>{visibleTools.length ? <ol>{visibleTools.map(tool => <li key={tool.id}><strong>{tool.name}</strong><span>{tool.status} · {formatTime(tool.startedAt)}</span></li>)}</ol> : <p className="panel-empty">Chưa có tool execution được ghi nhận.</p>}</div>
      </section>
      <section className="panel timeline" id="activity"><div className="panel-head"><h2>Hoạt động gần đây</h2><small>Sequence {snapshot.sequence}</small></div>{visibleEvents.length ? <ol>{visibleEvents.map(e => <li key={e.id}><span>{e.sourceHook}{e.toolName ? ` · ${e.toolName}` : ''}</span><time>{formatTime(e.receivedAt)}</time></li>)}</ol> : <p className="panel-empty">Chưa có sự kiện được ghi nhận.</p>}</section>
    </main>
  </div>;
}

export function OfficeDashboard(props: Props) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true } } }));
  return <QueryClientProvider client={client}><Office {...props} /></QueryClientProvider>;
}
