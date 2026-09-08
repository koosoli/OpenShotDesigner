/**
 * Scale budgets: what the app must still do on a feature-length project.
 *
 * The audit flagged the absence of list virtualisation as a risk and, honestly,
 * as an unmeasured one — there was no project in the repo big enough to tell
 * whether it mattered. Guessing in either direction is expensive: adding
 * virtualisation costs in-page search, printing and keyboard navigation, and
 * not adding it costs a producer their afternoon.
 *
 * So this measures instead. A feature is roughly 800–1500 shots across 30–50
 * shooting days with several hundred pieces of gear; the fixture below builds
 * one of those and puts a wall-clock budget on the derivations that every
 * panel runs on each render.
 *
 * The budgets are deliberately loose — several times the observed cost on a
 * developer laptop, and CI runners are slower and noisier than that. They are
 * not benchmarks and must never be tuned down to whatever the last run
 * produced. They exist to catch a change in COMPLEXITY: an accidental O(n²)
 * lookup inside a map over shots turns 40ms into 40 seconds and fails here
 * loudly, while ordinary drift stays quiet.
 */
import { describe, expect, it } from 'vitest';
import type { Project, SceneSetup, Shot } from '../../types';
import { makeActor, makeCamera, makeProject, makeSetup, makeShot } from './fixtures';
import { deriveSceneEquipment } from '../equipmentList';
import { validateProject } from '../../domain/validation';
import { buildIntegrityReport } from '../../domain/integrityReport';

const SCENES = 40;
const SHOTS_PER_SCENE = 25;
/** 1.000 shots — the top end of a feature, and a round number to reason about. */
const TOTAL_SHOTS = SCENES * SHOTS_PER_SCENE;

/**
 * A feature-sized project: 40 scenes, 1.000 shots, ~320 plan elements.
 *
 * Built once per test file rather than per test — construction is not what is
 * being measured, and rebuilding it eight times would dominate the runtime.
 */
const featureProject = (): Project => {
  const setups: SceneSetup[] = [];
  for (let scene = 0; scene < SCENES; scene += 1) {
    const cameras = [makeCamera({ id: `cam-${scene}-a` }), makeCamera({ id: `cam-${scene}-b` })];
    // Actors rather than lights only because the fixture helpers offer them;
    // what this file measures is element COUNT per scene, not element kind.
    const performers = [
      makeActor({ id: `actor-${scene}-a`, characterLetter: 'A' }),
      makeActor({ id: `actor-${scene}-b`, characterLetter: 'B' }),
      makeActor({ id: `actor-${scene}-c`, characterLetter: 'C' }),
    ];
    const shots: Shot[] = [];
    for (let index = 0; index < SHOTS_PER_SCENE; index += 1) {
      shots.push(
        makeShot({
          id: `shot-${scene}-${index}`,
          sceneNumber: String(scene + 1),
          shotNumber: `${scene + 1}/${index + 1}`,
          name: `Shot ${index + 1}`,
          cameraId: cameras[index % 2].id,
          order: index + 1,
        }),
      );
    }
    setups.push(
      makeSetup({
        id: `setup-${scene}`,
        name: `Scene ${scene + 1}`,
        sceneNumber: String(scene + 1),
        elements: [...cameras, ...performers],
        shots,
      }),
    );
  }
  return makeProject(setups);
};

const project = featureProject();

/** Wall-clock cost of `run`, taking the best of a few passes to shed scheduler noise. */
const millisecondsFor = (run: () => unknown, passes = 3): number => {
  let best = Infinity;
  for (let pass = 0; pass < passes; pass += 1) {
    const started = performance.now();
    run();
    best = Math.min(best, performance.now() - started);
  }
  return best;
};

describe('feature-sized project — shape', () => {
  it('really is feature-sized, so the budgets below mean something', () => {
    const shots = project.setups.flatMap((setup) => setup.shots ?? []);
    expect(shots).toHaveLength(TOTAL_SHOTS);
    expect(project.setups).toHaveLength(SCENES);
    expect(project.setups.flatMap((setup) => setup.elements)).toHaveLength(SCENES * 5);
  });

  it('keeps every shot number unique across the whole production', () => {
    // Not a performance property, but the one that breaks first when a
    // renumbering routine is given a project this size.
    const numbers = project.setups.flatMap((setup) =>
      (setup.shots ?? []).map((shot) => shot.shotNumber),
    );
    expect(new Set(numbers).size).toBe(TOTAL_SHOTS);
  });
});

describe('feature-sized project — derivation budgets', () => {
  it('flattens every shot in the production well under a frame', () => {
    const elapsed = millisecondsFor(() =>
      project.setups.flatMap((setup) => setup.shots ?? []),
    );
    expect(elapsed).toBeLessThan(50);
  });

  it('derives a scene equipment list without scanning the whole project', () => {
    // Runs on every render of the gear panel and the equipment count badge.
    const elapsed = millisecondsFor(() => deriveSceneEquipment(project.setups[0]));
    expect(elapsed).toBeLessThan(50);
  });

  it('validates the whole project in a workable time', () => {
    const elapsed = millisecondsFor(() => validateProject(project), 1);
    expect(elapsed).toBeLessThan(2000);
  });

  it('builds the integrity report in a workable time', () => {
    // The report cross-references shots, setups and elements; a naive nested
    // lookup here is exactly the O(n²) this file is watching for.
    const elapsed = millisecondsFor(() => buildIntegrityReport(project), 1);
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('feature-sized project — the operations users repeat', () => {
  /**
   * Lookups a panel performs per rendered row. At 1.000 rows, anything that
   * scans the full shot list per row is quadratic — the failure mode that
   * makes a big project feel broken rather than merely slow.
   */
  it('resolves a camera for every shot in linear time', () => {
    const elapsed = millisecondsFor(() => {
      const cameras = new Map(
        project.setups.flatMap((setup) => setup.elements).map((element) => [element.id, element]),
      );
      return project.setups
        .flatMap((setup) => setup.shots ?? [])
        .map((shot) => cameras.get(shot.cameraId));
    });
    expect(elapsed).toBeLessThan(100);
  });

  it('sorts the full shot list repeatedly without falling over', () => {
    const shots = project.setups.flatMap((setup) => setup.shots ?? []);
    const elapsed = millisecondsFor(() =>
      [...shots].sort((a, b) => a.shotNumber.localeCompare(b.shotNumber)),
    );
    expect(elapsed).toBeLessThan(500);
  });

  it('serialises the project for autosave in a workable time', () => {
    // Autosave runs this on a debounce while the user types. If it costs
    // seconds at this size, the app stutters on every keystroke.
    const elapsed = millisecondsFor(() => JSON.stringify(project), 1);
    expect(elapsed).toBeLessThan(1000);
  });

  it('produces a project small enough to keep autosaving', () => {
    const bytes = JSON.stringify(project).length;
    // No media here — this is structured data only. A feature's shot and
    // scene data must stay far below the ~5MB localStorage ceiling, or
    // autosave starts failing on projects that have not done anything wrong.
    expect(bytes).toBeLessThan(4_000_000);
  });
});
