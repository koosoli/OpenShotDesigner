import { describe, it, expect } from 'vitest';
import { createId } from '../ids';
import type { CableProfile, Connection, ConnectionPortDefinition } from '../cable';

describe('CableProfile', () => {
  it('allows two independent ends — adapter cables with different connectors', () => {
    const adapter: CableProfile = {
      id: createId('cable'),
      name: 'powercon → Schuko feeder',
      connectorA: 'POWERCON_TRUE1',
      connectorB: 'SCHUKO',
      supportedSignalTypes: ['POWER_AC'],
      standardLengthsM: [1.5, 3, 5],
      weightPerMeterKg: 0.22,
    };
    expect(adapter.connectorA).not.toBe(adapter.connectorB);
    expect(adapter.connectorA).toBe('POWERCON_TRUE1');
    expect(adapter.connectorB).toBe('SCHUKO');
  });

  it('allows symmetric cables with identical ends and unknown data stays undefined', () => {
    const sdi: CableProfile = {
      id: createId('cable'),
      name: 'BNC SDI 12G',
      connectorA: 'BNC',
      connectorB: 'BNC',
      supportedSignalTypes: ['SDI'],
      standardLengthsM: [0.5, 1, 2, 5, 10, 25],
    };
    expect(sdi.weightPerMeterKg).toBeUndefined();
    expect(sdi.notes).toBeUndefined();
  });
});

describe('ConnectionPortDefinition', () => {
  it('describes a physical port with connector, signal semantics and direction', () => {
    const port: ConnectionPortDefinition = {
      id: createId('port'),
      name: 'DMX In',
      connectorType: 'XLR5',
      signalType: 'DMX512',
      direction: 'input',
    };
    expect(port.signalType).toBe('DMX512');
    expect(port.direction).toBe('input');
  });
});

describe('Connection', () => {
  it('links two element ports via a PortRef on each end', () => {
    const connection: Connection = {
      id: createId('conn'),
      from: { elementId: createId('el'), portId: 'dmx-out-1' },
      to: { elementId: createId('el'), portId: 'dmx-in' },
      cableProfileId: createId('cable'),
      lengthM: 7.5,
    };
    expect(connection.from.elementId).not.toBe(connection.to.elementId);
    expect(connection.from.portId).toBeDefined();
    expect(connection.to.portId).toBeDefined();
  });

  it('permits element-level refs without a specific port and optional cable info', () => {
    const connection: Connection = {
      id: createId('conn'),
      from: { elementId: createId('el') },
      to: { elementId: createId('el') },
    };
    expect(connection.cableProfileId).toBeUndefined();
    expect(connection.lengthM).toBeUndefined();
    expect(connection.from.portId).toBeUndefined();
  });
});
