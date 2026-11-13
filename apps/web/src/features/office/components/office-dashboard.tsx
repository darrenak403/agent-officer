'use client';

import { useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { OfficeAgent, OfficeSnapshot, Runtime } from '@office/contracts';
import { OfficeCanvas } from './office-canvas';
import { useOfficeHistory, useOfficeLive } from '../hooks';
import { projectPresence, type Presence } from '../presence';
import { agentNames, describeTool, hookLabel, sessionLabel } from '../labels';
import { formatTime } from '../../../lib/format';

type Props = { initialRuntime: Runtime; initialSnapshot: OfficeSnapshot; initialAvailable: boolean; renderedAt: number };
/** An agent as the office shows it: readable name, presence and what it is doing. */
export type LiveAgent = OfficeAgent & { presence: Presence; displayName: string; doing: string | null };

const runtimeName = (runtime: Runtime) => runtime === 'codex' ? 'Codex' : 'Claude';
const DONE = ['STOPPED', 'UNKNOWN', 'FAILED', 'COMPLETED'];

/** Ticks so stale evidence downgrades presence without waiting for a new event. */
function useNow(initial: number, intervalMs = 15000) {
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

  const selected = liveAgents.find(a => a.id === selectedId) ?? null;
  const count = (test: (a: LiveAgent) => boolean) => liveAgents.filter(test).length;
  const working = count(a => a.presence.status === 'WORKING');
  const waiting = count(a => a.presence.status === 'WAITING');
  const resting = count(a => a.presence.status === 'IDLE');
  const gone = count(a => DONE.includes(a.presence.status));
  const runningTools = visibleTools.filter(t => !t.endedAt).length;
  const nameOf = (agentId: string | null) => (agentId && names.get(agentId)) || 'Agent chính';
  const health = !available ? { cls: '', text: 'Mất kết nối dữ liệu' } : socketConnected ? { cls: 'online', text: 'Đang cập nhật trực tiếp' } : { cls: 'polling', text: 'Đang cập nhật định kỳ' };

  function chooseRuntime(next: Runtime) {
    if (next === runtime) return;
    setRuntime(next); setSessionId(null); setSelectedId(null);
    const url = new URL(window.location.href);
    url.searchParams.set('runtime', next);
    window.history.replaceState(null, '', url);
  }

  return <div className="shell" data-runtime={runtime}>
    <aside className="rail">
      <div className="brand"><span className="brand-mark" /><strong>AGENT<br />OFFICE</strong></div>
      <nav><a className="nav-active" href="#office">▦ &nbsp;Văn phòng</a><a href="#sessions">◷ &nbsp;Phiên làm việc</a><a href="#activity">≡ &nbsp;Hoạt động</a></nav>
      <small>CHỈ QUAN SÁT<br />KHÔNG ĐIỀU KHIỂN AGENT</small>
    </aside>
    <main>
      <header className="top">
        <div>
          <span className="eyebrow">VĂN PHÒNG / {runtime === 'codex' ? 'CODEX' : 'CLAUDE CODE'}</span>
          <h1>Văn phòng {runtimeName(runtime)}</h1>
          <p>Đang làm: từ lúc nhận yêu cầu đến khi trả lời xong. Đang nghỉ: đã trả lời xong. Mất tín hiệu: 5 phút không có hoạt động.</p>
        </div>
        <span className={`health ${health.cls}`}>{health.text}</span>
      </header>

      <div className="toolbar">
        <div className="switch" role="group" aria-label="Chọn môi trường code">
          <button aria-pressed={runtime === 'claude_code'} onClick={() => chooseRuntime('claude_code')}>Claude Code</button>
          <button aria-pressed={runtime === 'codex'} onClick={() => chooseRuntime('codex')}>Codex</button>
        </div>
        <div className="toolbar-stats"><span><b>{working}</b> ĐANG LÀM</span><span><b>{waiting}</b> CHỜ DUYỆT</span><span><b>{resting}</b> ĐANG NGHỈ</span><span><b>{runningTools}</b> THAO TÁC ĐANG CHẠY</span></div>
      </div>

      <section className="workspace" id="office">
        <div className="panel sessions" id="sessions">
          <div className="panel-head"><h2>Phiên làm việc</h2><small>{sessions.length} phiên</small></div>
          {sessions.length ? sessions.map(s => {
            const label = sessionLabel(s);
            return <button key={s.id} className={`session ${activeSession?.id === s.id ? 'selected' : ''}`} onClick={() => { setSessionId(s.id); setSelectedId(null); }}>
              <strong>{label.title}</strong><small>{label.meta}</small>
            </button>;
          }) : <p className="panel-empty">Chưa có phiên {runtime === 'codex' ? 'Codex nào. Mở /hooks trong Codex để duyệt Office hooks, rồi bắt đầu phiên mới.' : 'Claude Code nào được quan sát.'}</p>}
        </div>

        <div className="panel room-panel">
          <div className="panel-head">
            <h2>Sơ đồ văn phòng</h2>
            <div className="view-switch"><button aria-pressed={view === 'office'} onClick={() => setView('office')}>Bản đồ</button><button aria-pressed={view === 'list'} onClick={() => setView('list')}>Danh sách</button></div>
          </div>
          {view === 'office' ? <>
            <div className="room">
              <OfficeCanvas key={runtime} runtime={runtime} agents={liveAgents} selectedId={selectedId} onSelect={setSelectedId} />
              {!liveAgents.length && <div className="room-empty">Văn phòng đang chờ agent<small>Bản đồ sẽ cập nhật khi có agent bắt đầu làm việc.</small></div>}
            </div>
            <div className="legend">
              <span data-s="WORKING">Bàn làm việc · đang làm {working}</span><span data-s="WAITING">Chờ duyệt {waiting}</span>
              <span data-s="IDLE">Khu nghỉ · đã xong lượt {resting}</span><span data-s="STOPPED">Đã rời / mất tín hiệu {gone}</span>
            </div>
          </> : <div className="agent-list">
            {liveAgents.length ? liveAgents.map(a => <button key={a.id} className={selectedId === a.id ? 'selected' : ''} onClick={() => setSelectedId(a.id)}>
              <strong>{a.displayName} · {a.presence.label}</strong><span>{a.doing ?? a.mission ?? a.presence.detail}</span>
            </button>) : <p className="panel-empty">Chưa có agent trong phiên này.</p>}
          </div>}
        </div>

        <div className="panel inspector">
          <div className="panel-head"><h2>Chi tiết agent</h2><small>{selected ? (selected.type === 'MAIN' ? 'Agent chính' : 'Subagent') : 'Bấm vào một agent'}</small></div>
          {selected ? <dl>
            <dt>Tên</dt><dd>{selected.displayName}</dd>
            <dt>Trạng thái</dt><dd>{selected.presence.label} — {selected.presence.detail}</dd>
            <dt>Đang làm gì</dt><dd>{selected.doing ?? 'Chưa có thao tác nào'}</dd>
            <dt>Nhiệm vụ được giao</dt><dd>{selected.type === 'MAIN' ? 'Làm việc trực tiếp với bạn' : selected.mission ?? 'Không có mô tả'}</dd>
            <dt>Hoạt động gần nhất</dt><dd>{formatTime(selected.lastSeenAt)}</dd>
            <dt>Dự án</dt><dd>{activeSession?.projectName ?? 'Chưa rõ'}</dd>
          </dl> : <p className="panel-empty">Chọn một agent trên bản đồ để xem nó đang làm gì.</p>}
        </div>
      </section>

      <section className="task-tools">
        <div className="panel">
          <div className="panel-head"><h2>Công việc</h2><small>{visibleTasks.length} việc</small></div>
          {visibleTasks.length ? <ol>{visibleTasks.map(task => <li key={task.id}><strong>{task.subject ?? 'Công việc không có tiêu đề'}</strong><span>{task.status === 'COMPLETED' ? 'Xong' : 'Đang làm'}</span></li>)}</ol>
            : <p className="panel-empty">Phiên này chưa tạo danh sách công việc.</p>}
        </div>
        <div className="panel">
          <div className="panel-head"><h2>Thao tác gần đây</h2><small>{visibleTools.length} thao tác · {runningTools} đang chạy</small></div>
          {visibleTools.length ? <ol>{visibleTools.map(tool => <li key={tool.id}>
            <strong>{describeTool(tool.name, tool.activity)}</strong>
            <span>{nameOf(tool.agentId)} · {tool.endedAt ? (tool.status === 'FAILED' ? 'Lỗi' : 'Xong') : 'Đang chạy'} · {formatTime(tool.startedAt)}</span>
          </li>)}</ol> : <p className="panel-empty">Chưa có thao tác nào.</p>}
        </div>
      </section>

      <section className="panel timeline" id="activity">
        <div className="panel-head"><h2>Dòng thời gian</h2><small>{visibleEvents.length} sự kiện</small></div>
        {visibleEvents.length ? <ol>{visibleEvents.map(e => <li key={e.id}><span>{nameOf(e.agentId)}: {hookLabel(e.sourceHook, e.toolName)}</span><time>{formatTime(e.receivedAt)}</time></li>)}</ol>
          : <p className="panel-empty">Chưa có hoạt động nào.</p>}
      </section>
    </main>
  </div>;
}

export function OfficeDashboard(props: Props) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true } } }));
  return <QueryClientProvider client={client}><Office {...props} /></QueryClientProvider>;
}
