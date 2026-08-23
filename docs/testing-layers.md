# What each test layer is for

Five layers, each catching a failure the others cannot see. The point of
writing them down is that a feature should know where its tests go — and the
honest answer is usually "more than one place", because the defects in this
codebase have not been evenly distributed.

## The evidence this is built on

The continuity module shipped with four defects. Exactly one — the file-name
increment rule — lived in pure domain logic, and the unit tests caught it
within minutes of being written. The other three lived at seams:

- a crew column exported a job title, because it read the legacy free-text
  `Project.cinematographer` field instead of the crew list;
- a pickup silently joined the plan, because scheduling a setup expands to
  every shot on it;
- a controlled input ate the comma you typed, because it round-tripped an
  array through text on every keystroke.

All three were found by driving the real app. Over 1,400 unit tests were green
the entire time, and correctly so: the functions they covered were right. The
layers below exist because "the domain is well tested" and "the app works" are
different claims.

## 1. Domain unit tests — `src/domain/__tests__/`

Pure functions, no React, no DOM. Fast and precise, and where the majority of
tests should stay.

They cannot see: anything about how a component calls them, or whether it
passes the right slice of the project.

## 2. Cross-collection property tests — `projectCollections.test.ts`

Enumerates every id-bearing collection on `Project` and asserts properties
across all of them at once: cloning reissues ids, references follow their
target into the copy, an old project carrying the collection still migrates.

This layer exists because of a specific failure mode: a feature adds a
collection, everything about that feature works, and nothing notices that
`clone.ts` never learned about it. `takes` shipped exactly that way. A
per-collection test would not have caught it, because nobody writes the test
for the case they did not think of.

**Adding a collection to `Project` means adding a row to `ID_BEARING_COLLECTIONS`.**
The enumeration failing is the intended way to find out.

## 3. Provider-contract tests — `src/context/__tests__/*.contract.test.tsx`

Drive the real `FloorPlanProvider` through its public actions and assert the
resulting project state. Characterisation tests: they record what the context
does today so a refactor changes behaviour deliberately rather than by
accident.

Written before the `FloorPlanContext` decomposition specifically to guard it,
and they earned that immediately — the shot-builder extraction silently stopped
creating a camera element in single-camera mode, and the contract suite failed
while every unit test stayed green.

**Nothing here may assert internals** — not props, not callback shapes, not
which module an action lives in. That is exactly what the decomposition is free
to change.

## 4. Component tests — `src/components/__tests__/`

Two shapes, for two different costs:

- **Smoke** (`panels.smoke.test.tsx`) mounts all sixteen panels over a real
  project and fails on any `console.error`. Shallow on purpose. It catches the
  failure that reaches users fastest — a panel that throws on mount takes the
  whole right-hand side of the app with it — and it is the cheapest possible
  guard for a context refactor, because all sixteen fail at once and name the
  panel. React reports key warnings, invalid props and update-depth errors
  through `console.error` rather than throwing, so asserting on it catches
  defects that a render-succeeded check misses.
- **Behavioural** (`ContinuityPanel`, `ShotListPanel`) drive the DOM the way a
  user does and assert what got persisted — never that a callback fired.

**A panel added without a row in the smoke list is a panel nobody is watching.**

### Stub or real provider?

`ContinuityPanel` runs against a stubbed context because it reads four things
from it. The bigger panels run against the real provider, because stubbing
dozens of members means maintaining a second implementation of the context —
and a test passing against a drifted stub is worse than no test.

### Isolation, which is not obvious

Both harnesses give each test a fresh module registry. Wiping IndexedDB is not
enough: `projectLibrary` holds the open project in a module-level `Map` behind
an `initialized` flag, so the next test inherits the previous one's project.
This was not theoretical — a camera-uniqueness assertion passed alone and
failed in the suite, because an earlier test had added cameras in single-camera
mode, where repeating "A" is correct.

The same trick has a consequence worth knowing: `vi.resetModules()` also
re-imports `fake-indexeddb`, which keeps its data in module memory. A remount
therefore cannot see what the previous mount saved, so "reload the tab" cannot
be simulated that way — which is why the persistence tests read storage back
through the library's own API instead.

## 5. Workflow, persistence and scale

- **`goldenWorkflow.test.tsx`** walks one shot from the floor plan through the
  schedule and the continuity log to the exported CSV, asserting the *joins*:
  that the shot planned is the shot in the metadata, that the day the schedule
  holds is the date on the clip. No per-layer test can see those.
- **`persistence.test.tsx`** is the highest-consequence file here despite
  asserting very little. This app keeps everything in one browser, so
  persistence is the only thing between a user and losing a day's work. It also
  covers recovery: unreadable JSON, a project of the wrong shape and a
  newer-than-known schema must each still leave the app able to start, because
  a user who cannot start the app cannot reach the export button to rescue
  anything else.
- **`largeProject.test.ts`** runs the derivations over a feature-sized project
  (60 setups, 720 shots). Guards, not benchmarks: budgets sit around 50x the
  measured time, loose enough to survive a loaded CI box and tight enough that
  reintroducing a per-item scan trips them. It found two real quadratics.

## What none of this covers

- **Rendering and layout.** jsdom has no layout engine; `scrollIntoView` and
  `ResizeObserver` are stubs. Nothing here would notice a panel rendering
  correctly but invisibly.
- **The download itself.** The blob → anchor → file path is not exercised.
- **The DaVinci Resolve import.** Verified manually on 2026-08-23 and kept as a
  standing item in [`regression-checklist.md`](regression-checklist.md). No
  test in this repo can press that button, and the failure is silent: Resolve
  reports a successful import and attaches nothing.

An end-to-end layer (Playwright) would cover the first two. It is a real
dependency with browser binaries and CI time, so it is a decision rather than
an omission.
