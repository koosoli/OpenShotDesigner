import { convertLength } from '../units';
import type {
  LightModifier,
  LightPhotometricMarker,
  LightPhotometricReference,
  LightPhotometricResult,
} from './types';

export const LUX_PER_FOOT_CANDLE = 10.763910416709722;

export const luxToFootCandles = (lux: number): number => lux / LUX_PER_FOOT_CANDLE;
export const footCandlesToLux = (footCandles: number): number => footCandles * LUX_PER_FOOT_CANDLE;

export const calculateIlluminance = (
  reference: LightPhotometricReference | undefined,
  targetDistanceMm: number,
  currentIntensityPercent: number,
  modifiers: readonly LightModifier[] = [],
): LightPhotometricResult => {
  const warnings: string[] = [];
  if (!reference) return { lux: null, footCandles: null, warnings: ['Add a photometric reference first.'] };
  if (!(reference.illuminanceLux > 0) || !(reference.distanceMm > 0) || !(targetDistanceMm > 0)) {
    return { lux: null, footCandles: null, warnings: ['Illuminance and distances must be greater than zero.'] };
  }

  const referenceIntensity = reference.referenceIntensityPercent ?? 100;
  if (!(referenceIntensity > 0) || !(currentIntensityPercent >= 0)) {
    return { lux: null, footCandles: null, warnings: ['Dimmer percentages are invalid.'] };
  }

  let transmission = 1;
  if (reference.modifierBasis === 'bare_fixture') {
    for (const modifier of modifiers.filter((candidate) => candidate.enabled)) {
      if (modifier.transmissionPercent === undefined) {
        warnings.push(`${modifier.label || modifier.kind}: transmission is unknown.`);
        return { lux: null, footCandles: null, warnings };
      }
      if (!(modifier.transmissionPercent > 0 && modifier.transmissionPercent <= 100)) {
        warnings.push(`${modifier.label || modifier.kind}: transmission must be above 0 and at most 100%.`);
        return { lux: null, footCandles: null, warnings };
      }
      transmission *= modifier.transmissionPercent / 100;
    }
  }

  const distanceFactor = (reference.distanceMm / targetDistanceMm) ** 2;
  const dimmerFactor = currentIntensityPercent / referenceIntensity;
  const lux = reference.illuminanceLux * distanceFactor * dimmerFactor * transmission;
  warnings.push('Inverse-square and linear dimmer approximation; verify critical measurements on set.');
  return { lux, footCandles: luxToFootCandles(lux), warnings };
};

export const buildPhotometricMarkers = (input: {
  reference?: LightPhotometricReference;
  modifiers?: readonly LightModifier[];
  currentIntensityPercent: number;
  throwDistancePx: number;
  pixelsPerUnit: number;
  gridUnit: 'm' | 'ft';
  maxMarkers?: number;
}): LightPhotometricMarker[] => {
  if (!(input.throwDistancePx > 0) || !(input.pixelsPerUnit > 0)) return [];
  const unitCount = Math.min(
    Math.floor(input.throwDistancePx / input.pixelsPerUnit),
    input.maxMarkers ?? 12,
  );
  return Array.from({ length: unitCount }, (_, index) => {
    const displayDistance = index + 1;
    const distanceMm = convertLength(displayDistance, input.gridUnit, 'mm');
    return {
      distancePx: displayDistance * input.pixelsPerUnit,
      distanceMm,
      ...calculateIlluminance(
        input.reference,
        distanceMm,
        input.currentIntensityPercent,
        input.modifiers,
      ),
    };
  });
};
