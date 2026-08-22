import { describe, expect, it } from 'vitest';
import {
  bakeGroupRotation,
  computeGroupPoseOverrides,
  groupPivotOf,
  interpolateGroupPose,
  normalizeAngleDeg,
  planElementBounds,
  transformMemberElement,
} from '../plan/groupAnimation';
import { getInterpolatedPositionAndRotation, rotatePoint } from '../../utils/geometry';
import type {
  ActorElement,
  ArrowElement,
  CableElement,
  CameraElement,
  DoorElement,
  FloorPlanElement,
  LightElement,
  MeasurementElement,
  PlanGroup,
  PropElement,
  ShapeElement,
  StrokeElement,
  TextElement,
  TrackElement,
  WallElement,
  WindowElement,
  Waypoint,
} from '../../types';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const makeActor = (over: Partial<ActorElement> = {}): ActorElement => ({
  id: 'actor-1',
  type: 'actor',
  name: 'Alice',
  characterLetter: 'A',
  color: '#3b82f6',
  isStanding: true,
  path: [],
  x: 100,
  y: 100,
  rotation: 30,
  ...over,
});

const makeCamera = (over: Partial<CameraElement> = {}): CameraElement => ({
  id: 'camera-1',
  type: 'camera',
  name: 'Cam A',
  cameraLabel: 'A',
  color: '#ef4444',
  focalLength: 35,
  sensorFormat: 'Super35',
  fovAngle: 54,
  aspectRatio: '16:9',
  cameraHeight: 'Eye Level',
  rigType: 'Tripod',
  throwDistance: 300,
  path: [],
  x: 200,
  y: 80,
  rotation: 0,
  ...over,
});

const makeLight = (over: Partial<LightElement> = {}): LightElement => ({
  id: 'light-1',
  type: 'light',
  name: 'Key',
  fixtureType: 'fresnel',
  colorTemp: 3200,
  intensity: 80,
  beamAngle: 40,
  throwDistance: 200,
  x: 0,
  y: 0,
  rotation: 0,
  ...over,
});

const makeProp = (over: Partial<PropElement> = {}): PropElement => ({
  id: 'prop-1',
  type: 'prop',
  name: 'Table',
  propType: 'table_rect',
  width: 80,
  height: 50,
  x: 300,
  y: 200,
  rotation: 0,
  ...over,
});

const makeShape = (over: Partial<ShapeElement> = {}): ShapeElement => ({
  id: 'shape-1',
  type: 'shape',
  name: 'Zone',
  shapeType: 'rectangle',
  width: 40,
  height: 20,
  color: '#38bdf8',
  x: 10,
  y: 10,
  rotation: 15,
  ...over,
});

const makeWall = (over: Partial<WallElement> = {}): WallElement => ({
  id: 'wall-1',
  type: 'wall',
  name: 'Wall',
  thickness: 4,
  x: 0,
  y: 0,
  x2: 100,
  y2: 0,
  rotation: 0,
  ...over,
});

const makeTrack = (over: Partial<TrackElement> = {}): TrackElement => ({
  id: 'track-1',
  type: 'track',
  name: 'Track',
  x: 10,
  y: 20,
  x2: 30,
  y2: 60,
  isCurved: true,
  curveOffset: 12,
  rotation: 0,
  ...over,
});

const makeMeasurement = (over: Partial<MeasurementElement> = {}): MeasurementElement => ({
  id: 'measure-1',
  type: 'measurement',
  name: 'Measure',
  unit: 'm',
  x: 0,
  y: 0,
  x2: 50,
  y2: 10,
  rotation: 0,
  ...over,
});

const makeArrow = (over: Partial<ArrowElement> = {}): ArrowElement => ({
  id: 'arrow-1',
  type: 'arrow',
  name: 'Arrow',
  x: 5,
  y: 5,
  x2: 25,
  y2: 45,
  rotation: 0,
  ...over,
});

const makeCable = (over: Partial<CableElement> = {}): CableElement => ({
  id: 'cable-1',
  type: 'cable',
  name: 'SDI run',
  cableType: 'sdi_12g',
  fromLabel: 'CAM A',
  toLabel: 'CCU 1',
  x: 0,
  y: 0,
  x2: 8,
  y2: 0,
  rotation: 0,
  ...over,
});

const makeStroke = (over: Partial<StrokeElement> = {}): StrokeElement => ({
  id: 'stroke-1',
  type: 'stroke',
  name: 'Scribble',
  color: '#f59e0b',
  strokeWidth: 3,
  points: [
    { x: -50, y: 10 },
    { x: -40, y: 30 },
  ],
  x: -45,
  y: 20,
  rotation: 123,
  ...over,
});

const makeText = (over: Partial<TextElement> = {}): TextElement => ({
  id: 'text-1',
  type: 'text',
  name: 'Note',
  text: 'Hello',
  fontSize: 16,
  color: '#ffffff',
  x: 5,
  y: 5,
  rotation: 10,
  ...over,
});

const makeDoor = (over: Partial<DoorElement> = {}): DoorElement => ({
  id: 'door-1',
  type: 'door',
  name: 'Door',
  width: 90,
  swingAngle: 90,
  swingDirection: 'left',
  x: 0,
  y: 0,
  rotation: 0,
  ...over,
});

const makeWindow = (over: Partial<WindowElement> = {}): WindowElement => ({
  id: 'window-1',
  type: 'window',
  name: 'Window',
  width: 120,
  depth: 16,
  x: 40,
  y: 40,
  rotation: 0,
  ...over,
});

const wp = (over: Partial<Waypoint> & Pick<Waypoint, 'id' | 'beat'>): Waypoint => ({
  x: 0,
  y: 0,
  ...over,
});

const makeGroup = (over: Partial<PlanGroup> = {}): PlanGroup => ({
  id: 'group-1',
  name: 'Dining set',
  childIds: [],
  ...over,
});

/* ------------------------------------------------------------------ */
/* normalizeAngleDeg                                                   */
/* ------------------------------------------------------------------ */

describe('normalizeAngleDeg', () => {
  it('normalizes into [0, 360)', () => {
    expect(normalizeAngleDeg(0)).toBe(0);
    expect(normalizeAngleDeg(390)).toBe(30);
    expect(normalizeAngleDeg(-60)).toBe(300);
    expect(normalizeAngleDeg(720)).toBe(0);
    expect(normalizeAngleDeg(359.5)).toBe(359.5);
  });
});

/* ------------------------------------------------------------------ */
/* planElementBounds / groupPivotOf                                    */
/* ------------------------------------------------------------------ */

describe('planElementBounds', () => {
  it('counts prop/shape width and height extents around the anchor', () => {
    expect(planElementBounds(makeProp())).toEqual({ minX: 260, minY: 175, maxX: 340, maxY: 225 });
    expect(planElementBounds(makeShape())).toEqual({ minX: -10, minY: 0, maxX: 30, maxY: 20 });
  });

  it('counts linear endpoints for wall/track/measurement/arrow/cable', () => {
    expect(planElementBounds(makeWall())).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 0 });
    expect(planElementBounds(makeTrack())).toEqual({ minX: 10, minY: 20, maxX: 30, maxY: 60 });
    expect(planElementBounds(makeMeasurement())).toEqual({ minX: 0, minY: 0, maxX: 50, maxY: 10 });
    expect(planElementBounds(makeArrow())).toEqual({ minX: 5, minY: 5, maxX: 25, maxY: 45 });
    expect(planElementBounds(makeCable())).toEqual({ minX: 0, minY: 0, maxX: 8, maxY: 0 });
  });

  it('uses marker half-extents for actors, cameras and lights', () => {
    expect(planElementBounds(makeActor({ x: 100, y: 100 }))).toEqual({
      minX: 78, minY: 78, maxX: 122, maxY: 122,
    });
    expect(planElementBounds(makeCamera({ x: 200, y: 80 }))).toEqual({
      minX: 178, minY: 58, maxX: 222, maxY: 102,
    });
    expect(planElementBounds(makeLight({ x: 0, y: 0 }))).toEqual({
      minX: -14, minY: -14, maxX: 14, maxY: 14,
    });
  });

  it('uses width-based extents for doors and windows', () => {
    expect(planElementBounds(makeDoor())).toEqual({ minX: -45, minY: -9, maxX: 45, maxY: 9 });
    expect(planElementBounds(makeWindow())).toEqual({ minX: -20, minY: 31, maxX: 100, maxY: 49 });
  });

  it('uses the stroke sample-point bbox and falls back to the anchor when empty', () => {
    expect(planElementBounds(makeStroke())).toEqual({ minX: -50, minY: 10, maxX: -40, maxY: 30 });
    expect(planElementBounds(makeStroke({ points: [], x: 7, y: 9 }))).toEqual({
      minX: -8, minY: -6, maxX: 22, maxY: 24,
    });
  });

  it('falls back to a default extent for text', () => {
    expect(planElementBounds(makeText({ x: 5, y: 5 }))).toEqual({
      minX: -10, minY: -10, maxX: 20, maxY: 20,
    });
  });
});

describe('groupPivotOf', () => {
  it('returns the bbox centre over mixed member anchors and extents', () => {
    const members: FloorPlanElement[] = [
      makeActor({ x: 100, y: 100 }), // [78..122] x [78..122]
      makeProp({ x: 300, y: 200 }), // [260..340] x [175..225]
      makeWall(), // [0..100] x [0..0]
    ];
    const pivot = groupPivotOf(members);
    expect(pivot).not.toBeNull();
    expect(pivot!.x).toBeCloseTo(170);
    expect(pivot!.y).toBeCloseTo(112.5);
  });

  it('counts stroke points and endpoints, not just anchors', () => {
    expect(groupPivotOf([makeStroke()])).toEqual({ x: -45, y: 20 });
    expect(groupPivotOf([makeTrack()])).toEqual({ x: 20, y: 40 });
  });

  it('returns null for an empty member list', () => {
    expect(groupPivotOf([])).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* interpolateGroupPose                                                */
/* ------------------------------------------------------------------ */

describe('interpolateGroupPose', () => {
  it('returns null when the group has no animation path', () => {
    expect(interpolateGroupPose(makeGroup(), 1)).toBeNull();
    expect(interpolateGroupPose(makeGroup({ path: [] }), 1)).toBeNull();
  });

  it('returns the single keyframe pose (rotation normalized) for any beat', () => {
    const group = makeGroup({ path: [wp({ id: 'k1', x: 5, y: 6, rotation: 420, beat: 2 })] });
    expect(interpolateGroupPose(group, 1)).toEqual({ x: 5, y: 6, rotationDelta: 60 });
    expect(interpolateGroupPose(group, 99)).toEqual({ x: 5, y: 6, rotationDelta: 60 });
  });

  it('clamps before the first and after the last keyframe', () => {
    const group = makeGroup({
      path: [
        wp({ id: 'k1', x: 0, y: 0, rotation: 10, beat: 2 }),
        wp({ id: 'k2', x: 100, y: 50, rotation: 20, beat: 6 }),
      ],
    });
    expect(interpolateGroupPose(group, 1)).toEqual({ x: 0, y: 0, rotationDelta: 10 });
    expect(interpolateGroupPose(group, -3)).toEqual({ x: 0, y: 0, rotationDelta: 10 });
    expect(interpolateGroupPose(group, 7)).toEqual({ x: 100, y: 50, rotationDelta: 20 });
    expect(interpolateGroupPose(group, 99)).toEqual({ x: 100, y: 50, rotationDelta: 20 });
  });

  it('matches the shared camera-path interpolation semantics exactly', () => {
    const group = makeGroup({
      path: [
        wp({ id: 'k1', x: 0, y: 0, rotation: 350, beat: 1 }),
        wp({ id: 'k2', x: 100, y: 40, rotation: 10, beat: 5 }),
      ],
    });
    for (const beat of [1.5, 2, 3, 4, 4.5]) {
      const pose = interpolateGroupPose(group, beat)!;
      const shared = getInterpolatedPositionAndRotation(
        { x: 0, y: 0 },
        350,
        [wp({ id: 'w', x: 100, y: 40, rotation: 10, beat: 5 })],
        beat,
      );
      expect(pose.x).toBeCloseTo(shared.position.x);
      expect(pose.y).toBeCloseTo(shared.position.y);
      expect(pose.rotationDelta).toBeCloseTo(shared.rotation);
    }
    // Midpoint sanity: smoothstep(0.5) = 0.5, shortest arc 350 -> 10 passes 0.
    const mid = interpolateGroupPose(group, 3)!;
    expect(mid.x).toBeCloseTo(50);
    expect(mid.y).toBeCloseTo(20);
    expect(mid.rotationDelta).toBeCloseTo(0);
  });

  it('interpolates rotation via the shortest arc', () => {
    const group = makeGroup({
      path: [
        wp({ id: 'k1', x: 0, y: 0, rotation: 10, beat: 1 }),
        wp({ id: 'k2', x: 0, y: 0, rotation: 50, beat: 3 }),
      ],
    });
    expect(interpolateGroupPose(group, 2)!.rotationDelta).toBeCloseTo(30);
    // 350 -> 10 goes forward through 0, not backward through 180.
    const wrap = makeGroup({
      path: [
        wp({ id: 'k1', x: 0, y: 0, rotation: 350, beat: 1 }),
        wp({ id: 'k2', x: 0, y: 0, rotation: 10, beat: 3 }),
      ],
    });
    expect(interpolateGroupPose(wrap, 2)!.rotationDelta).toBeCloseTo(0);
  });

  it('carries the previous rotation delta when a keyframe omits rotation', () => {
    const group = makeGroup({
      path: [
        wp({ id: 'k1', x: 0, y: 0, rotation: 90, beat: 1 }),
        wp({ id: 'k2', x: 10, y: 0, beat: 3 }),
      ],
    });
    // The last keyframe holds the carried delta, so the segment stays constant.
    expect(interpolateGroupPose(group, 3)!.rotationDelta).toBeCloseTo(90);
    expect(interpolateGroupPose(group, 2)!.rotationDelta).toBeCloseTo(90);
    // With no rotation anywhere the delta stays 0.
    const plain = makeGroup({
      path: [
        wp({ id: 'k1', x: 0, y: 0, beat: 1 }),
        wp({ id: 'k2', x: 10, y: 0, beat: 3 }),
      ],
    });
    expect(interpolateGroupPose(plain, 2)!.rotationDelta).toBe(0);
  });

  it('clamps non-finite beat input to the first keyframe', () => {
    const group = makeGroup({
      path: [
        wp({ id: 'k1', x: 3, y: 4, rotation: 0, beat: 1 }),
        wp({ id: 'k2', x: 30, y: 40, rotation: 0, beat: 3 }),
      ],
    });
    const pose = interpolateGroupPose(group, Number.NaN)!;
    expect(pose.x).toBe(3);
    expect(pose.y).toBe(4);
  });
});

/* ------------------------------------------------------------------ */
/* computeGroupPoseOverrides                                           */
/* ------------------------------------------------------------------ */

/**
 * Fixture: basePivot at the origin, one keyframe at beat 2 moving the pivot to
 * (10, 20) with a +90 degree rotation delta. The transform per member is
 * "rotate 90 degrees around the origin, then translate by (10, 20)".
 */
const overridesGroup = makeGroup({
  childIds: [
    'actor-1', 'camera-1', 'light-1', 'prop-1', 'shape-1', 'shape-line-1',
    'wall-1', 'track-1', 'measure-1', 'arrow-1', 'cable-1', 'stroke-1',
    'text-1', 'door-1', 'ghost-id',
  ],
  basePivot: { x: 0, y: 0 },
  path: [wp({ id: 'k1', x: 10, y: 20, rotation: 90, beat: 2 })],
});

const overridesElements = (): FloorPlanElement[] => [
  makeActor({
    x: 1, y: 0, rotation: 30,
    path: [wp({ id: 'wp-1', x: 5, y: 5, rotation: 77, beat: 2 })],
  }),
  makeCamera({ x: 0, y: 0, rotation: 0 }),
  makeLight({ x: 0, y: 0, rotation: 0 }),
  makeProp({ x: 300, y: 200, rotation: 0 }),
  makeShape({ x: 10, y: 10, rotation: 15 }),
  makeShape({ id: 'shape-line-1', shapeType: 'line', width: 100, height: 0, x: 0, y: 0, rotation: 45 }),
  makeWall({ x2: 4, y2: 4 }),
  makeTrack(),
  makeMeasurement(),
  makeArrow(),
  makeCable({ path: [{ id: 'cpp-1', x: 4, y: 4 }] }),
  makeStroke({ points: [{ x: 2, y: 0 }, { x: 3, y: 1 }] }),
  makeText(),
  makeDoor(),
];

describe('computeGroupPoseOverrides', () => {
  it('returns an empty map when the group has no animation path', () => {
    expect(computeGroupPoseOverrides(overridesElements(), makeGroup(), 2).size).toBe(0);
  });

  it('transforms x/y of every member and skips non-members', () => {
    const elements = overridesElements();
    const overrides = computeGroupPoseOverrides(elements, overridesGroup, 2);
    expect(overrides.has('ghost-id')).toBe(false);
    expect(overrides.size).toBe(elements.length);
    // Anchors rotate about basePivot (origin) and then translate by (10, 20).
    const actor = overrides.get('actor-1')!;
    expect(actor.x).toBeCloseTo(10); // (1,0) rotated 90 deg -> (0,1); + (10,20)
    expect(actor.y).toBeCloseTo(21);
    const prop = overrides.get('prop-1')!;
    expect(prop.x).toBeCloseTo(-190); // (300,200) rotated -> (-200,300); + (10,20)
    expect(prop.y).toBeCloseTo(320);
    const originMember = overrides.get('camera-1')!;
    expect(originMember.x).toBeCloseTo(10); // already at the pivot: pure translate
    expect(originMember.y).toBeCloseTo(20);
  });

  it('adds the rotation delta to point elements, normalized to 0-359', () => {
    const overrides = computeGroupPoseOverrides(overridesElements(), overridesGroup, 2);
    expect(overrides.get('actor-1')!.rotation).toBe(120);
    expect(overrides.get('text-1')!.rotation).toBe(100);
    expect(overrides.get('light-1')!.rotation).toBe(90);
    // 15 + 90 stays within range; check a wrap-around case separately below.
    expect(overrides.get('prop-1')!.rotation).toBe(90);
    expect(overrides.get('door-1')!.rotation).toBe(90);
    expect(overrides.get('shape-1')!.rotation).toBe(105);
  });

  it('normalizes wrapped rotations (300 + 90 = 30, not 390)', () => {
    const group = makeGroup({
      childIds: ['actor-1'],
      basePivot: { x: 0, y: 0 },
      path: [wp({ id: 'k1', x: 0, y: 0, rotation: 90, beat: 2 })],
    });
    const overrides = computeGroupPoseOverrides(
      [makeActor({ x: 1, y: 0, rotation: 300 })],
      group,
      2,
    );
    expect(overrides.get('actor-1')!.rotation).toBe(30);
  });

  it('rotates movement waypoints of path members but keeps their own rotations', () => {
    const overrides = computeGroupPoseOverrides(overridesElements(), overridesGroup, 2);
    const actorPose = overrides.get('actor-1')!;
    expect(actorPose.pathPoints).toHaveLength(1);
    const moved = actorPose.pathPoints![0] as Waypoint;
    expect(moved.id).toBe('wp-1');
    expect(moved.beat).toBe(2);
    expect(moved.x).toBeCloseTo(5); // (5,5) rotated 90 deg -> (-5,5); + (10,20)
    expect(moved.y).toBeCloseTo(25);
    expect(moved.rotation).toBe(77); // untouched
  });

  it('rotates endpoint kinds without adding the delta to .rotation', () => {
    const overrides = computeGroupPoseOverrides(overridesElements(), overridesGroup, 2);
    const wall = overrides.get('wall-1')!;
    expect(wall.x).toBeCloseTo(10);
    expect(wall.y).toBeCloseTo(20);
    expect(wall.x2).toBeCloseTo(6); // (4,4) rotated 90 deg -> (-4,4); + (10,20)
    expect(wall.y2).toBeCloseTo(24);
    expect(wall.rotation).toBe(0); // endpoints carry orientation; NO delta

    const track = overrides.get('track-1')!;
    expect(track.x).toBeCloseTo(-10);
    expect(track.y).toBeCloseTo(30);
    expect(track.x2).toBeCloseTo(-50);
    expect(track.y2).toBeCloseTo(50);
    expect(track.rotation).toBe(0);
    expect(overrides.get('measure-1')!.rotation).toBe(0);
    expect(overrides.get('arrow-1')!.rotation).toBe(0);
    expect(overrides.get('shape-line-1')!.rotation).toBe(45); // line shapes too
  });

  it('rotates stroke points only and never double-rotates the stroke', () => {
    const overrides = computeGroupPoseOverrides(overridesElements(), overridesGroup, 2);
    const stroke = overrides.get('stroke-1')!;
    expect(stroke.rotation).toBe(123); // untouched: points carry orientation
    expect(stroke.strokePoints).toHaveLength(2);
    expect(stroke.strokePoints![0].x).toBeCloseTo(10); // (2,0) rotated -> (0,2); + (10,20)
    expect(stroke.strokePoints![0].y).toBeCloseTo(22);
    expect(stroke.strokePoints![1].x).toBeCloseTo(9); // (3,1) rotated -> (-1,3)
    expect(stroke.strokePoints![1].y).toBeCloseTo(23);
  });

  it('rotates cable routing points along with its endpoints', () => {
    const overrides = computeGroupPoseOverrides(overridesElements(), overridesGroup, 2);
    const cable = overrides.get('cable-1')!;
    expect(cable.x2).toBeCloseTo(10); // (8,0) rotated -> (0,8); + (10,20)
    expect(cable.y2).toBeCloseTo(28);
    expect(cable.pathPoints).toHaveLength(1);
    expect(cable.pathPoints![0].x).toBeCloseTo(6); // (4,4) rotated -> (-4,4)
    expect(cable.pathPoints![0].y).toBeCloseTo(24);
  });

  it('clamps beats after the last keyframe to that keyframe', () => {
    const atBeat = computeGroupPoseOverrides(overridesElements(), overridesGroup, 2);
    const clamped = computeGroupPoseOverrides(overridesElements(), overridesGroup, 99);
    expect(clamped.get('actor-1')).toEqual(atBeat.get('actor-1'));
    expect(clamped.get('actor-1')!.rotation).toBe(120);
  });

  it('holds the AUTHORED pose before the first keyframe, like camera paths', () => {
    // The base pivot is the implicit beat-1 node. Clamping backwards onto the
    // first keyframe instead would teleport a group away from where it was
    // drawn as soon as one keyframe existed.
    const actorAtBase = overridesElements().find((el) => el.id === 'actor-1')!;
    for (const beat of [0, 1]) {
      const pose = computeGroupPoseOverrides(overridesElements(), overridesGroup, beat).get('actor-1')!;
      expect(pose.x).toBeCloseTo(actorAtBase.x);
      expect(pose.y).toBeCloseTo(actorAtBase.y);
      expect(pose.rotation).toBe(actorAtBase.rotation);
    }
  });

  it('eases from the authored pose into the first keyframe', () => {
    const half = computeGroupPoseOverrides(overridesElements(), overridesGroup, 1.5).get('actor-1')!;
    const atKey = computeGroupPoseOverrides(overridesElements(), overridesGroup, 2).get('actor-1')!;
    const atBase = overridesElements().find((el) => el.id === 'actor-1')!;
    // Strictly between the two poses: the group is on its way, not snapped.
    expect(half.y).toBeGreaterThan(Math.min(atBase.y, atKey.y));
    expect(half.y).toBeLessThan(Math.max(atBase.y, atKey.y));
    expect(half.rotation).not.toBe(atBase.rotation);
    expect(half.rotation).not.toBe(atKey.rotation);
  });

  it('still clamps backwards when no base pivot is available at all', () => {
    // interpolateGroupPose without a pivot keeps the old endpoint clamp, so
    // hand-authored data with no members still resolves to something sane.
    const pose = interpolateGroupPose(overridesGroup, 0);
    expect(pose).toEqual({ x: 10, y: 20, rotationDelta: 90 });
  });

  it('falls back to the member bbox centre when basePivot is absent', () => {
    const members: FloorPlanElement[] = [makeProp({ x: 300, y: 200 }), makeWall()];
    const pivot = groupPivotOf(members)!; // (170, 112.5)
    const withoutBase = makeGroup({
      childIds: ['prop-1', 'wall-1'],
      path: [wp({ id: 'k1', x: pivot.x, y: pivot.y, rotation: 90, beat: 2 })],
    });
    const withBase = makeGroup({
      ...withoutBase,
      basePivot: { x: pivot.x, y: pivot.y },
    });
    const a = computeGroupPoseOverrides(members, withoutBase, 2);
    const b = computeGroupPoseOverrides(members, withBase, 2);
    expect(a.size).toBe(2);
    expect(a.get('prop-1')).toEqual(b.get('prop-1'));
    expect(a.get('wall-1')).toEqual(b.get('wall-1'));
  });
});

/* ------------------------------------------------------------------ */
/* bakeGroupRotation                                                   */
/* ------------------------------------------------------------------ */

describe('bakeGroupRotation', () => {
  const bakeElements = (): FloorPlanElement[] => [
    makeActor({
      x: 1, y: 0, rotation: 30,
      path: [wp({ id: 'wp-1', x: 5, y: 5, rotation: 77, beat: 2 })],
    }),
    makeWall(),
    makeStroke({ points: [{ x: 2, y: 0 }], x: 2, y: 0 }),
    makeShape({ x: 10, y: 10, rotation: 15 }),
    makeText({ x: 500, y: 500 }), // non-member
  ];

  const bakeGroup = makeGroup({
    childIds: ['actor-1', 'wall-1', 'stroke-1', 'shape-1'],
    basePivot: { x: 0, y: 0 },
    path: [
      wp({ id: 'k1', x: 0, y: 0, rotation: 0, beat: 1 }),
      wp({ id: 'k2', x: 0, y: 0, rotation: 45, beat: 2 }),
      wp({ id: 'k3', x: 0, y: 0, rotation: 90, beat: 3 }),
    ],
  });

  const closeTo = (a: number | undefined, b: number | undefined) =>
    expect(a).toBeCloseTo(b as number);

  const expectPoseMatchesBaked = (
    pose: { x: number; y: number; rotation: number; x2?: number; y2?: number },
    baked: FloorPlanElement,
  ) => {
    closeTo(pose.x, baked.x);
    closeTo(pose.y, baked.y);
    expect(pose.rotation).toBe(baked.rotation);
    if (pose.x2 !== undefined) closeTo(pose.x2, (baked as WallElement).x2);
    if (pose.y2 !== undefined) closeTo(pose.y2, (baked as WallElement).y2);
  };

  it('baking by the pose rotation delta equals computeGroupPoseOverrides at that beat', () => {
    for (const beat of [1, 2, 3]) {
      const elements = bakeElements();
      const overrides = computeGroupPoseOverrides(elements, bakeGroup, beat);
      const pose = interpolateGroupPose(bakeGroup, beat)!;
      const baked = bakeGroupRotation(elements, bakeGroup, pose.rotationDelta, { x: 0, y: 0 });
      expect(baked).toHaveLength(elements.length);
      for (const [id, memberPose] of overrides) {
        const bakedMember = baked.find((e) => e.id === id)!;
        expectPoseMatchesBaked(memberPose, bakedMember);
        // Nested path/stroke geometry must match too.
        if (memberPose.pathPoints) {
          const bakedPath = (bakedMember as ActorElement).path;
          expect(bakedPath).toHaveLength(memberPose.pathPoints.length);
          memberPose.pathPoints.forEach((p, i) => {
            closeTo(p.x, bakedPath[i].x);
            closeTo(p.y, bakedPath[i].y);
            expect((p as Waypoint).rotation).toBe(bakedPath[i].rotation);
          });
        }
        if (memberPose.strokePoints) {
          const bakedPoints = (bakedMember as StrokeElement).points;
          memberPose.strokePoints.forEach((p, i) => {
            closeTo(p.x, bakedPoints[i].x);
            closeTo(p.y, bakedPoints[i].y);
          });
        }
      }
    }
  });

  it('accepts a bare member-id list instead of a PlanGroup', () => {
    const elements = bakeElements();
    // Baking is a pure rotation around the given pivot; no translation.
    const baked = bakeGroupRotation(elements, ['actor-1', 'wall-1'], 90, { x: 0, y: 0 });
    const actor = baked.find((e) => e.id === 'actor-1') as ActorElement;
    expect(actor.x).toBeCloseTo(0); // (1,0) rotated 90 deg about the origin
    expect(actor.y).toBeCloseTo(1);
    expect(actor.rotation).toBe(120);
    const wall = baked.find((e) => e.id === 'wall-1') as WallElement;
    expect(wall.x2).toBeCloseTo(0); // (100,0) rotated 90 deg
    expect(wall.y2).toBeCloseTo(100);
    expect(wall.rotation).toBe(0);
    // Non-member passed through by reference.
    expect(baked.find((e) => e.id === 'text-1')).toBe(elements.find((e) => e.id === 'text-1'));
  });

  it('defaults the pivot to the member bbox centre', () => {
    const elements: FloorPlanElement[] = [
      makeActor({ x: 1, y: 0, rotation: 30 }),
      makeWall({ x: 0, y: 0, x2: 4, y2: 4 }),
    ];
    const center = groupPivotOf(elements)!; // (-21..23) x (-22..22) -> (1, 0)
    expect(center).toEqual({ x: 1, y: 0 });
    const baked = bakeGroupRotation(elements, ['actor-1', 'wall-1'], 90);
    const actor = baked.find((e) => e.id === 'actor-1') as ActorElement;
    const wall = baked.find((e) => e.id === 'wall-1') as WallElement;
    const expectedAnchor = rotatePoint({ x: 1, y: 0 }, center, 90);
    expect(actor.x).toBeCloseTo(expectedAnchor.x);
    expect(actor.y).toBeCloseTo(expectedAnchor.y);
    expect(actor.rotation).toBe(120);
    const expectedEnd = rotatePoint({ x: 4, y: 4 }, center, 90);
    closeTo(wall.x2, expectedEnd.x);
    closeTo(wall.y2, expectedEnd.y);
    expect(wall.rotation).toBe(0);
  });

  it('returns an unchanged copy when there is nothing to bake', () => {
    const elements = bakeElements();
    const baked = bakeGroupRotation(elements, ['missing-id'], 90);
    expect(baked).toHaveLength(elements.length);
    expect(baked).toEqual(elements);
    expect(baked).not.toBe(elements);
    expect(bakeGroupRotation([], ['x'], 90)).toEqual([]);
  });

  it('is immutable: inputs are untouched and members are new objects', () => {
    const elements = bakeElements();
    const group = makeGroup({ ...bakeGroup });
    const elementSnapshot = structuredClone(elements);
    const groupSnapshot = structuredClone(group);

    bakeGroupRotation(elements, group, 90);
    bakeGroupRotation(elements, ['actor-1'], 45, { x: 0, y: 0 });
    computeGroupPoseOverrides(elements, group, 2);
    interpolateGroupPose(group, 2);
    transformMemberElement(elements[0], { deltaDeg: 90, center: { x: 0, y: 0 }, translation: { x: 0, y: 0 } });

    expect(elements).toEqual(elementSnapshot);
    expect(group).toEqual(groupSnapshot);

    const baked = bakeGroupRotation(elements, group, 90);
    const actorIdx = elements.findIndex((e) => e.id === 'actor-1');
    expect(baked[actorIdx]).not.toBe(elements[actorIdx]);
    expect((baked[actorIdx] as ActorElement).path[0]).not.toBe(
      (elements[actorIdx] as ActorElement).path[0],
    );
    const strokeIdx = elements.findIndex((e) => e.id === 'stroke-1');
    expect((baked[strokeIdx] as StrokeElement).points[0]).not.toBe(
      (elements[strokeIdx] as StrokeElement).points[0],
    );
    const textIdx = elements.findIndex((e) => e.id === 'text-1');
    expect(baked[textIdx]).toBe(elements[textIdx]);
  });

  it('applies a zero delta exactly (identity transform)', () => {
    const elements = bakeElements();
    const baked = bakeGroupRotation(elements, ['actor-1'], 0, { x: 0, y: 0 });
    const actor = baked.find((e) => e.id === 'actor-1') as ActorElement;
    expect(actor.x).toBe(1);
    expect(actor.y).toBe(0);
    expect(actor.rotation).toBe(30);
    expect(actor.path[0].x).toBe(5);
    expect(actor.path[0].y).toBe(5);
  });
});
