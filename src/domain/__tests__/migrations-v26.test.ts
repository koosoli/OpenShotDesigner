import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';
import { migrateV25ToV26 } from '../migrations/v25-to-v26';

type Loose = Record<string, unknown>;

const v25Fixture = (containers: unknown[] = [], extra: Loose = {}) => ({
  schemaVersion: 25,
  title: 'Journey migration test',
  director: '',
  cinematographer: '',
  date: '2026-08-26',
  activeSetupId: 'setup-1',
  setups: [
    {
      id: 'setup-1',
      name: 'S',
      sceneNumber: '1',
      location: 'INT. ROOM',
      timeOfDay: 'Day INT',
      elements: [] as unknown[],
      shots: [] as unknown[],
    },
  ],
  logisticsContainers: containers,
  ...extra,
});

const containersOf = (project: unknown) =>
  (project as { logisticsContainers: Loose[] }).logisticsContainers;

describe('migrateV25ToV26', () => {
  it('stamps the version and adds nothing to a project with no containers', () => {
    const after = migrateV25ToV26(v25Fixture() as never);
    expect(after.schemaVersion).toBe(26);
    expect(containersOf(after)).toEqual([]);
  });

  /**
   * Absent means nobody has marked it — a different fact from "packed".
   * Assuming packed would hide exactly the case everyone forgot about; the
   * day report prints "not marked" instead.
   */
  it('does not invent a journey stage for a routed container', () => {
    const after = migrateV25ToV26(
      v25Fixture([
        { id: 'c-1', kind: 'case', name: 'Camera build' },
      ]) as never,
    );
    expect('journey' in containersOf(after)[0]).toBe(false);
  });

  it('does not infer a stage from a routed shoot day either', () => {
    const after = migrateV25ToV26(
      v25Fixture([
        { id: 'c-1', kind: 'truck', name: 'Grip truck', productionDayId: 'day-1' },
      ]) as never,
    );
    expect('journey' in containersOf(after)[0]).toBe(false);
  });

  it('keeps a journey that is already recorded', () => {
    const after = migrateV25ToV26(
      v25Fixture([
        { id: 'c-1', kind: 'case', name: 'Media', journey: 'delivered' },
      ]) as never,
    );
    expect(containersOf(after)[0].journey).toBe('delivered');
  });

  it('is lossless and deterministic across the whole chain from v25', () => {
    const raw = v25Fixture([{ id: 'c-1', kind: 'case', name: 'Expendables', notes: 'restock' }]);
    const first = migrateProject(structuredClone(raw));
    const second = migrateProject(structuredClone(raw));

    expect(first.project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(first.migratedFrom).toBe(25);
    expect(second.project).toEqual(first.project);
    expect((containersOf(first.project)[0] as Loose).notes).toBe('restock');
    expect(first.project.title).toBe('Journey migration test');
  });
});
