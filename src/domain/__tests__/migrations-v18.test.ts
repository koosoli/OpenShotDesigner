import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';
import { migrateV17ToV18 } from '../migrations/v17-to-v18';

const v17Fixture = () => ({
  schemaVersion: 17,
  title: 'Light path test',
  director: '',
  cinematographer: '',
  date: '2026-08-22',
  activeSetupId: 'setup-1',
  setups: [
    {
      id: 'setup-1',
      name: 'Setup 1',
      sceneNumber: '1',
      elements: [
        { id: 'l1', type: 'light', x: 10, y: 20, rotation: 0, fixtureType: 'fresnel', colorTemp: 3200, intensity: 80, beamAngle: 35, throwDistance: 300 },
        { id: 'a1', type: 'actor', x: 0, y: 0, name: 'Actor', path: [{ id: 'wp1', x: 5, y: 5, beat: 2 }] },
      ],
    },
  ],
});

const lightOf = (project: unknown) =>
  (project as { setups: Array<{ elements: Array<Record<string, unknown>> }> }).setups[0].elements[0];

describe('v17 → v18 migration', () => {
  it('stamps the new version and changes nothing else', () => {
    const before = v17Fixture();
    const after = migrateV17ToV18(JSON.parse(JSON.stringify(before)));
    expect(after.schemaVersion).toBe(18);
    expect({ ...after, schemaVersion: 17 }).toEqual(before);
  });

  it('backfills no path — a fixture with no waypoints keeps standing still', () => {
    expect('path' in lightOf(migrateV17ToV18(v17Fixture()))).toBe(false);
  });

  it('leaves actor paths alone', () => {
    const after = migrateV17ToV18(v17Fixture()) as unknown as { setups: Array<{ elements: Array<Record<string, unknown>> }> };
    expect(after.setups[0].elements[1].path).toEqual([{ id: 'wp1', x: 5, y: 5, beat: 2 }]);
  });

  it('keeps a well-formed light path', () => {
    const raw = v17Fixture() as unknown as Record<string, any>;
    raw.setups[0].elements[0].path = [{ id: 'wp1', x: 100, y: 200, rotation: 45, beat: 2 }];
    expect(lightOf(migrateV17ToV18(raw)).path).toEqual([{ id: 'wp1', x: 100, y: 200, rotation: 45, beat: 2 }]);
  });

  it('drops waypoints with no position or no beat', () => {
    const raw = v17Fixture() as unknown as Record<string, any>;
    raw.setups[0].elements[0].path = [
      { id: 'good', x: 1, y: 2, beat: 2 },
      { id: 'noPos', beat: 3 },
      { id: 'nanPos', x: NaN, y: 2, beat: 3 },
      { id: 'noBeat', x: 4, y: 5 },
      'nonsense',
    ];
    expect(lightOf(migrateV17ToV18(raw)).path).toEqual([{ id: 'good', x: 1, y: 2, beat: 2 }]);
  });

  it('mints deterministic ids for waypoints missing one', () => {
    const raw = () => {
      const fixture = v17Fixture() as unknown as Record<string, any>;
      fixture.setups[0].elements[0].path = [{ x: 1, y: 2, beat: 2 }];
      return fixture;
    };
    expect(lightOf(migrateV17ToV18(raw())).path).toEqual([{ id: 'wp-migrated-0', x: 1, y: 2, beat: 2 }]);
    expect(migrateV17ToV18(raw())).toEqual(migrateV17ToV18(raw()));
  });

  it('strips a non-numeric rotation rather than drawing the fixture at NaN degrees', () => {
    const raw = v17Fixture() as unknown as Record<string, any>;
    raw.setups[0].elements[0].path = [{ id: 'wp1', x: 1, y: 2, beat: 2, rotation: 'sideways' }];
    expect(lightOf(migrateV17ToV18(raw)).path).toEqual([{ id: 'wp1', x: 1, y: 2, beat: 2 }]);
  });

  it('removes a path that is not an array, and one left with nothing usable', () => {
    const bad = v17Fixture() as unknown as Record<string, any>;
    bad.setups[0].elements[0].path = 'nope';
    expect('path' in lightOf(migrateV17ToV18(bad))).toBe(false);

    const empty = v17Fixture() as unknown as Record<string, any>;
    empty.setups[0].elements[0].path = [{ id: 'x' }];
    expect('path' in lightOf(migrateV17ToV18(empty))).toBe(false);
  });

  it('is idempotent through the full chain', () => {
    const first = migrateProject(v17Fixture()).project;
    const second = migrateProject(JSON.parse(JSON.stringify(first))).project;
    expect(first.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(second).toEqual(first);
  });
});
