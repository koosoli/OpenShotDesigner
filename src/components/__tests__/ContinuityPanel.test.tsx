/**
 * Continuity panel — the seams between the component, the domain and real
 * project data.
 *
 * Every case here is a bug that actually shipped, or the class of one:
 *
 *  - the keywords field ate the comma you typed, because it round-tripped
 *    array→text on every keystroke;
 *  - an unplanned shot on a scheduled setup quietly joined the plan, so the
 *    checklist stopped reporting the shot that was really missed;
 *  - two state updates in one tick dropped the first, because the second read
 *    a stale project.
 *
 * The domain functions behind all of this are unit-tested elsewhere and were
 * green while every one of those bugs was live. That is the point: the defects
 * were at the seam, so the tests have to be too.
 *
 * BEHAVIOUR-ONLY (see `renderWithProject`): drive the DOM, assert what is
 * visible or what got persisted. No props, no callbacks, no internals.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../context/FloorPlanContext', async () => {
  const harness = await import('./renderWithProject');
  return { useFloorPlan: () => harness.currentDeps() };
});
// Theme and the export modal live in their own context now, so the stub does
// too — a panel reaching for them through `useFloorPlan` fails here as it
// would in the app.
vi.mock('../../context/WorkspaceUIContext', async () => {
  const harness = await import('./renderWithProject');
  return { useWorkspaceUI: () => harness.currentWorkspaceUI() };
});

import { ContinuityPanel } from '../continuity/ContinuityPanel';
import {
  currentProject,
  exportsOpened,
  projectFixture,
  renderWithProject,
} from './renderWithProject';
import type { Project } from '../../types';

// `globals: false` in the vitest config means Testing Library cannot register
// its own afterEach, so without this the previous test's tree stays in the
// document and every query matches twice.
afterEach(cleanup);

const shot = (id: string, shotNumber: string, name: string, unplanned = false) =>
  ({
    id,
    sceneNumber: '1',
    shotNumber,
    name,
    cameraId: '',
    cameraLabel: 'A',
    shotSize: 'MS',
    lensMm: 35,
    cameraAngle: 'Eye Level',
    movement: 'Static',
    aspectRatio: '16:9',
    frameRate: 25,
    subjectActorIds: [],
    framingDescription: '',
    status: 'planned',
    takesCount: 0,
    estDurationSeconds: 0,
    order: 1,
    ...(unplanned ? { unplanned: true } : {}),
  }) as unknown as Project['setups'][number]['shots'][number];

/** A day with three planned shots, scheduled as a setup block. */
const dayProject = (): Project =>
  projectFixture({
    setups: [
      {
        id: 'setup1',
        name: 'Office',
        sceneNumber: '1',
        location: 'OFFICE',
        timeOfDay: 'Day INT',
        elements: [],
        shots: [
          shot('shot1', '1/1', 'Master'),
          shot('shot2', '1/2', 'Single'),
          shot('shot3', '1/3', 'Insert'),
        ],
      },
    ],
    activeSetupId: 'setup1',
    productionDays: [
      { id: 'day1', name: 'Day 1', date: '2026-08-29', scheduleBlockIds: ['b1'] },
    ],
    scheduleBlocks: [{ id: 'b1', kind: 'setup', setupId: 'setup1' }],
    continuityDayFilterId: 'day1',
  } as unknown as Partial<Project>);

/** Log a take on the nth shot listed in the checklist. */
const logTake = async (user: ReturnType<typeof userEvent.setup>, index = 0) => {
  const buttons = screen.getAllByRole('button', { name: 'Take' });
  await user.click(buttons[index]);
};

const openDetails = async (user: ReturnType<typeof userEvent.setup>, index = 0) => {
  const toggles = screen.getAllByTitle('Edit every column for this take');
  await user.click(toggles[index]);
};

describe('ContinuityPanel — logging', () => {
  it('logs takes that number within a shot and reset across shots', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());

    await logTake(user, 0);
    await logTake(user, 0);
    await logTake(user, 1);

    const takes = currentProject().takes ?? [];
    expect(takes.map((t) => [t.shotId, t.takeNumber])).toEqual([
      ['shot1', 1],
      ['shot1', 2],
      ['shot2', 1],
    ]);
  });

  it('logs a pickup as a tagged take on the existing shot', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());

    await user.click(screen.getAllByRole('button', { name: 'PU' })[0]);

    const project = currentProject();
    expect(project.setups[0].shots).toHaveLength(3);
    expect(project.takes).toMatchObject([
      { shotId: 'shot1', takeNumber: 1, slateTag: 'PU' },
    ]);
    expect(screen.getByText('1/1-PU')).toBeTruthy();

    await user.click(screen.getByTitle('Mark as a good take'));
    expect(screen.getByText(/No good base take: 1\/1/)).toBeTruthy();
  });

  it('numbers normal and PU takes in separate slate series', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());

    await logTake(user, 0);
    await user.click(screen.getAllByRole('button', { name: 'PU' })[0]);
    await user.click(screen.getAllByRole('button', { name: 'PU' })[0]);

    expect(currentProject().takes?.map((entry) => [entry.slateTag, entry.takeNumber])).toEqual([
      [undefined, 1],
      ['PU', 1],
      ['PU', 2],
    ]);
  });

  /**
   * Regression: the field showed the stored array rejoined on every keystroke,
   * so typing "Laptop," split to ["Laptop"], rejoined to "Laptop", and the
   * comma vanished as fast as it was typed. Only one keyword was ever enterable.
   */
  it('keeps the comma while typing several keywords', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());
    await logTake(user);

    const field = screen.getByPlaceholderText<HTMLInputElement>('Keywords, comma separated');
    await user.type(field, 'Laptop, John');

    expect(field.value).toBe('Laptop, John');
    expect(currentProject().takes?.[0].keywords).toEqual(['Laptop', 'John']);
  });

  it('carries the roll card to the next take but never the good-take flag', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());

    await logTake(user);
    await user.type(screen.getByPlaceholderText('Card'), 'A001');
    await user.click(screen.getByTitle('Mark as a good take'));
    await logTake(user);

    const takes = currentProject().takes ?? [];
    expect(takes).toHaveLength(2);
    expect(takes[1].rollCard).toBe('A001');
    // Per-take facts must start blank: a NG take inheriting "good" is a lie
    // that survives into the grade.
    expect(takes[1].isGoodTake).toBeUndefined();
    expect(takes[1].comments).toBeUndefined();
  });

  /** Three states, not two — "not judged yet" is not the same as NG. */
  it('toggles the good-take flag back to unjudged rather than to NG', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());
    await logTake(user);

    await user.click(screen.getByTitle('Mark as a good take'));
    expect(currentProject().takes?.[0].isGoodTake).toBe(true);

    await user.click(screen.getByTitle('Mark as a good take'));
    expect(currentProject().takes?.[0].isGoodTake).toBeUndefined();

    await user.click(screen.getByTitle('Mark as NG'));
    expect(currentProject().takes?.[0].isGoodTake).toBe(false);
  });
});

describe('ContinuityPanel — checklist', () => {
  it('reports the wrap gaps and clears a shot once it has a good take', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());

    expect(screen.getByText(/Not shot: 1\/1, 1\/2, 1\/3/)).toBeTruthy();

    await logTake(user, 0);
    await user.click(screen.getByTitle('Mark as a good take'));

    // 1/1 is covered, so it leaves both gap lists; the other two remain.
    expect(screen.getByText(/Not shot: 1\/2, 1\/3/)).toBeTruthy();
    expect(screen.queryByText(/No good base take: 1\/1/)).toBeNull();
  });

  /**
   * Regression: the day schedules the whole setup, so an unplanned shot added to that
   * setup was resolved as "planned" — and the checklist stopped being able to
   * say which shot was actually missed.
   */
  it('keeps an unplanned shot out of the plan and lists it separately', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());

    await user.click(screen.getByTitle(/^Add an unplanned shot to scene/));

    // Numbered in the scene's own convention, and nothing planned was renumbered.
    const shots = currentProject().setups[0].shots;
    expect(shots.map((s) => s.shotNumber)).toEqual(['1/1', '1/2', '1/3', '1/4']);
    expect(shots[3].unplanned).toBe(true);

    // The plan is still three shots, and the miss is still reported.
    expect(screen.getByText('Shot but not planned')).toBeTruthy();
    expect(screen.getByText(/Not shot: 1\/1, 1\/2, 1\/3/)).toBeTruthy();
  });

  it('creates a separate lettered insert shot after an existing shot', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());

    await user.click(screen.getByTitle('Add a separate unplanned shot after 1/1'));

    const shots = currentProject().setups[0].shots;
    expect(shots.map((entry) => entry.shotNumber)).toEqual(['1/1', '1/1A', '1/2', '1/3']);
    expect(shots.map((entry) => entry.order)).toEqual([0, 1, 2, 3]);
    expect(shots[1].unplanned).toBe(true);
    expect(currentProject().takes?.[0].shotId).toBe(shots[1].id);
  });

  /**
   * Adding the shot and logging its first take are one user action, so they
   * must be one state update — the earlier two-call version dropped the first
   * write, because the second read a stale project.
   */
  it('creates the unplanned shot and its first take together', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());

    await user.click(screen.getByTitle(/^Add an unplanned shot to scene/));

    const project = currentProject();
    expect(project.setups[0].shots).toHaveLength(4);
    expect(project.takes).toHaveLength(1);
    expect(project.takes?.[0].shotId).toBe(project.setups[0].shots[3].id);
  });
});

describe('ContinuityPanel — as-shot values', () => {
  /**
   * The plan is a placeholder, never a stored value: what the user types wins,
   * and clearing it falls back to the plan again rather than exporting a blank.
   */
  it('shows the planned lens as a placeholder and overrides it with what was shot', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());
    await logTake(user);
    await openDetails(user);

    const focal = screen.getByLabelText<HTMLInputElement>('Focal Point (mm)');
    expect(focal.placeholder).toBe('35mm');
    expect(focal.value).toBe('');

    await user.type(focal, '85');
    expect(currentProject().takes?.[0].cameraOverrides?.focalMm).toBe(85);

    await user.clear(focal);
    // Cleared means "as planned" — the override is removed, not stored empty.
    expect(currentProject().takes?.[0].cameraOverrides?.focalMm).toBeUndefined();
  });

  it('writes the production company to the project, not to a private copy', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());

    await user.type(screen.getByLabelText('Production company'), 'LAM');
    expect(currentProject().productionCompany).toBe('LAM');
  });

  /**
   * The crew list is the single source for a role somebody holds; the typed
   * name is only a fallback for a role nobody does.
   */
  it('locks a crew field when the crew list fills the role', async () => {
    const withCrew = dayProject();
    withCrew.people = [
      { id: 'p1', displayName: 'Alex Kim', role: 'Sound Mixer' },
    ] as Project['people'];
    renderWithProject(<ContinuityPanel />, withCrew);

    const mixer = screen.getByLabelText<HTMLInputElement>('Sound mixer');
    expect(mixer.readOnly).toBe(true);
    expect(mixer.value).toBe('Alex Kim');
    // Nobody holds script supervisor, so that one stays typeable.
    expect(screen.getByLabelText<HTMLInputElement>('Script supervisor').readOnly).toBe(false);
  });
});

describe('ContinuityPanel — file-name reconciliation', () => {
  /**
   * Drift is the whole point of the pass: a log that slips by one clip would
   * otherwise attach every later row to the wrong clip in Resolve, silently.
   */
  it('surfaces drift instead of matching past it', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());
    await logTake(user, 0);
    await logTake(user, 1);

    const listing = screen.getByPlaceholderText(/A001C001/);
    await user.type(listing, 'A001C001.mov');
    await user.click(screen.getByRole('button', { name: /Match/ }));

    expect(screen.getByText(/1 matched/)).toBeTruthy();
    expect(screen.getByText(/take\(s\) without a file/)).toBeTruthy();
  });

  it('applies matched names to the takes in order', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());
    await logTake(user, 0);
    await logTake(user, 1);

    const listing = screen.getByPlaceholderText(/A001C001/);
    await user.type(listing, 'A001C001.mov{Enter}A001C002.mov');
    await user.click(screen.getByRole('button', { name: /Match/ }));
    await user.click(screen.getByRole('button', { name: /Apply to 2 take/ }));

    expect((currentProject().takes ?? []).map((t) => t.fileName)).toEqual([
      'A001C001.mov',
      'A001C002.mov',
    ]);
  });
});

describe('ContinuityPanel — export', () => {
  it('asks the print studio for the continuity section', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());
    await user.click(screen.getByRole('button', { name: 'Print' }));
    expect(exportsOpened()).toContain('continuity');
  });
});

/**
 * The sound half of the log. These fields exist so the sound report can be
 * anything other than the camera report with different column headings — see
 * `domain/continuity/setReports.ts` for why the two documents disagree.
 */
describe('ContinuityPanel — sound', () => {
  it('records a sound roll separately from the camera card', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());
    await logTake(user);

    await user.type(screen.getByPlaceholderText('Card'), 'A001');
    await openDetails(user);
    await user.type(screen.getByPlaceholderText('S01'), 'S03');

    const take = currentProject().takes?.[0];
    expect(take?.rollCard).toBe('A001');
    expect(take?.soundRoll).toBe('S03');
  });

  it('carries the sound roll to the next take, like the camera card', async () => {
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());
    await logTake(user);
    await openDetails(user);
    await user.type(screen.getByPlaceholderText('S01'), 'S03');

    await logTake(user);

    expect(currentProject().takes?.[1].soundRoll).toBe('S03');
  });

  it('never carries MOS forward', async () => {
    // Carrying it would mark the next take silent and send an assistant
    // looking for audio that was in fact recorded.
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());
    await logTake(user);
    await openDetails(user);
    await user.click(screen.getByLabelText(/MOS/));

    await logTake(user);

    expect(currentProject().takes?.[0].mos).toBe(true);
    expect(currentProject().takes?.[1].mos).toBeUndefined();
  });

  it('clears wild track when MOS is set, and the other way round', async () => {
    // Picture with no sound and sound with no picture; a take cannot be both,
    // and one that claimed to be would appear on the camera report as MOS and
    // be excluded from it as a wild track at the same time.
    const user = userEvent.setup();
    renderWithProject(<ContinuityPanel />, dayProject());
    await logTake(user);
    await openDetails(user);

    await user.click(screen.getByLabelText(/Wild track/));
    expect(currentProject().takes?.[0].wildTrack).toBe(true);

    await user.click(screen.getByLabelText(/MOS/));
    const take = currentProject().takes?.[0];
    expect(take?.mos).toBe(true);
    expect(take?.wildTrack).toBeUndefined();
  });
});
