import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';
import { migrateV24ToV25 } from '../migrations/v24-to-v25';

type Loose = Record<string, unknown>;

const v24Fixture = (customEquipment: unknown[] = [], extra: Loose = {}) => ({
  schemaVersion: 24,
  title: 'Fixture mode migration test',
  director: '',
  cinematographer: '',
  date: '2026-08-25',
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
      customEquipment,
    },
  ],
  ...extra,
});

const equipmentOf = (project: unknown) =>
  (project as { setups: Array<{ customEquipment: Loose[] }> }).setups[0].customEquipment;

describe('migrateV24ToV25', () => {
  it('stamps the version and adds nothing to a project with no gear', () => {
    const after = migrateV24ToV25(v24Fixture() as never);
    expect(after.schemaVersion).toBe(25);
    expect(equipmentOf(after)).toEqual([]);
  });

  /**
   * A row naming an ARRI L7-C says which fixture is in the truck, not which of
   * its fifteen personalities the board is patched to. Writing the first mode
   * in would invent a channel count nobody set — and on a patch sheet a wrong
   * footprint reads exactly like a right one.
   */
  it('does not infer a personality from a linked fixture profile', () => {
    const after = migrateV24ToV25(
      v24Fixture([
        { id: 'gear-1', category: 'lighting', name: 'Key', quantity: 1, fixtureProfileId: 'arri-l7-c' },
      ]) as never,
    );
    expect(equipmentOf(after)[0].fixtureProfileId).toBe('arri-l7-c');
    expect('fixtureModeId' in equipmentOf(after)[0]).toBe(false);
  });

  it('keeps a personality that is already recorded', () => {
    const after = migrateV24ToV25(
      v24Fixture([
        {
          id: 'gear-1',
          category: 'lighting',
          name: 'Key',
          quantity: 1,
          fixtureProfileId: 'arri-l7-c',
          fixtureModeId: 'p02-cct-8bit',
        },
      ]) as never,
    );
    expect(equipmentOf(after)[0].fixtureModeId).toBe('p02-cct-8bit');
  });

  /**
   * A stale id is the only record of what was chosen while the profile still
   * existed. Readers resolve it against the live catalogue and report an
   * unknown footprint; rewriting it here would destroy that record.
   */
  it('leaves an id whose profile has since been deleted exactly as written', () => {
    const after = migrateV24ToV25(
      v24Fixture([
        {
          id: 'gear-1',
          category: 'lighting',
          name: 'Key',
          quantity: 1,
          fixtureProfileId: 'a-profile-that-was-deleted',
          fixtureModeId: 'a-mode-that-no-longer-exists',
        },
      ]) as never,
    );
    expect(equipmentOf(after)[0]).toMatchObject({
      fixtureProfileId: 'a-profile-that-was-deleted',
      fixtureModeId: 'a-mode-that-no-longer-exists',
    });
  });

  it('is lossless and deterministic across the whole chain from v24', () => {
    const raw = v24Fixture([
      { id: 'gear-1', category: 'lighting', name: 'Key', quantity: 1, notes: 'hand-typed' },
    ]);
    const first = migrateProject(structuredClone(raw));
    const second = migrateProject(structuredClone(raw));

    expect(first.project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(first.migratedFrom).toBe(24);
    expect(second.project).toEqual(first.project);
    expect(equipmentOf(first.project)[0].notes).toBe('hand-typed');
    expect(first.project.title).toBe('Fixture mode migration test');
  });
});
