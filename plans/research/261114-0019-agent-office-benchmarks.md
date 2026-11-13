---
date: 2026-11-14
status: complete
topic: visual agent office benchmarks
---

# Research: Visual Agent Office benchmarks

## Summary

The current Office has working observation and runtime separation, but its visual scene is six static desks and nearly identical rectangular figures. The map is too small in the page hierarchy, agent labels do not expose state at a glance, and updates recreate the whole Pixi application. The user's criticism is accurate: it reads as a dashboard with a small office illustration.

The strongest references show a coherent floor plan, character silhouettes, visible work/rest/wait behavior, and activity labels directly on the map. Rebuild the scene with original procedural art so the product keeps its local, read-only, metadata-only contract and does not inherit paid or uncertain art licenses.

## Method

- Researched 14 November 2026 with five focused web research calls, using project repositories, official product pages, and one live demo.
- Compared visual hierarchy, character design, state language, runtime support, licensing, and integration assumptions.
- Inspected the live [Agent Office demo](https://alminisl.github.io/agent-office/demo/) and [Pixel Agents site](https://pixel-agents.com/) visually.
- Ran the invoked `last30days` engine for 14 Oct–13 Nov 2026. It returned one directly relevant GitHub repository, while most Reddit/HN results concerned coding agents generally; Reddit search was partially blocked and YouTube/X were unavailable. Treat that pass as a recency check, not a popularity ranking of office UIs. Raw evidence: [last30days output](ai-coding-agent-virtual-office-visualization-like-ajsahni-agents-office-raw-v3.md).

## Benchmarks

| Project | What works | Fit and constraint |
| --- | --- | --- |
| [Agents Office v3](https://github.com/ajsahni/agents-office) | A strong 3D isometric composition: six departments around a central Brain, task status rail, distinct agent seating | The user-provided visual benchmark. It runs agent tasks on Claude rather than simply observing Claude and Codex. Its PolyForm Noncommercial license plus extra terms explicitly prohibit bundling or wiring into another agent product; use design observations only. |
| [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents) | Distinct characters, zoned office, readable speech/status bubbles, pixel-perfect scene, layout editor | Strongest art direction. Its official product currently describes Codex as roadmap, so not a drop-in dual-runtime solution. Do not copy its art. |
| [Agent Move](https://github.com/FoothillSolutions/agent-move) | Activity zones and animated sprites with Claude, Codex CLI, OpenCode and pi support | Useful cross-runtime movement reference; verify license before reusing any asset or code. |
| [Agent Virtual Office](https://github.com/KbWen/agent-virtual-office) | Cozy pixel co-workers visibly type, break and block; Claude, Codex and Gemini support | Good state language and compact room composition. Our app preserves its own event evidence model. |
| [Pixel Office](https://github.com/bignutchanon/pixel-office) | Gather-style office, real Claude/Codex session activity, RPG character scale | Early small project; useful comparison for dual-runtime visual hierarchy, not a proven production base. |
| [Agent Office demo](https://github.com/alminisl/agent-office) | Cubicles, varied workers, dense but legible status labels, working/idle/attention language | Best reference for visible agent presence. Repository license is marked TBD; use it as visual research only. |
| [Claude Office](https://github.com/W17ant/Claude-Office) | Multiple rooms, main/subagent roles, inspection, task whiteboard | Rich but too much game behavior for a read-only MVP. Keep our scene simpler and evidence-based. |
| [Cubicle](https://github.com/caglarutkuguler/cubicle) | Desk → lounge state mapping, clear needs-attention pose, local read-only observation | Strong model for connecting motion to observed states. Avoid copying its control features. |
| [Pixel Agents Web](https://github.com/mriechers/pixel-agents-web) | Browser office, Claude/Codex/Gemini labels, layout editor, team grouping | Its full furniture tileset requires a paid third-party pack. Detailed non-Claude status depends on transcript compatibility. |
| [theagentoffice](https://github.com/bas3line/agent-office) | Claude/Codex support, crisp offscreen pixel rendering, zoom/pan, inspector | Supports launching/controlling agents, outside this product's read-only scope. |

## Decision for this product

1. Make the office scene the dominant surface. Move sessions to a narrow rail and inspector/evidence below the map.
2. Draw one original shared floor with defined desk, collaboration, and lounge zones. Zone placement expresses observed status only, never inferred profession or task content.
3. Give each observed agent a stable visual identity from its ID: face, hair, clothing, and nameplate. Main agents get a distinct silhouette.
4. Working agents type at desks; waiting agents use a visible attention marker; idle agents rest; stopped and stale agents remain visibly inactive. Motion must stop under reduced-motion preference.
5. Show tool and state labels beside characters, derived only from stored allowlisted metadata. The list view remains the accessible equivalent.
6. Keep Claude and Codex data separate. Both render into the same visual system with runtime-specific accent color.
7. Do not use third-party artwork in the shipped version. Original Pixi shapes avoid unclear redistribution rights and keep install reproducible.

## Acceptance

- At desktop width, the office occupies most of the content area and agents are distinguishable without opening the inspector.
- Empty Codex data shows an empty but fully realized office, with clear hook-trust guidance.
- Active, idle, stopped, and unknown agents have different poses or placement; no ongoing animation is presented as evidence of work after status becomes stale.
- Agent selection opens identity and latest evidence without hiding the floor.
- List fallback, keyboard focus, narrow viewport, reconnect, and runtime isolation still work.
- Build and integration tests pass; inspect screenshots at desktop and phone widths.

## Unresolved

- The Codex stream showed one observed session during visual QA on 14 Nov 2026. This confirms data arrival on this machine, but richer Codex subagent behavior still needs a real multi-agent session to validate. The UI must not invent occupants.

## Sources

- [Pixel Agents repository](https://github.com/pixel-agents-hq/pixel-agents) and [product page](https://pixel-agents.com/)
- [Agent Office repository](https://github.com/alminisl/agent-office) and [demo](https://alminisl.github.io/agent-office/demo/)
- [Claude Office repository](https://github.com/W17ant/Claude-Office)
- [Cubicle repository](https://github.com/caglarutkuguler/cubicle)
- [Pixel Agents Web repository](https://github.com/mriechers/pixel-agents-web)
- [theagentoffice repository](https://github.com/bas3line/agent-office)
- [Agents Office v3 repository and license](https://github.com/ajsahni/agents-office)
- [Agent Move](https://github.com/FoothillSolutions/agent-move), [Agent Virtual Office](https://github.com/KbWen/agent-virtual-office), [Pixel Office](https://github.com/bignutchanon/pixel-office)
