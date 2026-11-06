import type { FixtureBeamAim } from './types';

export function clampBeamPan(degrees: number): number {
  return Number.isFinite(degrees) ? Math.max(-180, Math.min(180, degrees)) : 0;
}
export function clampBeamTilt(degrees: number): number {
  return Number.isFinite(degrees) ? Math.max(-90, Math.min(90, degrees)) : 0;
}
export function resolveBeamAim(fixture: FixtureBeamAim & { rotation: number }, inheritedTilt = 20) {
  const panOffsetDeg = clampBeamPan(fixture.beamPanDeg ?? 0);
  const tiltDeg = clampBeamTilt(typeof fixture.beamTiltDeg === 'number' && Number.isFinite(fixture.beamTiltDeg)
    ? fixture.beamTiltDeg : inheritedTilt);
  const yaw = (fixture.rotation + panOffsetDeg) * Math.PI / 180;
  const tilt = tiltDeg * Math.PI / 180;
  return { panOffsetDeg, tiltDeg, direction: [Math.cos(yaw) * Math.cos(tilt), Math.sin(yaw) * Math.cos(tilt), -Math.sin(tilt)] as [number, number, number] };
}
