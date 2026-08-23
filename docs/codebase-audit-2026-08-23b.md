# Codebase Audit and Remediation — 2026-08-23 (second pass)

A full audit of the codebase, a pass fixing everything it found, and then a
second adversarial audit of that pass — which found that two of its headline
changes did not work and that it had introduced regressions of its own. Both
rounds are recorded here; the second one starts at "Second audit pass".

Supersedes `codebase-audit-2026-08-23.md`, the morning's audit: most of its open
findings are closed here, and the ones that are not are listed at the end.

## State at the end of the pass

| | Start of pass | End of pass |
| --- | --- | --- |
| Tests | 1,104 across 88 files | **1,236 across 93 files** |
| Lint | 0 errors, 181 warnings, budget 400 | **0 errors, 149 warnings, budget 149** |
| TypeScript | no `strict` at all | **`strict: true`**, plus `noFallthroughCasesInSwitch` |
| Entry chunk | 1,218 kB (330 kB gzip) | **880 kB (235 kB gzip)** |
| Largest JS chunk | `fixture-db` 1,232 kB | **`vendor-react` 194 kB** — the snapshot is now a fetched JSON asset |
| Icon-only buttons with no accessible name | 103 | **0** |
| Schema | v23 | v23 (unchanged; every field added this pass is absent-safe) |

`npm run lint`, `npm test`, `npm run build` and `GH_PAGES=true npm run build`
are all green. The app was also driven in a browser to confirm the keyboard and
undo changes behave as intended, not merely as typed.

## Correctness bugs fixed

**A scene insert could hang the tab.** `insertedSceneNumber` searched for a
suffix sorting below the next heading's, and between `3` and `3A` no such
suffix exists — every candidate sorts at or above `"A"`, so the `while` loop
never terminated. Reproduced before the fix (a test worker had to be killed at
45 s). The search now stops when the ordering can no longer be satisfied and
falls back to the script convention for inserting ahead of a numbered scene, a
letter prefix: `3`, `A3A`, `3A`. `src/domain/script/numbering.ts`, with an
exhaustive neighbour-pair test that would have caught it.

**Ctrl+Shift+Z never redid anything.** The handler compared `e.key === 'z'`,
but a letter key arrives upper-case while Shift is held, so only Ctrl+Y worked.
Letters are now folded before comparison. `FloorPlanCanvas.tsx`.

**Canvas shortcuts fired while other panels had focus.** The canvas is always
mounted and its listener is on `window`, so with focus on a shot-list or
inspector button, Delete removed the selected element, `l` locked it and
Ctrl+V pasted into the plan. Element shortcuts now fire only when the canvas is
the surface being worked — focus inside it, or nowhere in particular, which is
what clicking the plan leaves behind since an SVG takes no focus. Undo and redo
stay global, because they are application-level actions. Verified both ways in
the browser.

**Lining a speech stopped working after a tab switch.** The script panel
attached its selection listener once to `scrollRef.current`, but that ref is
bound to two different conditionally-rendered containers; switching tabs
remounted the node and the listener went with it. Now on the document, reading
the container at event time, and on `pointerup` rather than `mouseup` so touch
and pen work too. `ScriptPanel.tsx`.

**Deleting a scene took the user off the one they were editing** and could
discard a same-render write, because it computed the surviving setups from the
render-time project and wrote them back inside an updater. Both fixed; the
confirm dialog no longer claims the deletion cannot be undone, because it can.

**Deleting a setup left the script lined for shots that no longer existed.**
`removeSetupReferences` walked only the schedule. It now delegates the
per-shot cleanup to `removeShotReferences`, so a setup's shots are cleaned up
exactly as if each had been deleted on its own, and the AV script rows follow
the same rule as everywhere else — a row nobody wrote in goes, one carrying
copy survives unlinked.

**Undo could resurrect migrated images.** The one-time pass that moves inline
base64 images into the asset store wrote through `setProject`, leaving every
history entry holding the old inline data: undoing to the bottom of the stack
put the blobs back and the next autosave re-persisted them. The replacements
are now applied to the history entries too, without adding an undo step —
nothing the user did caused it.

**Sun times were printed in the machine's timezone, not the location's.** An LA
shoot day scheduled from a CET machine printed 14:44 / 05:07 instead of
05:44 / 20:07 — on a call sheet, the one document the crew turns up on. Now
threaded through an IANA zone from the location, with `Intl` doing both
directions and an unknown zone falling back *visibly* rather than silently.
Locations gained a timezone field. The same work found a second bug: `sunTimes`
swept a fixed 1,441 minutes, so on a 26-hour local day (Antarctica/Troll,
25 Oct 2026) it missed a 22:04 sunset and reported a polar day that was not
happening.

**A budget line set to zero priced as one.** `quantity > 0 ? quantity : 1`
treated a deliberate zero — a struck line, a role not being cast — as a missing
value. Only a missing or nonsensical quantity falls back to one now.

**Power headroom ignored power factor.** Current is `W/(V·pf)`, not `W/V`. Three
kilowatts of magnetic-ballast HMI at pf 0.6 pulls 21.7 A off a 230 V 16 A
circuit; the old maths reported 13 A and "fits". Power factor is now a
per-circuit field (absent = 1, which is correct for tungsten and PFC LED, so no
existing plan's numbers move) and the panel shows it when it is not 1.

**The asset store could delete an image still in use.** Assets are
content-addressed, so one image used by a headshot and a mood board card is one
record; deleting it for one owner deleted the bytes for both. Ownership is now
tracked and `release(id, owner)` removes the bytes only on the last claim.
`put` also merges metadata instead of replacing it — a second put of the same
bytes was discarding dimensions the first had measured. Nothing in the app
called `delete` yet, so this closed the hole before it opened.

**Duplicating a project broke its breakdown.** `clone.ts` copied
`sourceScriptLineIds` verbatim instead of remapping them, so every tagged
element in the copy pointed at the original's lines.

**`Date.now()`-based ids** in paste, camera creation and background images
replaced with `createId` (rule 16) — two elements created in the same
millisecond collided, which breaks React keys and drag targeting alike.

## Architecture and performance

**The setup-commit migration is finished.** All 25 remaining whole-setup writes
now derive from the committed setup instead of the render-time copy, so two
writes in one render can no longer discard each other. `commitSetupState` and
the `liveSetupRef` it depended on are gone; `commitCurrentState` reads the live
project directly, which removes the "never cleared" invariant the last audit
flagged rather than documenting it. Reorder, sort and renumber go through one
`reorderCommittedShots` helper that applies the UI's ordering **by id**, so a
shot added or edited elsewhere in the same render is neither dropped nor
resurrected.

**The context value no longer changes identity on every render.** It was one
large object literal holding both state and ~200 action closures, so every
keystroke, pointer move and playback tick re-rendered all 54 `useFloorPlan()`
consumers — the whole canvas and inspector included. `useStableContextValue`
(new, `src/context/stableContextValue.ts`) gives every action a permanently
stable wrapper that forwards to the current implementation through a ref, then
hands back the previous value object when a shallow compare finds nothing
changed. Deliberately a comparison rather than a `useMemo` dependency list: a
list over that many fields is a stale-UI bug waiting to be written, and a
comparison cannot miss a field.

**The canvas no longer redraws the whole plan on a mouse move.** Thirteen
`.filter()` passes over the element list became one memoised bucketing pass, all
thirteen SVG layers are `React.memo`, and the callbacks handed to them are
hoisted and memoised. `handleElementSelect` — the `onSelect` of every layer —
is memoised too, which pulled in its callees; `exhaustive-deps` is an error in
this repo, so each of those dependency lists is complete and checked.

**Bundle.** React and lucide split into vendor chunks; the script and storyboard
tabs lazy-loaded; the 1.2 MB fixture snapshot fetched as a hashed JSON asset
rather than imported as a module, so the browser's JSON parser handles it
instead of the JavaScript parser, and Vite rewrites the URL for the Pages base
path. Entry chunk 1,218 → 880 kB.

**`strict: true`.** Sixty-four errors, fixed rather than suppressed, and two of
them were latent bugs of their own. The fixes were mostly making types tell the
truth: `FixtureProfile` now requires `manufacturer` and `model` (a lighting
fixture always has both; a generic bit of grip need not), a normalised
reference image is `IdentifiedBackgroundImage` so the render layer cannot be
handed one without an id, and the script suggestion list is a tagged union
instead of `Character[] | LocationEntry[]`. The AI Studio template leftovers
(`experimentalDecorators`, `useDefineForClassFields`, `allowJs`) are gone.

## Features

- **Script breakdown tagging**, the largest remaining StudioBinder gap. More of
  it existed than the morning audit thought — the domain, the categories and the
  tag control were all there — but nothing was ever drawn on the page, there was
  no way to untag, and referential integrity was missing. Tagged ranges are now
  marked on the page in their category colour, a chip row untags them, and
  deletion cascades. Required one additive model change: `BreakdownItem` gained
  optional `sourceRanges` with character offsets, following the convention
  `ScriptMark` already set.
- **Sun and call sheets** are timezone-aware, and locations carry a zone.
- **Power factor** per circuit.
- **Accessibility**: every icon-only button in `src/components` has an
  accessible name (103 → 0), toggles carry `aria-pressed`/`aria-expanded`, and
  the eight real modal dialogs have `role="dialog"`, `aria-modal`, a labelled
  heading and a focus trap (`src/utils/useDialogFocusTrap.ts`).

## Tests

111 new tests. The four domains that had none now have suites: the IndexedDB
facade including its open-timeout, `onblocked` and `onversionchange` paths; the
content-addressed asset store, with the ids pinned to the published SHA-256
digests so a change to the hash input cannot silently orphan every saved asset;
the fixture catalog store, including the race its own comment claims to handle;
and the sun timezone work. `src/domain/shots/` is still untested because it
contains no runtime code — it is one interface and a re-export.

## Second audit pass — what the review of the remediation found

The work above was then audited again, adversarially, on the assumption it was
broken. It partly was. Everything in this section was found *after* the pass
above reported itself green, which is the argument for the second look.

**Two of the changes above did not do what they claimed.**

- **The canvas memoisation was inert.** Thirteen layers were wrapped in
  `React.memo` and the element buckets were memoised — but `visibleElements`,
  the filter they all derive from, was not. It allocated a new array every
  render, so the buckets recomputed, every layer got fresh props, and every
  memo was a no-op. The plan still redrew on every pointer move. `visibleElements`
  and `renderedElements` are now memoised, which is what makes the rest of it
  work.
- **The context value's shallow compare never hit.** Three fields —
  `revisions`, `scriptLines`, `avScriptRows` — used a `|| []` fallback that
  allocated on every render, and all three are absent by default on a new
  project. One field is enough to fail the comparison, so every consumer still
  re-rendered on every keystroke. Now memoised, with shared empty constants.

**Regressions introduced by the pass above, now fixed.**

- **The keyboard guard broke the tool palette.** Scoping element shortcuts to
  "focus inside the canvas container" was too tight: the left toolbar and the
  timeline are siblings of the canvas, so clicking a tool and then pressing
  Delete did nothing. The rule is now "not somewhere that owns its own keys" —
  the side panel or an open dialog — which also closes the case the first
  attempt missed, a modal that opens without taking focus leaving Delete live
  on the plan behind it. Verified in the built app at all three focus positions.
- **`setShotCameraLetter` reverted concurrent edits.** It carried a whole
  rebuilt camera from render-time state, so relabelling a camera dragged in the
  same batch snapped it back. It now carries only the keys it changes.
- **`addShot` could mint duplicate shot numbers.** Two calls in one batch both
  read the render-time shot count and both claimed `1/4`. Numbering now happens
  against the committed list. (The camera *letter* can still collide in
  multi-camera mode in that same window; it is cosmetic where the shot number
  is not, and is left listed below rather than half-fixed.)
- **Two id-less reference images collided.** Normalising legacy images gave
  them all the id `bg-legacy`, so selecting one selected them all. They now get
  distinct ids, and the common case — every image already has one — no longer
  reallocates the array at all.
- **`liveProjectRef` could go stale**, losing a drag released right after an
  undo, a scene switch or any non-setup edit. Rather than update the ref at each
  of a dozen writers, every project write now goes through one wrapped setter,
  so the next writer cannot forget.

**A bug the pass above did not fix so much as move.** The scene-numbering
infinite loop was fixed by falling back to a letter prefix (`3`, `A3A`, `3A`) —
but `compareSceneNumbers`, which the breakdown report orders by, did not
understand prefixes and sorted every prefixed number to the end of the report.
That was already true of `A1`, which this app has generated since prefixes were
introduced: the scene inserted *before* scene 1 printed after the last scene of
the film. The comparator now models both letter runs, and the numbering search
walks the prefix run as well as the suffix run — between `A1` and `1` the answer
is `B1`, not the `A1A` it used to return.

That work also established a real limit, now documented and tested rather than
hidden: the scheme cannot always produce a number between two neighbours. Once
a script carries a prefixed number, every later insert immediately ahead of one
has nowhere to go — a third of the inserts in a 300-insert simulation. The
result stays unique and still follows its predecessor; it simply cannot also
precede its successor, and at that point the honest answer is that the script
wants renumbering.

**Other defects found and fixed:** the asset store kept a stale mime type
forever on re-put and could be talked out of its own legacy protection by a
single owner-bearing put; concurrent puts of the same bytes lost an owner;
`removeShotReferences` injected `scriptLines: []` into callers that had no
screenplay, turning "no script" into "empty script"; power factor was applied
in `circuitHeadroom` but not in `phaseBalance` or the supply capacity, so one
screen showed the same circuit at 21.7 A and 13 A; and the budget zero-quantity
fix was unreachable because the input clamped to a minimum of 1.

**Weak tests replaced.** Several tests written in the first pass would have
passed through the bugs above — a neighbour-pair test asserting only that a
string came back, mime-type tests that never read the mime type back, timezone
assertions deriving both sides from the same function. They now assert
behaviour: that an inserted number *sorts* between its neighbours, that a
re-put blob comes back with the right type, that a fallback zone really printed
in that zone's clock.

## Final state

| | |
| --- | --- |
| Tests | **1,236 across 93 files** |
| Lint | **0 errors, 149 warnings**, budget pinned at 149 |
| TypeScript | `strict: true`, clean |
| Builds | `npm run build` and `GH_PAGES=true npm run build` both green |
| Verified in the built app | boots clean, fixture snapshot fetched as JSON off the critical path at ~500 ms, lazy panel chunks load on demand, undo/redo and Ctrl+Shift+Z work, keyboard scoping correct in all three focus positions, no console errors |

Two notes on verifying this yourself: the browser pane used here does not
deliver physical keystrokes to the page, so keyboard behaviour was exercised by
dispatching events at the focused element — a real key press targets the same
node, so the handler path is the same, but it is not a substitute for trying it
by hand. And the app fires several hundred requests to jsDelivr on load to
refresh the OFL fixture catalogue; that is pre-existing and by design, but it is
a lot of first-load network for a feature most sessions never open.

## Production panels — printing and plan connection

Four panels reported as unusable, and what was actually wrong with each.

**Run of Show: the cue list could not be reordered.** Both the drag handles and
the up/down arrows were wired and neither did anything. `renumber` re-sorted the
array by the *old* `order` values before assigning new ones, so it reconstructed
the pre-move state exactly and wrote back an identical list. The distinction the
code needed — "this array is already in the intended order" versus "this array
is in storage order" — is now explicit in the domain as
`renumberCuesByPosition`, `sortAndRenumberCues` and `moveCueInList`, and every
call site says which it means. `duplicateCue` had been working only by accident
of a stable sort.

**Power: lights on the floor plan did not appear, and nothing had a wattage.**
Two separate faults compounding. Consumers only existed if the user found an
"add all lights from current scene" button, and even then the fixture's identity
was dropped — while the panel passed `() => undefined` as its wattage resolver,
so the estimation chain could never reach its "authoritative profile" tier. A
fixture specified precisely in the inspector still reported unknown, and the
page could only ever total what had been typed into it a second time.

Now the plan owns which fixtures exist: `derivePlanConsumers` lists every light
on the plan, and the panel persists only what the plan cannot know — circuit,
quantity, truss, distro zone, and an explicit wattage where the operator knows
better than the catalogue. Wattage resolves against the live fixture catalogue,
and each row says where its number came from ("Wattage from the fixture
catalogue" / "entered here" / "unknown — pick a fixture in the inspector"). A
saved row whose light has been deleted is kept but flagged rather than left
looking live. The "add all lights" button is gone because there is nothing left
for it to do.

**Nothing could be printed.** There was no export section for power, rigging,
logistics or run of show at all. Each now has one, built from the same domain
derivation its panel uses so the sheet and the screen cannot disagree, and each
panel has a Print button that opens the export studio on its own section — the
pattern the contacts and mood board panels already used.

- **Power plan** — supplies with apparent-VA against their rating, circuits with
  draw, power factor and headroom, phase legs, and every consumer with the
  provenance of its wattage. Unknowns are counted and stated, never totalled
  as zero.
- **Rigging plot** — one section per truss run: suspended loads with per-line
  weights, hardware with position and rated capacity, and a capacity verdict
  from the new `evaluateTrussCapacity`, which returns "unknown" rather than a
  number when any hang point is unrated.
- **Load list** — containers and their nested cases, with a tick box per item
  for the loader, per-line and total weight and volume, and a payload verdict.
- **Run of show** — cue numbers, planned starts from `computeCueStarts`,
  durations, the per-department notes, the total run time, and the validation
  issues, because a cue list with a hole in it is exactly what you want to see
  on paper before the show.

**Two connection gaps closed on the way:** `RiggingItem.positionMm` and
`capacityKg` were stored in the type and written by the sample production but
had no field in the panel — invisible, uneditable, and silently lost on a round
trip. Both are now editable.

**Connection gaps found and reported rather than built**, because each is a
feature rather than a fix: the load list re-types the equipment manifest instead
of packing from it, suspended loads re-type fixture weights the catalogue
already holds, containers reference no shoot day or location, truss runs have no
canvas placement at all (their x/y/rotation are permanently zero), rigging
hardware weight assumptions live in component state and vanish on reload, and
`calculateContainerLoad` counts only a container's direct items so a truck's
total excludes the cases inside it — a real trap for an axle-load figure, now at
least footnoted on the printed sheet.

## Still open

1. **The entry chunk is 880 kB.** Below the point where further splitting is
   cheap: what remains is the app shell and the canvas, both needed at first
   paint. The 500 kB Rollup warning still fires and has been left honest rather
   than silenced with `chunkSizeWarningLimit`.
2. **149 lint warnings**, 96 of them `no-explicit-any` concentrated in the canvas
   and inspector where element unions are narrowed by hand. The budget is now
   set to the exact count, so it ratchets.
3. **`FloorPlanContext.tsx` is 4,406 lines** and `FloorPlanCanvas.tsx` 3,520.
   Both are now internally sound — the writes are functional, the deps are
   checked — but they are still too large. The natural next cut is moving the
   action groups (equipment, script, AV, revisions) into domain-level reducers
   over `(project) => project`, most of which already read only `prev`.
4. **`handleElementSelect` encloses two group helpers** (`getGroupMemberIds`,
   `expandDragSetWithGroupMembers`) — pre-existing, harmless, and confusing to
   read. Worth lifting out.
5. **Breakdown tag pruning lives in `ScriptPanel`, not the context**, so tags are
   only pruned on edits made through the script panel. It belongs in the
   context action.
6. **No character/cast tagging** from the breakdown tagger, and no drag-to-adjust
   on tag edges the way linings have.
7. **Revision snapshots still embed a whole project each.** Much less costly now
   that images are asset ids rather than base64, but a project with many named
   revisions is still heavy.
8. ~~**`addShot` can still mint a duplicate camera *letter***~~ **Closed
   (2026-08-24).** It was worse than "cosmetic": the letter reaches the
   `Camera #` column of the Resolve metadata export, so two cameras sharing one
   makes two setups claim to be the same camera in the media pool. The cause
   was counting rather than reading — `String.fromCharCode(65 + cameras.length)`
   is correct only while nothing is ever deleted, and with A and C on the plan
   it proposes C again. Six call sites did that; two others had grown their own
   correct loop, and `ShotListPanel` had a third variant that started at A
   instead of reserving it, so the letter *offered* in the dropdown could differ
   from the one you got. All nine now call `nextCameraLabel` in
   `domain/plan/cameraLabels.ts`, which is unit-tested including the
   deleted-in-the-middle case.
9. **Asset-store ownership is capability, not cure.** Nothing in the app calls
   `release` or passes an owner yet, so the reference counting protects a path
   that is not yet walked. Wiring mood-board and headshot deletion to it is the
   follow-up.
10. **`mergeSetupWrite` is now dead in production** — the last caller went with
    `commitSetupState`. It is still exported and tested; either wire it or
    remove it.
11. ~~The production panels are still islands.~~ **Closed.** All six links were
    built: the load list packs from the equipment manifest (idempotently, by a
    source key, never touching hand-packed rows); suspended loads link to a
    catalogue fixture or a plan light and resolve their weight on read, so
    `source: 'profile'` finally means what it says and is no longer hand-pickable;
    containers carry a shoot day and destination, inherited from their parent
    container, with a day filter on screen and on paper; truss runs are drawn on
    the floor plan to scale from their profile and can be dragged and rotated
    there (`TrussLayer`); rigging weight assumptions moved onto the project and
    into the totals; and nested container weight rolls up, with unknowns
    propagating so a truck holding one unweighed case reports unknown rather
    than a total that reads light.

    Two follow-ups fell out of that work, both reported rather than guessed at:
    `deriveSceneEquipment` does not propagate `fixtureProfileId`, so the load
    list matches catalogue weights by brand and model rather than by id; and
    `clone.ts` does not carry `riggingAssumptions`, so a cloned scenario falls
    back to the defaults.

    **Correction (2026-08-24):** the second claim was wrong. `clone.ts` does
    carry `riggingAssumptions` — the top-level spread in
    `cloneProjectWithNewIds` covers it, and a regression test now pins that so
    the question is settled rather than re-reported. The `fixtureProfileId`
    item stands.

12. ~~**Continuity reports and the shooting-day checklist** are specified and
    not started.~~ **Built (2026-08-24), schema v24.** `domain/continuity/`
    holds the take log, the derived shooting-day checklist and the DaVinci
    Resolve metadata export; `ContinuityPanel` and `ContinuityPrintView` are
    its screen and paper. The CSV header is asserted byte-for-byte against the
    vendored template, and — the part tests cannot prove — **the import was
    verified against a real Resolve media pool**, now a standing item in
    [`regression-checklist.md`](regression-checklist.md).

    Two decisions in [`handover-continuity-reports.md`](handover-continuity-reports.md)
    were revised while building and the document records both, including the
    reasoning that was wrong the first time.

    Four defects were found during the build, and their distribution is the
    useful finding: only one (the filename increment rule) was in pure domain
    logic, where the unit tests caught it immediately. The other three lived at
    the seam between component, domain and real project data — a crew column
    exporting a job title because it read a legacy free-text field instead of
    the crew list; a pickup silently joining the plan because a scheduled setup
    expands to all its shots; and a controlled input that ate the comma you
    typed. All three were found by driving the real app, not by the suite.

13. **Component and end-to-end coverage** (opened 2026-08-24). The seam defects
    above were the direct evidence: 1,400+ unit tests were green throughout,
    because the domain functions they cover were correct. A first React Testing
    Library layer now exists (`src/components/__tests__/`), behaviour-only by
    rule so it survives the planned `FloorPlanContext` split, and each case
    was mutation-tested — reintroducing the bug turns exactly one test red.
    It covers the continuity seams only; the shot list, script lining and
    equipment panels have none. There is still no end-to-end layer, so the
    money path (block → schedule → export) is guarded only by
    [`regression-checklist.md`](regression-checklist.md).
