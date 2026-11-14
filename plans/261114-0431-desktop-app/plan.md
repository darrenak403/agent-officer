# Agent Office desktop app (Tauri, no Docker)

Status: proposed · Route: build · Tier: high (replaces runtime, DB, distribution)

## Why
Today: Docker (Postgres + NestJS API + Next.js dev/prod server) ≈ 3 containers, 600MB–1GB RAM, constant CPU. Goal: one small native app, idle near 0% CPU, installable by anyone, auto-updates.

## Decision
| Option | Size / idle RAM | Verdict |
| --- | --- | --- |
| **Tauri v2** (Rust core + system WebView) | ~10–15MB app, ~60–90MB RAM | **Chosen** |
| Electron (bundles Chromium + Node) | ~150MB app, ~250MB+ RAM | Heavier, the thing we are escaping |
| Keep web, drop Docker (Node + SQLite) | ~100MB RAM, needs Node installed | Lighter but not an installable app |

## Architecture
- **UI**: existing Next.js office UI exported as static files (`output: 'export'`), loaded by Tauri. Pixi canvas, components and labels stay.
- **Core (Rust)**: local HTTP ingest on `127.0.0.1:4100` (same contract, token check) + SQLite (`rusqlite`, WAL) replacing Postgres/Prisma. Port `office.service.ts` ingest/snapshot logic (~250 lines). Push updates to UI via Tauri events instead of Socket.IO.
- **Collector**: unchanged Node hook scripts (Claude Code/Codex already require Node). Installer step in app writes the hooks + status line on user consent.
- **Tray/menubar**: app lives in the menu bar; window opens on click; closing window keeps ingest running with no rendering (Pixi ticker paused when hidden → ~0% CPU).
- **Auto-update**: `tauri-plugin-updater` + signed `latest.json` on GitHub Releases. App checks on start + every 6h, shows "Có bản mới vX" banner, installs and restarts on click.
- **Release**: GitHub Actions on tag `v*` builds macOS (arm64 + x64, .dmg) and Windows (.msi), signs update bundles, publishes Release.

## Phases
0. Bước tạm (xong): dừng vẽ Pixi khi tab bị ẩn và hạ khung hình xuống 30fps khi không có agent hoạt động. Máy mát hơn ngay trong lúc chờ có app.
1. Static export of web UI; replace API/socket client with a Tauri bridge (`invoke` + events).
2. Rust core: SQLite schema + migrations, ingest endpoint, snapshot query, limits endpoint. Port unit tests.
3. Tray app shell, hidden-window throttling, first-run hook installer (asks consent).
4. Updater + GitHub Actions release pipeline; update banner UI.
5. Remove Docker/Postgres/NestJS; docs: install, update, uninstall.

## Acceptance
- Idle CPU < 1%, RAM < 120MB with window closed; no Docker running.
- Fresh machine: download .dmg/.msi → open → consent → agents appear.
- Publishing tag `v0.2.0` makes an installed `v0.1.0` show the update banner and update in place.

## Risks / needs from user
- **macOS signing**: without an Apple Developer ID ($99/yr) users see "unidentified developer" and must right-click → Open once; notarization needs the account. Windows SmartScreen similar without a code-signing cert.
- Updater signing key: generated once, private key stored only as a GitHub Actions secret.
- Rust toolchain needed for local builds (CI builds releases).
- Existing Postgres history is not migrated (fresh SQLite) unless asked.

## Defaults (chọn sẵn, đổi được)
- Repo releases public (repo riêng `agent-office-releases` nếu code muốn để private): tự cập nhật không cần token.
- macOS arm64 trước, sau đó x64 và Windows.
- Chưa mua Apple ID: hướng dẫn chuột phải → Open lần đầu; mua khi có người dùng ngoài.
- Không chuyển lịch sử Postgres sang.

## Status (2026-11-14)
All phases done. Phase 4 deviation: update prompt is a native dialog, not an in-page banner. Not yet verified: a real tag release updating an installed build (needs the public releases repo + secrets).
