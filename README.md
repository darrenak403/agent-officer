# Agent Office

A local, read-only office for watching Claude Code and Codex work. Pick a runtime in the header to see its sessions, agents, tasks, tools and event timeline, drawn as a pixel-art office floor or as a list. It never starts agents or calls a model.

It is one small menu-bar app (about 10 MB, near 0% CPU when idle). There is no Docker, database server or Node process to run.

## Install

1. Download the latest `.dmg` from [Releases](https://github.com/darrenak403/agent-office-releases/releases/latest) (macOS, Apple silicon) and drag **Agent Office** to Applications.
2. The app is not signed with an Apple Developer ID yet, so macOS blocks the first launch. Run this once, then open it:

   ```sh
   xattr -cr "/Applications/Agent Office.app"
   ```

3. On first launch the app asks to add its hooks to `~/.claude/settings.json` (and `~/.codex/hooks.json` if Codex is installed). Choose **Cài hook**. Your other hooks and settings are kept, and each file is backed up next to itself as `*.office-backup-<time>` before it changes. An existing status line keeps running after the office one.
4. **Codex only:** open `/hooks` in Codex (or **Settings → Hooks**) and trust the Agent Office hooks. Codex does not run new hooks until you do, and the app does not bypass that.

New sessions appear as soon as they send a hook event. A session that was already running may miss its first `SessionStart`.

The app lives in the menu bar. Closing the window only hides it; the office keeps collecting while it is hidden and pauses its drawing. The menu has: open, install hooks, remove hooks, check for updates, quit.

## Update

The app checks for a new version on start and every 6 hours and asks before installing. **Kiểm tra bản mới** in the menu checks now. Updates are signed; the app refuses a bundle not signed with the project's key.

## Uninstall

1. Menu → **Gỡ hook**. This removes only the Agent Office hooks and restores your previous status line.
2. Quit the app and delete it from Applications.
3. Delete its data (history and the ingest token): `~/Library/Application Support/dev.agentoffice.app`.

## Privacy

Everything stays on this machine. The server binds to `127.0.0.1` only and accepts events only with the local ingest token (a file readable only by you). The collector sends ids, hook and tool names, timestamps, the project path, plus a short activity summary. To show a session title, context usage and the model, it reads the tail of the session transcript on disk; it does not store prompts, tool input or output, or environment variables.

Missing agent ids stay unattributed, and the office shows `UNKNOWN` after stale activity instead of inventing agents. Codex has no task hooks, so its Tasks panel may stay empty. Codex `PostToolUse` means a tool finished, not that it succeeded.

## Develop

Requirements: Rust (stable), Node.js 20+, pnpm 12+.

```sh
pnpm install
pnpm test            # Rust core tests + static UI export
pnpm desktop:ui      # export the UI to apps/web/out
cd apps/desktop && npx @tauri-apps/cli@2 dev
```

`pnpm dev` serves the UI on `http://127.0.0.1:3000` against a running app. The core also runs alone: `cargo run --manifest-path apps/core/Cargo.toml` (`OFFICE_DATA_DIR`, `PORT`), and `office-core install-hooks` / `uninstall-hooks` work without the UI.

**Release:** push a tag like `v0.2.0`. GitHub Actions builds the app, signs the update bundle and publishes it with `latest.json` to the public `agent-office-releases` repo, where installed apps find it. It needs the secrets `TAURI_SIGNING_PRIVATE_KEY` (the updater key) and `RELEASES_TOKEN` (a token that can write releases to that repo).

Layout: `apps/core` (Rust server, SQLite, hook collector, installer), `apps/desktop` (Tauri shell), `apps/web` (UI), `packages/contracts` (shared schemas). More in the [product specification](./Visual_Multi_Agent_Office_Specification.md), [dual-runtime architecture](./docs/DUAL_RUNTIME_ARCHITECTURE.md) and [interface design](./docs/INTERFACE_DESIGN.md).
