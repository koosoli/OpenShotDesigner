# Documentation index

What lives in `docs/`, and which document answers which question. Everything
listed here is current; anything superseded has moved to [`archive/`](#archive).

## Current documents

| Document | What it is | Read it when |
| --- | --- | --- |
| [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) | The master plan and repository-level source of truth: product scope, the numbered workstreams and batches, and the rules (§ references throughout the codebase point here). Large — navigate by section number. | You need the intended design of a feature, or a comment cites a `§`. |
| [`handover-2026-08-23.md`](handover-2026-08-23.md) | State of the work at the end of the most recent session and what the next session should pick up. | You are starting a session and want the current front line. |
| [`codebase-audit-2026-08-24.md`](codebase-audit-2026-08-24.md) | The newest pass: the lint debt paid to zero, the defects that clearing it exposed, and the seven features that close the production loop (daily report, camera/sound reports, continuity binder, ALE, coverage and schedule checks, magic hour). Ends with the previous audit's open list, answered. | You want the honest current state and the open-debt list. |
| [`codebase-audit-2026-08-23b.md`](codebase-audit-2026-08-23b.md) | The previous full audit and the remediation pass that followed it. Still the best record of the reasoning behind the test-layer design and the `FloorPlanContext` hardening. | You want the *why* behind the current test net. |
| [`handover-continuity-reports.md`](handover-continuity-reports.md) | The specification for the continuity module — the take log, the shooting-day checklist and the DaVinci Resolve metadata CSV — **now built** (`src/domain/continuity/`, schema v24). Kept because it records the decisions and the reasoning behind them, including two that were revised mid-build. The column contract lives in [`resolve-metadata-template.csv`](resolve-metadata-template.csv) next to it. | You are changing the continuity / Resolve work, or wondering why it is shaped the way it is. |
| [`testing-layers.md`](testing-layers.md) | What each of the five test layers catches that the others cannot, and where a new feature's tests belong. Built on evidence rather than theory: the defect distribution from the continuity module, where 1,400 green unit tests missed three of four bugs because they lived at seams. | You are adding a feature and wondering what to test, or a test in an unfamiliar layer just failed. |
| [`regression-checklist.md`](regression-checklist.md) | Manual QA checklist covering the existing feature contract. | Before a release, and after any storage, canvas or architecture refactor. |
| [`collaboration-boundaries.md`](collaboration-boundaries.md) | The four state classes (shared/persistent, personal, ephemeral, derived) that every new piece of state must be assigned to. | You are adding state and have to decide where it belongs. |
| [`draft-curated-film-fixtures.md`](draft-curated-film-fixtures.md) | Unverified draft of curated film-fixture specs, not wired into the app. Carries its own provenance warning. | You are working on fixture data — read the warning first. |
| [`screenshots/`](screenshots) | Screenshots used by the root `README.md`. | You changed a surface the README shows. |

## Archive

[`archive/`](archive) is historical. Those documents were accurate when written
and are kept because they record why things are the way they are, but they are
**not** maintained and should not be treated as current state:

- `codebase-audit-2026-08-21.md`, `codebase-audit-2026-08-22.md`,
  `codebase-audit-2026-08-22b.md`, `codebase-audit-2026-08-23.md` — the earlier
  audit passes, superseded by `codebase-audit-2026-08-23b.md`. The 08-23 one is
  worth keeping in mind rather than reading: most of its open findings are
  closed in the b pass, and it says so.
- `implementation-audit-2026-08-21.md` — a one-off status sweep of the plan's
  workstreams as of that date.
- `implementation-progress.md` — running record of landed batches; the handover
  and the newest audit now carry this.
- `batch1-notes.md` — what the Batch 1 foundation delivered.
- `review-response-2026-08-23.md` — point-by-point answer to an external review
  of the pushed state.
