import type { OfficeAgent, OfficeSession } from '@office/contracts';
import { formatTime } from '../../lib/format';

/**
 * Everything the office shows about an agent is phrased for people: no UUIDs or runtime IDs.
 */
const ROLE: Record<string, string> = {
  Explore: 'Trinh sát', 'general-purpose': 'Đa năng', Plan: 'Lập kế hoạch', planner: 'Lập kế hoạch',
  'code-reviewer': 'Review code', tester: 'Kiểm thử', debugger: 'Gỡ lỗi', researcher: 'Nghiên cứu',
  'docs-manager': 'Tài liệu', 'ui-ux-designer': 'Thiết kế UI', 'fullstack-developer': 'Lập trình',
  'git-manager': 'Git', brainstormer: 'Brainstorm', 'web-fetch': 'Đọc web',
};

const VERB: Record<string, string> = {
  Bash: 'Chạy lệnh', shell: 'Chạy lệnh', exec_command: 'Chạy lệnh', Read: 'Đọc file', Edit: 'Sửa file',
  MultiEdit: 'Sửa file', Write: 'Viết file', apply_patch: 'Sửa code', NotebookEdit: 'Sửa notebook',
  Grep: 'Tìm trong code', Glob: 'Tìm file', WebFetch: 'Đọc web', WebSearch: 'Tìm trên web',
  Agent: 'Giao việc', Task: 'Giao việc', TodoWrite: 'Cập nhật checklist', Skill: 'Dùng skill',
};

const HOOK: Record<string, string> = {
  SessionStart: 'Mở phiên', SessionEnd: 'Đóng phiên', UserPromptSubmit: 'Nhận yêu cầu mới',
  PreToolUse: 'Bắt đầu', PostToolUse: 'Xong', PostToolUseFailure: 'Lỗi khi', Stop: 'Xong lượt, nghỉ',
  StopFailure: 'Lượt kết thúc lỗi', SubagentStart: 'Giao việc cho subagent', SubagentStop: 'Subagent rời đi',
  Notification: 'Chờ bạn duyệt', TaskCreated: 'Tạo task', TaskCompleted: 'Hoàn thành task', TeammateIdle: 'Đồng đội rảnh',
};

const titleCase = (value: string) => value.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function toolVerb(tool: string | null): string {
  if (!tool) return 'Làm việc';
  if (tool.startsWith('mcp__')) return `Dùng ${titleCase(tool.split('__')[1] ?? 'công cụ')}`;
  return VERB[tool] ?? titleCase(tool);
}

/** "Sửa file: page.tsx" / "Chạy lệnh: Build web app" / "Đọc file". */
export function describeTool(tool: string | null, activity: string | null): string {
  return activity ? `${toolVerb(tool)}: ${activity}` : toolVerb(tool);
}

export function hookLabel(hook: string, tool: string | null): string {
  const base = HOOK[hook] ?? titleCase(hook);
  return tool && /ToolUse/.test(hook) ? `${base} ${toolVerb(tool).toLowerCase()}` : base;
}

/** Stable readable names per session: "Agent chính", "Trinh sát", "Trinh sát 2". */
export function agentNames(agents: OfficeAgent[]): Map<string, string> {
  const names = new Map<string, string>();
  const seen = new Map<string, number>();
  for (const agent of agents) {
    if (agent.type === 'MAIN') { names.set(agent.id, 'Agent chính'); continue; }
    const role = agent.name && agent.name !== 'Subagent' ? ROLE[agent.name] ?? titleCase(agent.name) : 'Trợ lý';
    const n = (seen.get(role) ?? 0) + 1;
    seen.set(role, n);
    names.set(agent.id, n > 1 ? `${role} ${n}` : role);
  }
  return names;
}

export function sessionLabel(session: OfficeSession): { title: string; meta: string } {
  const state = session.status === 'ACTIVE' ? 'Đang mở' : session.status === 'ENDED' ? 'Đã đóng' : 'Không hoạt động';
  const people = session.agents.length === 1 ? '1 agent' : `${session.agents.length} agent`;
  const project = session.projectName ?? 'Dự án chưa rõ';
  // Prefer the session's own name; the folder moves to the second line.
  return session.title
    ? { title: session.title, meta: `${project} · ${state} · ${people} · từ ${formatTime(session.startedAt)}` }
    : { title: project, meta: `${state} · ${people} · từ ${formatTime(session.startedAt)}` };
}

/** "86k / 200k" style token counts. */
export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(value);
}

/** Context-window fill of an agent, or null when the runtime has not reported it. */
export function contextUsage(agent: Pick<OfficeAgent, 'contextTokens' | 'contextLimit'>) {
  if (agent.contextTokens == null || !agent.contextLimit) return null;
  const percent = Math.min(100, Math.round((agent.contextTokens / agent.contextLimit) * 100));
  const level = percent >= 85 ? 'high' : percent >= 60 ? 'mid' : 'low';
  return { percent, level, text: `${formatTokens(agent.contextTokens)} / ${formatTokens(agent.contextLimit)} token` } as const;
}

/** "3 phút" style elapsed time since an ISO timestamp. */
export function elapsed(iso: string | null, now: number): string {
  if (!iso) return '';
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return `${s} giây`;
  if (s < 3600) return `${Math.floor(s / 60)} phút`;
  return `${Math.floor(s / 3600)} giờ ${Math.floor((s % 3600) / 60)} phút`;
}
