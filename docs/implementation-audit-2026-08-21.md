# Implementation Audit Against `IMPLEMENTATION_PLAN.md` — 2026-08-21

Status meanings: **Implemented** = substantive domain + UI path exists; **Partial** = useful core exists but plan/Definition-of-Done scope is incomplete; **Deferred** = intentionally not selected or not started. “Implemented” does not waive the release checks in plan §42.

| Plan workstream | Status | Evidence and remaining gap |
|---|---|---|
| Batch 1 — Foundation | Partial | IDs, migrations, domain folders, validation, IndexedDB facade, CI, and state-boundary documentation exist. The giant context is not yet decomposed, regression fixtures are incomplete, and the present work is not divided into reviewable delivery units. |
| Batch 2 — Canvas | Partial | Layers, freehand, touch context menu, assemblies, and PWA shell exist. Freehand export was fixed in this pass. Grouping/assembly and all tools still need complete touch, print, package, and regression acceptance. |
| Batch 2 — Asset Library | Partial | Registry/search infrastructure exists and new curated placements now preserve symbol IDs. Stage/broadcast redesign began here. The full §43 per-icon audit, domestic expansion, connector metadata, every zoom level, themes, and print matrix are not complete. |
| Batch 3 — Production Model | Partial | Locations, people, script, shots/segments, scheduling, equipment, technical domains, presets, migration and IDs exist. Semantic links and referential-integrity coverage are not complete across every UI workflow. |
| Batch 3A — Collaboration spike | Deferred | Correctly not chosen silently. No CRDT/backend/auth decision should be inferred from the current local-first implementation. |
| Batch 4 — Script + Locations | Partial | Script editor and location UI/domain exist. Character/location intelligence, reusable master-plan propagation/detach, named revisions, and complete reports remain incomplete. |
| Batch 5 — Scheduling | Partial | Production days, unscheduled pool, dense strip rows, drag/drop for scenes/setups/shots, multi-select shots, one-line view, ranged calendar, estimates, and warnings exist. Full stripboard ergonomics, drag reordering/resize across all devices, dependency/company-move logic, production-segment/Run-of-Show integration, and acceptance fixtures remain. |
| Batch 6 — Reports / Call sheets | Partial | Derived day data, explicit overrides, draft/published lifecycle, editor, paper preview, and print/PDF exist. Private call times, recipient/distribution workflow, revision delivery log, concert/broadcast crew-sheet variants, Day Out Of Days, and full department/location/character reports remain. |
| Batch 7 — Fixture / DMX | Partial | Fixture profile adapter, hardened allocator, mode-footprint validation, and a 512-address universe view exist. Custom fixture/mode editing is basic, protocol-aware network mapping and patch report depth remain, and the OFL snapshot cannot ship before licensing review. Unknown footprints correctly remain unknown. |
| Batch 8 — Rigging / Cable / Signal / Power | Partial | Typed domain calculations and working panels exist, including signal-flow and power/rigging summaries. Modular truss endpoint assembly, complete port graph editing, cable manifests/bundles, regional/phase planning depth, and full export acceptance remain. |
| Batch 9 — Logistics | Partial | Containers, packing, dimensions/weight/volume and utilization logic/panel exist. Day-linked requirements, payload constraints, manifests, and representative vehicle workflows need completion. |
| Batch 10 — Mood Boards | Partial | Boards, sections, cards, local asset references, URLs and entity links exist. Provider adapters are intentionally absent; package/export and larger workflow acceptance need completion. |
| Collaboration productionization | Deferred | Correctly deferred until an explicit Batch 3A decision. Core offline operation remains available. |
| Future phases 9–28 | Mostly deferred/partial overlap | The early On Set prototype is not a schedule-aware production-day system. Continuity, sun planning, comments/review, permissions, sharing, offline collaborative reconciliation, server, backups, and security gates are not complete. |

## User-facing workflow verdicts

### Shoot planner and line schedule

The useful core is real: shots can be selected individually or in groups and dragged/assigned to production days, alongside scenes and setups. A screenplay is optional. It is not yet equivalent to StudioBinder in total workflow depth: advanced strip operations, revision tracking, breakdown-driven banners, day-out-of-days, company moves, and distribution-grade reports still need work.

### Call sheet editor

The current editor is a credible local draft/print tool, not a complete call-sheet operations product. It derives schedule/location/cast information and supports explicit overrides and publish states. Correct callsheets still require private call times, recipient groups, acknowledgements/distribution history, stronger validation, stable named revisions, and dedicated concert/broadcast variants.

### Production calendar

Ranged events, milestones, and a one-line shooting-day view exist in a contained workspace. Calendar dependency logic, richer drag/resize interaction, filters, and production-wide resource views remain.

### DMX universe

The 512-slot viewer and exact address footprint are implemented when a fixture mode footprint is explicitly known. The software does not guess channels from a model name. It is a planning patch view, not yet a grandMA-class programming environment; network/session topology, personalities, universes across protocols, cloning/swapping tools, and console import/export are beyond the current core.

### On-set tool

The existing scene-only live tracker is correctly de-emphasized. It should not be treated as finished; replacement should be driven by the scheduled Production Day, include the current block/shot, progress, notes/continuity, crew-facing status, and offline handoff rather than a detached fullscreen mode.

### Icons and plan symbols

The user's criticism was justified: old stage and vehicle glyphs mixed visual languages and some were side/elevation-like drawings rather than top-down plan symbols. Worse, registry previews did not survive placement. New stage/broadcast symbols now share a coherent top-down outline language and stable Asset Library identity. The overall icon library still needs the complete §43 audit before it can be called “as good as can be.”

## Acceptance required before calling the implementation complete

1. Run and preserve green typecheck, unit tests, standard build, and GitHub Pages build.
2. Establish the narrative, concert, broadcast, and simple-floor-plan fixtures from plan §44.
3. Browser-test mouse, keyboard, touch-sized controls, light/dark theme, print, PNG, save/reload, and project package for each major workflow.
4. Split the worktree into reviewable domain commits and avoid merging broad UI-only claims as completed batches.
5. Record any choices for collaboration, drag/drop library, backend, auth, providers, license, or branding explicitly; none were silently selected in this pass.
