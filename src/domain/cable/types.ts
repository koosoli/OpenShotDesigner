/**
 * Cable & connection domain types (plan §19/§20).
 *
 * Ports describe what a piece of equipment can physically connect through;
 * connections link two element ports, optionally via a cable profile.
 * Canonical lengths are meters (`lengthM`) — see src/domain/units.ts.
 */

export type ConnectorType =
  | 'BNC' | 'HDMI' | 'XLR3' | 'XLR5' | 'RJ45' | 'LC_FIBER' | 'SMPTE_FIBER'
  | 'SPEAKON' | 'SOCAPEX' | 'POWERCON' | 'POWERCON_TRUE1' | 'SCHUKO'
  | 'CEE16' | 'CEE32' | 'CEE63' | 'CEE125' | 'OTHER';

export type SignalType =
  | 'SDI' | 'HDMI_VIDEO' | 'ANALOG_AUDIO' | 'AES_EBU' | 'SPEAKER_LEVEL'
  | 'DMX512' | 'ETHERNET' | 'DANTE' | 'AES67' | 'ARTNET' | 'SACN'
  | 'SMPTE_CAMERA' | 'TIMECODE' | 'GENLOCK' | 'TALLY' | 'INTERCOM' | 'NDI'
  | 'SMPTE_ST2110' | 'MADI' | 'POWER_AC' | 'OTHER';

/** A physical connector on a device or element, with its signal semantics. */
export interface ConnectionPortDefinition {
  id: string;
  name: string;
  connectorType: ConnectorType;
  signalType: SignalType;
  direction: 'input' | 'output' | 'bidirectional';
}

/**
 * A reusable cable description. Both ends are independent (adapter cables
 * with different connectors are allowed); `connectorA`/`connectorB` may be
 * omitted when unknown rather than defaulted.
 */
export interface CableProfile {
  id: string;
  name: string;
  connectorA?: ConnectorType;
  connectorB?: ConnectorType;
  supportedSignalTypes?: SignalType[];
  /** Canonical meters; explicit standard lengths only, never inferred. */
  standardLengthsM?: number[];
  weightPerMeterKg?: number;
  notes?: string;
}

/** Reference to one end of a connection: an element plus optionally a port on it. */
export interface PortRef {
  elementId: string;
  portId?: string;
}

export interface Connection {
  id: string;
  from: PortRef;
  to: PortRef;
  cableProfileId?: string;
  lengthM?: number;
  notes?: string;
}
