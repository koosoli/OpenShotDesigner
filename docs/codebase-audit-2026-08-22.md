# Codebase Audit — 2026-08-22

Follow-up to `codebase-audit-2026-08-21.md`. Two parallel reviews were run: a StudioBinder feature-parity comparison (call sheets, screenwriting, AV script, shot list, storyboard, mood board, breakdown, scheduling, sides, contacts, task board, calendar) and a correctness audit of storage, context, script, scheduling, canvas, service worker and encoding. This document records what was fixed in the same pass and what remains open, ordered by severity.

## Fixed in this pass

| Severity | Finding | Fix |
|---|---|---|
| P0 | "Font shows strange signs": 10 files committed with double-encoded UTF-8 (Windows-1252 round trip) + BOMs | Bytes repaired, BOMs stripped, `.gitattributes` + `.editorconfig`, `scripts/check-encoding.mjs` in `npm run lint` / CI |
| P0 | IndexedDB save failures were silent (no subscriber to the save-state channel) | Provider subscribes and raises the storage warning; writes flushed on project switch, `visibilitychange`, `pagehide`, `beforeunload`, unmount |
| High | Autosave serialised the whole project on every pointer move | 300 ms debounce with the flush points above |
| High | `updatedAt` fabricated at read time, so "most recent project" was arbitrary | `Project.updatedAt` stamped by `writeProject`; summaries sort on it |
| High | Every raw-text edit / re-import minted new line ids → all linings dropped, every scheduled scene stamped OMITTED | `reconcileScriptLineIds` keeps ids for surviving lines (scene headings match by number) |
| High | Duplicating a project orphaned linings and scene strips (project-level lines were cloned after setups) | Shared line map built first; scene ids and `scheduleBlocks[].scriptSceneId` follow it; test added |
| High | Geocode had no timeout; unit test hit Nominatim | 8 s `AbortSignal.timeout`, tests stub `fetch` |
| High | Second finger of a pinch placed elements / started drags; element long-press menu never opened | Non-primary touch pointers ignored; long-press armed from element select too |
| High | Timeline drags died after deleting a row; resizing past the axis ran away | Header lane measured; px/day frozen per gesture |
| Medium | Service worker cache name never changed → stale shell, unbounded cache growth | Build id stamped by a Vite plugin, old caches purged on activate, navigations network-first |
| Medium | App never rendered if the IndexedDB open hung | 5 s open timeout, `onblocked`, `onversionchange` → localStorage fallback |
| Medium | `updateAVScriptRow` dispatched `updateShot` inside a state updater | Hoisted out of the updater |
| Medium | Global shortcuts stole Ctrl+C / Delete from selects, contentEditable and text selections | Guard extended |
| Medium | Today marker used UTC | Local `todayIso()` |
| Medium | "Clear cache & reset" wiped localStorage without confirmation | Confirm dialog |
| Medium | Camera stream leaked when the viewfinder closed during the permission prompt | Tracks stopped if the modal is closed when the promise resolves |
| Medium | Starter project saved without `schemaVersion`, hand-rolled id | Uses `CURRENT_PROJECT_SCHEMA_VERSION` + `createId` |

## Open findings (not addressed yet)

1. **Same-render multi-commit writes are lost** — setup mutations build from the render-time `activeSetup` instead of `prev` (`FloorPlanContext.tsx` `commitSetupState`, `updateElement`; `createCameraAndShot` returns `shotId: ''`). Route all setup updates through functional `setProject` updaters.
2. **Stale-closure overwrites after `await`** in `LocationsPanel` (geocode), `MoodBoardPanel` (multi-file upload race). Use functional meta updates.
3. **`readProject` hides unmigratable projects** and `writeProject` stamps them as current. Surface `MigrationError.issues` in the dashboard.
4. **Per-line `sceneNumber` is a stale cache** — recompute in `setScriptLines`; editor scene numbering still produces duplicates and has no `5A/5B` insert scheme.
5. **Parser misclassifications** (`JENNA (WHISPERING)`, dual dialogue `^`, all-caps action lines, `I/E.` headings) — no tests for `screenplayParser.ts` yet.
6. **Pinch during multi-element drag** leaves moves unrecorded in undo; drag state has no `pointerId`.
7. **ScriptPanel listener binding** — lined-coverage text selection dies after a tab switch; raw textarea not resynced on undo.
8. `ISO_DAY_PATTERN` accepts impossible dates; deleted run-of-show cues ghost in the coverage matrix; invalid crew-call text yields no warning.
9. Bundle is one 2.6 MB chunk — module-level `lazy()` is still pending (keep GitHub Pages base path intact).
10. Hand-rolled ids remain in `FloorPlanContext` (`newShotId`, `newMarkId`, …) and `duplicateCurrentSetup` keeps element/shot ids.
11. Giant hotspots (`InspectorPanel` ≈5.3k lines, `FloorPlanContext` ≈4k, `FloorPlanCanvas` ≈2.5k, `EquipmentPanel` ≈2.5k) and ~170 `any` escapes — unchanged from the previous audit.

## StudioBinder parity — still missing after this pass

- Script breakdown **tagging UI** (select text → element category, element manager, merge-characters UI). Domain + reports + tests exist; only UI is missing.
- Call sheets: per-person call times, department notes, section show/hide & templates, next-day preview, 12/24 h and °C/°F toggles, weather provider.
- Printable stripboard / one-liner; auto-scheduling helpers (group by location / INT-EXT / day-night, auto day breaks by page eighths — eighths must become editable first).
- Shot list column visibility + filter controls (state exists, no UI), per-shot location/sound/gear columns, user colour tags; storyboard images still embedded as base64 (rule 26 debt).
- Storyboard / mood-board image tools (crop, annotate, text cards, duplicate board).
- Export customisation (headers/footers, watermark, paper size, cover page).
- Everything collaboration-dependent (sharing links, comments, delivery status) — deferred by plan.
