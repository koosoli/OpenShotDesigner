# Handover — continuity reports, DaVinci Resolve metadata, and the shooting-day checklist

The next substantial feature, specified but deliberately not started. Everything
below comes from the user's own description and from the template they supplied,
which is vendored next to this document as
[`resolve-metadata-template.csv`](resolve-metadata-template.csv). **Read that
file before writing any code** — the column names are the contract.

## What it is

One page that serves two jobs at once, because on a shoot they are the same job:

1. **A continuity / script-supervisor report.** One row per clip, logged as it is
   shot: scene, shot, take, whether it was a good take, what happened in it, and
   the camera settings it was shot on.
2. **A shooting-day checklist.** The same page shows the shots planned for the
   day and lets the user tick them off as they are covered, so at wrap it is
   obvious what was missed. The app already knows what was planned — that is the
   whole point of the shot list and the schedule — so the checklist is a view
   over existing data, not a second list to maintain.

The export is a CSV that imports straight into DaVinci Resolve's metadata
importer, which matches on file name and attaches every other column to the
matching clip in the media pool.

## The contract: the CSV must match the template exactly

Resolve maps columns **by header name**. A renamed, reordered-by-name or
prettified header silently fails to import. The template's 29 columns, in order:

```
File Name, Production Company, Production Name, Director, DOP, Sound Mixer,
Script Supervisor, Date Recorded, Roll Card #, Environment, Location,
Day / Night, Scene, Shot, Take, Good Take, Description, Comments, Keywords,
Camera #, Camera Type, Camera FPS, Shutter Speed, ISO, White Point (Kelvin),
Focal Point (mm), Filter, Camera Aperture, Camera Notes
```

Details taken from the template, all of which matter:

- **CRLF line endings.** The template uses them; write them.
- **Row 2 of the template is an instruction row** (`clipname.mov`, `LAM`,
  `Who directed this?`, …), not data. Our export must not emit it. It is worth
  reading once as documentation of what each column expects.
- **`Good Take` is `1` or `0`**, not `true`/`yes`.
- **`Date Recorded` is `YYYY_MM_DD`** — underscores, not hyphens. The app stores
  ISO dates, so this needs converting on the way out.
- **`Environment` is `INT` or `EXT`**; `Day / Night` is `DAY` or `NIGHT`. Note
  the spaces around the slash in that header.
- **`Keywords` is a comma-separated list inside one quoted field**
  (`"Laptop, John"`), so ordinary CSV quoting is required — do not hand-roll the
  serialiser, and do test a value containing a comma and a quote.
- Values in the sample are upper-case for `Location`, `Environment`,
  `Day / Night` and names. Worth matching; not worth enforcing.

The UI does **not** have to look like the template. The user was explicit: "in
our app it can of course look more sexy, but the CSV export should be like the
template."

## The interaction the user asked for

> "the user could just type in the file name per clip and the app will guess
> what the next clip will be called… most fields remain populated with the same
> information as the previous clip, and the user can just fill out what is new"

Two behaviours, and they are the heart of the feature:

**1. Filename reconciliation, not live typing.** *(Decided 2026-08-23, revising
the original brief — see "Decisions taken" below.)* The file name stays off the
critical path of logging. On set the person keeping continuity does not know the
camera's file name — the camera assistant does, and the names come off the card
at wrap. So: log scene / shot / take / notes live, and fill the `File Name`
column in a **reconciliation pass** afterwards, where the day's card listing is
pasted or imported and matched against the day's takes in order, with every
mismatch visible and resolvable before export.

The increment-guess survives, but as a convenience inside that pass rather than
as the thing standing between the user and the next take. The rule that covers
the real cases: find the last run of digits in the name and increment it,
preserving the zero-padding width (`A001C009` → `A001C010`, `C0001` → `C0002`,
and the template's own `1.MTS` → `2.MTS`). Leave everything else alone. Make it
a pure, well-tested function in the domain — it looks obvious and has a dozen
edge cases (no digits at all; digits only in the extension; `9` → `10` widening
the field; a name ending in a digit run that is a date).

Why this was changed: camera file names do not increment the way a log does.
Clip counters restart per card, ARRI/RED encode reel and camera into the name,
and an aborted take still burns a clip number. A log that drifts by one clip
makes Resolve attach *every* subsequent row to the wrong shot — silently, and
not noticed until the grade. A reconciliation pass makes that drift visible at
the one moment it can still be fixed cheaply.

**2. Sticky columns.** A new row inherits every value from the previous row, and
the user overwrites only what changed. In practice `Take` increments while the
shot stays the same; `Shot` changes and `Take` resets to 1; scene changes and
location/environment/day-night may change with it. Decide per column whether it
carries forward, resets, or increments, and make that table explicit in the
domain rather than scattered through the component. The user must be able to see
at a glance which values were inherited versus typed — inherited-but-wrong
metadata is worse than blank metadata, because it is confidently wrong.

## What the app already knows — do not make them type it twice

This is the reason to build this inside the app rather than in a spreadsheet.
Most of the 29 columns can be pre-filled:

| CSV column | Source already in the project |
| --- | --- |
| Production Company | `project.productionCompany` |
| Production Name | `project.title` |
| Director | `project.director` |
| DOP | `project.cinematographer` |
| Sound Mixer, Script Supervisor | `project.people` — match by role/department |
| Date Recorded | the `ProductionDay` being logged (convert to `YYYY_MM_DD`) |
| Environment, Location, Day / Night | the scene's location link and its heading — the schedule already resolves a day's locations |
| Scene | `shot.sceneNumber` |
| Shot | `shot.shotNumber` |
| Description | `shot.framingDescription` / `shot.name` |
| Camera # | `shot.cameraLabel` |
| Camera Type | the `CameraElement.cameraModel` behind the shot |
| Camera FPS | `shot.frameRate` |
| ISO, Camera Aperture, Filter | `CameraElement.iso`, `.aperture`, `.ndFilter` |
| Shutter Speed | derive from `CameraElement.shutterAngle` and the frame rate, or store a shutter speed |
| Focal Point (mm) | `shot.lensMm` |
| Camera Notes | `shot.equipmentNotes` |

Only `File Name`, `Roll Card #`, `Take`, `Good Take`, `Comments`, `Keywords` and
`White Point (Kelvin)` have no existing source. `White Point` is the one genuine
gap on `CameraElement` — everything else on that list is already modelled.

Follow the house rule while doing it: a value the app does not know stays empty.
Do not write a plausible default into a continuity report.

## Unplanned shots — number them, never renumber around them

The log has to accept a take for something that was never planned: the pickup,
the safety, the "we are here anyway" insert. If takes can only hang off a
planned `Shot`, the first day reality diverges from the schedule is the day the
log stops being used.

Two rules, decided together:

**Numbering reuses the scene algorithm, in the scene's own convention.**
A number that has reached a slate, a continuity log or a Resolve import is
immutable — the same reasoning already written at the top of
[`src/domain/script/numbering.ts`](../src/domain/script/numbering.ts) for locked
scene numbers, and it applies unchanged to shots.

There are two conventions in play and both are supported, because both are real:

- **`scene/index`** — `1/1`, `1/2`, `1/3`. This is what this app actually writes:
  `addShot` and the Renumber action produce it, and every existing project
  contains it. A pickup after `1/3` is `1/4`; one squeezed between `1/1` and
  `1/2` is `1/1A`, then `1/1B`, with `1/1AA` between those two.
- **`sceneLetter`** — `1A`, `1B`, `1C`, how many productions letter their setups.
  A pickup after `1F` is `1G`, never `2`, which is another scene.

`insertedShotNumber` follows whatever the scene already uses rather than
imposing one. A pickup numbered `1A` in a scene numbered `1/1, 1/2` is wrong in
the only way that matters — it is ambiguous on a slate.

*Correction to the first version of this decision, recorded 2026-08-23:* the
slash form `1/1A` was initially rejected here on the grounds that the slash is
already scene/shot notation. That premise was right and the conclusion was
wrong — the slash is already scene/shot notation **in this app's own stored
data**, so `1/1A` is not a new separator at all. It is the existing notation
with the locked-scene letter convention applied to the index, which is exactly
what the user proposed. The letter algebra is shared with the scene module
either way; only the "append at the end" rule differs between the two
conventions.

**Provenance is a flag, not part of the number.** The shot carries `unplanned:
true` and the UI shows a badge. Three reasons it must not live in the string: a
number encoding its own history would have to change if the shot is later added
to the plan; the wrap report needs to filter on it; and the `Shot` column going
to Resolve should read exactly what was on the slate — `1G`, not `1/1G`.

**Planned and actual stay two sets.** An unplanned shot must never retroactively
join the plan. If it does, the checklist can no longer report that 4C was
missed — it just shows a day where everything was covered. The wrap report wants
both lists: planned-but-not-shot, and shot-but-not-planned.

## The data model that is missing

There is no take record. `Shot` has `takesCount: number` and a `status`, and
that is all — so there is nowhere to put a take's file name, its good/NG flag or
its comments.

A new `Take` entity is needed, most naturally on the project (takes belong to a
shooting day, and a shot can be covered across two days):

```
id, shotId, productionDayId, takeNumber, fileName, isGoodTake,
comments, keywords[], rollCard, cameraOverrides?, loggedAt
```

Things to get right:

- `takesCount` on `Shot` becomes derived, or the two will drift. Prefer deriving
  it and migrating the stored value; if it stays, one of them is a lie.
- Referential integrity: deleting a shot, a scene or a production day must take
  its takes with it. `src/domain/integrity.ts` is the established pattern —
  follow it, and add the test alongside the existing ones.
- A take pointing at a shot that no longer exists should be flagged rather than
  dropped silently, the way the power page now flags a consumer whose light was
  deleted.
- This needs a **schema migration** (currently v23). Every migration in
  `src/domain/migrations/` is pure, deterministic and fixture-tested; match that.

## The checklist half

The page should show, for a selected production day: every shot scheduled for
that day, with its take count and whether any take is marked good. Ticking a
shot off is really "this shot has a good take" — so derive the checklist state
from the takes rather than storing a second flag that can disagree with them.
Surface the gap at wrap: shots scheduled with no takes at all, and shots with
takes but no good one. That list is the thing an AD actually wants at the end of
the day.

`src/domain/reports/dayCast.ts` is a good model for "derive a day's worth of
something from the schedule regardless of whether it was scheduled by scene,
setup or shot" — the same three block kinds apply here.

## Where it fits in the app

- A new module in the right sidebar, under OPERATIONS next to Run of Show.
  Module visibility is per workspace profile — see `isModuleEnabledIn`.
- A print section, the same way power, rigging, logistics and run of show were
  just added: a `ContinuityPrintView` in `src/components/reports/` exporting both
  the component and a `buildContinuityPrintModel(project, dayId)`, plus a tab in
  `PrintableShotPlan` and a Print button on the panel. A printed continuity
  report and a printed end-of-day checklist are both real paper documents.
- The CSV export belongs beside the other exporters (`src/utils/exportShotList.ts`
  is the closest precedent — it holds `exportShotListToCsv` and
  `exportProjectToCsv`) and the row-building must live in the domain so it
  can be tested without a DOM.

## Verify it for real

Building a CSV that *looks* right is not the deliverable — importing it into
Resolve is. Ask the user to round-trip an export through
**Media Pool → right-click → Import Metadata…** on a real project before calling
it done. The failure mode is silent: Resolve imports the file and attaches
nothing, because one header did not match.

Suggested tests: exact header row byte-for-byte against the template; CRLF; a
`Keywords` value containing a comma and a quote; `Good Take` as `1`/`0`; date
formatting; filename increment across the padding cases; sticky-column
inheritance including the take-number reset.

## Appendix — the brief in the user's own words

Kept verbatim, because everything above is an interpretation of it:

> "make it possible to write continuity reports compatible with davinci resolve,
> that page can also be a checklist to tick off to see that every shot has been
> done of the shooting day. ok here is what i meant, check this file, i can
> import it into davinci resolve for metadata, if i do that, every file name
> found will be connected with the corresponding meta data, for that the field
> need to be named like in my file like "Production Company". so it would be
> cool if the user could just type in the file name per clip and the app will
> guess what the next clip will be called… most fields remain populated with the
> same information as the previous clip, and the user can just fill out what is
> new. in our app it can of course look more sexy but the csv export should be
> like the template."

Three things that reading makes plain, in case the sections above blur them:

- **The file name is the join key, and it is the one field typed every row.**
  It must be the camera's actual file name on the card, extension included
  (`1.MTS`, `A001C002_230815_R1AB.mov`), because Resolve matches the string
  against clips already in the media pool. If the footage is renamed after
  export, the link breaks — say so in the UI next to the field.
- **Typing should be the exception, not the rule.** The target is: type a file
  name, glance at the inherited row, change the one or two fields that moved,
  next. If logging a take takes more than a few seconds it will not be used on
  set, and the checklist half goes stale with it.
- **The template is the spec for the export only.** The on-screen page is ours
  to design; the bytes leaving the app are not.

## Decisions taken after the first draft of this handover

Recorded so they are not relitigated. Both were discussed with the user on
2026-08-23 and agreed.

1. **File name moves off the critical path** — logged live as scene/shot/take,
   reconciled against the card listing afterwards. Supersedes the original
   "type the file name per clip" flow in the brief below. The user agreed to
   this change explicitly.
2. **Unplanned shots are supported, numbered in whichever convention the scene
   already uses, and marked with an `unplanned` flag.** In this app's own
   `scene/index` numbering that means a pickup after `1/3` is `1/4` and a
   squeeze between `1/1` and `1/2` is `1/1A` — the form the user proposed. The
   immutability principle behind it is the user's own and is not open for
   revision: additional shots must never disturb pre-existing numbering.
3. **An unplanned shot never joins the plan retroactively.** Expanding a
   scheduled setup or scene yields only the shots that were planned on it, so
   adding a pickup to a scheduled setup cannot quietly enrol it — otherwise the
   checklist stops being able to report the shot that was actually missed. A
   `shots` block that names the id explicitly does schedule it; that is someone
   deciding to plan it, which is a different act.

The user is expanding the app beyond pre-production deliberately, so "is
Cineplan open on set?" is answered — yes, by design. Do not treat on-set use as
a hypothetical when weighing the UI.

