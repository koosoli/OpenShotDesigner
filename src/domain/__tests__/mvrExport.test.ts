import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { exportProjectMvr } from '../technical/mvrExport';
import { createProject } from '../../utils/projectLibrary';

describe('MVR export', () => {
  it('creates a valid MVR root archive with fixture position and absolute DMX address', async () => {
    const project = createProject({ title: 'MVR' });
    project.setups[0].elements.push({
      id: 'light-1', type: 'light', x: 40, y: 80, rotation: 90, name: 'Key',
      fixtureType: 'fresnel', colorTemp: 5600, intensity: 100, beamAngle: 30,
      throwDistance: 5, dmxUniverse: 2, dmxAddress: 10,
    });
    const result = exportProjectMvr(project);
    const files = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
    const description = strFromU8(files['GeneralSceneDescription.xml']);
    expect(result.fixtureCount).toBe(1);
    expect(description).toContain('verMinor="6"');
    expect(description).toContain('<Fixture');
    expect(description).toContain('<Address break="0">522</Address>');
  });
});
