import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';
import { migrateV28ToV29 } from '../migrations/v28-to-v29';

type Loose = Record<string, unknown>;

const v28Fixture = (actuals: unknown[] | undefined, extra: Loose = {}) => ({
  schemaVersion: 28,
  title: 'Entry link migration test',
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
  budget: {
    settings: { currency: 'EUR', defaultVatPercent: 17, weekDays: 5 },
    lines: [],
    equipmentRates: [],
    ...(actuals ? { actuals } : {}),
  },
  ...extra,
});

describe('migrateV28ToV29', () => {
  it('stamps the version', () => {
    expect(migrateV28ToV29(v28Fixture(undefined) as never).schemaVersion).toBe(29);
  });

  /** Guessing a line from category would put somebody's catering bill on
   * Alex's row. Absent stays absent. */
  it('does not invent an attachment for existing actuals', () => {
    const after = migrateProject(
      v28Fixture([{ id: 'a1', category: 'catering', label: 'Crafty', amount: 84 }]) as never,
    ).project as unknown as Loose;
    const actuals = (after.budget as Loose).actuals as Loose[];
    expect('entryId' in actuals[0]).toBe(false);
  });

  it('keeps an attachment that is already recorded and is deterministic', () => {
    const raw = v28Fixture([
      { id: 'a1', category: 'cast', label: 'Alex renegotiation', amount: 300, entryId: 'person:alex' },
    ]);
    const first = migrateProject(structuredClone(raw));
    const second = migrateProject(structuredClone(raw));
    expect(first.project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(first.migratedFrom).toBe(28);
    expect(second.project).toEqual(first.project);
    const budget = (first.project as unknown as Loose).budget as Loose;
    expect(((budget.actuals as Loose[])[0] as Loose).entryId).toBe('person:alex');
  });
});
