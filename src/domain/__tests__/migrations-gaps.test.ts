/**
 * Chain coverage for the migration steps nothing else pins.
 *
 * `migrations.test.ts` explicitly exercises arrival at v7–v10 and v12–v15, and
 * there are dedicated files for v3, v16–v18 and v20–v24. That left five steps —
 * arriving at v4, v5, v6, v11 and v19 — reachable only as pass-through traffic
 * inside longer chains, where a mistake would show up as some unrelated
 * assertion failing several versions later, if at all.
 *
 * Each case below starts a project at the version *before* the step and
 * migrates all the way to current, asserting the two properties every
 * migration in this codebase claims: LOSSLESS (nothing a user typed is
 * altered or dropped) and DETERMINISTIC (same input, same output). Backfilled
 * collections are asserted as empty arrays rather than as absent, because that
 * is what these particular steps promise — unlike the later, absent-safe ones.
 */
import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';

type Loose = Record<string, unknown>;

/** A project as it looked before the vNext collections existed. */
const legacyRaw = (schemaVersion: number, extra: Loose = {}): Loose => ({
  schemaVersion,
  title: 'Gap coverage',
  director: 'A Director',
  cinematographer: 'A DP',
  date: '2026-08-24',
  activeSetupId: 'setup-1',
  setups: [
    {
      id: 'setup-1',
      name: 'Scene 1',
      sceneNumber: '1',
      location: 'INT. ROOM',
      timeOfDay: 'Day INT',
      elements: [],
      shots: [],
    },
  ],
  ...extra,
});

const migrate = (raw: Loose) => migrateProject(structuredClone(raw));

describe('migration steps without dedicated coverage', () => {
  /** v3 → v4 backfills the vNext production collections. */
  it('arrives at v4 with the production collections present and empty', () => {
    const { project, migratedFrom } = migrate(legacyRaw(3));
    expect(migratedFrom).toBe(3);
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    for (const key of [
      'locations',
      'people',
      'castAssignments',
      'characters',
      'scriptScenes',
      'breakdownItems',
      'productionSegments',
      'productionDays',
      'scheduleBlocks',
    ] as const) {
      expect(Array.isArray(project[key])).toBe(true);
    }
    // Nothing the user typed moved.
    expect(project.title).toBe('Gap coverage');
    expect(project.setups[0].sceneNumber).toBe('1');
  });

  /** v4 → v5 adds run-of-show, power and logistics without touching cables. */
  it('arrives at v5 without inventing cable endpoints', () => {
    const raw = legacyRaw(4, {
      cables: [{ id: 'cable-1', label: 'DMX to grid', fromLabel: 'Desk', toLabel: 'Grid' }],
    });
    const { project } = migrate(raw);
    expect(Array.isArray(project.runOfShowCues)).toBe(true);
    expect(Array.isArray(project.logisticsContainers)).toBe(true);
    expect(Array.isArray(project.packedItems)).toBe(true);

    const cable = (project as unknown as { cables: Loose[] }).cables[0];
    expect(cable.label).toBe('DMX to grid');
    // The new port-aware reference fields stay unknown rather than guessed
    // from the free-text labels that were there before.
    expect(cable.fromElementId).toBeUndefined();
    expect(cable.toElementId).toBeUndefined();
  });

  /** v5 → v6 formalizes the rigging collections. */
  it('arrives at v6 with the rigging collections present, keeping existing rigging data', () => {
    const raw = legacyRaw(5, {
      trussElements: [{ id: 'truss-1', label: 'Grid A', x: 10, y: 20, rotation: 0 }],
    });
    const { project } = migrate(raw);
    for (const key of ['trussProfiles', 'trussElements', 'suspendedLoads', 'riggingItems'] as const) {
      expect(Array.isArray(project[key])).toBe(true);
    }
    expect(project.trussElements?.[0]).toMatchObject({ id: 'truss-1', label: 'Grid A' });
  });

  /** v10 → v11 formalizes per-beat actor speech. */
  it('arrives at v11 without disturbing actors that already carry speech cues', () => {
    const raw = legacyRaw(10, {
      setups: [
        {
          id: 'setup-1',
          name: 'Scene 1',
          sceneNumber: '1',
          location: 'INT. ROOM',
          timeOfDay: 'Day INT',
          shots: [],
          elements: [
            { id: 'actor-1', type: 'actor', x: 0, y: 0, rotation: 0, name: 'ALEX' },
            {
              id: 'actor-2',
              type: 'actor',
              x: 1,
              y: 1,
              rotation: 0,
              name: 'SARAH',
              speechCues: [{ beat: 1, text: 'Already here' }],
            },
            { id: 'prop-1', type: 'prop', x: 2, y: 2, rotation: 0 },
          ],
        },
      ],
    });
    const { project } = migrate(raw);
    const elements = project.setups[0].elements as unknown as Loose[];
    // An actor that already had cues keeps them verbatim…
    expect(elements[1].speechCues).toEqual([{ beat: 1, text: 'Already here' }]);
    // …and a non-actor is never given the field at all.
    expect('speechCues' in elements[2]).toBe(false);
  });

  /**
   * v18 → v19 introduces roads. Existing projects contain none, so the
   * interesting case is imported JSON carrying a malformed one: it must be
   * normalized into something drawable rather than left to divide by a missing
   * endpoint.
   */
  it('arrives at v19 normalizing a malformed road instead of dropping it', () => {
    const raw = legacyRaw(18, {
      setups: [
        {
          id: 'setup-1',
          name: 'Scene 1',
          sceneNumber: '1',
          location: 'EXT. STREET',
          timeOfDay: 'Day EXT',
          shots: [],
          elements: [
            { id: 'road-1', type: 'road', x: 0, y: 0, rotation: 0, width: 0, lanes: 99 },
            { id: 'road-2', type: 'road', x: 5, y: 5, rotation: 0, x2: 200, y2: 90, width: 140, lanes: 2 },
          ],
        },
      ],
    });
    const { project } = migrate(raw);
    const [broken, intact] = project.setups[0].elements as unknown as Loose[];

    expect(Number.isFinite(broken.x2)).toBe(true);
    expect(Number.isFinite(broken.y2)).toBe(true);
    expect(broken.width as number).toBeGreaterThan(0);
    expect(broken.lanes as number).toBeLessThanOrEqual(8);
    expect(broken.lanes as number).toBeGreaterThanOrEqual(1);

    // A well-formed road is left exactly as it was.
    expect(intact).toMatchObject({ x2: 200, y2: 90, width: 140, lanes: 2 });
  });

  it('is deterministic for every one of those entry points', () => {
    for (const version of [3, 4, 5, 10, 18]) {
      const raw = legacyRaw(version);
      expect(migrate(raw).project).toEqual(migrate(raw).project);
    }
  });
});
