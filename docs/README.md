# Documentation index

What lives in `docs/`, and which document answers which question. Everything
listed here is current; anything superseded has moved to [`archive/`](#archive).

## Current documents

| Document | What it is | Read it when |
| --- | --- | --- |
| [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) | The master plan and repository-level source of truth: product scope, the numbered workstreams and batches, and the rules (§ references throughout the codebase point here). Large — navigate by section number. | You need the intended design of a feature, or a comment cites a `§`. |
| [`handover-2026-08-23.md`](handover-2026-08-23.md) | State of the work at the end of the most recent session and what the next session should pick up. | You are starting a session and want the current front line. |
| [`codebase-audit-2026-08-23b.md`](codebase-audit-2026-08-23b.md) | The newest full audit **and** the remediation pass that followed it: what was fixed, what the numbers are now, and what is still open. Supersedes every earlier audit. | You want the honest current state of code quality and the open-debt list. |
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
