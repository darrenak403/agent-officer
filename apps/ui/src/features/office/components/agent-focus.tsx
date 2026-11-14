import type { OfficeSnapshot } from '@office/contracts';
import type { LiveAgent } from './office-dashboard';
import { ContextBar } from './context-bar';

type CanvasAgentUsage = LiveAgent['usage'];
import { describeTool, elapsed } from '../labels';

type Tool = OfficeSnapshot['tools'][number];

const seconds = (from: string | null, to: string | null, now: number) =>
  from ? Math.max(0, Math.round(((to ? Date.parse(to) : now) - Date.parse(from)) / 1000)) : null;
const span = (s: number | null) => s == null ? '' : s < 60 ? `${s} giây` : `${Math.floor(s / 60)} phút ${s % 60} giây`;

/**
 * Answers "what is this agent doing?" in reading order: the action right now and for how long,
 * why it is doing it, the steps that led here, and how much memory it has left.
 */
const fmt = (n: number) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n);

/** Total tokens processed, split the way they are billed: new input, cache reads, cache writes, output. */
function usageText(u: NonNullable<CanvasAgentUsage>) {
  const total = u.input + u.cacheRead + u.cacheWrite + u.output;
  return `${fmt(total)} token (mới ${fmt(u.input + u.cacheWrite)}, đọc cache ${fmt(u.cacheRead)}, trả lời ${fmt(u.output)})`;
}

export function AgentFocus({ agent, tools, now }: { agent: LiveAgent; tools: Tool[]; now: number }) {
  const own = tools.filter(t => t.agentId === agent.id)
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''));
  const running = own.find(t => !t.endedAt);
  const last = own[0];
  const failed = own.filter(t => t.status === 'FAILED').length;
  const status = agent.presence.status;

  const headline = running ? describeTool(running.name, running.activity)
    : status === 'WAITING' ? 'Đang chờ bạn cho phép một thao tác'
    : status === 'WORKING' ? 'Đang suy nghĩ bước tiếp theo'
    : last ? `Việc cuối: ${describeTool(last.name, last.activity)}` : 'Chưa có thao tác nào';
  const sub = running ? `Đã chạy ${span(seconds(running.startedAt, null, now))}`
    : status === 'WAITING' ? 'Mở terminal để duyệt, agent sẽ làm tiếp ngay sau đó'
    : status === 'WORKING' ? `Thao tác trước xong ${last?.endedAt ? `${elapsed(last.endedAt, now)} trước` : 'vừa xong'}`
    : agent.presence.detail;

  return <div className="focus" data-s={status}>
    <div className="focus-now">
      <span className="focus-kicker">{status === 'WORKING' ? 'Đang làm ngay lúc này' : agent.presence.label}</span>
      <p className="focus-headline">{headline}</p>
      <p className="focus-sub">{sub}</p>
      {running && <span className="work-bar" aria-hidden="true" />}
    </div>

    <dl className="focus-facts">
      <div><dt>Nhiệm vụ</dt><dd>{agent.type === 'MAIN' ? 'Làm theo yêu cầu bạn gõ trong terminal' : agent.mission ?? 'Agent chính không ghi mô tả khi giao việc'}</dd></div>
      {agent.usage ? <div><dt>Đã tốn</dt><dd>{usageText(agent.usage)}</dd></div> : null}
      <div><dt>Trong phiên này</dt><dd>{own.length} thao tác{failed ? `, ${failed} lỗi` : ''}</dd></div>
    </dl>

    {own.length > 0 && <div className="focus-steps">
      <h3>Các bước gần đây</h3>
      <ol>{own.slice(0, 6).map(t => <li key={t.id} data-state={!t.endedAt ? 'run' : t.status === 'FAILED' ? 'fail' : 'ok'}>
        <span className="step-text">{describeTool(t.name, t.activity)}</span>
        <span className="step-meta">{!t.endedAt ? 'đang chạy' : t.status === 'FAILED' ? 'lỗi' : t.status === 'INTERRUPTED' ? 'bị dừng' : 'xong'}{t.startedAt ? ` · ${span(seconds(t.startedAt, t.endedAt, now))}` : ''}</span>
      </li>)}</ol>
    </div>}

    <div className="focus-context"><h3>Bộ nhớ ngữ cảnh</h3><ContextBar agent={agent} /></div>
  </div>;
}
