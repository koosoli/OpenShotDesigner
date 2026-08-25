import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';
import { migrateV27ToV28 } from '../migrations/v27-to-v28';

type Loose = Record<string, unknown>;

const v27Fixture = (budget: unknown, extra: Loose = {}) => ({
  schemaVersion: 27,
  title: 'Actuals migration test',
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
  budget,
  ...extra,
});

const budgetOf = (project: unknown): Loose =>
  (project as { budget: Loose }).budget;

describe('migrateV27ToV28', () => {
  it('stamps the version and leaves a budget with no ledger alone', () => {
    const after = migrateV27ToV28(
      v27Fixture({ settings: { currency: 'EUR', defaultVatPercent: 17, weekDays: 5 }, lines: [], equipmentRates: [] }) as never,
    );
    expect(after.schemaVersion).toBe(28);
    expect('actuals' in budgetOf(after)).toBe(false);
  });

  /** An empty ledger is "nothing logged", which is honest; zero would claim
   * a comparison nobody made. */
  it('does not invent an empty actuals array', () => {
    const after = migrateV27ToV28(
      v27Fixture({ settings: { currency: 'EUR', defaultVatPercent: 17, weekDays: 5 }, lines: [], equipmentRates: [] }) as never,
    );
    expect(budgetOf(after).actuals).toBeUndefined();
  });

  it('keeps actuals that are already recorded', () => {
    const actuals = [{ id: 'a1', category: 'catering', label: 'Craft services day 1', amount: 84.5 }];
    const after = migrateV27ToV28(
      v27Fixture({ settings: { currency: 'EUR', defaultVatPercent: 17, weekDays: 5 }, lines: [], equipmentRates: [], actuals }) as never,
    );
    expect(budgetOf(after).actuals).toEqual(actuals);
  });

  it('is lossless and deterministic across the whole chain from v27', () => {
    const raw = v27Fixture({
      settings: { currency: 'EUR', defaultVatPercent: 17, weekDays: 5 },
      lines: [{ id: 'l1', category: 'location', label: 'Location fee', amount: 500, basis: 'flat' }],
      equipmentRates: [],
    });
    const first = migrateProject(structuredClone(raw));
    const second = migrateProject(structuredClone(raw));

    expect(first.project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(first.migratedFrom).toBe(27);
    expect(second.project).toEqual(first.project);
    expect((budgetOf(first.project).lines as Loose[])[0].label).toBe('Location fee');
    expect(first.project.title).toBe('Actuals migration test');
  });
});
