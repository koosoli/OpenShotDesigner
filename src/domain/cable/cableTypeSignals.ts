/**
 * Implied-signal semantics for legacy canvas cable types (plan §20).
 *
 * Floor-plan CableElements carry only a coarse `cableType` string (no ports,
 * no profiles yet). This maps that string onto the closest domain
 * SignalType so compatibility checks have something meaningful to compare.
 * Unknown types stay unknown — never silently substituted (AGENTS.md rule 13).
 */

import type { SignalType } from './types';
import type { ConnectionEndpointInfo } from './logic';

export const impliedSignalTypeForCableType = (
  cableType: string,
): SignalType | undefined => {
  const t = cableType.toLowerCase();
  if (t.startsWith('dmx')) return 'DMX512';
  if (t.startsWith('sdi_')) return 'SDI';
  if (t === 'fiber' || t.startsWith('smpte')) return 'SMPTE_CAMERA';
  if (t === 'ethernet') return 'ETHERNET';
  if (t.startsWith('audio_xlr')) return 'ANALOG_AUDIO';
  if (t.includes('aes')) return 'AES_EBU';
  if (t.startsWith('power')) return 'POWER_AC';
  if (t === 'hdmi') return 'HDMI_VIDEO';
  if (t === 'speakon') return 'SPEAKER_LEVEL';
  return undefined;
};

/**
 * Endpoint info derived purely from the canvas cable type. Elements are
 * treated as bidirectional passthrough (no direction known), and connector
 * types are omitted since they are not declared on elements yet.
 */
export const impliedEndpointInfo = (cableType: string): ConnectionEndpointInfo => ({
  signalType: impliedSignalTypeForCableType(cableType),
});
