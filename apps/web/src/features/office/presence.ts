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
  if (agent.status === 'STOPPED') return agent.type === 'SUBAGENT'
    ? { status: 'STOPPED', label: 'Xong việc', detail: 'Đã nộp kết quả cho agent chính', observed: true }
    : { status: 'STOPPED', label: 'Đã rời', detail: 'Đã kết thúc lượt làm việc', observed: true };
  if (agent.status === 'COMPLETED') return { status: 'COMPLETED', label: 'Hoàn tất', detail: 'Runtime ghi nhận hoàn tất', observed: true };
  if (agent.status === 'FAILED') return { status: 'FAILED', label: 'Có lỗi', detail: 'Lượt làm việc dừng vì lỗi', observed: true };
  if (session.status === 'ENDED') return { status: 'STOPPED', label: 'Phiên đã đóng', detail: 'Phiên làm việc đã kết thúc', observed: true };
  const age = agent.lastSeenAt ? now - Date.parse(agent.lastSeenAt) : Infinity;
  const ago = Number.isFinite(age) ? `${Math.max(0, Math.round(age / 1000))}s trước` : 'chưa có';

  if (agent.status === 'IDLE') return {
    status: 'IDLE', label: 'Đang nghỉ',
    detail: sourceHook === 'TeammateIdle' ? 'Đang chờ việc mới' : `Đã trả lời xong, chờ yêu cầu tiếp theo (${ago})`, observed: true,
  };
  if (agent.status === 'WAITING') return { status: 'WAITING', label: 'Cần bạn duyệt', detail: `Đang chờ bạn cấp quyền hoặc trả lời (${ago})`, observed: true };
  if (agent.status === 'WORKING') {
    if (age > WORKING_STALE_MS) return { status: 'UNKNOWN', label: 'Mất tín hiệu', detail: `Không nhận được tín hiệu nào trong ${Math.round(age / 60000)} phút`, observed: false };
    return agent.currentTool
      ? { status: 'WORKING', label: 'Đang làm', detail: `Đang thao tác (${ago})`, observed: true }
      : { status: 'WORKING', label: 'Đang suy nghĩ', detail: `Đang cân nhắc bước tiếp theo (${ago})`, observed: true };
  }
  return { status: 'DISCOVERED', label: 'Có mặt', detail: 'Đã vào văn phòng, chưa bắt đầu việc', observed: false };
}
