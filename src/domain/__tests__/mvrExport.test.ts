import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { exportProjectMvr, importProjectMvr } from '../technical/mvrExport';
import { createProject } from '../../utils/projectLibrary';
import { createIdbAssetStore } from '../storage/idbAssetStore';

describe('MVR export', () => {
  it('creates a valid MVR root archive with fixture position and absolute DMX address', async () => {
    const project = createProject({ title: 'MVR' });
    project.setups[0].elements.push({
      id: 'light-1', type: 'light', x: 40, y: 80, rotation: 90, name: 'Key',
      fixtureType: 'fresnel', colorTemp: 5600, intensity: 100, beamAngle: 30,
      throwDistance: 5, dmxUniverse: 2, dmxAddress: 10,
    });
    const result = await exportProjectMvr(project);
    const files = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
    const description = strFromU8(files['GeneralSceneDescription.xml']);
    expect(result.fixtureCount).toBe(1);
    expect(description).toContain('verMinor="6"');
    expect(description).toContain('<Fixture');
    expect(description).toContain('<Address break="0">522</Address>');
  });

  it('embeds real GDTF bytes and generated truss GLB, then imports them again', async () => {
    const store = createIdbAssetStore();
    const gdtfBytes = new Uint8Array([80, 75, 3, 4, 71, 68, 84, 70]);
    const ref = await store.put(new Blob([gdtfBytes], { type: 'application/zip' }), {}, 'test-gdtf');
    const project = createProject({ title: 'MVR round trip' });
    const setup = project.setups[0];
    setup.elements.push({
      id: 'light-gdtf', type: 'light', x: 20, y: 30, rotation: 15, name: 'Profiled key',
      fixtureType: 'led_panel', colorTemp: 5600, intensity: 100, beamAngle: 30, throwDistance: 5,
      dmxModeName: 'Mode 1', gdtfAssetId: ref.id, gdtfFileName: 'Maker@Fixture.gdtf',
    });
    project.trussProfiles = [{ id: 'truss-profile', model: 'Box 2m', geometry: 'box', lengthMm: 2000, widthMm: 290, heightMm: 290 }];
    project.trussElements = [{ id: 'truss-1', profileId: 'truss-profile', setupId: setup.id, x: 10, y: 10, rotation: 0 }];

    const exported = await exportProjectMvr(project, { assetStore: store });
    const files = unzipSync(new Uint8Array(await exported.blob.arrayBuffer()));
    const description = strFromU8(files['GeneralSceneDescription.xml']);
    expect(files['Maker@Fixture.gdtf']).toEqual(gdtfBytes);
    expect(Object.keys(files).some((name) => name.endsWith('.glb'))).toBe(true);
    expect(description).toContain('<GDTFSpec>Maker@Fixture.gdtf</GDTFSpec>');
    expect(description).toContain('<Truss');
    expect(description).toContain('<Geometry3D');
    expect(exported.embeddedGdtfCount).toBe(1);
    expect(exported.trussCount).toBe(1);

    const imported = await importProjectMvr(exported.blob, store);
    expect(imported.fixtureCount).toBe(1);
    expect(imported.trussCount).toBe(1);
    expect(imported.setups[0].elements.find((element) => element.type === 'light' && element.name === 'Profiled key')).toMatchObject({
      dmxModeName: 'Mode 1',
      gdtfFileName: 'Maker@Fixture.gdtf',
    });
    expect(imported.trussProfiles[0].geometryAssetId).toBeTruthy();
  });
});
