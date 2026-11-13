# Research Report: Agent Office UI/UX references

Conducted: 2026-11-14 01:40 (UTC+7) · 3 web searches + earlier last30days run + plans/research/261114-0019-agent-office-benchmarks.md

## Executive Summary
Two camps exist: (A) game-like offices (Pixel Agents, Claude Office, Pixel Agent Desk, OfficeAI, Bit Office, AI Office 3D) whose charm comes from *characters acting out state* (typing, walking, speech bubbles, boss spawning employees); (B) observability dashboards (agents-observe, disler multi-agent observability, Agent Lens) whose value is *hierarchy + timeline + token stats*. Ours sits awkwardly between: a small static map in a busy dashboard of equal-weight panels. That is the "ugly" root cause: no focal point, too many boxed panels, map too small, text-heavy.

Recommendation: make the office the hero (≥65% of viewport), move info into overlays on the map (speech bubbles, hover cards, a floating "needs you" toast), and demote lists to a collapsible right drawer with a parent/subagent tree + timeline. Original art only.

## Key Findings (patterns worth stealing, not assets)
| Pattern | Seen in | Why it works |
|---|---|---|
| Speech/thought bubble over character with current tool ("Đang sửa file.tsx") | Pixel Agents, Claude Office | State readable without reading a panel |
| Boss/employee metaphor: main agent spawns subagents who walk in, leave when done | Claude Office (paulrobello) | Hierarchy shown spatially |
| Permission-waiting = character raises hand / "!" bubble + sound/toast | Pixel Agents | Most actionable state gets loudest signal |
| Zone = state (desk/lounge/exit), movement on change | Agent Office dashboard, ours | Already have; needs smoother walk & more space |
| Hierarchy tree + session replay timeline | agents-observe, Agent Lens | Dashboard camp's core value |
| Per-model token / context stats | agents-observe | We have context bar; show as ring on avatar |
| Isometric 3D, camera pan | OfficeAI, AI Office (Three.js) | Pretty but heavy; not needed |

## Gap analysis vs current app
1. Map ~45% width, 350px tall: characters tiny, plates overlap → enlarge to hero, full width.
2. 8 boxed panels of equal weight → no focal point. Cut to: map + 1 side drawer.
3. Info lives in panels far from the character → put on character (bubble, context ring, name tag).
4. Timeline/Thao tác/Công việc are 3 near-duplicate lists → merge into one "Hoạt động" feed with filter.
5. Left rail nav links do nothing useful → remove; runtime switch + session picker go in top bar.
6. Waiting-for-approval has no loud signal → "!" bubble + top toast "Agent chính cần bạn duyệt".

## Implementation Recommendations
Layout: `top bar (brand · runtime switch · session dropdown · live dot)` / `map hero (full width, aspect 16:9, max 70vh)` / `right drawer 360px: Đang hoạt động (tree main→subs) + feed`. Mobile: map first, drawer becomes bottom sheet.
Map overlays: bubble (current activity, 1 line, truncate 28ch), context ring around avatar (green/amber/red), "!" waiting marker, walk animation already in place, subagent enters from door and walks to desk beside parent.
Keep: Pixi canvas, zones, presence rules, reduced-motion.

## Common Pitfalls
- Copying sprites/tilesets (Pixel Agents uses paid/licensed assets) → draw own.
- Bubble spam with many agents → show bubble only for WORKING/WAITING, others on hover.
- 3D temptation → cost/perf without information gain.

## Resources
- Pixel Agents: https://www.mdskills.ai/tools/pixel-agents
- Claude Office Visualizer: https://cdn.jsdelivr.net/gh/paulrobello/claude-office@main/README.md
- Pixel Agent Desk: https://github.com/Mgpixelart/pixel-agent-desk
- PixelOffice: https://github.com/KalebKE/PixelOffice
- pixtuoid (TUI): https://cdn.jsdelivr.net/gh/ivanwng97/pixtuoid@main/README.md
- agents-observe: https://www.blog.brightcoding.dev/2026/08/07/simple10agents-observe-real-time-dashboard-for-claude-code-sessions
- disler multi-agent observability: https://docsearch.algolia.com/mcp/docs/repo/disler/claude-code-hooks-multi-agent-observability
- OfficeAI: https://dykyi-roman.github.io/pages/articles/18.html
- AI Office 3D: https://hackernoon.com/i-built-a-3d-office-where-local-ai-agents-share-one-rtx-4090
- Bit Office: https://www.producthunt.com/products/github-311/launches/bit-office
- ajsahni/agents-office: https://github.com/ajsahni/agents-office

## Next steps
1. Redesign layout to map-hero + drawer (/kit:frontend-design).
2. Add bubbles, context ring, waiting "!" in Pixi.
3. Merge 3 lists into one feed; tree for main→subagents.

## Unresolved questions
- Keep Codex/Claude switch as tabs or show both runtimes in one office?
- Sound/desktop notification on waiting: wanted?
