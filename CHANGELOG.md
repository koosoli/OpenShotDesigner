# Changelog

All notable changes to Open Shot Designer are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/).

## [1.3.0] — 2026-10-13

### Added

- **Screenplay editor pickers**: scene headings have a dropdown for INT. /
  EXT. / INT./EXT. / EXT./INT. / I/E. / EST. and one for the time of day
  (DAY, NIGHT, DAWN, DUSK, CONTINUOUS, LATER… plus any time the script
  already uses); the set is typed between them. Typing or pasting a whole
  heading still works and fills the pickers.
- Character cues get a ( ) picker that adds or removes V.O., O.S., O.C.,
  CONT'D, PRE-LAP, FILTERED…; transition, shot and parenthetical lines suggest
  the standard ones (CUT TO:, SMASH CUT TO:, ANGLE ON, INSERT, (beat),
  (whispering)…) as you type.
- **Keyboard-only screenplay writing**: ↑ / ↓ move between lines; every
  suggestion list (locations, characters, times, cue extensions, transitions,
  shots, parentheticals) is driven with ↑ / ↓ and taken with Enter or Tab;
  Alt+↑/↓ changes INT./EXT. and Alt+Shift+↑/↓ the time of day; ← / → at the
  ends of the set field reach the pickers. All listed in the shortcut sheet (?).
- **New scenes get a floor-plan setup**: a scene heading written in the
  screenplay editor creates a setup named after it, with one example camera
  (Camera A, Shot 1) and no actor, without switching away from the setup you
  have open. Imported or pasted drafts don't, and a scene number that already
  has a setup is left alone. Reports → "Create setup" builds the same.

### Changed

- The screenplay suggestions are the editor's own lists instead of the
  browser's autocomplete, so they look the same everywhere and work from the
  keyboard.

## [1.2.0] — 2026-10-11

### Added

- **Daily production report** in Schedule (Day report): progress from the
  continuity log, running totals to date, cast times from the Exhibit G sheet,
  delays / accidents / remarks; own Print and PDF. The export-studio DPR gains
  the same sections.
- **Exhibit G form PDF** in the union form's layout (US Letter).
- **Shooting schedule PDF** in the classic block-per-scene layout, with cast
  names.
- **Cast sides**: one highlighted sides PDF per performer for a shooting day,
  zipped, from the call sheet; sides filtered to a character highlight that
  character's lines.
- **Cloud save-back**: open projects from Google Drive (new) or Nextcloud,
  save them back to the same file, and get asked — save a copy or replace —
  when someone else saved in between (ETag / modifiedTime checks).
- Pasting a new draft over a script now goes through the same compare → mark
  changes → keep history flow as importing a file.
- **Merging cloud saves**: when someone saved the same Drive or Nextcloud file
  since you opened it, your save merges with theirs — changes on either side
  are kept, and only a value both of you changed differently is put to you
  (mine / theirs per item). The merge is one undo step.
- **Final Draft breakdown tags** import with the screenplay: Tagger elements
  (props, wardrobe, vehicles, stunts…) become breakdown elements on the lines
  they were tagged on.
- **Schedule import from CSV**: one-liner or stripboard exports from other
  scheduling tools or spreadsheets — day columns or "Day 3 / End of Day 2"
  rows, scene numbers matched to the screenplay, meals and moves as banners.

### Changed

- Decluttered UI: quiet top bar (ghost buttons, neutral icons), panel tabs and
  view switchers that never break labels or truncate the active tab, quieter
  shot-list, equipment and script toolbars, calmer inspector sections.
- Fixed overlapping text in the schedule's day headers and the shot-list
  toolbar.
- Entry bundle 471 → 362 KiB: dashboard, quick search, on-set mode and the DMX
  view load on demand.
- Equipment, script and context code split into focused files (item and
  package dialogs, gear options, A/V script view, element clipboard).
- Every project write in a component is now a named command (ratchet at 0);
  ~175 more light/dark class pairs moved to tokens or `dark:` variants;
  equipment list edits moved out of the main context.
- Dependency updates (from Dependabot #15).

### Migration

- Project schema v35 (stamp only): optional `productionReportNotes`.

## [1.1.0] — 2026-10-10

Production paperwork release: the reports an AD and a script supervisor hand
out every day, built from the data the app already has.

### Added

- **Page counts in eighths** — every scene measured on a standard 55-line
  Courier page, shown in the scene list, strips, one-liner and call sheets;
  overridable per scene.
- **Breakdown sheets & prop report** — one sheet per scene (cast, stunts,
  extras, props, wardrobe, vehicles, effects…) and a prop report built from the
  tagged screenplay.
- **Script colour highlighter** — highlight by character (with name mentions),
  location or breakdown category; colours per character are editable.
- **Locked pages & revisions** — lock page breaks (A-pages, omitted pages) and
  mark revised lines with the standard revision colour sequence; both carry
  into the lined-script PDF.
- **Final Draft export** (`.fdx`), alongside the existing import.
- **One-liner & shooting schedule** in the schedule, with page totals at each
  day break and optional breakdown elements.
- **Day out of days** — cast, stunts, background and any breakdown category,
  derived from the strips; manual travel / fitting / rehearsal / holiday cells;
  drop-and-pickup rule (WD/PW). Lives in Schedule.
- **What-if while dragging strips** — page, day-length and paid-day impact
  before you drop.
- **Performers production time report (SAG-AFTRA Exhibit G)** — filled from
  the schedule; warns about meal penalties, short meals, forced calls,
  overtime (day or weekly contract) and minors' hours, with per-sheet rule
  limits. On-set **cast clock** stamps times with one tap.
- **Location scouting** — notes, ratings, status and photos (EXIF date/GPS)
  per location, including set candidates.
- **Budget top sheet** with account numbers.
- **Call sheet email draft** with the PDF downloaded alongside.
- **Bigger storyboards in the shot list** (S/M/L/XL), also reflected in the
  shot-list print and PDF.
- **Print or export any single report** — every report has its own Print and
  PDF button, and print uses the same document as the PDF.
- **Getting started checklist**, keyboard shortcut sheet (`?`), empty states
  and panel headers across modules; new production icons in the toolbar.
- Example data for every new module when "fill empty modules with examples"
  is chosen, including a sample Exhibit G sheet.

### Changed

- Stripboard print/PDF fills each strip edge to edge in the board's
  INT/EXT × DAY/NIGHT colours.
- Phone layout: top bar, panel tabs and view switchers compact to icons; the
  production module menu opens as a bottom sheet.
- Contrast raised to WCAG AA across the theme (accent, muted text, status
  colours); unlabelled form controls named. Checked by axe in every module, in
  light and dark.
- Schedule derivations (DOOD, one-liner, what-if) index their lookups — about
  10× faster on a 40-day schedule.
- Typing in a field merges into one undo step.
- More writes go through named commands (production details, takes,
  logistics, day filters), so undo entries say what changed.
- The language switch is hidden for now; the app is English-only.

### Removed

- The backup-reminder pop-up.

### Migration

- Project schema v34 (stamp only). New optional fields: page-length overrides,
  revision marks and page locks, DOOD overrides and drop rule, performer time
  reports (with `contract` and per-sheet `limits`), location scouts. Older
  projects open unchanged.

## [1.0.2] — 2026-09-29

### Added

- **Nextcloud/WebDAV backup & restore** — manual `.osd` up- and download to
  your own server from the project dashboard's cloud dialog (Basic auth with
  an app password, remembered only on request). Listed server backups import
  back through the file-import path.
- **Stale-backup reminder** — the dashboard names the last backup
  ("last backup 12 days ago") once it is over 7 days old. Every
  project-level artifact (file, package, cloud upload) stamps the clock.
- **Persistent browser storage** — the app asks for the persistent storage
  bucket at startup so browsers do not quietly evict productions.

## [1.0.1] — 2026-09-29

### Added

- **True Hollywood screenplay PDF** — US Letter, 12pt Courier on the classic
  60-column grid (action full-width, character cues 2.2", parentheticals
  1.6", dialogue 1.0" × 3.5", transitions flush right), single-spaced with
  blank lines between blocks.
- **Title-page cover in the PDF** — prints first on its own page when enabled
  (mirroring the print view) and replaces the paperwork title block; without
  it the block stays as the production's name on the page. The cover Date
  field suggests today's date.
- **Screenplay export options** — Bold characters and Scene numbers
  checkboxes in the export studio, driving print preview and PDF alike
  (both off/on by Hollywood default respectively).
- **Cloud export (manual backup)** — save any production as an `.osd`
  package to your own Google Drive from the project dashboard (Google button
  next to Storage, one-click sign-in, same-name refresh in place). One-way
  backup, not sync; Drive file scope only.
- **Visible version + support** — tiny `v1.0.1` stamp under the product name,
  full-size sponsor buttons in the toolbar, version/support footer on the
  dashboard, GitHub Sponsor button via `FUNDING.yml`.
- **Release automation** — pushing a `v*` tag publishes a GitHub Release with
  the changelog section and the built app attached.

### Changed

- Fountain and PDF export buttons sit side by side in the Script tab.
- Dependency updates via Dependabot (#8: GitHub Actions v7/v5; #11: React
  19.3, Vite 8.3, Vitest 5, TypeScript 5.9 and more; #12: patch round).
- Byte-array downloads funnel through a `bytesToBlob` helper, keeping the
  build forward-compatible with newer `@types/node` (no behaviour change).

## [1.0.0] — 2026-09-26

First public open-source release. A free, local-first production planning
suite: lined script, floor plan, shot list, storyboard and equipment manifest,
plus scheduling, call sheets, crew and cast, budget, locations, tasks, mood
boards, logistics, rigging, power and an on-set continuity log — in one
browser tab, with no account and no backend.

### Added

- **Script suite** — screenplay editor (WYSIWYG + Fountain), lined coverage
  with drag-adjustable linings, AV two-column script, scene-number locking
  (`3A` inserts, omitted-scene handling), title page with draft stamp, and
  location links from scene headings.
- **Floor plan & blocking** — scaled canvas with actors, cameras (FOV cones,
  focal length, sensor), lights with beams and modifier stacks, props,
  walls/doors/windows, streets, shapes, reference images, waypoints with
  rotation, group animation, and storyboard thumbnails on the plan.
- **Shot list** — cards + production table, insert-between-shots numbering
  that never renumbers the plan, camera re-lettering that keeps blocking,
  all-scenes view.
- **Storyboard & viewfinder** — one frame per shot and per camera keyframe,
  drag-to-reorder board order, simulated optical finder with guides, live
  device-camera capture stored as storyboard art, per-camera exposure settings.
- **Equipment manifest** — derived from the plan (camera packages, fixtures
  with Kelvin/beam, track, props, cables), current-scene + all-scenes truck
  package, spreadsheet/cards views, presets and brand/model catalog.
- **Scheduling & call sheets** — stripboard (scenes, setups, shots), production
  calendar, coverage matrix, per-day call sheets with readiness warnings,
  per-person calls and pick-ups, per-location maps, draft watermark.
- **Continuity log** — take log + shooting-day checklist as one page, sticky
  columns, plan-vs-actual separation, pickup numbering, file-name
  reconciliation, **DaVinci Resolve metadata CSV export** (byte-identical
  headers, verified by test).
- **Crew, cast & contacts** — departments, key-role assignment, cast ↔
  character links, headshots with reversible framing, rates, CSV in/out,
  printable contact list.
- **Budget & day needs** — derived from crew + plan + schedule, per-day /
  per-week / flat rates, per-rate VAT with EU presets, above/below-the-line,
  unpriced-is-flagged (never silent zero), print + CSV.
- **Locations, tasks, mood boards, logistics** — keyless OpenStreetMap
  picker with reverse geocoding, kanban, collage boards with palette
  extraction, cases/containers with unknown-propagating utilisation.
- **Technical planning** — fixture database (curated + Open Fixture Library
  snapshot + custom profiles, no wattage guessed from model names), DMX patch
  with overlap detection, truss/rigging loads, power with per-truss and
  per-phase balance, cable runs measured along drawn routes. Planning aids
  only — not engineering certification.
- **Reports & export** — breakdown, sides, stripboard/calendar/coverage
  prints, DMX patch sheet, continuity report, contact list, blueprint PNG,
  JSON backup, `.osd` portable packages, and a one-click complete package.
- **Platform** — IndexedDB-first local storage with localStorage fallback,
  offline-capable static build (GitHub Pages), dark/light themes, undo/redo,
  touch + keyboard support, workspace presets, PDF exports.

### Fixed

- Storage is per-project so one heavy production can't evict the others;
  imports land beside open work instead of overwriting it.

### Notes

- Missing technical data is shown as `unknown`, never silently counted as `0`.
- Quantities are stored in explicit canonical SI units; display units convert
  at the boundary only.
- License: GPL-3.0 — see [LICENSE](LICENSE).
- Support the project: [GitHub Sponsors](https://github.com/sponsors/koosoli)
  · [Buy Me a Coffee](https://buymeacoffee.com/koosoli).
