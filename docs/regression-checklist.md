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

## Continuity & Avid ALE

**Not yet verified against a real Media Composer** (added 2026-08-24). The
column names and the three-section structure are written from the published
format; unlike the Resolve header, none of it has been confirmed by an actual
import. Treat a failure here as a bug in the exporter, not in the checklist.

ALE fails the same way the Resolve CSV does — Avid imports and populates
nothing — so this is a manual gate for the same reason.

- [ ] Export **Avid ALE** from the continuity panel
- [ ] Import into a bin via **File → Import…** and confirm clips appear
- [ ] Confirm `Name` matched existing clips, or that new master clips carry the
      right `Tape` / `Source File`
- [ ] Open a clip's bin columns and confirm Scene, Take, Descript, Camroll and
      Soundroll are populated
- [ ] Confirm the custom columns (Camera, Lens, Shutter, ISO, Circled) arrived
      as bin columns rather than being dropped
- [ ] Nothing populated → column-name mismatch. Rows split or columns shifted →
      an unescaped tab or newline reached the file, which `sanitiseAleField`
      exists to prevent

## Camera & sound reports

Both derive from the continuity log, so the check is that they DISAGREE in the
two places they are meant to.

- [ ] Log a take marked **MOS**: it appears on the camera report flagged MOS,
      and on the sound report as a row saying no sound was recorded
- [ ] Log a take marked **Wild track**: it appears on the sound report and is
      absent from the camera report entirely
- [ ] Give one take a camera card and a different sound roll: the two reports
      group under their own roll, not a shared one
- [ ] A take with no roll recorded appears under "Roll not recorded" rather
      than being dropped or filed under the previous card

## Continuity binder (wardrobe / hair / make-up / props)

The conflict check is only as good as the script days, so the first two items
are the ones that matter.

- [ ] Two notes for one character, same department, same script day, different
      descriptions → one warning naming both scenes
- [ ] The same pair with DIFFERENT script days → no warning (wardrobe is
      supposed to change between story days)
- [ ] A note with no script day inherits the one its scene declares
- [ ] Attach a photo, reload, and confirm it still renders — it is an asset id
      in the store, never inlined in the project
- [ ] Duplicate the project: the copy's notes point at the copy's characters
      and setups, not the original's
- [ ] Delete a setup a note cited: the NOTE SURVIVES with the link removed
      (unlike a take, which goes with its shot)

## End-of-day production report

- [ ] Schedule a day, cover some of it, and confirm scenes / setups / shots
      read as covered-over-scheduled
- [ ] Leave one scene without a page length and confirm PAGES reads "—" with
      the reason, rather than a partial sum
- [ ] Remove the estimate from a completed strip and confirm the schedule
      verdict reads "—" rather than "on schedule"
- [ ] A pickup appears under "shot but not scheduled", not among the planned
      shots

## Build / deployment

- [ ] `npm run build` succeeds at base `/`
- [ ] `GH_PAGES=true npm run build` succeeds at subpath `/OpenShotDesigner/`
- [ ] App loads and functions when served from the GitHub Pages subpath
