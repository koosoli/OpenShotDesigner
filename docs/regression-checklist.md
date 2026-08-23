# Regression Checklist — Existing Feature Contract

> Manual QA checklist derived from master plan §38.2. Run before releases and after any architecture/storage/canvas refactor. If a replacement architecture changes an existing workflow, the PR must document the migration and user-visible behavior.
>
> **Bundled demo project path:** keep at least one lightweight bundled/demo/sample project loadable on first run (see `src/utils/sampleContent.ts`) so new users and smoke tests can exercise the suite without importing their own production.

## Projects dashboard

- [ ] Dashboard lists multiple productions with correct summaries
- [ ] Create new project; rename project
- [ ] Duplicate project (no shared IDs; duplicate opens correctly)
- [ ] Download/export project JSON
- [ ] Delete project (with confirmation; others unaffected)
- [ ] JSON import creates/restores a project without overwriting another open production
- [ ] Old-schema project JSON still loads and migrates
- [ ] Bundled demo/sample project path works on first run
- [ ] Production metadata/logo behavior intact

## Floor plan / blocking

- [ ] Canvas pan/zoom; real-world scale, grid, and measurement display
- [ ] Add/move/resize/rotate: cameras, actors, props, architecture, lights, shapes, track, cables
- [ ] Background/reference blueprint and set-photo images render and persist
- [ ] Blocking paths with waypoints, per-waypoint rotation, playback
- [ ] Undo/redo and keyboard shortcuts work across plan edits
- [ ] Full-screen panel/workspace toggle behavior

## Camera / shot behavior

- [ ] Sensor-aware FOV/viewfinder updates from camera settings
- [ ] Lens/sensor/aspect/frame-rate/height/exposure finder settings persist
- [ ] Live device-camera viewfinder/capture where browser permissions allow
- [ ] Safe/action guides and storyboard overlay behavior
- [ ] Shot list cards/table; all-scenes view
- [ ] Insert shot between existing shots; reorder/renumber
- [ ] Takes/status editing
- [ ] Camera reassignment does not destroy existing blocked positions
- [ ] Camera ↔ shot selection stays synchronized; multi-camera workflows work

## Storyboard

- [ ] Board ordering independent of shot-list order
- [ ] Boards per shot and per camera keyframe/waypoint where supported
- [ ] Drag/drop/browse artwork into frames; device-camera capture lands in intended frame
- [ ] Aspect-ratio behavior correct
- [ ] Image optimization/downscaling applied (no storage blowup)
- [ ] Storyboard print/contact-sheet export

## Script (screenplay / lined / AV)

- [ ] Screenplay editor formatting workflow; Enter/Tab element transitions
- [ ] Fountain/plain-text and FDX import paths
- [ ] Scene-number parsing
- [ ] Raw Fountain / page-view modes
- [ ] Lined-script selection incl. word/range precision; script-range ↔ shot linking
- [ ] Lining handles/adjustment; out-of-frame/squiggle and continuation markers
- [ ] Line an existing shot without recreating it; unline keeps the shot deliberately
- [ ] AV two-column script; bidirectional AV-row ↔ shot linking
- [ ] Touch text-selection usable

## Equipment

- [ ] Equipment manifest derived from plan content
- [ ] Active-scene vs all-scenes/master views
- [ ] Custom equipment add/edit
- [ ] Camera packages / expandable kits
- [ ] Department/search/filter workflows
- [ ] Spreadsheet/CSV/print exports

## Responsive / touch / themes

- [ ] Responsive/mobile panels and bottom-sheet behavior
- [ ] Touch pinch/pan on canvas; touch targets usable
- [ ] Dark and light themes both readable (canvas + panels)
- [ ] Mouse and keyboard flows unaffected

## Exports

- [ ] Lined-script export (lined-only vs full screenplay options)
- [ ] Storyboard export/print
- [ ] Floor-plan blueprint PNG / print-PDF
- [ ] Shot-list export; equipment CSV
- [ ] Project JSON export/import round-trip

## Continuity & DaVinci Resolve metadata

The CSV's header row is asserted byte-for-byte against
[`resolve-metadata-template.csv`](resolve-metadata-template.csv) in the unit
tests, so a header regression fails CI. What the tests **cannot** prove is the
other half of the contract: Resolve matching rows to clips. Both halves fail
silently — Resolve reports a successful import and attaches nothing — so the
round-trip stays a manual gate.

Verified working against a real media pool on 2026-08-23 (first end-to-end
confirmation; before that the import path was untested).

- [ ] Log takes for a day, then fill file names via **Reconcile file names**
      against the card's own listing
- [ ] Export **Resolve CSV**, import in Resolve via
      **Media Pool → right-click → Import Metadata…**
- [ ] Open an individual clip's metadata and confirm Scene, Shot, Take and
      Keywords are populated — do not trust the import dialog, it reports
      success either way
- [ ] Nothing populated anywhere → header mismatch. Populated but on the wrong
      clips → file-name drift, not the CSV
- [ ] Checklist ticks itself off from good takes; wrap gaps list shots never
      shot and shots with no good take
- [ ] A pickup logged on the day takes the next free number in the scene's own
      convention and does not renumber anything already planned

## Build / deployment

- [ ] `npm run build` succeeds at base `/`
- [ ] `GH_PAGES=true npm run build` succeeds at subpath `/OpenShotDesigner/`
- [ ] App loads and functions when served from the GitHub Pages subpath
