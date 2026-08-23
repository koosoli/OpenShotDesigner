# Batch 1 Notes — Foundation

> Record of Batch 1 (master plan §41 "Batch 1 — Foundation", §48). Batch 1 is the prerequisite for all parallel feature work (Gate A).

## What Batch 1 delivered

- **Central ID service** (`src/domain/ids.ts`): `createId(prefix)` backed by `crypto.randomUUID()` with fallback; `isGeneratedId()` helper. All persistent entities use globally unique IDs (rule 16).
- **Deep-clone/remap** (`src/domain/clone.ts`): `cloneSetupWithNewIds` / `cloneProjectWithNewIds` regenerate nested IDs and remap internal references on duplicate/import-as-copy; covered by unit tests.
- **Schema versioning + migration framework**: projects carry `schemaVersion`; deterministic versioned migrations in `src/domain/migrations/` (`v1-to-v2`, chain runner); old saved JSON still loads losslessly (rule 8); migration fixture tests included.
- **Storage facade** (`src/utils/projectLibrary`): project persistence behind a sync facade implementing the `ProjectStore` shape, moving toward IndexedDB as primary store (plan §5.1); components never touch storage engines directly.
- **Validation framework** (`src/domain/validation.ts`): composable, pure validators returning structured issues (`severity`/`code`/`entityId`/`message`), incl. duplicate-ID and dangling-reference checks; runs at meaningful boundaries only.
- **Test infrastructure**: Vitest with jsdom environment and `fake-indexeddb` for storage tests; domain tests under `src/domain/__tests__/` and `src/utils/__tests__/`.
- **CI** (`.github/workflows/ci.yml`): install → typecheck → test → lint → build → GH_PAGES subpath build on every push/PR.
- **Governance docs**: this file, `AGENTS.md` (distilled agent rules), `docs/collaboration-boundaries.md` (four state classes + document partitioning), `docs/regression-checklist.md` (existing-feature contract incl. bundled demo project path).
- **Master plan committed in-repo** at `docs/IMPLEMENTATION_PLAN.md`; `AGENTS.md` must stay synchronized with it.

## New dependency justification (rule 31)

All added as **devDependencies only — zero runtime dependencies added**:

| Dependency | Justification |
|---|---|
| `vitest` | Test runner required by plan §3.8 / rule 7 (unit tests for every domain calculation/migration); Vite-native, no extra build config. |
| `jsdom` | DOM environment for Vitest so component-adjacent utilities can be tested headlessly. |
| `fake-indexeddb` | In-memory IndexedDB implementation enabling deterministic storage-facade tests in CI without a browser. |

## Follow-ups tracked out of Batch 1

- Canonical units module (`src/domain/units.ts`) policy lands with the first technical-domain batch.
- IndexedDB asset store and autosave/save-state UX follow the project-store migration (plan §5.2, §5.5).
