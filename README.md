# Visual Multi-Agent Office

A local, read-only office for observing Claude Code and Codex separately. Select a runtime in the header to see its sessions, observed agents, tasks, tools, and event timeline. The office floor shows original pixel-art desks, a lounge and status-marked characters based on observed events; the list view provides the same agent information in text. The dashboard does not start agents or make model API calls.

## Run on this Mac

Requirements: Docker Desktop, Node.js 20+, pnpm 12+.

```sh
node scripts/init-config.mjs
pnpm install
docker compose up -d --build
node scripts/setup-hooks.mjs install both
node scripts/replay-service.mjs install
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The API health endpoint is [http://127.0.0.1:4100/api/health](http://127.0.0.1:4100/api/health). Existing Claude and Codex hooks are preserved. The installer checks API health and saves a backup before modifying an existing hook config.

**Codex:** Open `/hooks` in Codex or **Settings → Hooks** and trust each Visual Agent Office hook definition. Codex will not run newly configured hooks until you review them. The office intentionally does not bypass this trust check. Claude events can arrive as soon as Claude starts another hook event; an already running session may lack its initial `SessionStart` event.

The macOS replay service retries spooled events every 30 seconds. It is a small LaunchAgent, not a third coding runtime. It depends on this project remaining at its current path.

## Verify

```sh
pnpm build
pnpm test
pnpm test:integration
docker compose ps
```

The integration test creates temporary synthetic sessions in both runtimes and removes them afterward. No model call is involved. For a real observation, start a new Claude Code or Codex session after its Office hooks are active and inspect its runtime tab.

## Stop or remove

```sh
docker compose down
node scripts/replay-service.mjs uninstall
node scripts/setup-hooks.mjs uninstall both
```

`docker compose down` retains the PostgreSQL volume. `docker compose down -v` deletes all Office history. Hook uninstall removes only the Office handlers and keeps other handlers in place.

## Privacy and limits

The collector sends only allowlisted identifiers, hook/tool names, timestamps, and project path to a local token-protected API. It does not read transcripts or store prompts, tool input/output, environment variables, or task titles. `.env`, the ingest token, and spool files are ignored by git. HTTP is bound to loopback.

Missing agent IDs remain unattributed. The office displays `UNKNOWN` after stale activity and never invents unseen agents. Codex task hooks are not available in the current hook set, so its Tasks panel may stay empty. Tool history is limited to events the runtime exposes. Codex `PostToolUse` means a tool finished; it does not prove success.

Read the [product specification](./Visual_Multi_Agent_Office_Specification.md), [dual-runtime architecture](./docs/DUAL_RUNTIME_ARCHITECTURE.md), [interface design](./docs/INTERFACE_DESIGN.md), [visual benchmark research](./plans/research/261114-0019-agent-office-benchmarks.md), and [implementation plan](./plans/2026-11-13-dual-runtime-office/plan.md).
