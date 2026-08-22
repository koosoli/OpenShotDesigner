# Implementation Progress

Running record of what has landed, mapped to `docs/IMPLEMENTATION_PLAN.md` batches.
Typecheck and Vitest are green at time of writing; test count: **466**. Production builds are verified separately before handoff.

## Batch 1 — Foundation ✅
- Central ID service (`src/domain/ids.ts`), deep-clone/remap (`src/domain/clone.ts`)
- Schema versioning + migration framework (`src/domain/migrations/`), legacy v1→v4 chain, fixture-tested
- IndexedDB project + content-addressed asset stores behind a synchronous facade (`src/utils/projectLibrary.ts`, `src/domain/storage/`); localStorage fallback + one-time LS→IDB import
- Validation framework (`src/domain/validation/`) wired into JSON import
- Autosave/save-state contract + top-bar indicator
- Vitest infra, CI workflow, AGENTS.md, collaboration-boundaries note, regression checklist
- Brand-neutral branding config (`src/config/branding.ts`)

## Batch 2 — Canvas + Asset Foundation ✅ (core)
- Plan layer system: schema v3 migration, default layers, visibility/lock/opacity, Layers panel in Inspector, canvas render/hit-test filtering
- Freehand annotation tool (Pointer Events, pen/touch/mouse, pressure + coalesced events, pinch coexistence, undo via normal element path)
- Touch context menu (right-click + long-press): open in inspector, lock, duplicate, z-order, clipboard, delete
- Symbol registry + Quick Asset Search integration (`src/domain/assets/`, 51 curated symbols)
- Schema v9 Asset Library references: curated symbols now remain real symbols when placed and exported instead of degrading to generic rectangles; stage, runway, truss-tower, OB production truck, ENG van, and satellite-uplink truck families were redesigned as top-down plan glyphs
- Editor and print/PNG paths share the same freehand renderer; layer `printVisible` is respected independently of temporary editing visibility
- Free draw has a canvas-native brush palette with pen/highlighter modes, preset and custom colors, 1–16 px thickness, 10–100% opacity, a live sample, and device-local preference persistence; each stroke saves its chosen appearance in project state
- PWA offline app shell (`public/sw.js`, registered in production builds)

## Batch 3 — Production Model ✅ (core)
- Domain modules: locations, people (+CastAssignment), script (ScriptScene/BreakdownItem/Character), shots (ProductionSegment), scheduling, equipment, fixtures, cable (ports/connectors), power (no model-name guessing), rigging, logistics, moodboard, reports
- Schema v4: persisted vNext collections with lossless deterministic migration + clone/remap coverage
- Workspace presets (§1.2): dashboard picker, per-project local-preference profiles, module visibility actually hides tabs (script-free concert/broadcast workspaces)

## Batch 5 — Scheduling ✅ (core)
- Resizable, non-full-screen production scheduling workspace that keeps the plan canvas in context; dense AD strip rows, searchable unscheduled pool, drag/touch-button day placement, editable estimates, day breaks, banners/manual blocks, summaries, and conflict warnings
- Script-optional scheduling: screenplay scenes and floor-plan setups can both be scheduled, so a screenplay is never required
- Individual shots and multi-selected shot groups can be dragged or assigned to shooting days; setup/shot coverage is mutually exclusive to prevent accidental double-scheduling, and resolved shot names flow into call sheets
- Production calendar timeline with persistent ranged events/milestones plus a shooting-day one-line view
- Coverage matrix remains a separate view inside the scheduling workspace

## Batch 6 — Reports ✅ (core)
- Derived call-sheet data + explicit overrides + publish lifecycle (`src/domain/reports/`)
- Editable call-sheet workspace with day picker, live paper preview, readiness status, and printable/PDF output
- Day-specific sheets include scheduled start times, linked location addresses, scheduled cast filtering, parking/access, hospital, weather summary, safety bulletins, and readiness warnings

## Application shell / visual system ✅ (current pass)
- Replaced the overflowing flat module-tab row with grouped Create / Production / Technical navigation and clear module names
- Removed module full-screen toggles and the schedule-only full-width takeover; every module stays inside the normal resizable workspace panel
- Viewing Options now exposes every workspace tab in every project preset, with per-tab switches and “Show all”; presets remain editable defaults rather than module locks
- Schema v10 reference-image calibration: mark two endpoints on an imported plan's known scale, enter metres or feet, and resize the image to the canvas grid with an anchored, undoable, provenance-recorded calculation

## Batch 7 — Fixture / DMX ✅ (core)
- OFL adapter + fixture-db manifest (`adaptOflFixture`, never infers watts from model names)
- DMX allocator hardening: 512-crossing, gap-fit overlap, overflow, invalid addresses, mode-change growth detection
- Full universe patch view lists each fixture's mode, start/end address, and footprint; mode footprint is explicit project data and remains unknown until configured (never inferred from a fixture label/model)

## Batch 8 — Truss / Cable / Signal / Power ✅ (domain)
- TrussProfile/rigging loads incl. generic suspended loads + safety disclaimers
- Cable/port/connection model; power load/headroom with unknown-data propagation

## Batch 9 — Logistics ✅ (domain)
- Containers/nesting/packed-vs-physical volume/utilization with null-propagation for unknowns

## Batch 10 — Mood Boards ✅
- MoodBoardPanel tab: boards/sections/cards, asset-store-backed images (no base64 in project state), URL-reference cards, entity links

## StudioBinder parity pass (2026-08-22) ✅
Schema v13 (`src/domain/migrations/v12-to-v13.ts`, no backfill — every new field is absent-safe). Test count now **466**.
- **Encoding repair:** 10 source files had been round-tripped through a Windows-1252 decode (the "strange signs" bug: degree signs, dashes and multiplication signs rendered as two or three Latin letters); bytes repaired, BOMs stripped, `.gitattributes`/`.editorconfig` added, `scripts/check-encoding.mjs` runs in `npm run lint` so CI fails on regressions.
- **Screenplay omission:** deleting a scene heading now OMITS the scene (`src/domain/script/omission.ts`): the slug stays as "SCENE n — OMITTED" with Restore, a second delete removes it; the flag round-trips through Fountain (`[[OMITTED]]`), shows in the lined script, breakdown reports and schedule strips, and omitted scenes leave the schedulable pool.
- **Script line identity:** re-parsing / re-importing a draft reconciles line ids (`src/domain/script/reconcile.ts`) so linings, shot links and scheduled scenes survive edits; project duplication now remaps the project-level screenplay, scene ids and scene strips consistently.
- **Mood board:** free-form collage (drag to move, corner to resize, click to raise; persisted `collageLayout` in 1000-unit canvas coordinates, `src/domain/moodboard/collageLayout.ts`) for panel and print; palette extraction reports why it found nothing (CORS-blocked URL images) instead of silently returning an empty palette.
- **Fixtures:** brand/model dropdowns merge the curated presets with the bundled OFL snapshot + custom profiles (`src/domain/fixtures/brandCatalog.ts`); picking a database model (or a preset with a confident match) links the profile so watts, weight, size and DMX modes come from measured data; the picker suggests the light's brand without typing.
- **New modules:** Contacts / crew list (`src/components/contacts/`, people CRUD, cast ↔ character assignment, CSV import/export, printable contact list), Task board (`src/domain/tasks/`, kanban with due dates, priorities, assignees, labels, checklists, drag + touch moves), production calendar Month view with event category/status/assignee editing, Script Sides generator (scenes by selection or shooting day, per-character filter, Courier print) and a Day-out-of-days report in Script reports.
- **Icons:** toolbar/inspector camera and light glyphs are now a motion-picture camera and a fresnel head (`src/components/icons/ProductionIcons.tsx`).
- **Audit fixes:** debounced autosave with flush on project switch / tab hide / unload and surfaced IndexedDB save errors; real `updatedAt` on projects; IndexedDB open timeout + blocked/versionchange handling; pure AV-row updater; geocode timeout and network-stubbed tests; second-finger touch guard and element long-press menu on the canvas; keyboard shortcuts no longer steal copy/delete from text fields; timeline drag survives row deletion and no longer runs away past the axis; local-date today marker; service-worker cache keyed by build id with network-first navigations; camera stream released when the viewfinder closes mid-prompt; confirm before "Clear cache & reset".
- See `docs/codebase-audit-2026-08-22.md` for the remaining open findings.

## Remaining / deferred
- Batch 3A collaboration spike — intentionally deferred (CRDT choice is a locked "do not decide silently" item)
- ~~OFL build-time snapshot generation script~~ ✅ done (`scripts/build-fixture-db.ts`, `npm run fixtures:build`; fetches OFL dump with fallback, adapts via `adaptOflFixture`, writes `src/generated/fixture-db.json` + manifest; graceful skip on network failure, never wired into CI build; schema-contract test skips when the snapshot is absent — snapshot itself generated on demand, licensing review still pending before shipping a committed snapshot)
- Script intelligence UI (character/location autocomplete) on the existing editor
- GDTF/MVR adapters (explicitly post-OFL-stability)
- Schedule-aware show-day workflow, continuity, and sun planning (future phases §35–37); the earlier scene-only live shot tracker is de-emphasized in overflow navigation pending replacement
