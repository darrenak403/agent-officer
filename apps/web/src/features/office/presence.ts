import type { OfficeAgent, OfficeSession } from '@office/contracts';

export type Presence = { status: OfficeAgent['status']; label: string; detail: string; observed: boolean };

/** Working with no hook for this long is no longer trusted (long reasoning rarely exceeds it). */
export const WORKING_STALE_MS = 5 * 60_000;

/**
 * Turns stored status + evidence age into what the office shows.
 * Explicit resting (Stop) stays true until a new event; only "working" can go stale,
 * so the map never animates work that is no longer evidenced.
 */
export function projectPresence(agent: OfficeAgent, session: OfficeSession, sourceHook: string | null, now: number): Presence {
  if (agent.status === 'STOPPED') return { status: 'STOPPED', label: 'Đã rời', detail: 'Hook SubagentStop: subagent đã kết thúc', observed: true };
  if (agent.status === 'COMPLETED') return { status: 'COMPLETED', label: 'Hoàn tất', detail: 'Runtime ghi nhận hoàn tất', observed: true };
  if (agent.status === 'FAILED') return { status: 'FAILED', label: 'Có lỗi', detail: 'Lượt làm việc kết thúc bằng lỗi', observed: true };
  if (session.status === 'ENDED') return { status: 'STOPPED', label: 'Phiên đã đóng', detail: 'Hook SessionEnd đã được ghi nhận', observed: true };
  const age = agent.lastSeenAt ? now - Date.parse(agent.lastSeenAt) : Infinity;
  const ago = Number.isFinite(age) ? `${Math.max(0, Math.round(age / 1000))}s trước` : 'chưa có';

  if (agent.status === 'IDLE') return {
    status: 'IDLE', label: 'Đang nghỉ',
    detail: sourceHook === 'TeammateIdle' ? 'Hook TeammateIdle: chờ việc mới' : `Hook Stop: đã xong lượt, chờ prompt mới (tín hiệu ${ago})`, observed: true,
  };
  if (agent.status === 'WAITING') return { status: 'WAITING', label: 'Cần bạn duyệt', detail: `Runtime gửi thông báo chờ người dùng (${ago})`, observed: true };
  if (agent.status === 'WORKING') {
    if (age > WORKING_STALE_MS) return { status: 'UNKNOWN', label: 'Mất tín hiệu', detail: `Đang làm nhưng không có hook nào trong ${Math.round(age / 60000)} phút`, observed: false };
    return agent.currentTool
      ? { status: 'WORKING', label: `Đang chạy ${agent.currentTool}`, detail: `PreToolUse ${agent.currentTool} (${ago})`, observed: true }
      : { status: 'WORKING', label: 'Đang suy nghĩ', detail: `Trong lượt làm việc, giữa các tool (${ago})`, observed: true };
  }
  return { status: 'DISCOVERED', label: 'Có mặt', detail: 'Đã thấy agent, chưa có lượt làm việc nào', observed: false };
}
