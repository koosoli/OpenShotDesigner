import { CameraElement, CableElement, FloorPlanElement, LightElement, PropElement } from '../types';
import { CABLE_TYPES } from '../constants/presets';
import { fixtureProfileById } from '../domain/fixtures';

export interface PowerSummary {
  totalWatts: number;
  lightingWatts: number;
  cameraWatts: number;
  propWatts: number;
  poweredCablesCount: number;
  /** 20A / 120V circuits needed if all load were on a single-phase distro (2400W max). */
  estimatedCircuits20A: number;
  /** A practical truck / distro recommendation in kW. */
  recommendedSupplyKw: number;
}

const WATTS_BY_FIXTURE: Record<string, number> = {
  fresnel: 1000,
  softbox: 600,
  tube_light: 120,
  led_panel: 600,
  spotlight: 750,
  china_ball: 100,
  practical: 75,
  hmi: 1200,
  par_can: 1000,
  kino_flo: 400,
  reflector: 0,
  c_stand_flag: 0,
  tripod: 0,
  flag_solid: 0,
  flag_silk: 0,
  flag_net: 0,
  flag_cutter: 0,
  overhead_diffusion: 0,
};

/**
 * Lighting draw for planning. Priority order:
 * 1. Explicit power from the linked FixtureProfile (OFL/manual) — the only
 *    manufacturer-accurate source.
 * 2. Generic per-fixture-TYPE planning defaults (documented assumptions).
 * Model names are NEVER parsed for wattages (plan rule 28).
 */
export const estimateLightWatts = (light: LightElement): number => {
  const profile = fixtureProfileById(light.fixtureProfileId);
  if (profile?.powerWatts !== undefined) return profile.powerWatts;
  if (light.beamAngle === 0 && light.intensity === 0) return 0;
  return WATTS_BY_FIXTURE[light.fixtureType] ?? 0;
};

export const estimateCameraWatts = (camera: CameraElement): number => {
  const model = (camera.cameraModel || '').toLowerCase();
  const rig = (camera.rigType || '').toLowerCase();
  let watts = 120;
  if (model.includes('hdc') || model.includes('ldx') || model.includes('uhk') || model.includes('ak-uc')) watts = 350;
  else if (model.includes('alexa') || model.includes('venice')) watts = 150;
  else if (model.includes('fx6') || model.includes('fx9') || model.includes('fx30') || model.includes('fx3')) watts = 90;
  if (rig.includes('technocrane')) watts += 1800;
  else if (rig.includes('jib') || rig.includes('crane')) watts += 200;
  else if (rig.includes('gimbal')) watts += 90;
  return watts;
};

const WATTS_BY_PROP: Record<string, number> = {
  video_wall: 3500,
  foh_console: 500,
  monitor_console: 500,
  amp_stack: 500,
  speaker_stack: 900,
  speaker_array: 1800,
  sub_stack: 1400,
  monitor_wedge: 350,
  keyboard_rig: 60,
  broadcast_truck: 0, // self-powered generators
  broadcast_van: 0,
  sat_truck: 0,
};

export const estimatePropWatts = (prop: PropElement): number => {
  const base = WATTS_BY_PROP[prop.propType] ?? 0;
  if (prop.propType === 'video_wall') {
    // ~350W per square meter of LED wall
    const areaM2 = ((prop.width || 200) * (prop.height || 100)) / 10000;
    return Math.round(areaM2 * 350);
  }
  return base;
};

export const estimateElementWatts = (el: FloorPlanElement): number => {
  if (el.type === 'light') return estimateLightWatts(el as LightElement);
  if (el.type === 'camera') return estimateCameraWatts(el as CameraElement);
  if (el.type === 'prop') return estimatePropWatts(el as PropElement);
  return 0;
};

export const computePowerSummary = (elements: FloorPlanElement[]): PowerSummary => {
  let lightingWatts = 0;
  let cameraWatts = 0;
  let propWatts = 0;
  let poweredCablesCount = 0;

  elements.forEach((el) => {
    if (el.type === 'cable') {
      const info = CABLE_TYPES.find((c) => c.type === (el as CableElement).cableType);
      if (info?.isPower) poweredCablesCount += 1;
      return;
    }
    const w = estimateElementWatts(el);
    if (el.type === 'light') lightingWatts += w;
    else if (el.type === 'camera') cameraWatts += w;
    else if (el.type === 'prop') propWatts += w;
  });

  const totalWatts = lightingWatts + cameraWatts + propWatts;
  return {
    totalWatts,
    lightingWatts,
    cameraWatts,
    propWatts,
    poweredCablesCount,
    estimatedCircuits20A: Math.ceil(totalWatts / 2400),
    recommendedSupplyKw: Math.ceil((totalWatts / 1000) * 1.25),
  };
};