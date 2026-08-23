/**
 * Plan-group animation and rigid group transforms (plan §6.4).
 *
 * Pure domain code — no React, no canvas imports. UI layers consume:
 *  - `interpolateGroupPose` / `computeGroupPoseOverrides` for live per-beat
 *    previews (ephemeral render state; never persisted), and
 *  - `bakeGroupRotation` to commit an interactive group rotation into project
 *    data, so the gesture preview and the committed result share one code path.
 *
 * Conventions (AGENTS.md): angles are degrees, positions are plan pixels.
 * Group keyframes (`PlanGroup.path`) reuse the Waypoint shape with
 * group-specific semantics:
 *  - waypoint.x/y = GROUP PIVOT position at that beat,
 *  - waypoint.rotation = ROTATION DELTA relative to the members' base pose.
 * A missing `rotation` on a keyframe carries the previous effective delta
 * (starting at 0) — mirroring how camera paths treat missing rotations.
 */
import type {
  CableElement,
  CablePathPoint,
  FloorPlanElement,
  PlanGroup,
  StrokeElement,
  StrokePoint,
  Vector2D,
  Waypoint,
} from '../../types';
import { lerpAngleDeg, rotatePoint, smoothstepProgress } from '../../utils/geometry';

/** Axis-aligned bounding box of plan geometry. */
export interface ElementBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A path point carried in a pose override (movement waypoints or cable routing). */
export type PosePathPoint = Waypoint | CablePathPoint;

/**
 * Per-member render override for one beat. Fields are only present when the
 * member kind carries them; consumers merge them onto the element for display.
 */
export interface ElementPose {
  x: number;
  y: number;
  rotation: number;
  x2?: number;
  y2?: number;
  /** Rotated member path points; each point's own rotation/cues stay untouched. */
  pathPoints?: PosePathPoint[];
  /** Rotated freehand stroke samples (pressure preserved). */
  strokePoints?: StrokePoint[];
}

/** Interpolated group pivot position + rotation delta at a beat. */
export interface GroupPose {
  x: number;
  y: number;
  rotationDelta: number;
}

/**
 * A rigid transform: rotate by `deltaDeg` around `center`, then translate.
 * T = Translate(translation) . Rotate(deltaDeg around center).
 */
export interface RigidTransform {
  deltaDeg: number;
  center: Vector2D;
  translation: Vector2D;
}

const IDENTITY_TRANSLATION: Readonly<Vector2D> = { x: 0, y: 0 };

/* ------------------------------------------------------------------ */
/* Small pure helpers                                                  */
/* ------------------------------------------------------------------ */

/** Normalize degrees to [0, 360). */
export function normalizeAngleDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

const translatePoint = (p: Vector2D, by: Vector2D): Vector2D => ({
  x: p.x + by.x,
  y: p.y + by.y,
});

/** Apply a rigid transform to a single point. */
export function applyRigidTransform(point: Vector2D, transform: RigidTransform): Vector2D {
  return translatePoint(
    rotatePoint(point, transform.center, transform.deltaDeg),
    transform.translation,
  );
}

/* ------------------------------------------------------------------ */
/* Bounds / pivot                                                      */
/* ------------------------------------------------------------------ */

// Marker half-extents, matching the InspectorPanel align/distribute bounds so
// group pivots land where users already expect selection boxes to centre.
const DEFAULT_HALF_EXTENT = 15;
const LIGHT_HALF_EXTENT = 14;
const ACTOR_CAMERA_HALF_EXTENT = 22;
const DOOR_WINDOW_DEFAULT_WIDTH = 60;
const DOOR_WINDOW_DEPTH = 18;

function centeredBounds(anchor: Vector2D, halfWidth: number, halfHeight: number): ElementBounds {
  return {
    minX: anchor.x - halfWidth,
    minY: anchor.y - halfHeight,
    maxX: anchor.x + halfWidth,
    maxY: anchor.y + halfHeight,
  };
}

/**
 * Pure bounding box of one floor-plan element: counts the anchor AND its
 * extents (width/height, linear endpoints, stroke sample points).
 * Promoted from the InspectorPanel align/distribute math into the domain.
 */
export function planElementBounds(el: FloorPlanElement): ElementBounds {
  switch (el.type) {
    case 'prop':
    case 'shape': {
      const w = el.width || 80;
      const h = el.height || 50;
      return centeredBounds({ x: el.x, y: el.y }, w / 2, h / 2);
    }
    case 'wall':
    case 'track':
    case 'road':
    case 'measurement':
    case 'arrow':
    case 'cable': {
      // All endpoint kinds carry required x2/y2.
      return {
        minX: Math.min(el.x, el.x2),
        minY: Math.min(el.y, el.y2),
        maxX: Math.max(el.x, el.x2),
        maxY: Math.max(el.y, el.y2),
      };
    }
    case 'door':
    case 'window': {
      // Both kinds carry a required `width`.
      return centeredBounds(
        { x: el.x, y: el.y },
        (el.width || DOOR_WINDOW_DEFAULT_WIDTH) / 2,
        DOOR_WINDOW_DEPTH / 2,
      );
    }
    case 'light':
      return centeredBounds({ x: el.x, y: el.y }, LIGHT_HALF_EXTENT, LIGHT_HALF_EXTENT);
    case 'actor':
    case 'camera':
      return centeredBounds(
        { x: el.x, y: el.y },
        ACTOR_CAMERA_HALF_EXTENT,
        ACTOR_CAMERA_HALF_EXTENT,
      );
    case 'stroke': {
      if (el.points.length === 0) {
        return centeredBounds({ x: el.x, y: el.y }, DEFAULT_HALF_EXTENT, DEFAULT_HALF_EXTENT);
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of el.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      return { minX, minY, maxX, maxY };
    }
    default:
      // text and any future anchored-only kind
      return centeredBounds({ x: el.x, y: el.y }, DEFAULT_HALF_EXTENT, DEFAULT_HALF_EXTENT);
  }
}

/**
 * Bbox-centre pivot over all member anchors and extents.
 * Returns null for an empty member list.
 */
export function groupPivotOf(elements: ReadonlyArray<FloorPlanElement>): Vector2D | null {
  if (!elements || elements.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const b = planElementBounds(el);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/* ------------------------------------------------------------------ */
/* Pose interpolation                                                  */
/* ------------------------------------------------------------------ */

const isFiniteNumber = (v: number): boolean => Number.isFinite(v);

function effectiveRotationDeltas(path: Waypoint[]): Array<{ x: number; y: number; beat: number; rotationDelta: number }> {
  let carried = 0;
  return path.map((wp) => {
    const rotationDelta = typeof wp.rotation === 'number' && isFiniteNumber(wp.rotation)
      ? wp.rotation
      : carried;
    carried = rotationDelta;
    return { x: wp.x, y: wp.y, beat: wp.beat, rotationDelta };
  });
}

/**
 * Group pivot position + rotation delta at a beat.
 *
 * Uses the same smoothstep easing and shortest-arc rotation interpolation as
 * camera paths (`getInterpolatedPositionAndRotation`), including the same
 * beat-1 convention: when `basePivot` is supplied and no keyframe sits at or
 * before beat 1, the group's authored position IS the beat-1 node. Without it a
 * single keyframe would clamp backwards over beat 1 and teleport the group away
 * from where it was drawn — cameras and actors have never behaved that way.
 *
 * After the last keyframe the pose clamps to that keyframe.
 * Returns null when the group has no usable animation path.
 */
export function interpolateGroupPose(
  group: PlanGroup,
  beat: number,
  basePivot?: Vector2D | null,
): GroupPose | null {
  const rawPath = group?.path;
  if (!Array.isArray(rawPath) || rawPath.length === 0) return null;

  const keyed = effectiveRotationDeltas(rawPath)
    .filter((wp) => isFiniteNumber(wp.x) && isFiniteNumber(wp.y))
    .sort((a, b) => a.beat - b.beat);
  if (keyed.length === 0) return null;

  // The implicit beat-1 node: the group where it was authored, unrotated.
  const needsBaseNode =
    !!basePivot &&
    isFiniteNumber(basePivot.x) &&
    isFiniteNumber(basePivot.y) &&
    keyed[0].beat > 1;
  const nodes = needsBaseNode
    ? [{ x: basePivot!.x, y: basePivot!.y, beat: 1, rotationDelta: 0 }, ...keyed]
    : keyed;

  const atBeat = isFiniteNumber(beat) ? beat : -Infinity;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];

  if (atBeat <= first.beat) {
    return { x: first.x, y: first.y, rotationDelta: normalizeAngleDeg(first.rotationDelta) };
  }
  if (atBeat >= last.beat) {
    return { x: last.x, y: last.y, rotationDelta: normalizeAngleDeg(last.rotationDelta) };
  }

  for (let i = 0; i < nodes.length - 1; i++) {
    const n1 = nodes[i];
    const n2 = nodes[i + 1];
    if (atBeat >= n1.beat && atBeat <= n2.beat) {
      const span = n2.beat - n1.beat;
      const progress = span === 0 ? 0 : (atBeat - n1.beat) / span;
      const t = smoothstepProgress(progress);
      return {
        x: n1.x + (n2.x - n1.x) * t,
        y: n1.y + (n2.y - n1.y) * t,
        rotationDelta: normalizeAngleDeg(lerpAngleDeg(n1.rotationDelta, n2.rotationDelta, t)),
      };
    }
  }

  // Unreachable safeguard: clamp to the last node.
  return { x: last.x, y: last.y, rotationDelta: normalizeAngleDeg(last.rotationDelta) };
}

/* ------------------------------------------------------------------ */
/* Per-member rigid transforms                                         */
/* ------------------------------------------------------------------ */

type GeometryKind = 'point' | 'endpoint' | 'stroke';

function geometryKindOf(el: FloorPlanElement): GeometryKind {
  switch (el.type) {
    case 'wall':
    case 'track':
    case 'road':
    case 'measurement':
    case 'arrow':
    case 'cable':
      return 'endpoint';
    case 'stroke':
      return 'stroke';
    default:
      return 'point';
  }
}

const ENDPOINT_ELEMENT_TYPES: readonly string[] = ['wall', 'track', 'road', 'measurement', 'arrow', 'cable'];

/**
 * Endpoint kinds (wall/track/measurement/arrow/cable): orientation lives in
 * their x2/y2 endpoints, not in `.rotation`.
 */
export function isEndpointElement(
  el: FloorPlanElement,
): el is FloorPlanElement & { x: number; y: number; x2: number; y2: number } {
  return ENDPOINT_ELEMENT_TYPES.includes(el.type);
}

/** Stroke kinds carry orientation in their sample points, not `.rotation`. */
export const isStrokeElement = (el: FloorPlanElement): el is StrokeElement =>
  el.type === 'stroke';

/**
 * True when the member's `.rotation` must absorb the group's rotation delta.
 * Line-shapes and all endpoint kinds encode orientation geometrically — adding
 * the delta there would double-rotate them.
 */
export function addsRotationDelta(el: FloorPlanElement): boolean {
  if (geometryKindOf(el) !== 'point') return false;
  if (el.type === 'shape') return el.shapeType !== 'line';
  return true;
}

function transformWaypoints<T extends Vector2D>(points: readonly T[], xf: RigidTransform): T[] {
  return points.map((p) => {
    const moved = applyRigidTransform(p, xf);
    return { ...p, x: moved.x, y: moved.y };
  });
}

/**
 * Apply a rigid transform to ONE element, returning a new object.
 * Immutable: the input element (and its nested arrays) is never mutated.
 */
export function transformMemberElement(el: FloorPlanElement, xf: RigidTransform): FloorPlanElement {
  const movedAnchor = applyRigidTransform({ x: el.x, y: el.y }, xf);

  if (isEndpointElement(el)) {
    const movedEnd = applyRigidTransform({ x: el.x2, y: el.y2 }, xf);
    if (el.type === 'cable') {
      const cable: CableElement = {
        ...el,
        x: movedAnchor.x,
        y: movedAnchor.y,
        x2: movedEnd.x,
        y2: movedEnd.y,
        ...(el.path ? { path: transformWaypoints(el.path, xf) } : {}),
      };
      return cable;
    }
    const rotated: FloorPlanElement & {
      x: number;
      y: number;
      x2: number;
      y2: number;
    } = {
      ...el,
      x: movedAnchor.x,
      y: movedAnchor.y,
      x2: movedEnd.x,
      y2: movedEnd.y,
    };
    return rotated;
  }

  if (isStrokeElement(el)) {
    const stroke: StrokeElement = {
      ...el,
      x: movedAnchor.x,
      y: movedAnchor.y,
      // Points carry the drawn geometry; `.rotation` stays untouched so the
      // delta is applied exactly once (no double rotation on strokes).
      points: transformWaypoints(el.points, xf),
    };
    return stroke;
  }

  if (el.type === 'actor' || el.type === 'camera' || el.type === 'prop') {
    return {
      ...el,
      x: movedAnchor.x,
      y: movedAnchor.y,
      rotation: normalizeAngleDeg(el.rotation + xf.deltaDeg),
      // Rotate movement-waypoint positions only; keep each waypoint's own
      // rotation value (they describe the subject, not the group move).
      //
      // Spread conditionally rather than writing `path: undefined`: an actor's
      // path is required and a prop's is not, so assigning the absent case
      // back would widen a required field to undefined.
      ...(el.path ? { path: transformWaypoints(el.path, xf) } : null),
    };
  }

  return {
    ...el,
    x: movedAnchor.x,
    y: movedAnchor.y,
    rotation:
      el.type === 'shape' && el.shapeType === 'line'
        ? el.rotation // endpoints-in-extents carry orientation; see addsRotationDelta
        : normalizeAngleDeg(el.rotation + xf.deltaDeg),
  };
}

function elementPoseOf(transformed: FloorPlanElement): ElementPose {
  const pose: ElementPose = { x: transformed.x, y: transformed.y, rotation: transformed.rotation };
  if (isEndpointElement(transformed)) {
    pose.x2 = transformed.x2;
    pose.y2 = transformed.y2;
    if (transformed.type === 'cable') {
      pose.pathPoints = transformed.path;
    }
    return pose;
  }
  if (isStrokeElement(transformed)) {
    pose.strokePoints = transformed.points;
    return pose;
  }
  if (
    transformed.type === 'actor' ||
    transformed.type === 'camera' ||
    transformed.type === 'prop'
  ) {
    pose.pathPoints = transformed.path;
  }
  return pose;
}

/**
 * Per-member pose overrides for rendering a group at a beat.
 *
 * The applied transform per member is
 *   T = Translate(pivot(beat) - basePivot) . Rotate(rotationDelta around basePivot)
 *
 * When `basePivot` was never captured it falls back to the members' current
 * bbox centre, so previews still behave sensibly for hand-authored data.
 * Returns an empty map when the group has no animation or no members.
 */
export function computeGroupPoseOverrides(
  elements: ReadonlyArray<FloorPlanElement>,
  group: PlanGroup,
  beat: number,
): Map<string, ElementPose> {
  const overrides = new Map<string, ElementPose>();
  const childIds = new Set(group.childIds ?? []);
  const members = elements.filter((el) => childIds.has(el.id));
  if (members.length === 0) return overrides;

  const basePivot = group.basePivot ?? groupPivotOf(members);
  if (!basePivot) return overrides;

  // The base pivot doubles as the implicit beat-1 keyframe.
  const pose = interpolateGroupPose(group, beat, basePivot);
  if (!pose) return overrides;

  const transform: RigidTransform = {
    deltaDeg: pose.rotationDelta,
    center: basePivot,
    translation: { x: pose.x - basePivot.x, y: pose.y - basePivot.y },
  };

  for (const member of members) {
    overrides.set(member.id, elementPoseOf(transformMemberElement(member, transform)));
  }
  return overrides;
}

/**
 * Commit a group rotation ONCE into new element objects.
 *
 * Applies the same rigid transform as {@link computeGroupPoseOverrides} but by
 * an explicit `deltaDeg` around the group bbox centre (or a given pivot), with
 * zero translation. Powers the interactive group-rotate gesture: preview with
 * `computeGroupPoseOverrides`, commit with this.
 *
 * Accepts either the `PlanGroup` or a bare list of member ids. Non-members are
 * passed through untouched (same references); members become new objects.
 */
export function bakeGroupRotation(
  elements: ReadonlyArray<FloorPlanElement>,
  target: PlanGroup | ReadonlyArray<string>,
  deltaDeg: number,
  pivot?: Vector2D,
): FloorPlanElement[] {
  const memberIds: readonly string[] = 'childIds' in target ? target.childIds : target;
  const memberIdSet = new Set(memberIds);
  const members = elements.filter((el) => memberIdSet.has(el.id));

  const center = pivot ?? groupPivotOf(members);
  if (!center || members.length === 0 || !isFiniteNumber(deltaDeg)) {
    return [...elements];
  }

  const transform: RigidTransform = {
    deltaDeg,
    center,
    translation: { ...IDENTITY_TRANSLATION },
  };
  return elements.map((el) =>
    memberIdSet.has(el.id) ? transformMemberElement(el, transform) : el,
  );
}
