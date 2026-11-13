# Context bar, active-agents panel, motion

Status: in progress

Research input: pixel-agents (10K stars, v1.6.0 2026-11-10) and ajsahni/agents-office v3 (task status panel)
were the most active references; see plans/research/261114-0019-agent-office-benchmarks.md.

## Phases
1. Context usage capture (collector): on main-thread hooks read only the tail of the runtime transcript,
   take token counts of the last turn (Claude `message.usage`, Codex `token_count` event) and the model name.
   Numbers + model only; no text leaves the hook. Contract: `contextTokens`, `contextLimit`, `model`.
2. Persist on Agent (migration `20261114_context`) and expose in the snapshot.
3. Web: context bar per agent (inspector, active panel, session list), "Đang hoạt động" panel listing working
   and waiting agents with elapsed time, CSS motion (pulse, shimmer, entrance), reduced-motion respected.
4. Test (unit for transcript parsing), typecheck, rebuild docker, browser check desktop + mobile, commit.

## Acceptance
- Context bar shows % of window with token count; hidden when unknown.
- Active panel updates live; no IDs on screen.
- `pnpm test` and `pnpm test:integration` pass.
