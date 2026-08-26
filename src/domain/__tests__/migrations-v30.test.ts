import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';
import { migrateV29ToV30 } from '../migrations/v29-to-v30';

const fixture = (castAssignments: unknown[]) => ({
  schemaVersion: 29,
  title: 'Cast numbers',
  director: '',
  cinematographer: '',
  date: '2026-08-26',
  activeSetupId: 'setup-1',
  setups: [{ id: 'setup-1', name: 'S', sceneNumber: '1', location: '', timeOfDay: '', elements: [], shots: [] }],
  castAssignments,
});

describe('migrateV29ToV30', () => {
  it('assigns stable sequential numbers without changing assignment identity', () => {
    const raw = fixture([
      { id: 'ca-1', characterId: 'ch-1', personId: 'p-1' },
      { id: 'ca-2', characterId: 'ch-2', personId: 'p-2' },
    ]);
    const first = migrateProject(structuredClone(raw));
    const second = migrateProject(structuredClone(raw));
    expect(first.project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(first.project.castAssignments).toEqual([
      { id: 'ca-1', characterId: 'ch-1', personId: 'p-1', castNumber: 1 },
      { id: 'ca-2', characterId: 'ch-2', personId: 'p-2', castNumber: 2 },
    ]);
    expect(second.project).toEqual(first.project);
  });

  it('preserves valid numbers and repairs duplicate or invalid values', () => {
    const after = migrateV29ToV30(fixture([
      { id: 'a', characterId: 'a', personId: 'a', castNumber: 7 },
      { id: 'b', characterId: 'b', personId: 'b', castNumber: 7 },
      { id: 'c', characterId: 'c', personId: 'c', castNumber: 0 },
    ]) as never);
    expect(after.castAssignments?.map((entry) => entry.castNumber)).toEqual([7, 1, 2]);
  });
});
