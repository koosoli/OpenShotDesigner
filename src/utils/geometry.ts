import {
  AspectRatio,
  FloorPlanElement,
  SensorFormat,
  Vector2D,
  Waypoint,
} from '../types';

export const SENSOR_SIZES: Record<SensorFormat, { width: number; height: number; name: string }> = {
  FullFrame: { width: 36.0, height: 24.0, name: 'Full Frame (35mm)' },
  Super35: { width: 24.89, height: 18.66, name: 'Super 35' },
  MFT: { width: 17.3, height: 13.0, name: 'Micro Four Thirds' },
  LargeFormat: { width: 44.0, height: 33.0, name: 'Large Format (ARRI LF)' },
};

/**
 * Calculates the horizontal field of view angle (in degrees)
 * based on focal length (mm) and sensor format.
 */
export function calculateFovAngle(focalLength: number, sensor: SensorFormat = 'Super35'): number {
  const sensorWidth = SENSOR_SIZES[sensor]?.width || 24.89;
  const fovRad = 2 * Math.atan(sensorWidth / (2 * focalLength));
  return Math.round((fovRad * (180 / Math.PI)) * 10) / 10;
}

/**
 * Convert degrees to radians
 */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Convert radians to degrees
 */
export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Rotates a point (x, y) around origin (cx, cy) by given degrees
 */
export function rotatePoint(point: Vector2D, center: Vector2D, angleDeg: number): Vector2D {
  const rad = degToRad(angleDeg);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;

  return {
    x: center.x + (dx * cos - dy * sin),
    y: center.y + (dx * sin + dy * cos),
  };
}

/**
 * Snap coordinate to nearest grid step if snap is active
 */
export function snapToGrid(val: number, gridSize: number, enabled: boolean): number {
  if (!enabled || gridSize <= 0) return val;
  return Math.round(val / gridSize) * gridSize;
}

/**
 * Distance between two points
 */
export function getDistance(p1: Vector2D, p2: Vector2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Angle from p1 to p2 in degrees
 */
export function getAngleBetweenPoints(p1: Vector2D, p2: Vector2D): number {
  const dy = p2.y - p1.y;
  const dx = p2.x - p1.x;
  let deg = radToDeg(Math.atan2(dy, dx));
  if (deg < 0) deg += 360;
  return deg;
}

/**
 * Computes FOV cone polygon coordinates for SVG rendering
 */
export function getCameraFovPolygon(
  cameraPos: Vector2D,
  rotationDeg: number,
  fovAngleDeg: number,
  throwDistance: number
): { pathString: string; leftPt: Vector2D; rightPt: Vector2D; centerPt: Vector2D } {
  const halfFov = fovAngleDeg / 2;
  const leftAngle = rotationDeg - halfFov;
  const rightAngle = rotationDeg + halfFov;

  const leftRad = degToRad(leftAngle);
  const rightRad = degToRad(rightAngle);
  const centerRad = degToRad(rotationDeg);

  const leftPt: Vector2D = {
    x: cameraPos.x + Math.cos(leftRad) * throwDistance,
    y: cameraPos.y + Math.sin(leftRad) * throwDistance,
  };

  const rightPt: Vector2D = {
    x: cameraPos.x + Math.cos(rightRad) * throwDistance,
    y: cameraPos.y + Math.sin(rightRad) * throwDistance,
  };

  const centerPt: Vector2D = {
    x: cameraPos.x + Math.cos(centerRad) * throwDistance,
    y: cameraPos.y + Math.sin(centerRad) * throwDistance,
  };

  const pathString = `M ${cameraPos.x} ${cameraPos.y} L ${leftPt.x} ${leftPt.y} A ${throwDistance} ${throwDistance} 0 0 1 ${rightPt.x} ${rightPt.y} Z`;

  return { pathString, leftPt, rightPt, centerPt };
}

/**
 * Computes light beam polygon path for SVG rendering
 */
export function getLightBeamPolygon(
  lightPos: Vector2D,
  rotationDeg: number,
  beamAngleDeg: number,
  throwDistance: number
): string {
  const halfBeam = beamAngleDeg / 2;
  const leftAngle = rotationDeg - halfBeam;
  const rightAngle = rotationDeg + halfBeam;

  const leftPt: Vector2D = {
    x: lightPos.x + Math.cos(degToRad(leftAngle)) * throwDistance,
    y: lightPos.y + Math.sin(degToRad(leftAngle)) * throwDistance,
  };

  const rightPt: Vector2D = {
    x: lightPos.x + Math.cos(degToRad(rightAngle)) * throwDistance,
    y: lightPos.y + Math.sin(degToRad(rightAngle)) * throwDistance,
  };

  return `M ${lightPos.x} ${lightPos.y} L ${leftPt.x} ${leftPt.y} A ${throwDistance} ${throwDistance} 0 0 1 ${rightPt.x} ${rightPt.y} Z`;
}

/**
 * Approximate Kelvin temperature to RGB string for lights
 */
export function kelvinToRgb(kelvin: number): string {
  const temp = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let red: number;
  let green: number;
  let blue: number;

  if (temp <= 66) {
    red = 255;
    green = 99.4708025861 * Math.log(temp) - 161.1195681661;
    if (temp <= 19) {
      blue = 0;
    } else {
      blue = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
    }
  } else {
    red = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    green = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
    blue = 255;
  }

  const r = Math.round(Math.max(0, Math.min(255, red)));
  const g = Math.round(Math.max(0, Math.min(255, green)));
  const b = Math.round(Math.max(0, Math.min(255, blue)));

  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Generates an SVG path string representing a smooth Catmull-Rom or cubic Bezier spline
 * passing through a list of points.
 */
export function getSmoothSplinePath(points: Vector2D[]): string {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 ? points[i + 2] : p2;

    const tension = 0.5;
    const cp1x = p1.x + (p2.x - p0.x) * (tension / 3);
    const cp1y = p1.y + (p2.y - p0.y) * (tension / 3);
    const cp2x = p2.x - (p3.x - p1.x) * (tension / 3);
    const cp2y = p2.y - (p3.y - p1.y) * (tension / 3);

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  return d;
}

/**
 * Calculates actor or camera position and orientation at a given beat/progress
 * Handles smooth interpolation across waypoints
 */
export function getInterpolatedPositionAndRotation(
  initialPos: Vector2D,
  initialRotation: number,
  waypoints: Waypoint[],
  currentBeat: number
): { position: Vector2D; rotation: number } {
  if (!waypoints || waypoints.length === 0 || currentBeat <= 1) {
    return { position: initialPos, rotation: initialRotation };
  }

  // Create full path nodes: Beat 1 is initialPos
  const nodes = [
    { x: initialPos.x, y: initialPos.y, rotation: initialRotation, beat: 1 },
    ...waypoints.map((wp) => ({
      x: wp.x,
      y: wp.y,
      rotation: wp.rotation ?? initialRotation,
      beat: wp.beat,
    })),
  ].sort((a, b) => a.beat - b.beat);

  if (currentBeat <= nodes[0].beat) {
    return { position: { x: nodes[0].x, y: nodes[0].y }, rotation: nodes[0].rotation };
  }

  const lastNode = nodes[nodes.length - 1];
  if (currentBeat >= lastNode.beat) {
    return { position: { x: lastNode.x, y: lastNode.y }, rotation: lastNode.rotation };
  }

  // Find surrounding segment
  for (let i = 0; i < nodes.length - 1; i++) {
    const n1 = nodes[i];
    const n2 = nodes[i + 1];

    if (currentBeat >= n1.beat && currentBeat <= n2.beat) {
      const beatSpan = n2.beat - n1.beat;
      const progress = beatSpan === 0 ? 0 : (currentBeat - n1.beat) / beatSpan;

      // Smooth step easing
      const t = progress * progress * (3 - 2 * progress);

      const x = n1.x + (n2.x - n1.x) * t;
      const y = n1.y + (n2.y - n1.y) * t;

      // Handle shortest angle interpolation
      let angleDiff = (n2.rotation - n1.rotation) % 360;
      if (angleDiff > 180) angleDiff -= 360;
      if (angleDiff < -180) angleDiff += 360;
      const rotation = (n1.rotation + angleDiff * t + 360) % 360;

      return { position: { x, y }, rotation };
    }
  }

  return { position: initialPos, rotation: initialRotation };
}

/**
 * Check if a point is inside a camera's FOV cone
 */
export function isPointInCameraFov(
  point: Vector2D,
  cameraPos: Vector2D,
  cameraRotationDeg: number,
  fovAngleDeg: number,
  throwDistance: number
): { inFrame: boolean; normalizedX: number; distance: number } {
  const dist = getDistance(cameraPos, point);
  if (dist > throwDistance) {
    return { inFrame: false, normalizedX: 0, distance: dist };
  }

  const angleToPoint = getAngleBetweenPoints(cameraPos, point);
  let diff = (angleToPoint - cameraRotationDeg) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;

  const halfFov = fovAngleDeg / 2;
  const inFrame = Math.abs(diff) <= halfFov;
  const normalizedX = diff / halfFov; // -1 (left edge) to +1 (right edge)

  return { inFrame, normalizedX, distance: dist };
}

/**
 * Finds the nearest point on a wall segment (x1, y1) -> (x2, y2)
 * from a query point (px, py)
 */
export function getClosestPointOnSegment(
  p: Vector2D,
  w1: Vector2D,
  w2: Vector2D
): { point: Vector2D; distance: number; angle: number; t: number } {
  const dx = w2.x - w1.x;
  const dy = w2.y - w1.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    const d = getDistance(p, w1);
    return { point: { ...w1 }, distance: d, angle: 0, t: 0 };
  }

  // Projection parameter t (clamped to prevent sticking off the wall edges)
  let t = ((p.x - w1.x) * dx + (p.y - w1.y) * dy) / lenSq;
  t = Math.max(0.08, Math.min(0.92, t));

  const projPoint: Vector2D = {
    x: w1.x + t * dx,
    y: w1.y + t * dy,
  };

  const dist = getDistance(p, projPoint);
  let wallAngle = radToDeg(Math.atan2(dy, dx));
  if (wallAngle < 0) wallAngle += 360;

  return { point: projPoint, distance: dist, angle: Math.round(wallAngle), t };
}

/**
 * Checks all walls to find the closest wall within snapThreshold
 */
export function findNearestWall(
  point: Vector2D,
  walls: { id: string; x: number; y: number; x2?: number; y2?: number }[],
  snapThreshold = 40
): { wallId: string; point: Vector2D; angle: number; distance: number } | null {
  let closest: { wallId: string; point: Vector2D; angle: number; distance: number } | null = null;
  let minDistance = snapThreshold;

  for (const wall of walls) {
    const w1 = { x: wall.x, y: wall.y };
    const w2 = { x: wall.x2 ?? wall.x + 200, y: wall.y2 ?? wall.y };
    const res = getClosestPointOnSegment(point, w1, w2);

    if (res.distance < minDistance) {
      minDistance = res.distance;
      closest = {
        wallId: wall.id,
        point: res.point,
        angle: res.angle,
        distance: res.distance,
      };
    }
  }

  return closest;
}
