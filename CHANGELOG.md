# Changelog

All notable changes to Open Shot Designer are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/).

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
