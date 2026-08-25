import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';
import { migrateV26ToV27 } from '../migrations/v26-to-v27';

type Loose = Record<string, unknown>;

const v26Fixture = (people: unknown[] = [], extra: Loose = {}) => ({
  schemaVersion: 26,
  title: 'Availability migration test',
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
  people,
  ...extra,
});

const peopleOf = (project: unknown) => (project as { people: Loose[] }).people;

describe('migrateV26ToV27', () => {
  it('stamps the version and adds nothing to a project with no people', () => {
    const after = migrateV26ToV27(v26Fixture() as never);
    expect(after.schemaVersion).toBe(27);
    expect(peopleOf(after)).toEqual([]);
  });

  /** No ranges means "no availability typed in", which reads as always free. */
  it('does not invent availability for a person without it', () => {
    const after = migrateV26ToV27(
      v26Fixture([{ id: 'p-1', displayName: 'Sarah Cast' }]) as never,
    );
    expect('unavailableRanges' in peopleOf(after)[0]).toBe(false);
  });

  it('keeps ranges that are already recorded', () => {
    const ranges = [{ id: 'r-1', from: '2026-09-01', to: '2026-09-05', note: 'other job' }];
    const after = migrateV26ToV27(
      v26Fixture([{ id: 'p-1', displayName: 'Sarah Cast', unavailableRanges: ranges }]) as never,
    );
    expect(peopleOf(after)[0].unavailableRanges).toEqual(ranges);
  });

  it('is lossless and deterministic across the whole chain from v26', () => {
    const raw = v26Fixture([{ id: 'p-1', displayName: 'Crew One', phone: '+352 123456' }]);
    const first = migrateProject(structuredClone(raw));
    const second = migrateProject(structuredClone(raw));

    expect(first.project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(first.migratedFrom).toBe(26);
    expect(second.project).toEqual(first.project);
    expect((peopleOf(first.project)[0] as Loose).phone).toBe('+352 123456');
    expect(first.project.title).toBe('Availability migration test');
  });
});
