import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';
import { migrateV20ToV21, normalizeBudget, normalizeRotation } from '../migrations/v20-to-v21';

const v20Fixture = () => ({
  schemaVersion: 20,
  title: 'Budget & tilt test',
  director: '',
  cinematographer: '',
  date: '2026-08-23',
  activeSetupId: 'setup-1',
  setups: [{ id: 'setup-1', name: 'S', sceneNumber: '1', elements: [] as unknown[] }],
  people: [
    { id: 'p1', displayName: 'Ines', kind: 'crew', headshotFraming: { x: 40, y: 60, zoom: 1.5 } },
  ],
});

type Loose = Record<string, unknown>;
const peopleOf = (project: unknown) => (project as { people: Loose[] }).people;

describe('normalizeRotation', () => {
  it('wraps into a half turn each way and rejects non-numbers', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(370)).toBe(10);
    expect(normalizeRotation(-190)).toBe(170);
    expect(normalizeRotation(-180)).toBe(180);
    expect(normalizeRotation('sideways')).toBeUndefined();
    expect(normalizeRotation(NaN)).toBeUndefined();
  });
});

describe('normalizeBudget', () => {
  it('falls back field by field to the Luxembourg defaults', () => {
    expect(normalizeBudget({})).toEqual({ settings: { currency: 'EUR', defaultVatPercent: 17, weekDays: 5 }, lines: [], equipmentRates: [] });
    expect(normalizeBudget({ settings: { currency: 'chf', defaultVatPercent: 8.1, weekDays: 6.4, contingencyPercent: 10 } })?.settings).toEqual({
      currency: 'CHF',
      defaultVatPercent: 8.1,
      weekDays: 6,
      contingencyPercent: 10,
    });
  });

  it('drops rates and lines the budget could not price, and repairs the rest', () => {
    const budget = normalizeBudget({
      equipmentRates: [
        { key: 'grip::dolly', amount: 300, basis: 'flat' },
        { key: '', amount: 10, basis: 'day' },
        { key: 'camera::alexa', amount: 'lots', basis: 'day' },
      ],
      lines: [
        { id: 'l1', category: 'snacks', label: 'Fruit', amount: 20, basis: 'hour', vatPercent: -3, units: 4, quantity: 0 },
        { amount: 50, basis: 'day' },
        'nonsense',
      ],
    }) as { equipmentRates: Loose[]; lines: Loose[] };
    expect(budget.equipmentRates).toEqual([{ key: 'grip::dolly', amount: 300, basis: 'flat', id: 'equipment-rate-migrated-0', label: 'grip::dolly' }]);
    expect(budget.lines).toEqual([
      { id: 'l1', category: 'other', label: 'Fruit', amount: 20, basis: 'day', units: 4 },
      { id: 'budget-line-migrated-1', category: 'other', label: '', amount: 50, basis: 'day' },
    ]);
  });
});

describe('migrateV20ToV21', () => {
  it('stamps the version and leaves a plain project untouched otherwise', () => {
    const before = v20Fixture();
    const after = migrateV20ToV21(before as never);
    expect(after.schemaVersion).toBe(21);
    expect(peopleOf(after)[0]).toEqual({ id: 'p1', displayName: 'Ines', kind: 'crew', headshotFraming: { x: 40, y: 60, zoom: 1.5 } });
    expect('budget' in after).toBe(false);
    expect('sceneNumbersLocked' in after).toBe(false);
  });

  it('normalises a rotation, a rate card, a budget and the numbering flag that are present', () => {
    const before = {
      ...v20Fixture(),
      sceneNumbersLocked: 'yes',
      budget: { lines: [{ id: 'l1', category: 'catering', label: 'Lunch', amount: 15, basis: 'day' }] },
      people: [
        { id: 'p1', displayName: 'Ines', kind: 'crew', headshotFraming: { x: 50, y: 50, zoom: 1, rotation: 450 }, rateCard: { amount: 600, basis: 'weekly', vatPercent: 17 } },
        { id: 'p2', displayName: 'Tom', kind: 'crew', rateCard: { amount: 'tba' } },
      ],
    };
    const after = migrateV20ToV21(before as never) as unknown as Loose;
    const [ines, tom] = peopleOf(after);
    expect((ines.headshotFraming as Loose).rotation).toBe(90);
    expect(ines.rateCard).toEqual({ amount: 600, basis: 'day', vatPercent: 17 });
    expect('rateCard' in tom).toBe(false);
    expect((after.budget as Loose).settings).toEqual({ currency: 'EUR', defaultVatPercent: 17, weekDays: 5 });
    expect('sceneNumbersLocked' in after).toBe(false);
  });

  it('is reached by the migration chain and lands on the current version', () => {
    const { project, migratedFrom } = migrateProject(v20Fixture());
    expect(migratedFrom).toBe(20);
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(CURRENT_PROJECT_SCHEMA_VERSION).toBe(21);
  });
});

describe('location maps in v21', () => {
  it('keeps well-formed maps and drops the rest', () => {
    const before = {
      ...v20Fixture(),
      productionDays: [{ id: 'd1', name: 'Day 1', scheduleBlockIds: [], callSheet: { locationMaps: [
        { locationName: 'Studio', lat: 52.5, lng: 13.4, assetId: 'asset-a' },
        { locationName: '', lat: 1, lng: 1, assetId: 'asset-b' },
        { locationName: 'Nowhere', lat: 'x', lng: 1, assetId: 'asset-c' },
        'junk',
      ] } }],
    };
    const after = migrateV20ToV21(before as never) as unknown as { productionDays: Array<{ callSheet: Loose }> };
    expect(after.productionDays[0].callSheet.locationMaps).toEqual([
      { id: 'map-migrated-0', locationName: 'Studio', lat: 52.5, lng: 13.4, assetId: 'asset-a' },
    ]);
  });
  it('removes an empty list', () => {
    const before = { ...v20Fixture(), productionDays: [{ id: 'd1', name: 'Day 1', scheduleBlockIds: [], callSheet: { locationMaps: 'none' } }] };
    const after = migrateV20ToV21(before as never) as unknown as { productionDays: Array<{ callSheet: Loose }> };
    expect('locationMaps' in after.productionDays[0].callSheet).toBe(false);
  });
});
