# Implementation Progress

Running record of what has landed, mapped to `docs/IMPLEMENTATION_PLAN.md` batches.
Typecheck and Vitest are green at time of writing; test count: **349**. Production builds are verified separately before handoff.

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

## Remaining / deferred
- Batch 3A collaboration spike — intentionally deferred (CRDT choice is a locked "do not decide silently" item)
- ~~OFL build-time snapshot generation script~~ ✅ done (`scripts/build-fixture-db.ts`, `npm run fixtures:build`; fetches OFL dump with fallback, adapts via `adaptOflFixture`, writes `src/generated/fixture-db.json` + manifest; graceful skip on network failure, never wired into CI build; schema-contract test skips when the snapshot is absent — snapshot itself generated on demand, licensing review still pending before shipping a committed snapshot)
- Script intelligence UI (character/location autocomplete) on the existing editor
- GDTF/MVR adapters (explicitly post-OFL-stability)
- Schedule-aware show-day workflow, continuity, and sun planning (future phases §35–37); the earlier scene-only live shot tracker is de-emphasized in overflow navigation pending replacement
