# Changelog

All notable changes to Open Shot Designer are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/).

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
