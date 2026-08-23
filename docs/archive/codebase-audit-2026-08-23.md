# Codebase Audit — 2026-08-23

A fresh pass over the whole codebase rather than a re-read of the earlier audits
(`codebase-audit-2026-08-21.md`, `-08-22.md`, `-08-22b.md`). Records the state of
the code, what this pass fixed, what is still open, and where the biggest wins
are next.

## Overall

The architecture is holding up well, and better than the file sizes suggest.
The domain layer is real: 60 test files, 684 passing tests, and the business
logic that matters — scheduling, reports, power, cable, rigging, script,
migrations, group animation — lives outside React and is tested. Nineteen
schema migrations exist, each lossless, deterministic and fixture-tested, and
old projects still load. The "unknown stays unknown" rule is followed with
unusual discipline: power, rigging and logistics all propagate absent data
instead of substituting zero, and the sample production deliberately ships one
consumer and one load with no value so the behaviour is visible.

The weak spots are concentrated and identifiable: four enormous components, a
state-commit pattern that is only half migrated, and no linter.

| Metric | Value |
|---|---|
| Source (excl. tests) | ~64,900 lines |
| Tests | 684 across 60 files |
| Largest components | InspectorPanel 6,105 · FloorPlanContext 4,123 · FloorPlanCanvas 3,274 · EquipmentPanel 2,648 |
| `any` escapes | 129 |
| Entry bundle | 1,608 kB (415 kB gzip) — was 2,838 kB before this pass |
| Domains with no tests | assets, fixtures, reports (partial), shots, storage |

## Fixed in this pass

| Severity | Finding | Fix |
|---|---|---|
| High | **Call sheets listed no cast unless screenplay scenes were scheduled.** `castPersonIdsForDay` only walked `scene` blocks, so a production scheduling setups or shots — the script-optional path the app exists to support (rule 1) — printed "No cast scheduled" while its actors stood on the plan. The bundled example production does exactly this, so the defect shipped in the demo | Derivation moved to `src/domain/reports/dayCast.ts` and extended to all three block kinds: a scene's characters, the actors on a scheduled setup, and the actors on the setup a scheduled shot belongs to. 13 tests |
| High | **1.23 MB fixture snapshot in the entry chunk.** `offlineCatalog.ts` statically imported `generated/fixture-db.json`, so every first-time visitor downloaded the entire fixture database before first paint, whether or not they ever opened the fixture picker | Dynamic import, started after mount. Entry chunk 2,838 → 1,608 kB (gzip 498 → 415 kB); the snapshot is now a separate 1,232 kB chunk that gzips to 91 kB |
| Medium | **Gear and Power panels never subscribed to the fixture catalog**, so an online catalog refresh already left stale wattages on screen — a live bug, not just a blocker for the lazy snapshot | Both subscribe via `useFixtureCatalog()` |
| Medium | **`removePerson` left dangling references** in task assignees and call-sheet pick-ups | Both are cleared, like cast assignments and location contacts already were |
| Medium | **Waypoint ids minted as `wp-${Date.now()}`** in six places — two waypoints created in the same millisecond collide, which breaks React keys *and* drag targeting, since the drag patches by id (rule 16) | All six use `createId('wp')` |

## Open findings

1. **The setup-commit migration is 3/25 done.** `commitSetupUpdate` derives the
   next setup from the latest committed project; `commitSetupState` takes a
   pre-built one and 25 call sites still construct it from the render-time
   `activeSetup`. Two same-render writes through those paths still lose the
   first. `updateElement`, `updateMultipleElements` and `updateSetupMeta` are
   converted; add/delete/duplicate/group/paste are not.
2. **`liveSetupRef` is never cleared.** It is written on every commit and read
   by `commitCurrentState` on drag release. Today the `dragChangedRef` guard
   means a stale ref cannot realistically be consumed, but nothing enforces
   that. Clearing it on setup switch and after it is consumed would make the
   invariant explicit instead of incidental.
3. **There is no linter.** `npm run lint` is `tsc --noEmit` plus the encoding
   check. The eight `eslint-disable` comments — seven of them
   `react-hooks/exhaustive-deps` — suppress rules that nothing runs, so nobody
   knows whether those dependency lists are correct. Three of the bugs fixed in
   the last two sessions were stale-closure bugs that `exhaustive-deps` flags by
   construction.
4. **`screenplayParser.ts` still has no tests**, and the known
   misclassifications (`JENNA (WHISPERING)`, dual dialogue `^`, all-caps action
   lines, `I/E.` headings) are unverified either way. It is the entry point for
   every imported script.
5. **Untested domains:** `assets`, `fixtures` (adapter is tested, store is not),
   `shots`, `storage`. `storage` is the one that would hurt: it is the
   IndexedDB facade every project passes through.
6. **Coverage cells outlive their cue** (carried from the last audit). Deleting
   a run-of-show cue hides the row but leaves the cells in
   `coverageMatrix.cells` forever; the print builder still emits them under a
   `Row abcdef` stub.
7. **Power consumers can point at a deleted truss.** It degrades honestly
   ("Truss no longer on the rig") but the reference should be cleared on delete
   now that `removePerson` sets the pattern.
8. **Four components carry too much.** InspectorPanel is 6,105 lines and is
   really twelve inspectors in a switch; FloorPlanContext is 4,123 and is the
   whole application's state. Both are still growing — most of this session's
   features added to them.
9. **129 `any` escapes**, concentrated in the canvas and inspector where element
   unions are narrowed by hand.
10. **The committed fixture snapshot vs the docs.** `implementation-progress.md`
    still says "licensing review still pending before shipping a committed
    snapshot", but `src/generated/fixture-db.json` is committed. The manifest
    does record provenance correctly (provider, snapshotId, retrievedAt,
    license, count — rule 35), so this is a documentation/decision mismatch to
    resolve rather than a data problem.

## Ideas worth doing next

Ordered by value for effort.

**1. Add ESLint with `react-hooks` and `jsx-a11y`.** The single highest-leverage
change available. It catches the exact bug class that has dominated the last two
sessions — stale closures and missing effect dependencies — before they reach
the app, and it makes the existing `eslint-disable` comments mean something.
Dev-dependency only, so rule 31's justification is cheap: it is the standard
React toolchain and it replaces manual review that has already missed real bugs.

**2. Finish the `commitSetupUpdate` migration.** Twenty-two call sites, each a
mechanical change to a functional updater. It closes open finding 1 permanently
rather than one path at a time, and it is the difference between "we fixed the
two paths we noticed" and "this class of bug is gone".

**3. Split `InspectorPanel`.** It is twelve element inspectors and a
plan-settings view sharing one file. `inspector/elements/LightInspector.tsx`,
`CameraInspector.tsx`, `RoadInspector.tsx`… with the shared `RubricSection` and
field primitives extracted would each be 200–500 lines and independently
readable. No behaviour change, and it makes the next twelve features cheaper.

**4. Test `screenplayParser` and the storage facade.** The parser is the front
door for user data and the storage facade is the floor under all of it; both are
currently unverified. A parser test suite would also settle whether the four
suspected misclassifications are real.

**5. Continue code-splitting.** The entry chunk is still 1.6 MB. The print/export
views (`PrintableShotPlan` 2,087 lines plus ten report views), the viewfinder,
and the schedule workspace are all natural `lazy()` boundaries that nobody needs
on first paint. Keep the GitHub Pages base path intact.

**6. A referential-integrity helper.** `removePerson` now does this properly;
truss, circuit, location, character and cue deletion each handle it ad hoc or
not at all. One tested `removeEntity(refs, kind, id)` in the domain would close
findings 6 and 7 and stop the next one appearing.

**7. Product ideas, in rough order of how often they would earn their keep:**
   - **Sun and time-of-day on the plan.** Latitude, date and time give a real
     sun angle for exteriors; the location pin already provides the coordinates.
     This is planning information nothing else in the app can substitute for.
   - **Per-person call times on the call sheet.** The pick-up list added this
     pass is half of it; the other half is a per-person call time column, which
     is what makes a call sheet actually issuable.
   - **Shot-list column visibility and filters.** The state exists with no UI.
   - **Breakdown tagging UI** — select text, tag an element category. The domain,
     the reports and the tests all exist; only the interaction is missing. It is
     the biggest remaining StudioBinder-parity gap.
   - **Storyboard images out of project state.** Rule 26 debt: frames are still
     base64 in the project, which is what makes large projects heavy to save.
     The asset store already exists and the mood board already uses it.
