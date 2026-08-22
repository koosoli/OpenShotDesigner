# Codebase Audit — 2026-08-22 (second pass)

Follow-up to `codebase-audit-2026-08-22.md`, run alongside a feature batch
(light modifiers, crew roles, power grouping, export completeness). Records
what this pass fixed, what it found and left open, and the answers to the two
design questions that came with the request.

## Fixed in this pass

| Severity | Finding | Fix |
|---|---|---|
| High | `src/domain/power/types.ts` contained a raw Latin-1 `0xA7` byte and was **not valid UTF-8** at all. `scripts/check-encoding.mjs` could not see it: it reads with `readFileSync(file,'utf8')`, which silently substitutes U+FFFD, and only matched double-encoding patterns | Byte repaired; the checker now fails on any U+FFFD, which is the only way an invalid byte can reach it |
| High | Same-render multi-commit writes were lost — `updateElement` / `updateMultipleElements` rebuilt the whole setup from the render-time `activeSetup`, so two mutations in one render meant the second discarded the first (audit finding 1) | New `commitSetupUpdate()` in `FloorPlanContext` derives the next setup from the latest committed project; both element paths use it |
| High | Stale-closure overwrites after `await`: the location reverse-geocode wrote back a `locations` array captured before an ~1 s network round trip, and the mood-board multi-file upload accumulated cards onto a stale board, one commit per file (audit finding 2) | `updateProjectMeta` now accepts a functional patch; `updateLocation`, `pickPin`, `updateBoard`, `updateBoardWith`, `addImageFiles` and palette extraction all patch from `prev`. Uploads store every file first, then commit once |
| Medium | The whole-group rotate handle rendered an **invisible `r=18` rotate hit target on the group pivot** — i.e. on top of the group's own contents. Pressing near the middle of a selected group started a rotation instead of a drag. The single-element rotate handle also had its live degree badge inside the pointer-down group, extending the grab area ~30 px to the right | Pivot is now a 3 px non-interactive marker; rotation is the offset knob only, with a touch-sized transparent halo. Degree badges are `pointer-events-none` |
| Medium | Camera FOV cones and light beams defaulted to on, so a first plan with a handful of lights and cameras was unreadable | Both default off for a fresh install. Saved preferences are untouched — this is a local preference, not project state, so no migration is involved |
| Medium | Stripboard strip labels, colours and coverage rows were computed inside `SchedulePanel` (rule 4), and therefore could not be reused — which is why the "complete package" export had no schedule in it | Extracted to `src/domain/scheduling/stripboardPrint.ts` with 13 tests; the schedule tab and the exporter now share one implementation |

## Feature-level gaps closed in the same pass

- **Light tools** gained cucoloris (cookie), branchaloris and barn-door /
  framing shutter, with top-down glyphs, a shutter cut-angle control, search
  keywords, and correct exclusion from DMX addressing, power estimation and the
  flag branch of the equipment list.
- **Crew page** (the former Contacts tab) gained a key-crew block assigning
  Director, DP and eleven other heads by role. The assignment is stored as the
  person's `role` — no second table — and Director / DP mirror into the legacy
  `Project.director` / `.cinematographer` fields the exports already render, so
  the crew page and the scene inspector cannot drift. The inspector fields offer
  the crew list through a datalist while still accepting free text, because a
  production may name a director before it has a crew list.
- **Power** gained load per truss run and per distro zone, plus 3-phase leg
  assignment with a phase-balance readout (spread %, busiest leg, watts on
  circuits with no leg set). Unknowns stay unknown everywhere: a leg nobody has
  assigned is excluded rather than loaded onto L1, and `imbalanceRatio` is
  `null` rather than a falsely reassuring 0 % when nothing is known.
- **Complete-package export** now also prints the stripboard and the coverage
  matrix, and states its contents in the UI so an empty section is not mistaken
  for a lost one.

## Design questions answered

**"Is Scene Inspector still a good name, and does its content belong there?"**
Partly no, and the panel has been renamed accordingly. It is really two panels
sharing a tab:

1. *Selected element* — the actual inspector. This is what "inspector" means and
   it is correct.
2. *No selection* — plan, scene and **project** settings: scene and environment,
   location, production details, display and labels, layers, declutter,
   reference images.

The no-selection view is now titled **Plan & Scene Settings** with an explicit
"nothing selected" line, and *Production Info* is titled **Production Details
(whole project)**. That last group is the one genuinely misfiled item: project
title, director, DP, production company, logo and date are project-wide, not
per-scene, and a user reasonably reads a "scene inspector" as scene-scoped.
Director and DP now have their real home on the Crew tab and are mirrored here;
moving title/logo/company to the dashboard would be the next step, but that is a
navigation change worth deciding deliberately rather than folding into this pass.

**"Is the coverage page functional?"** Yes. `CoverageMatrixEditor` adds and
removes camera columns, auto-discovers columns from cameras on the active scene,
takes rows from the run-of-show cue list plus freely added manual rows, edits
every cell, renames and deletes rows, and prints through
`CoverageMatrixPrintView` — and it now appears in the complete package too. One
real wart remains, listed below.

## Fixed in the follow-up batch

| Severity | Finding | Fix |
|---|---|---|
| High | The **first-run project shipped no example data**. `FloorPlanContext` hand-rolled its starter project with only the sample scenes and screenplay, while `createProject({withSampleScenes:true})` from the dashboard built locations, crew, schedule, tasks and mood boards. The very first project a user ever opened therefore had an empty Schedule and Crew page | The starter goes through the same factory. `src/utils/__tests__/sampleProject.test.ts` now asserts every module has example data, so the two paths cannot diverge again |
| Medium | **Group keyframes were invisible and uneditable on the canvas.** Playback worked, but nothing drew the path and the inspector exposed only beat and rotation, so there was no way to see or set where a group travelled. New keyframes also spawned on top of the previous one, resolving to identical positions — an animated group looked static | Dashed motion path with numbered, draggable keyframe dots; live pose preview while dragging; new keyframes spawn clear of the last one |
| Medium | `RubricSection` rendered its `badge` / `headerRight` slots **inside** the collapse toggle `<button>`. Those slots are often buttons ("Add movement waypoint"), so the DOM was invalid and some clicks went to the outer control — pressing "Add waypoint" could collapse the section instead | Both slots moved outside the toggle; the header stays keyboard-accessible |

## Open findings (not addressed)

1. **Coverage cells outlive their cue.** Deleting a run-of-show cue hides the
   row in the editor (`rows` filters unresolved keys) but the cells stay in
   `coverageMatrix.cells` forever, and the print builder still emits them under
   a `Row abcdef` stub. Decide one behaviour — prune on cue delete, or keep and
   show them as orphaned — and apply it in both places.
2. **Referential integrity for the new links.** Power consumers can point at a
   deleted truss, and a call-sheet pick-up can point at a deleted contact. Both
   degrade honestly ("Truss no longer on the rig", "contact removed") rather
   than vanishing, but the references should be cleared on delete the way
   `removePerson` already clears its own. Deleting a truss in
   `RiggingPanel` leaves `PowerConsumer.trussElementId` dangling. The report
   degrades honestly ("Truss no longer on the rig") but the reference should be
   cleared on delete, the way `removePerson` already clears its references.
3. **The remaining same-render commit paths.** `commitSetupState` still takes a
   pre-built setup, and ~25 call sites build it from the render-time
   `activeSetup`. The two highest-frequency ones are fixed; the rest
   (add/delete/duplicate/group/paste) should migrate to `commitSetupUpdate`.
   `createCameraAndShot` still returns `shotId: ''`.
4. Everything else from `codebase-audit-2026-08-22.md` §"Open findings" that is
   not listed above stands unchanged: unmigratable projects hidden by
   `readProject` (3), stale per-line `sceneNumber` (4), untested screenplay
   parser misclassifications (5), pinch-during-drag undo gaps (6), ScriptPanel
   listener rebinding (7), `ISO_DAY_PATTERN` accepting impossible dates (8),
   the 2.8 MB single bundle chunk (9), hand-rolled ids in `FloorPlanContext`
   (10), and the giant components plus ~170 `any` escapes (11).

## Improvement ideas worth queuing

- **Code-split the bundle.** 2.8 MB / 498 kB gzipped in one chunk is the single
  biggest first-load cost. The print/export views, the fixture catalog and the
  schedule workspace are natural `lazy()` boundaries and none of them is on the
  first paint path. Keep the GitHub Pages base path intact.
- **Referential-integrity sweep.** `removePerson` clears its references
  properly; truss, circuit, location, character and cue deletions each handle
  this ad hoc or not at all. A single `removeEntity(refs, kind, id)` in the
  domain, tested once, would close finding 2 and prevent the next one.
- **Power: inrush and per-source derating.** Now that loads group by truss and
  phase, the obvious next planning aids are a per-fixture inrush multiplier and
  a generator derating factor — both explicit user inputs, never inferred.
- **Key crew on the call sheet.** The heads are now structured data; the call
  sheet masthead still has no Director / DP / 1st AD line. That is a small,
  purely additive render change over `keyCrewDisplayName`.
