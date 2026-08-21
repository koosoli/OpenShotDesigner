/**
 * Canonical units policy (plan §4.11, AGENTS.md rule 14).
 *
 * Canonical SI units are stored internally:
 *   length mm · mass kg · power W · current A · voltage V · angles degrees
 * Conversions happen ONLY at display/export boundaries. A user changing their
 * display unit preference never changes stored physical meaning.
 */

export type LengthUnit = 'mm' | 'cm' | 'm' | 'ft' | 'in';
export type MassUnit = 'kg' | 'lb';

const MM_PER: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  ft: 304.8,
  in: 25.4,
};

const KG_PER_LB = 0.45359237;

/** Convert a length between units via the canonical base (mm). */
export const convertLength = (value: number, from: LengthUnit, to: LengthUnit): number =>
  (value * MM_PER[from]) / MM_PER[to];

/** Convert a mass between kg and lb. */
export const convertMass = (value: number, from: MassUnit, to: MassUnit): number => {
  if (from === to) return value;
  return from === 'kg' ? value / KG_PER_LB : value * KG_PER_LB;
};

/** Format a canonical millimetre length for display in the user's preferred unit. */
export const formatLength = (valueMm: number, displayUnit: LengthUnit, fractionDigits = 1): string => {
  const value = convertLength(valueMm, 'mm', displayUnit);
  return `${value.toFixed(fractionDigits).replace(/\.0+$/, '')} ${displayUnit}`;
};
