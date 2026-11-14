
import { useState } from 'react';
import type { OfficeSnapshot } from '@office/contracts';
import { describeTool, hookLabel } from '../labels';
import { formatTime } from '../../../lib/format';

type Item = { id: string; at: string | null; who: string; text: string; state?: 'run' | 'ok' | 'fail' };
const TOOL_HOOKS = new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure']);

/** One feed instead of three lists: tool calls carry their own state, lifecycle hooks fill the gaps. */
export function ActivityFeed({ tools, events, tasks, nameOf }: {
  tools: OfficeSnapshot['tools']; events: OfficeSnapshot['events']; tasks: OfficeSnapshot['tasks']; nameOf: (id: string | null) => string;
}) {
  const [tab, setTab] = useState<'all' | 'tools' | 'tasks'>('all');
  const toolItems: Item[] = tools.map(t => ({ id: t.id, at: t.startedAt, who: nameOf(t.agentId), text: describeTool(t.name, t.activity),
    state: !t.endedAt ? 'run' : t.status === 'FAILED' ? 'fail' : 'ok' }));
  const lifeItems: Item[] = events.filter(e => !TOOL_HOOKS.has(e.sourceHook))
    .map(e => ({ id: e.id, at: e.receivedAt, who: nameOf(e.agentId), text: hookLabel(e.sourceHook, e.toolName) }));
  const items = (tab === 'tools' ? toolItems : [...toolItems, ...lifeItems])
    .sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).slice(0, 60);
  const running = toolItems.filter(i => i.state === 'run').length;
  return <section className="drawer-block feed">
    <header className="block-head"><h2>Hoạt động</h2><span>{running ? `${running} thao tác đang chạy` : 'Không có thao tác đang chạy'}</span></header>
    <div className="tabs" role="tablist">
      {([['all', 'Tất cả'], ['tools', 'Thao tác'], ['tasks', `Công việc ${tasks.length || ''}`]] as const).map(([k, l]) =>
        <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
    </div>
    {tab === 'tasks'
      ? tasks.length ? <ol>{tasks.map(t => <li key={t.id} data-state={t.status === 'COMPLETED' ? 'ok' : 'run'}><span className="text">{t.subject ?? 'Công việc không có tiêu đề'}</span><span className="meta">{t.status === 'COMPLETED' ? 'Xong' : 'Đang làm'}</span></li>)}</ol>
        : <p className="empty">Phiên này chưa tạo danh sách công việc.</p>
      : items.length ? <ol>{items.map(i => <li key={i.id} data-state={i.state}>
        <span className="text">{i.text}</span><span className="meta">{i.who} · {formatTime(i.at)}</span>
      </li>)}</ol> : <p className="empty">Chưa có hoạt động nào.</p>}
  </section>;
}
