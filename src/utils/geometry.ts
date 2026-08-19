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
 * Approximate Kelvin temperature to RGB string for lights.
 * Tungsten renders warm amber, daylight renders cool blue so the beam + fixture
 * front visually match the color temperature set on the element.
 */
export function kelvinToRgb(kelvin: number): string {
  const stops: [number, [number, number, number]][] = [
    [2000, [255, 125, 40]],
    [2700, [255, 165, 90]],
    [3200, [255, 192, 125]],
    [4300, [255, 238, 210]],
    [5600, [160, 202, 255]],
    [6500, [130, 182, 255]],
    [10000, [110, 168, 255]],
  ];
  const t = Math.max(stops[0][0], Math.min(stops[stops.length - 1][0], kelvin));
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const [t0, c0] = stops[i];
  const [t1, c1] = stops[i + 1];
  const f = (t - t0) / (t1 - t0);
  const r = Math.round(c0[0] + (c1[0] - c0[0]) * f);
  const g = Math.round(c0[1] + (c1[1] - c0[1]) * f);
  const b = Math.round(c0[2] + (c1[2] - c0[2]) * f);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Convert color temperature in Kelvin to a valid #rrggbb hex string. */
export function kelvinToHex(kelvin: number): string {
  const stops: [number, [number, number, number]][] = [
    [2000, [255, 125, 40]],
    [2700, [255, 165, 90]],
    [3200, [255, 192, 125]],
    [4300, [255, 238, 210]],
    [5600, [160, 202, 255]],
    [6500, [130, 182, 255]],
    [10000, [110, 168, 255]],
  ];
  const t = Math.max(stops[0][0], Math.min(stops[stops.length - 1][0], kelvin));
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const [t0, c0] = stops[i];
  const [t1, c1] = stops[i + 1];
  const f = (t - t0) / (t1 - t0);
  const r = Math.round(c0[0] + (c1[0] - c0[0]) * f);
  const g = Math.round(c0[1] + (c1[1] - c0[1]) * f);
  const b = Math.round(c0[2] + (c1[2] - c0[2]) * f);
  return rgbToHex(r, g, b);
}

/** Ensure any color string (hex, rgb(), or named) is converted to a valid 7-character #rrggbb hex string for <input type="color">. */
export function ensureHexColor(colorStr?: string | null, fallback = '#ffffff'): string {
  if (!colorStr) return fallback;
  const s = colorStr.trim();
  if (s.startsWith('#')) {
    if (s.length === 4) {
      return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
    }
    if (s.length === 7) return s;
  }
  const rgbMatch = s.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  if (rgbMatch) {
    return rgbToHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]));
  }
  return fallback;
}

/** Convert HSB/HSV (0-360, 0-100, 0-100) to a #rrggbb hex string. */
export function hsvToHex(h: number, s: number, v: number): string {
  const hh = ((h % 360) + 360) % 360;
  const c = (Math.max(0, Math.min(100, v)) / 100) * (Math.max(0, Math.min(100, s)) / 100);
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = Math.max(0, Math.min(100, v)) / 100 - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) { r = c; g = x; }
  else if (hh < 120) { r = x; g = c; }
  else if (hh < 180) { g = c; b = x; }
  else if (hh < 240) { g = x; b = c; }
  else if (hh < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (n: number) =>
    Math.round(Math.max(0, Math.min(255, (n + m) * 255)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Convert integer r, g, b (0-255) to a #rrggbb hex string. */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Parse a #rrggbb / #rgb hex string into HSB (h 0-360, s 0-100, v 0-100). */
export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  let m = (hex || '').trim().replace(/^#/, '');
  if (m.length === 3) m = m.split('').map((ch) => ch + ch).join('');
  const num = parseInt(m || 'ffffff', 16);
  const r = ((num >> 16) & 255) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return {
    h: Math.round(h),
    s: max === 0 ? 0 : Math.round((d / max) * 100),
    v: Math.round(max * 100),
  };
}

/** Parse a hex string into { r, g, b } (0-255) for display. */
export function hexToRgbParts(hex: string): { r: number; g: number; b: number } {
  const { h, s, v } = hexToHsv(hex);
  const c = (v / 100) * (s / 100);
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v / 100 - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
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
