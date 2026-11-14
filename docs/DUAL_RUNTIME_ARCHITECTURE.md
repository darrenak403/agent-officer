# Dual-runtime architecture

## Decision

The office has two independent runtime views from the first usable release: **Claude Code** and **Codex**. A runtime switch filters sessions, agents, tasks, activities, and connection health. Each runtime gets its own adapter and event source. No agent is merged across runtimes, even if project path or display name matches.

The original specification calls Codex a Phase 3 extension. This decision moves Codex observation into the initial architecture and first release, while preserving the specification's local-first, read-only, evidence-based, no-additional-API-token requirements. It does not make this dashboard an execution or orchestration runtime.

## Data path

```text
Claude Code hooks ──> Claude adapter ──┐
                                        ├──> validated event envelope ──> ingestion ──> projections ──> API/WS
Codex hooks / read APIs ──> Codex adapter ┘                                      │
                                                                                   └──> runtime-filtered UI
```

The implementation is one desktop app (Tauri). Its Rust core (`apps/core`) runs the HTTP server on `127.0.0.1:4100` with SQLite in WAL mode, streams changes over server-sent events, and is also the hook collector: Claude Code and Codex call the app binary with `hook --runtime <name>`. Failed deliveries are spooled and replayed when the server starts. The UI (`apps/ui`) is a React page built with Vite into static files, drawn with PixiJS. This replaced the earlier NestJS, PostgreSQL, Prisma and Socket.IO stack run in Docker.

## Identity and isolation

- `runtime` is a required enum: `claude_code` or `codex`.
- Session identity is `(runtime, runtime_session_id)`, with a project/machine scope if needed. Never key a session by ID alone.
- Agent identity is `(runtime, session_id, runtime_agent_id)`. Fallback identity must remain session-scoped and carry confidence/source metadata.
- A missing `agent_id` on a tool event means **unattributed** until the adapter has evidence. It is not automatically the main agent.
- Claude Code and Codex have separate runtime-filtered data. Capability gaps are documented and never filled with inferred events; the UI currently reports API connection rather than per-runtime hook health.
- All REST queries and the event stream include runtime. A client changing runtime clears its selected session and agent, then loads that runtime's snapshot and cursor. The server enforces the filter; the UI filter alone is insufficient.
- No cross-runtime `parent_agent_id`, task assignment, dedupe key, or replay cursor is valid.

## Adapter contract

Both adapters emit only a normalized envelope with: runtime, adapter version, source hook name, runtime session ID, optional runtime agent ID, optional turn and tool IDs, occurred/received timestamps, and allowlisted metadata. Never ingest prompt text, tool input/output, environment variables, transcript contents, or tokens into the default event record.

The adapters map observed lifecycle events to domain events. `Stop` means turn stop; it does not end a session. A failed tool does not make an entire agent `FAILED`. Session and agent state may be `UNKNOWN` after loss of evidence. Late events are stored but must not blindly overwrite a newer projection. Retries must use an idempotent dedupe key and sequence/cursor inside each runtime stream.

## Observation capability, checked 13 November 2026

Claude Code documents hooks for session, subagent, tool, task, and teammate events. Codex documents hooks for session, subagent, tool, and stop events. Codex subagent hooks carry an `agent_id` but use the parent `session_id`; the adapter must preserve both fields. Codex `transcript_path` is not a stable integration interface. The Codex app-server offers thread listing and read APIs, but observing an already running Desktop session through a separate app-server process needs a proof on this machine before promising full live coverage.

Sources: [Claude Code hooks](https://code.claude.com/docs/en/hooks), [Claude subagents](https://code.claude.com/docs/en/sub-agents), [Claude agent teams](https://code.claude.com/docs/en/agent-teams), [Codex hooks](https://learn.chatgpt.com/docs/hooks), [Codex app-server](https://learn.chatgpt.com/docs/app-server).

## Installation boundary

Global Claude settings already contained hooks. The installer backs up settings, appends only Office-owned handlers, preserves existing handlers and order, verifies API health, and supports exact uninstall. Both global configurations were installed on this Mac. Codex still requires the user to trust each Office hook definition in `/hooks` or Settings → Hooks before Codex will run them.
