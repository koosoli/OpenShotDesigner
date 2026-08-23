/**
 * How the derivations behave on a production-sized project.
 *
 * Not a benchmark. The budgets below are deliberately an order of magnitude
 * looser than what these functions actually take, because a test that measures
 * speed on shared CI hardware fails for reasons that have nothing to do with
 * the change under review, and a flaky gate is one people learn to ignore.
 *
 * What they catch is the shape of the cost, not its size: an accidental
 * quadratic. Most of these derivations walk a collection and look something up
 * per item, and the natural way to write that lookup is `array.find` — correct,
 * invisible on the ten-shot example project, and ruinous on a feature film. The
 * project built here is roughly a small feature: 60 setups, 12 shots each, a
 * take per shot and a scheduled day per setup.
 */
import { describe, expect, it } from 'vitest';
import { cloneProjectWithNewIds } from '../clone';
import { dayChecklist, exportResolveCsv, takesForDay } from '../continuity';
import { migrateProject } from '../migrations';
import type { Project } from '../../types';
import type { Take } from '../continuity';

const SETUPS = 60;
const SHOTS_PER_SETUP = 12;
const TOTAL_SHOTS = SETUPS * SHOTS_PER_SETUP;

const buildLargeProject = (): Project => {
  const setups = [];
  const takes: Take[] = [];
  const productionDays = [];
  const scheduleBlocks = [];

  for (let s = 0; s < SETUPS; s += 1) {
    const setupId = `setup-${s}`;
    const shots = [];
    for (let i = 0; i < SHOTS_PER_SETUP; i += 1) {
      const shotId = `shot-${s}-${i}`;
      shots.push({
        id: shotId,
        sceneNumber: `${s + 1}`,
        shotNumber: `${s + 1}/${i + 1}`,
        name: `Shot ${i + 1}`,
        cameraId: `cam-${s}`,
        cameraLabel: 'A',
        shotSize: 'MS',
        lensMm: 35,
        cameraAngle: 'Eye Level',
        movement: 'Static',
        aspectRatio: '16:9',
        frameRate: 24,
        subjectActorIds: [],
        framingDescription: 'Coverage',
        status: 'planned',
        takesCount: 0,
        estDurationSeconds: 20,
        order: i + 1,
      });
      takes.push({
        id: `take-${s}-${i}`,
        shotId,
        productionDayId: `day-${s}`,
        takeNumber: 1,
        fileName: `A001C${String(s * SHOTS_PER_SETUP + i).padStart(4, '0')}.mov`,
        isGoodTake: i % 3 !== 0,
      });
    }

    setups.push({
      id: setupId,
      name: `Setup ${s + 1}`,
      sceneNumber: `${s + 1}`,
      location: 'INT. ROOM',
      timeOfDay: 'Day INT',
      elements: [
        { id: `cam-${s}`, type: 'camera', cameraLabel: 'A', x: 0, y: 0, rotation: 0 },
        { id: `actor-${s}`, type: 'actor', x: 10, y: 10, rotation: 0 },
      ],
      shots,
    });
    productionDays.push({
      id: `day-${s}`,
      name: `Day ${s + 1}`,
      date: '2026-09-14',
      scheduleBlockIds: [`block-${s}`],
    });
    scheduleBlocks.push({ id: `block-${s}`, kind: 'setup', setupId });
  }

  return {
    id: 'large-project',
    title: 'Feature-sized',
    director: 'A Director',
    cinematographer: 'A DP',
    date: '2026-09-14',
    activeSetupId: 'setup-0',
    setups,
    takes,
    productionDays,
    scheduleBlocks,
  } as unknown as Project;
};

/** Run `fn` and return how long it took, in milliseconds. */
const timed = (fn: () => unknown): number => {
  const started = performance.now();
  fn();
  return performance.now() - started;
};

describe(`a project with ${TOTAL_SHOTS} shots`, () => {
  const project = buildLargeProject();

  it('builds the fixture the test assumes', () => {
    expect(project.setups).toHaveLength(SETUPS);
    expect(project.takes).toHaveLength(TOTAL_SHOTS);
  });

  it('exports the full continuity CSV without a quadratic blowup', () => {
    const elapsed = timed(() =>
      exportResolveCsv(project.takes ?? [], {
        productionCompany: 'Test',
        title: project.title,
        director: project.director,
        cinematographer: project.cinematographer,
        setups: project.setups,
        productionDays: project.productionDays,
      }),
    );
    // ~4ms in practice. The budget is ~50x that: loose enough to survive a
    // loaded CI box, tight enough that reintroducing a per-take scan over every
    // setup — which is what this used to do — trips it.
    expect(elapsed).toBeLessThan(250);
  });

  it('produces a correct CSV at that size, not merely a fast one', () => {
    const csv = exportResolveCsv(project.takes ?? [], {
      title: project.title,
      setups: project.setups,
      productionDays: project.productionDays,
    });
    // Header plus one row per take, and a trailing newline.
    expect(csv.trimEnd().split('\r\n')).toHaveLength(TOTAL_SHOTS + 1);
  });

  it('derives a day checklist quickly', () => {
    const elapsed = timed(() =>
      dayChecklist(
        ['block-0'],
        project.scheduleBlocks ?? [],
        { setups: project.setups },
        project.takes ?? [],
        'day-0',
      ),
    );
    // ~1ms in practice, since the shots and takes are indexed once.
    expect(elapsed).toBeLessThan(250);
  });

  it('scopes a day of takes quickly', () => {
    const elapsed = timed(() => takesForDay(project.takes ?? [], 'day-30'));
    expect(elapsed).toBeLessThan(100);
  });

  it('duplicates the whole project quickly, and completely', () => {
    let clone: Project | undefined;
    const elapsed = timed(() => {
      clone = cloneProjectWithNewIds(project);
    });
    // ~3ms in practice.
    expect(elapsed).toBeLessThan(500);
    expect(clone?.setups).toHaveLength(SETUPS);
    expect(clone?.takes).toHaveLength(TOTAL_SHOTS);
    // Every take still points at a shot that exists in the copy.
    const shotIds = new Set(clone!.setups.flatMap((setup) => setup.shots.map((shot) => shot.id)));
    expect((clone!.takes ?? []).every((take) => shotIds.has(take.shotId))).toBe(true);
  });

  it('migrates a project of this size quickly', () => {
    const legacy = { ...(project as unknown as Record<string, unknown>), schemaVersion: 20 };
    const elapsed = timed(() => migrateProject(legacy));
    expect(elapsed).toBeLessThan(500);
  });
});
