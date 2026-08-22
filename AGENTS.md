# AGENTS.md — Rules for AI Coding Agents

> **Master plan:** `docs/IMPLEMENTATION_PLAN.md` is the full product/architecture source of truth.
> **This file must stay synchronized with it.** If the master plan's locked rules change, update this file in the same PR (and vice versa: never contradict the master plan here). Read plan §1–5 and §39–48 before large tasks; this file is the short version.

## Product direction (one paragraph)

Cineplan ("Open Shot Designer") is evolving from a shot/floor-plan tool into a **modular, local-first production planning suite** covering film, documentary, commercial, music video, concert filming, broadcast/OB, studio, live events, interviews, photo shoots, and pure technical floor plans. A **screenplay is optional** — no feature may require one unless it is explicitly a script feature. The **standalone/static build remains first-class** (GitHub Pages-compatible); collaboration is optional, self-hostable, and designed for but never required. Everything is optional; everything can connect.

## Non-negotiable architectural rules (plan §2, condensed)

1. No feature may require a screenplay unless it is explicitly a script feature.
2. No core feature may require the collaboration server.
3. Static standalone build stays functional, including GitHub Pages where technically possible.
4. Business/domain calculations live outside React components.
5. Do not add new `any` types.
6. Every persistent schema change requires a migration.
7. Every important domain calculation gets unit tests.
8. Existing saved projects/imports must continue to load.
9. UI supports mouse and touch where appropriate.
10. Stylus/Pencil uses the same canvas architecture, not a separate app mode.
11. No one-off SVG production symbols inside random components.
12. All production-plan symbols go through the shared Asset Library.
13. Missing technical data stays `unknown`; never silently substitute `0`.
14. Store quantities in explicit canonical units (`src/domain/units.ts` once landed); convert only at display/export boundaries; never mix implicit metric/imperial.
15. Rigging/electrical calculations are planning aids, not engineering or safety certification.
16. Every persistent entity uses globally unique IDs.
17. Heavy binary assets are not embedded in collaborative project state.
18. Design new data structures collaboration-ready, even before any sync server exists.
19. Offline work must remain possible.
20. Rebranding is presentation/configuration only — never a domain-model concern.
21. Avoid giant cross-domain context objects.
22. Collaboration framework must be ours/self-hostable; no Firebase/Supabase/SaaS as a required dependency.
23. Persistent project state and ephemeral presence state stay separate.
24. Collaborative undo/redo must never revert another user's remote changes.
25. Partition project data into sensible collaboration documents; do not assume one giant CRDT doc.
26. Assets are referenced by IDs/metadata, never embedded as base64 in project state.
27. Preserve provenance/version metadata on technical source data where practical.
28. Never infer fixture power from numbers in model names (model number ≠ wattage).
29. External image/content integrations use explicit provider adapters with attribution/licensing respect; no scraping third-party libraries.
30. Static mode degrades gracefully when online providers are unavailable.
31. New dependencies require written justification in PR/task notes; keep the frontend lean.
32. Agents must not silently choose/change license, brand name, CRDT library, backend stack, drag/drop library, or auth strategy.
33. High-frequency data (cursors, viewport, live selection) never enters persisted project history.
34. Local-first sync tolerates network loss and reconciles after reconnect.
35. Externally sourced database snapshots record source, version/date, attribution/license.
36. Plan/canvas engine works without script, schedule, equipment, accounts, or server.
37. Reports/manifests/paperwork derive from canonical project data; store explicit overrides/snapshots, not hidden duplicates.
38. Keep persistent local preferences, local session-only UI state, shared project state, and broadcast presence distinct.

See `docs/collaboration-boundaries.md` for rule 38's concrete partitioning in this codebase.

## Repo conventions

- **Domain code** lives in `src/domain/<area>/` (project, people, locations, plan, shots, script, scheduling, equipment, fixtures, dmx, cable, signal, power, rigging, logistics, moodboard, assets, collaboration). Each domain owns its types, pure logic, serialization/migration helpers, validation, and tests. Do not grow the legacy monolithic types/context further; new logic goes in domains, not components.
- **IDs:** always via the central ID service (`src/domain/ids.ts`, `createId("shot")` etc., backed by `crypto.randomUUID()` with fallback). Never hand-roll IDs in components or utilities. Duplicates/imports must deep-clone and remap nested IDs + references (`src/domain/clone.ts` helpers).
- **Migrations:** every persisted schema change bumps `schemaVersion` and adds a deterministic versioned migration in `src/domain/migrations/` (`vN-to-vN+1.ts`), plus a fixture test proving old saved projects still load and migrate losslessly.
- **Validation:** composable domain validators live in the domain layer (`src/domain/validation.ts` / domain `validate*` functions), returning structured issues (`severity`/`code`/`entityId`/`message`). Pure, testable; run at meaningful boundaries, not per pointer-move.
- **Storage:** all persistence goes through the storage facade (`src/utils/projectLibrary` → IndexedDB-backed store implementing the `ProjectStore` shape). Do not touch `localStorage`/IndexedDB directly from components. **No new base64 blobs embedded in project state going forward** — binary media belongs in the asset store, referenced by ID.
- **No business logic in React components:** calculations like cable length, DMX patching, rig loads, day equipment, scheduling belong in domain/service modules with unit tests.
- **No new `any`:** extend typed domain models instead; do not widen existing escapes.
- **Units:** canonical SI units internally (see `src/domain/units.ts` policy: mm/kg/W/A/V/degrees/explicit time fields). Convert only at display/export edges; user display-unit preference never changes stored meaning.

## PR / task checklist (from plan §39.1)

Every PR/task description must state:

- [ ] **Scope** — what changed, which plan section/workstream it belongs to
- [ ] **Data-model changes** — new/changed persisted fields or entities
- [ ] **Migration impact** — schemaVersion bump? migration added? fixture test added?
- [ ] **New dependencies** — each with written justification (rule 31)
- [ ] **Tests added** — domain calculations, migrations, referential integrity
- [ ] **Standalone/GitHub Pages impact** — does it still work offline/subpath?
- [ ] **Collaboration-readiness impact** — which of the four state classes does new state belong to?

Also: one workstream owns a domain at a time; no opportunistic repo-wide refactors outside your scope; small reviewable commits; don't mark done when only the UI exists (see plan §42 Definition of Done).

## Do NOT decide silently (plan §46.1)

Research and propose, but never bake these into architecture without an explicit project decision:

- Product rebrand/name (and repo/schema renames)
- License / commercial direction (current baseline: GPL-3.0 — do not alter)
- Exact CRDT/local-first library
- Collaboration backend framework / database / ORM
- Authentication implementation
- Drag/drop library
- Frontend state library (e.g. Zustand)
- Optional image/weather/map/sun provider(s)

## Commands

```bash
npm run dev          # Vite dev server on port 3000
npm run typecheck    # tsc --noEmit
npm run test         # vitest run
npm run lint         # tsc --noEmit + scripts/check-encoding.mjs (fails on mojibake / BOMs)
npm run check:encoding        # encoding check alone; --fix-bom strips byte-order marks
npm run build        # production build (base '/')
GH_PAGES=true npm run build   # subpath base '/OpenShotDesigner/' — CI verifies this
```

CI (`.github/workflows/ci.yml`) runs: install → typecheck → test → lint → build → GH_PAGES build. Keep it green; add tests for every domain calculation and migration you touch.

## Definition of Done (plan §42, short form)

A feature is not done because it renders. Where applicable it needs: domain types, referential integrity, persistence, migration, undo/redo, copy/paste, touch + keyboard behavior, export behavior, tests, dark/light themes, standalone mode, collaboration compatibility, and docs. Technical calculations additionally need input validation, explicit missing-data behavior (`unknown`, not `0`), explicit units, unit tests, and a safety disclaimer where relevant.

## QA / regression

Before releases and after storage/canvas refactors, walk `docs/regression-checklist.md` (derived from plan §38.2). Keep at least one lightweight bundled demo project path working for first-run users and smoke tests.
