# Office interface design

## Navigation and runtime switch

The runtime switch is the first control in the header: **Claude** | **Codex**. The selected runtime is reflected in the URL (`?runtime=claude_code` or `?runtime=codex`) so a view can be reopened. It changes the complete data scope, not just character colors. The switch preserves page type and project when possible, but clears session and agent selections that do not belong to the new runtime.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ OFFICE  [Claude | Codex]   Project ▾   Session ▾   Connection: observed   │
├────────────────┬────────────────────────────────────┬───────────────────────┤
│ Sessions       │ Pixel office / accessible list     │ Agent inspector       │
│ in this        │ only observed agents               │ identity + evidence   │
│ runtime        │                                    │ current tool if known │
├────────────────┴────────────────────────────────────┴───────────────────────┤
│ Activity timeline for selected runtime, session, and sequence              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Visual language

Pixel-art office is the focal surface, using a fixed shared workspace until explicit placement exists. Claude and Codex use distinct header accents and avatar outline details, but status always has a text label and accessible list equivalent. Do not assign rooms or roles from agent names. A character animates typing only while an observed `WORKING` state is current; stale and unknown states use a neutral pose. Reduced-motion preference disables continuous animation.

The technical inspector shows the event that supports each status, its timestamp, runtime, agent ID/confidence, session, current tool, and task only when known. A missing field displays `Không có dữ liệu`. Error and disconnected states are visibly different from idle.

## First screen states

1. **No integration:** runtime-specific setup instructions, no example agents in the live office.
2. **Connected, no session:** empty office and a clear "Chưa có phiên đang chạy" message.
3. **Live evidence:** agents and timeline update after persisted events; selecting an agent opens inspector.
4. **Stale or disconnected:** retain last known snapshot with timestamp and `UNKNOWN`/stale indicator; never animate it as active work.
5. **History:** ended sessions remain selectable, marked as replay rather than live.

The first functional UI should be a list view connected to real snapshots. PixiJS renders the same store only after the event pipeline and reconnect behavior pass tests.
