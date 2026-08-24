import { describe, expect, it } from 'vitest';
import { optionValues, parseOption, parseOptionFrom } from '../optionValue';
import { ASPECT_RATIOS, CAMERA_RIGS, SENSOR_FORMATS } from '../../constants/presets';

describe('parseOption', () => {
  const allowed = ['low', 'eye', 'high'] as const;

  it('returns the value when it is in the allowed set', () => {
    expect(parseOption(allowed, 'eye', 'low')).toBe('eye');
  });

  it('falls back rather than writing an unrecognised value', () => {
    expect(parseOption(allowed, 'shoulder', 'low')).toBe('low');
  });

  it('falls back on the empty string, which is what a cleared select reports', () => {
    expect(parseOption(allowed, '', 'high')).toBe('high');
  });

  it('does not accept a value that merely looks similar', () => {
    // The bug this exists to catch: an <option> renamed to "Eye" while the
    // union still says "eye". A cast would have written "Eye" and rendered blank.
    expect(parseOption(allowed, 'Eye', 'low')).toBe('low');
  });

  it('is not fooled by inherited Object properties', () => {
    // `includes` on an array, not a key lookup on an object — "toString" and
    // "constructor" are properties of every object and must not pass.
    expect(parseOption(allowed, 'toString', 'low')).toBe('low');
    expect(parseOption(allowed, 'constructor', 'low')).toBe('low');
  });
});

describe('optionValues / parseOptionFrom', () => {
  it('reads the value union out of a presets array', () => {
    expect(optionValues(SENSOR_FORMATS)).toContain('Super35');
  });

  it('accepts every value the user can actually pick', () => {
    // The guarantee that matters: the allowed set IS the rendered option list,
    // so no option in the dropdown can be rejected by the parser.
    for (const rig of CAMERA_RIGS) {
      expect(parseOptionFrom(CAMERA_RIGS, rig.value, 'tripod')).toBe(rig.value);
    }
    for (const ratio of ASPECT_RATIOS) {
      expect(parseOptionFrom(ASPECT_RATIOS, ratio.value, '16:9')).toBe(ratio.value);
    }
  });

  it('rejects a value from a different list', () => {
    expect(parseOptionFrom(CAMERA_RIGS, '16:9', 'tripod')).toBe('tripod');
  });
});
