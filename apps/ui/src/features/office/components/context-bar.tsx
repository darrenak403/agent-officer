import type { OfficeAgent } from '@office/contracts';
import { contextUsage } from '../labels';

/** How full the agent's context window is after its latest turn. Renders nothing when unknown. */
export function ContextBar({ agent, compact = false }: { agent: Pick<OfficeAgent, 'contextTokens' | 'contextLimit' | 'model'>; compact?: boolean }) {
  const usage = contextUsage(agent);
  if (!usage) return compact ? null : <span className="context-unknown">Chưa có số liệu (chỉ có sau lượt trả lời đầu tiên)</span>;
  return <div className={`context-bar ${compact ? 'compact' : ''}`} data-level={usage.level}
    role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usage.percent} aria-label="Mức dùng context">
    <div className="context-track"><span style={{ width: `${usage.percent}%` }} /></div>
    <small><b>{usage.percent}%</b> context · {usage.text}{!compact && agent.model ? ` · ${agent.model}` : ''}</small>
  </div>;
}
