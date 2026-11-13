# Hybrid office rendering and truthful presence

Status: reviewed for implementation on 2026-11-14.

## Scope and acceptance

1. Initial request renders a runtime-scoped office snapshot in Next.js server HTML; API outage yields an honest disconnected shell.
2. A typed data access layer validates the API response using shared Zod contracts; client revalidation uses the same schema.
3. Client runtime switching, session selection, list/map selection and realtime updates do not hard-reload the browser. Socket events invalidate the matching runtime cache, with polling as recovery.
4. Status labels and placement distinguish observed tool work, explicit idle/turn stop, stale evidence and disconnected transport. No animation suggests work when evidence is stale.
5. Move office implementation into `src/features/office`, keep `src/app` routing thin, add `src/server/dal` guarded by `server-only`; preserve the separate NestJS/Prisma backend and read-only scope.
6. Build, tests, integration, SSR HTML and browser desktop/mobile checks pass.

## Implementation

- Add Zod schemas for snapshot/events in `@office/contracts` and parse API responses on server and client.
- Add server-only API DAL with internal Docker URL and a feature server query.
- Move page/canvas into feature components; server page fetches initial snapshot, client component hydrates TanStack Query for ongoing observation.
- Build a pure presence projection from latest hook + timestamp + connection state. Use a clock tick so stale status changes without a new event.
- Improve labels, live counters, inspector evidence, and map placement while retaining the accessible list.
- Update Docker env, docs and meaningful tests.

## Review

This plan follows the existing read-only event architecture, does not add writes or Server Actions, and keeps runtime isolation in every query key and API call. Main risks: server fetch address in Docker, stale-status timing, and client hydration mismatch; verify these explicitly.
