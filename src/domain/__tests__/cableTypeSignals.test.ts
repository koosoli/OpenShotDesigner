import { describe, expect, it } from 'vitest';

import {
  impliedEndpointInfo,
  impliedSignalTypeForCableType,
} from '../cable/cableTypeSignals';
import { validateConnectionCompatibility } from '../cable/logic';

describe('impliedSignalTypeForCableType', () => {
  it('maps DMX cable types', () => {
    expect(impliedSignalTypeForCableType('dmx')).toBe('DMX512');
    expect(impliedSignalTypeForCableType('dmx_over_ethernet')).toBe('DMX512');
  });

  it('maps SDI variants', () => {
    expect(impliedSignalTypeForCableType('sdi_12g')).toBe('SDI');
    expect(impliedSignalTypeForCableType('sdi_3g')).toBe('SDI');
  });

  it('maps fiber and SMPTE hybrid to SMPTE camera fiber', () => {
    expect(impliedSignalTypeForCableType('fiber')).toBe('SMPTE_CAMERA');
    expect(impliedSignalTypeForCableType('smpte_fiber')).toBe('SMPTE_CAMERA');
  });

  it('maps ethernet, audio, AES, power, HDMI and speaker types', () => {
    expect(impliedSignalTypeForCableType('ethernet')).toBe('ETHERNET');
    expect(impliedSignalTypeForCableType('audio_xlr')).toBe('ANALOG_AUDIO');
    expect(impliedSignalTypeForCableType('aes_ebu')).toBe('AES_EBU');
    expect(impliedSignalTypeForCableType('power_20a')).toBe('POWER_AC');
    expect(impliedSignalTypeForCableType('power_cee63')).toBe('POWER_AC');
    expect(impliedSignalTypeForCableType('hdmi')).toBe('HDMI_VIDEO');
    expect(impliedSignalTypeForCableType('speakon')).toBe('SPEAKER_LEVEL');
  });

  it('leaves unmapped types unknown instead of guessing', () => {
    expect(impliedSignalTypeForCableType('socapex')).toBeUndefined();
    expect(impliedSignalTypeForCableType('')).toBeUndefined();
  });
});

describe('impliedEndpointInfo + validateConnectionCompatibility', () => {
  it('reports no issues when both ends imply the same signal (bidirectional passthrough)', () => {
    const info = impliedEndpointInfo('sdi_12g');
    expect(info.signalType).toBe('SDI');
    expect(info.connectorType).toBeUndefined();
    expect(info.direction).toBeUndefined();
    // Connector/direction checks are skipped because both are unknown.
    expect(validateConnectionCompatibility(info, info)).toEqual([]);
  });

  it('still surfaces signal mismatches against a profile when one is supplied', () => {
    const info = impliedEndpointInfo('dmx');
    const profile = {
      id: 'p1',
      name: '12G SDI BNC',
      supportedSignalTypes: ['SDI' as const],
    };
    const issues = validateConnectionCompatibility(info, info, profile);
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.code === 'CABLE_SIGNAL_NOT_SUPPORTED')).toBe(true);
  });
});
