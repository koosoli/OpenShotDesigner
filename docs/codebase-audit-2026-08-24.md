# Codebase Audit and Feature Pass — 2026-08-24

An audit-and-cleanup pass, followed by seven features that between them close
the production loop: the app now follows a production from blocking a scene
through to the paperwork that travels with the media and the report the office
reads at wrap.

Supersedes nothing. [`codebase-audit-2026-08-23b.md`](codebase-audit-2026-08-23b.md)
holds the reasoning for the previous pass; its open list is answered at the end
of this one.

## State at the end of the pass

| | Start of pass | End of pass |
| --- | --- | --- |
| Tests | 1,579 across 115 files | **1,869 across 136 files** |
| Lint | 0 errors, 111 warnings, budget 111 | **0 errors, 0 warnings, budget 0** |
| `any` in `src/` | 96 | **0** |
| Schema | v24 | v24 (unchanged; every field added is absent-safe) |
| Entry chunk | 880 kB (235 kB gzip) | 894 kB (240 kB gzip) |
| Panels with behaviour coverage | continuity, shot list, schedule, equipment | + **inspector, coverage warnings, binder** |
| Context actions under contract | elements, shots | + **script** |

`npm run lint`, `npm test`, `npm run build` and `GH_PAGES=true npm run build`
are all green. The app was driven in a browser throughout — two of the defects
below were found that way and by no other means.

---

## Part 1 — The cleanup, and what it found

The lint budget went from 111 to 0, and the `--max-warnings` ceiling with it,
so rule 5 ("no new `any`") is now an actual gate rather than a ratchet.

**Fifty-five were dead code.** Unused imports, context values destructured and
never read, `useMemo`s computing results nothing consumed. Two were not free:
`InspectorPanel` derived a breakdown of the whole screenplay on every script
change and threw it away, and subscribed to the fixture catalog so that a
catalog update re-rendered 2,300 lines of panel for a value it did not use.

**Fifty-six were `any`, and clearing them found two real defects.**

### The printed blueprint's auto-fit was wrong in three ways

`PrintableShotPlan` computed the page's bounding box like this:

```ts
fullMinX = Math.min(...elements.map((e) => e.x)) - 60;
fullMaxX = Math.max(...elements.map((e) => (e as any).x2 || e.x + ((e as any).width || 80))) + 60;
```

- The minimum came from `e.x` alone while the maximum came from `e.x2`, so a
  wall drawn right-to-left — an ordinary way to draw one — produced an
  **inverted box**. The printed blueprint got a viewBox with negative width and
  came out scrambled or empty.
- `width` was read as measured from the element's corner. Every layer draws a
  sized element **centred** on `(x, y)` (`x={-w / 2}`), so the fit clipped the
  left half of anything near the edge and left a matching band of blank paper.
- `(e as any).x2 || …` discarded an `x2` of exactly `0`.

`domain/plan/elementBounds.ts` replaces it and the canvas's own copy of the
same computation. All three cases are pinned by tests.

### `(mark as any).shotSize` read a field that has never existed

In the lined script, a fallback chain read `shot?.shotSize || (mark as any).shotSize || ''`.
`ScriptMark` has never declared `shotSize`, so the middle term has always
evaluated to `undefined`. The cast made it compile and made it look
intentional.

### Two type gaps that were bugs waiting

`LinedScriptPage` declared its selection as `{ from, to }` while `ScriptPanel`
passed four more fields, and read them back through `(selection as any).partial`.
Renaming any of them would have silently stopped the partial highlight drawing,
which reads as "the selection did not take". `ScriptSelectionRange` now says
what it is.

`MasterEquipmentItem` was narrowed by `as any` at both render sites, so a row
missing `usedInSetups` would have thrown inside a print view — while the user
was trying to print. `isMasterEquipmentItem` checks the fields are usable
rather than merely present.

### The fourteen `<select>` casts

`e.target.value as any` on a `<select>` handler is the one place in this app
where a raw DOM string reached persisted project state with no check at all.
Rename an option value and the old string keeps being written, into a field no
renderer has a case for — a camera that draws with no rig, months later, with
nothing to grep for.

`domain/optionValue.ts` validates against the SAME array the `<option>`s are
rendered from, so the allowed set cannot drift from what the user can pick, and
falls back to the current value rather than writing something invented.
`CAMERA_ANGLES` moved into presets on the way: the shot list held three copies
of that literal list, in two different orderings.

### A flaky test, fixed rather than re-run

The heaviest panel-behaviour test measures ~5.3 s under full-suite load against
Vitest's 5 s default, so it failed **only when the whole suite ran**. That is
the worst kind of red: the fix looks like "run it again", and that is what
people learn to do. Timeout raised to 20 s.

---

## Part 2 — Seven features

All seven were proposed by a review of the codebase; all seven were worth
building, though one of them rested on a claim about the data that was not
true (see the DPR below).

### 1. End-of-day production report (§35)

`domain/reports/dailyProgress.ts`. Scenes, pages, setups and shots scheduled
against covered; takes good and NG; first and last take; ahead or behind.

The proposal said "actual start/stop times already live in the continuity log".
They do not — `Take` carries `loggedAt` and nothing else. Rather than invent a
camera-roll clock (two more button presses per take, which is how a log stops
being kept), the report brackets the day by the **first and last take logged**
and says so on the sheet. A unit that spends the first hour lighting has a
first take later than its call, which is normal and not a delay.

Two honesty rules that shaped the rest of it:

- **Variance is measured only against strips whose shots were all covered.**
  Crediting a half-shot strip's whole estimate would report a day as on
  schedule that is in fact a scene short.
- **Pages go null the moment any scheduled scene has no recorded length.** A
  partial page count is the number most likely to be repeated at a production
  meeting and the hardest to trace afterwards.

### 2. Camera and sound reports

`domain/continuity/setReports.ts`. Two functions rather than one with a flag,
because they are two documents that disagree on purpose: a wild track is a row
on the sound report and absent from the camera one; an MOS take is on both, and
is listed on the sound report precisely so a missing audio file reads as
intended rather than as lost.

Building them required a real fix rather than a new column. `Take.rollCard` was
documented as "sound roll / camera card" and used as both, while feeding
Resolve's `Roll Card #` — which is the camera card. A day can burn three camera
cards against one sound roll, so one field for both makes the two reports print
the same number, which is the mistake they exist to catch. Sound now has its
own `soundRoll`, `soundFileName`, `soundNotes`, `mos` and `wildTrack`.

Both build on `buildResolveRows`, so the printed sheet and the exported
metadata cannot say different things about the same take.

### 3. Continuity binder — wardrobe / hair / make-up / props (§36)

`domain/continuity/binder.ts` and the Binder tab.

**Keyed on script day, not scene number**, and that is the whole design. A
feature is shot out of order: scene 4 and scene 51 can be the same afternoon in
the story and three weeks apart on the schedule, and the costume that has to
match is the one from the same script day. `ScriptScene` gains an optional
`scriptDay`; a note may override it.

`continuityConflicts` reports where the binder disagrees with itself and
deliberately **does not judge whether two descriptions match**. "Blue coat,
buttoned" and "blue coat, top button undone" differ, and a machine cannot tell
whether that is an error or the point of the scene. Notes with no script day are
skipped rather than pooled under a blank one, which would report every un-dayed
note as conflicting with every other.

Photographs are asset ids, never inlined (rules 17 and 26). Deleting a setup a
note cites **unlinks rather than deletes**, unlike a take whose shot goes: a
take is meaningless without its footage, a continuity note is the costume
department's record.

### 4. ALE export

`domain/continuity/ale.ts`, beside the Resolve CSV. Same rows, the other
editorial contract.

No `Start`/`End` columns: the app has no timecode, and writing `00:00:00:00`
for every clip would be a fabricated value Avid would treat as real. Avid's own
bin columns and the custom ones are listed separately so a later reader does not
have to guess which is which. ALE has **no quoting mechanism at all**, so tabs
and newlines are collapsed to spaces — a mangled comment is readable, a mangled
file is not importable.

**Not verified against a real Media Composer.** It is a standing manual gate in
[`regression-checklist.md`](regression-checklist.md), exactly as the Resolve
import is.

### 5. Coverage checker

`domain/shots/coverage.ts`. Four questions per scene: is there anything wide
enough to cut back out to, is it covered from more than one angle, is every
performer framed alone somewhere, is anyone the breakdown names missing from the
shot list entirely.

Two are warnings and two are notes, because a documentary crew shooting one
locked-off wide is not making a mistake and a checker that says it is gets
ignored wholesale. Nothing about the 180-degree line: the plan has the geometry
to attempt it, and a false positive on a legitimate crossing move is exactly
what would make the rest of the list worthless.

### 6. Schedule health warnings

`domain/scheduling/health.ts`. Company moves, locations too far apart to be one
day, the cast actually booked across that distance, turnaround between wrap and
the next call, and work that does not fit the published day.

Thresholds are parameters with documented defaults, because ten hours'
turnaround is an agreement rather than a fact. A day with no wrap time raises
nothing rather than assuming one, and a strip with no estimate makes the day's
total a floor rather than a total.

### 7. Golden-hour planning (§37)

Most of §37 already existed — the overlay, the scrubber, the golden-hour
readout. What was missing was magic hour on the **call sheet**, which is where
a DOP looks for it. Derived only, with no override of its own: a production that
corrects sunset for a ridge line has said something about the horizon, not about
the sun's elevation.

Building it found the bug below.

---

## Part 3 — Defects found by driving the app

Both of these were live while 1,700+ unit tests were green, and both are at the
seam between a component and the domain — the same distribution the previous
audit recorded.

### The sun was computed in the wrong time zone

The floor-plan sun overlay and the inspector's readout each built the planned
moment with `new Date(year, month, day, hour, minute)` — **the machine's wall
clock**. Set the scrubber to 18:00 for a location in Tokyo while working in
Europe and both computed the sun for 18:00 in Europe: a shadow pointing the
wrong way across the plan, a readout saying "below horizon" for a scene
shooting in daylight, and "Calculated for &lt;the Tokyo location&gt;" printed
underneath it.

`domain/sun/scenePlan.ts` resolves the moment through the location's own zone,
returns position and day-events together so the two views cannot disagree, and
reports where the zone came from — the panel now says when it is showing the
machine's.

### The coverage warnings reported one person twice

Found within a minute of putting the checker on screen, against the sample
project. An actor **marker** is a per-setup floor-plan element, so one performer
standing in two setups of a scene is two elements with two ids, and
`Shot.subjectActorIds` points at those. The panel printed "CHARACTER C is in
scene 1 but appears in no shot" once per marker.

The domain was correct throughout. The adapter now reduces every marker to a
canonical identity before the domain sees it — the script character it plays,
failing that its display name, failing that its own id — and translates the
shots through the same map. Matching unlinked markers by name is a judgement,
and it is the one `locations/linking.ts` already makes for set names.

### Breakdown-tag pruning ran for only one caller

Open item 5 from the previous audit, and worse than it read. Pruning the
breakdown tags that pointed at deleted script lines lived in `ScriptPanel`'s
wrapper, so it ran only for edits made through that panel — while
`setSceneNumbersLocked` and every import path call the context's
`setScriptLines` directly. Those paths left tags referencing lines that no
longer existed, and the reports resolve scenes through those tags.

It now happens inside the same updater that already prunes the linings, which
also removes the panel's second `updateProjectMeta` in the same tick — the
shape of write this codebase has lost data to before.

One behavioural change, deliberate: a tag on a line inside an **omitted**
scene's stored body now survives. Those lines are hidden, not gone.

---

## Part 4 — Tests

Every new domain module is unit-tested. Beyond that:

| Layer | Added |
| --- | --- |
| Provider contract | `script.contract.test.tsx` — the widest-reaching write in the context had none |
| Panel behaviour | `InspectorPanel`, `CoverageWarnings`, `ContinuityBinder`; sound cases on `ContinuityPanel` |
| Cross-collection property | `continuityNotes` added to the `projectCollections` enumeration |

**Mutation-tested, each turning exactly the expected cases red:**

- removing the MOS/wild-track exclusion → 1 case
- removing the sound-roll carry → 1 case
- reverting the coverage adapter's canonical key → 2 cases
- removing the context's breakdown pruning → 3 cases
- restoring `as any` on the camera-rig `<select>` → 1 case
- removing the binder's clone branch → 1 case

One test had to be **rewritten because the mutation showed it was overclaiming**.
It said it covered the functional-update invariant, and two awaited
`userEvent.click`s pass just as well against a handler that reads the project
from its render closure, because `userEvent` flushes between them. Both native
clicks inside one `act` batch properly, and that version does turn red.

That is worth recording as a method: a test whose comment claims a guarantee it
does not provide is worse than no test, because it reads as coverage of a path
nothing walks.

---

## Answering the previous audit's open list

| Item | Now |
| --- | --- |
| 1. Entry chunk 880 kB | **Open**, and 894 kB — this pass added to it. Nothing in this pass addressed it; the three new print views are inside the already-split `PrintableShotPlan` chunk. |
| 2. 149 lint warnings | **Closed.** 0, budget 0. |
| 3. `FloorPlanContext` 4,406 lines | **Open**, and 4,363 now. One action moved IN (breakdown pruning, because that is where it belongs); nothing moved out. |
| 4. `handleElementSelect` encloses two group helpers | **Open.** |
| 5. Breakdown pruning lives in `ScriptPanel` | **Closed** — see above. |
| 6. No character tagging from the breakdown tagger | **Open.** |
| 7. Revision snapshots embed a whole project each | **Open.** |
| 9. Asset-store ownership | **Open**, for the reason recorded there. The binder adds a second consumer of the store, which strengthens the case rather than changing it. |
| 13. Component and end-to-end coverage | **Partly.** Inspector and the new panels now have behaviour coverage; script has contract coverage; the **download path is now covered** (Part 5). Rendering and layout are still untested, and there is no browser-driving end-to-end layer. |

---

## Part 5 — The download path (added after the pass)

The open list's item 2 said the download path was "exercised by nothing". It is
now, and covering it found two defects — both in code that had been shipping
for as long as the exports have existed.

Nine places built their own Blob-and-anchor. Comparing them side by side is
what made the bugs visible; each one alone looked fine.

### Three exports downloaded nothing in Firefox

The contacts CSV, the Fountain screenplay and the AV-script CSV created a
**detached** `<a>` and called `.click()` on it. Chrome tolerates that; Firefox
does not fire the download at all. No error, no file — the button simply did
nothing, which is not a symptom anyone can report usefully.

### Two exports produced filenames the filesystem refuses

The project JSON and the Fountain screenplay sanitised whitespace and nothing
else, so a project called `Ocean's 11: Director/Draft "2"` produced a download
name containing `/`, `:` and `"`. Those are illegal on Windows and `/` reads as
a path separator.

### And an inconsistency that was quietly costing data

Three CSVs had a byte-order mark and three did not, with no stated rule. The
BOM is not cosmetic: Excel needs one to read UTF-8, and Resolve breaks on one.
The **contacts** export — the one file that is entirely people's names — had
none, so every accented name came out as mojibake in Excel. The shot list had
none either.

`utils/download.ts` is now the single path, with `excelBom` a **required**
argument for CSV so the choice cannot be defaulted into being wrong. Both
failure modes are silent, which is exactly why the type makes you say it.

Worth recording one thing the tests taught: `Blob.text()` runs the WHATWG UTF-8
decode, which **strips a leading BOM**. A test asserting BOM behaviour through
`.text()` can never see one and passes just as happily against code that writes
none. The assertions read raw bytes.

Mutation-tested: detaching the anchor turns 6 cases red; reverting to the
whitespace-only sanitiser turns 7 red.

---

## Part 6 — Workspace chrome out of the project context

Open item 1 argued against decomposing `FloorPlanContext` on the evidence: the
audit's own success test — "adding something like Camera Reports stops
requiring edits to six unrelated systems" — was already passing, seven features
having cost one line between them.

One piece was worth moving anyway, for a reason that is not about size. Rule 38
asks that session UI state and shared project state be kept distinct, and they
were not. `WorkspaceUIContext` now owns the theme, the active panel, quick
search, the dashboard and the export modal — everything describing **this
browser tab** rather than the production.

The payoff is not the line count (4,395 → 4,329, and 181 context members →
166). It is that when sync lands, the thing that must converge and the thing
that must NOT are now separate objects rather than two kinds of field in one,
told apart by remembering which is which.

### Three candidates turned out to be project state

Worth recording, because each would have made the split worse:

- **The viewfinder.** `openViewfinder()` picks a camera out of
  `activeSetup.elements` when not given one. The flag could move; the action
  could not, and splitting one action across two contexts is worse than
  leaving both.
- **`workspaceProfile` / `isModuleVisible`.** Keyed by project id and reloaded
  on project change — moving them means handing the new context a project.
- **`displaySettings`.** Reads as preference, consumed by canvas rendering.

### The dependency points one way

`WorkspaceUIProvider` mounts OUTSIDE `FloorPlanProvider`, because selecting an
element on the canvas opens the inspector — project state driving workspace
state. That only works in this nesting order, and it is the order with no
cycle: nothing in the workspace context reads a project.

The test harnesses needed care for a non-obvious reason. Both call
`vi.resetModules()` and import the context dynamically; a STATIC import of
`WorkspaceUIProvider` would have handed its value to the pre-reset context
object, so the freshly imported `FloorPlanProvider` would look up a context
nobody provided. Both now import it after the reset.

Verified in a real browser: the theme toggles and persists, selecting on the
canvas flips the tab to the inspector across the new provider boundary, and the
rule that reading the lined script is not interrupted by a selection still
holds.

---

## Part 7 — The download CALL SITES

Part 5 covered the download path. Checking afterwards showed that was true of
the path and not of the ways into it: `ContactsPanel`, `ScriptPanel`,
`TopNavbar`, `BudgetPanel` and `ProjectDashboard` had no test files at all —
and three of them were where the Firefox bug actually lived. A structural fix
is not a guarded one; nothing stopped the next person re-inlining an anchor.

Writing those tests found **two more live instances of the filename bug**, in
`ProjectDashboard` (the JSON backup and the project package). Part 5 missed
them because they call a local `triggerDownload` rather than
`URL.createObjectURL`, so the grep that found the other nine did not reach
them. Both used the same whitespace-only sanitiser, on the two files that ARE
the project.

`BudgetPanel` also still had its own filename sanitiser, so an untitled
production exported as `Budget_.csv`.

### Two things the tests needed from the environment

`matchMedia` joins `scrollIntoView` and `ResizeObserver` in `vitest.setup.ts`.
Note the guard: jsdom DEFINES the property and leaves it undefined, so an
`in` check passes and the call still throws — it has to test for a function.

### The AV export, closed with the right harness

Left open at first because its button would not render under the stub, this is
now covered by `ScriptPanelAVExport.test.tsx` using `renderPanel` — the real
provider. The diagnosis held: `scriptFormatMode` is project state, so the AV
tab only exists once it has been written and the panel's own effect has
followed. No stub could hand that over as a prop.

That makes it an integration test rather than a unit one, and slower. That is
the honest price of covering a tab whose existence depends on persisted state,
and it is worth paying for one of the three Firefox sites.

Mutation-tested: detaching the anchor and reverting the sanitiser each turn one
case red.

### One gap left open on purpose

**`ContactsPanel`'s editing flow** — draft, save and delete. This pass was about
the download path, and a test written against a guess at the save mechanics
would be worse than none.

---

## Still open

1. **`FloorPlanContext` decomposition.** Workspace chrome is out (Part 6); the
   rest stays, on the evidence in that section. The contract layer that makes
   it safe covers elements, shots and script; equipment, AV and revisions do
   not. Worth restating what success is not — the file getting shorter.
2. **No browser-driving end-to-end layer.** The money path is guarded by the
   golden-workflow test at the domain level, by the download tests at the file
   level (Part 5), and by `regression-checklist.md` in a real browser. What is
   still untested is rendering and layout — that a print view lays out on
   paper, that the canvas draws what the plan says.
3. **The ALE contract is unverified.** See the checklist.
4. **Entry chunk.** Below the point where further splitting is cheap; what
   remains is the app shell and the canvas.
5. **On-set operational view** (§35's other half): current shot, next shot,
   live status, cue tracking.
6. **Matching shots** (§36's other half): two frames side by side, which needs
   the storyboard surface rather than the binder.
