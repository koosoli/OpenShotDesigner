/**
 * Harness for component tests.
 *
 * Renders a panel over a real, stateful stub of the floor-plan context rather
 * than the whole `FloorPlanProvider`. The provider owns IndexedDB, sample
 * content, history and 4k lines of unrelated state; none of that is under test
 * here, and pulling it in would make these tests slow and make them fail for
 * reasons that have nothing to do with the component.
 *
 * What the stub reproduces exactly is the part components actually depend on:
 * `updateProjectMeta` merging a patch — or the result of a `(prev) => patch`
 * updater — into the project. Getting that wrong caused a real bug (two
 * mutations in one tick, the first silently dropped), so the stub uses the same
 * functional-update semantics as the real provider.
 *
 * These tests are deliberately BEHAVIOUR-ONLY: render, interact through the DOM
 * the way a user does, assert what is visible or what was persisted. Nothing
 * here may assert props, callback shapes or context internals — those would be
 * invalidated by the planned `FloorPlanContext` split and would make a safe
 * refactor look dangerous, which is the opposite of what a test net is for.
 */
import React, { useMemo, useState } from 'react';
import { render } from '@testing-library/react';
import type { Project } from '../../types';

type UpdateProjectMeta = (
  updates: Partial<Project> | ((prev: Project) => Partial<Project>),
) => void;

/**
 * Same shape as the provider's `runCommand`: a pure domain command plus its
 * input, applied to the project.
 *
 * Stubbed here rather than left out because a panel that has been migrated to
 * commands reaches for this on every write. Leaving it undefined would make
 * those panels throw in tests while working in the app — the stub lying, which
 * is the one thing this harness must never do.
 */
type RunCommand = <TInput>(
  command: (project: Project, input: TInput) => { project: Project; meta: unknown; warnings?: string[] },
  input: TInput,
  options?: unknown,
) => unknown;

interface FloorPlanDeps {
  project: Project;
  updateProjectMeta: UpdateProjectMeta;
  runCommand: RunCommand;
  activeSetup?: unknown;
}

/**
 * The workspace-chrome half, stubbed separately because it now IS separate:
 * theme and the export modal moved to `WorkspaceUIContext`. Keeping the two
 * stubs apart is the point — a panel that reaches for `theme` through
 * `useFloorPlan` no longer compiles, here as in the app.
 */
interface WorkspaceUIDeps {
  theme: string;
  openExportModal: (section?: string) => void;
}

/**
 * The live stub, read by the mocked `useFloorPlan`. A module-level holder
 * rather than a React context because the mock factory has to reach it from
 * outside the tree.
 */
const holder: {
  deps: FloorPlanDeps | null;
  ui: WorkspaceUIDeps | null;
  latest: Project | null;
  exportsOpened: string[];
} = { deps: null, ui: null, latest: null, exportsOpened: [] };

/** What the mocked `useFloorPlan` returns. */
export const currentDeps = (): FloorPlanDeps => {
  if (!holder.deps) throw new Error('renderWithProject has not run yet');
  return holder.deps;
};

/** What the mocked `useWorkspaceUI` returns. */
export const currentWorkspaceUI = (): WorkspaceUIDeps => {
  if (!holder.ui) throw new Error('renderWithProject has not run yet');
  return holder.ui;
};

/** The project as it stands after the interactions so far. */
export const currentProject = (): Project => {
  if (!holder.latest) throw new Error('renderWithProject has not run yet');
  return holder.latest;
};

/** Export sections the component asked to open. */
export const exportsOpened = (): string[] => holder.exportsOpened;

/**
 * A minimal but honest project. Only the fields under test are set; every
 * optional collection stays absent rather than empty, which is what a real
 * project that has never used a feature looks like.
 */
export const projectFixture = (overrides: Partial<Project> = {}): Project =>
  ({
    title: 'Test Production',
    director: '',
    cinematographer: '',
    date: '2026-08-23',
    setups: [],
    activeSetupId: '',
    ...overrides,
  }) as Project;

/**
 * Render a panel with a stateful project behind it.
 *
 * `extra` adds context members a particular panel needs beyond the common
 * four. It is a per-test opt-in rather than a growing default so that each
 * test states exactly what its panel depends on — a stub that quietly provides
 * everything hides the coupling it is supposed to make visible.
 */
export const renderWithProject = (
  element: React.ReactElement,
  initial: Project,
  extra: Record<string, unknown> = {},
  extraUI: Record<string, unknown> = {},
) => {
  holder.latest = initial;
  holder.exportsOpened = [];

  const Host: React.FC = () => {
    const [project, setProject] = useState<Project>(initial);
    const deps = useMemo<FloorPlanDeps>(
      () => ({
        project,
        // Same merge semantics as the real provider, functional form included.
        updateProjectMeta: (updates) =>
          setProject((prev) => {
            const patch = typeof updates === 'function' ? updates(prev) : updates;
            const next = { ...prev, ...patch };
            holder.latest = next;
            return next;
          }),
        // Mirrors the provider: the command runs against `prev` inside the
        // updater, so two writes in one tick compose instead of the second
        // overwriting the first — the same functional-update guarantee
        // `updateProjectMeta` gives above, and for the same reason.
        runCommand: ((command, input) => {
          let meta: unknown;
          setProject((prev) => {
            const result = command(prev, input);
            meta = result.meta;
            holder.latest = result.project;
            return result.project;
          });
          return meta;
        }) as RunCommand,
        activeSetup: project.setups[0],
        // The real provider always merges these over its defaults, so a stub
        // that omits them is the stub lying rather than the component being
        // careless about an optional field.
        displaySettings: {},
        ...extra,
      }),
      [project],
    );
    const ui = useMemo<WorkspaceUIDeps>(
      () => ({
        theme: 'dark',
        openExportModal: (section?: string) => {
          holder.exportsOpened.push(section ?? '');
        },
        ...extraUI,
      }),
      [],
    );
    // Assigned during the parent's render, so the child sees it on its own
    // first render — React renders parent before child, synchronously.
    holder.deps = deps;
    holder.ui = ui;
    // Cloned rather than returned as-is: React bails out of re-rendering a
    // child whose element is referentially identical to the previous render,
    // so handing back the same object would freeze the panel on its first
    // paint and every interaction would silently do nothing on screen.
    return React.cloneElement(element);
  };

  return render(<Host />);
};
