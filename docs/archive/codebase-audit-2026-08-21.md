# Codebase Audit — 2026-08-21

Scope: the current local worktree, including the implementation-plan work that has not yet been pushed. This is a code and architecture audit, not a claim that every workflow has passed production acceptance.

## Executive finding

The codebase contains substantial working domain functionality, but it is not yet maintainable at the standard set by the implementation plan. The largest risk is concentration: several multi-thousand-line React/context files still own rendering, interaction, state mutation, and compatibility logic. The second risk is delivery discipline: a very large feature set is present as one dirty worktree rather than small reviewable commits. The third is UI/export drift caused by parallel render paths.

## Findings

### P0 — Release integrity

1. **The current implementation is not reviewable as a release unit.** The worktree contains broad modifications and many untracked feature directories spanning scheduling, reports, DMX, power, rigging, logistics, mood boards, migrations, CI, and documentation. This conflicts with plan §39's small-reviewable-workstream rule. Before pushing, split the work by domain and verify each slice independently.
2. **The progress document previously overstated completion.** Several batches were labelled complete at “core” level although §42 requires persistence, migration, undo/copy behavior where applicable, export, tests, themes, standalone operation, and documentation. The implementation audit records these as partial where those gates are not evidenced.

### P1 — Architecture and correctness

1. **Giant hotspots remain.** Current largest files include `InspectorPanel.tsx` (~5,228 lines), `FloorPlanContext.tsx` (~3,839), `FloorPlanCanvas.tsx` (~2,517), `EquipmentPanel.tsx` (~2,503), `equipmentList.ts` (~1,925), `PrintableShotPlan.tsx` (~1,598), and `PropsLayer.tsx` (~1,585). These are change-collision and regression magnets and contradict the plan's domain extraction direction.
2. **Legacy type escapes are pervasive.** A scan found 167 matches across `as any`, `: any`, direct storage, raw HTML, and browser prompt/confirm patterns; many are existing `any` casts around canvas geometry and context mutation. The rule is “no new `any`”; the remaining debt should be retired by adding typed geometry capabilities and discriminated update helpers.
3. **Editor/export rendering had diverged.** Freehand strokes rendered only on the live canvas and disappeared from printable/PNG output. Fixed in this pass by sharing `FreehandStrokeLayer` and introducing a tested print-visibility selector. Remaining plan rendering should converge on shared scene-layer components so walls, symbols, labels, and future tools cannot drift independently.
4. **Asset Library integration was cosmetic.** Registry search results previewed curated SVGs but placed generic rectangles; legacy stage and broadcast entries bypassed the registry through one-off `PropsLayer` JSX. Fixed for new placements with persisted `ShapeElement.symbolId` and schema v8→v9 migration. Legacy branches remain for saved-project compatibility and should be migrated deliberately, not deleted.
5. **The central context is still doing too much.** `FloorPlanContext` handles cross-domain state, mutations, cloning, scheduling, and UI actions. Continue extracting domain commands and narrow providers; do not replace it with a different giant global store.

### P2 — Performance, UX, and maintenance

1. **Bundle boundaries need attention.** Large workspaces are mounted through a broad application shell, and previous builds warned about a large main bundle. Route/module-level lazy loading is appropriate as long as standalone and GitHub Pages builds remain intact.
2. **One-off symbol rendering remains expensive to maintain.** `PropsLayer` contains large handcrafted branches. New production symbols must be registry-only; legacy prop symbols should be mapped to registry definitions through a versioned compatibility table.
3. **Export remains a large monolith.** `PrintableShotPlan` combines derivation, controls, paper layout, CSV entry points, and SVG rendering. Split derived report data from paper templates and canvas scene rendering.
4. **Representative fixtures are incomplete.** Plan §44 calls for narrative, concert, broadcast, simple floor-plan, and collaboration-conflict fixtures. Lightweight domain tests exist, but the full scenario set is not established as repeatable acceptance data.

## Changes made from this audit

- Freehand annotations now export through the same renderer used by the editor.
- Print selection honors `PlanLayer.printVisible` independently of editor visibility.
- Asset Library symbols persist by stable registry ID and render in both canvas and export.
- Added a deterministic schema v8→v9 migration; existing shapes are preserved without guessed symbol identities.
- Reworked the main-stage, stage-deck, runway, truss-tower, OB production-truck, ENG-van, and satellite-uplink-truck glyphs as top-down plan symbols with physical-size metadata.
- Added tests for print visibility, migration compatibility, and required stage/broadcast symbol families.

## Recommended next refactor order

1. Freeze feature expansion long enough to split and review the dirty worktree by domain.
2. Extract a shared `PlanScene` renderer used by editor, print, PNG, thumbnails, and future exports.
3. Replace canvas/context `any` geometry with typed capability guards and typed update commands.
4. Split Inspector, Equipment, and printable reports into domain-specific panels/templates.
5. Add the §44 representative fixtures and browser acceptance tests for scheduling, call sheets, DMX, and export.

## Task checklist

- Scope: export correctness, Asset Library placement, stage/broadcast symbols, repository and implementation audit.
- Data model: optional `ShapeElement.symbolId` references curated registry data.
- Migration: schema version 9 with deterministic v8→v9 migration and fixture test.
- Dependencies: none added.
- Tests: print-selection, migration, and symbol-family coverage.
- Standalone/GitHub Pages: no online/runtime dependency introduced; verify both production build variants before handoff.
- Collaboration readiness: `symbolId` is shared project state; symbol definitions remain versioned application metadata. Export selection is derived state; no ephemeral state is persisted.
