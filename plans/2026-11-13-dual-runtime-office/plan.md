---
title: Dual-runtime Visual Multi-Agent Office
status: in-progress
created: 2026-11-13
blockedBy: []
---

# Dual-runtime Visual Multi-Agent Office

## Goal

Build the specified local, read-only office with separate Claude Code and Codex views. Every status shown in the UI must cite an observed runtime event. No extra API key or model call is required by the dashboard.

## Scope and acceptance

- Both runtimes can be selected independently. Sessions, agents, tasks, timeline, health, and replay cursor never mix.
- Local collectors observe supported hooks without blocking the coding tool; setup preserves existing user hooks.
- A persisted event stream and state projection drive a list view, then a PixiJS office.
- Refresh/reconnect restores the selected runtime and its snapshot.
- Unknown capabilities and missing agent IDs are represented explicitly.
- Default storage excludes prompts, transcript bodies, tool input/output, tokens, and secrets.

## Phases

| Phase | Deliverable | Status |
| --- | --- | --- |
| 0 | Runtime capability audit and safe hook probe | Claude verified; Codex awaits hook trust |
| 1 | Monorepo, contracts, NestJS, PostgreSQL/Prisma, Docker Compose | Done |
| 2 | Claude/Codex adapters, setup/uninstall, ingestion and dedupe | Done; Codex live verification pending |
| 3 | Session/agent/task projections, ordering, Socket.IO and recovery | Done; validation in progress |
| 4 | Runtime-filtered list UI, inspector, history, timeline | Done |
| 5 | PixiJS office with accessible fallback | Done |
| 6 | Security, reliability, integration/E2E tests, release docs | In progress |

## Phase 0: current work

- [x] Read the product specification and inspect the empty repository.
- [x] Check current official Claude Code and Codex hook documentation.
- [x] Record dual-runtime architecture and interface behavior.
- [x] Add an allowlist-only hook probe and tests.
- [x] Capture actual Claude Code events and compare payloads with adapter assumptions.
- [ ] Trust Office hooks in Codex and capture an actual Codex event.
- [ ] Determine Codex Desktop parent/subagent coverage from live events; show unknown details conservatively until observed.

## Risks and gates

- Existing global hooks are busy; setup must append safely and provide exact rollback.
- Codex Desktop observation may differ from CLI/app-server docs; do not infer unseen subagents or tool ownership.
- Hook retry/dedupe cannot rely on timestamps alone. Confirm available IDs from real events, then design stable event keys.
- The original spec estimated 4–6 weeks for Claude only. Dual-runtime support adds adapter, test, and UI scope; re-estimate after Phase 0 evidence.

## References

See the [original specification](../../Visual_Multi_Agent_Office_Specification.md), [architecture](../../docs/DUAL_RUNTIME_ARCHITECTURE.md), and [interface design](../../docs/INTERFACE_DESIGN.md).
