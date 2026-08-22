import { describe, expect, it } from 'vitest';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';
import { DEFAULT_ROAD_WIDTH, migrateV18ToV19, normalizeRoad } from '../migrations/v18-to-v19';
import { sampleRoadCentre } from '../../components/canvas/RoadLayer';
import type { RoadElement } from '../../types';
import { planElementBounds } from '../plan/groupAnimation';

const road = (over: Partial<RoadElement> = {}): RoadElement => ({
  id: 'r1',
  type: 'road',
  name: 'Street',
  x: 0,
  y: 0,
  x2: 200,
  y2: 0,
  rotation: 0,
  width: 100,
  ...over,
});

describe('road geometry', () => {
  it('samples a straight run as two points with a perpendicular normal', () => {
    const samples = sampleRoadCentre(road());
    expect(samples).toHaveLength(2);
    // Run points along +x, so the normal points along +y.
    expect(samples[0].nx).toBeCloseTo(0);
    expect(samples[0].ny).toBeCloseTo(1);
  });

  it('walks a curved run with normals that stay perpendicular to the tangent', () => {
    const samples = sampleRoadCentre(road({ isCurved: true, curveOffset: 80 }));
    expect(samples.length).toBeGreaterThan(2);
    for (const s of samples) {
      expect(Math.hypot(s.nx, s.ny)).toBeCloseTo(1);
    }
    // The middle of the arc is pushed off the straight chord.
    const mid = samples[Math.floor(samples.length / 2)];
    expect(Math.abs(mid.y)).toBeGreaterThan(10);
  });

  it('never divides by zero on a degenerate run', () => {
    const samples = sampleRoadCentre(road({ x2: 0, y2: 0 }));
    for (const s of samples) {
      expect(Number.isFinite(s.x)).toBe(true);
      expect(Number.isFinite(s.nx)).toBe(true);
    }
  });

  it('is treated as endpoint geometry for group bounds', () => {
    expect(planElementBounds(road({ x: 10, y: 20, x2: 110, y2: 220 }))).toEqual({
      minX: 10,
      minY: 20,
      maxX: 110,
      maxY: 220,
    });
  });
});

describe('v18 → v19 migration', () => {
  const v18Fixture = () => ({
    schemaVersion: 18,
    title: 'Road test',
    director: '',
    cinematographer: '',
    date: '2026-08-22',
    activeSetupId: 'setup-1',
    setups: [{ id: 'setup-1', name: 'S', sceneNumber: '1', elements: [] as unknown[] }],
  });

  it('stamps the version and leaves a project with no roads untouched', () => {
    const before = v18Fixture();
    const after = migrateV18ToV19(JSON.parse(JSON.stringify(before)));
    expect(after.schemaVersion).toBe(19);
    expect({ ...after, schemaVersion: 18 }).toEqual(before);
  });

  it('gives a road with no second endpoint a straight default run', () => {
    const r: Record<string, unknown> = { id: 'r', type: 'road', x: 50, y: 60 };
    normalizeRoad(r);
    expect(r.x2).toBe(370);
    expect(r.y2).toBe(60);
    expect(r.width).toBe(DEFAULT_ROAD_WIDTH);
  });

  it('replaces a zero or negative width rather than drawing a collapsed band', () => {
    for (const bad of [0, -20, NaN, 'wide']) {
      const r: Record<string, unknown> = { id: 'r', type: 'road', x: 0, y: 0, x2: 10, y2: 0, width: bad };
      normalizeRoad(r);
      expect(r.width).toBe(DEFAULT_ROAD_WIDTH);
    }
  });

  it('clamps lanes to whole lanes between 1 and 8', () => {
    const r: Record<string, unknown> = { id: 'r', type: 'road', x: 0, y: 0, x2: 10, y2: 0, width: 100, lanes: 12.7 };
    normalizeRoad(r);
    expect(r.lanes).toBe(8);
  });

  it('drops unknown surfaces and markings so the renderer default applies', () => {
    const r: Record<string, unknown> = {
      id: 'r', type: 'road', x: 0, y: 0, x2: 10, y2: 0, width: 100,
      surface: 'lava', marking: 'squiggle', curveOffset: 'a lot',
    };
    normalizeRoad(r);
    expect('surface' in r).toBe(false);
    expect('marking' in r).toBe(false);
    expect('curveOffset' in r).toBe(false);
  });

  it('keeps valid surface and marking values', () => {
    const r: Record<string, unknown> = {
      id: 'r', type: 'road', x: 0, y: 0, x2: 10, y2: 0, width: 100, surface: 'cobble', marking: 'double',
    };
    normalizeRoad(r);
    expect(r.surface).toBe('cobble');
    expect(r.marking).toBe('double');
  });

  it('is idempotent through the full chain', () => {
    const raw = v18Fixture() as unknown as Record<string, any>;
    raw.setups[0].elements = [{ id: 'r', type: 'road', x: 0, y: 0, width: -5 }];
    const first = migrateProject(raw).project;
    const second = migrateProject(JSON.parse(JSON.stringify(first))).project;
    expect(first.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    expect(second).toEqual(first);
  });
});
