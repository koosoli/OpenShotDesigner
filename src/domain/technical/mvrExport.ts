import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { LightElement, Project, SceneSetup } from '../../types';
import type { TrussElement, TrussProfile } from '../rigging';
import { createIdbAssetStore } from '../storage/idbAssetStore';
import type { AssetStore } from '../storage/types';
import { createId } from '../ids';

const xml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Stable UUID-shaped identifier derived from a persistent project id. */
const stableUuid = (value: string): string => {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let index = 0; index < value.length; index++) {
    a = Math.imul(a ^ value.charCodeAt(index), 0x01000193) >>> 0;
    b = Math.imul(b ^ (value.charCodeAt(index) + index), 0x85ebca6b) >>> 0;
  }
  const hex = `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}${(a ^ b).toString(16).padStart(8, '0')}${Math.imul(a, b).toString(16).padStart(8, '0')}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`.toUpperCase();
};

const millimetresPerPixel = (setup: SceneSetup): number =>
  (setup.gridSettings.unit === 'm' ? 1000 : 304.8) / setup.gridSettings.pixelsPerUnit;

const transformMatrix = (x: number, y: number, rotation: number, setup: SceneSetup, z = 0): string => {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians).toFixed(6);
  const sin = Math.sin(radians).toFixed(6);
  const scale = millimetresPerPixel(setup);
  return `{${cos},${(-Number(sin)).toFixed(6)},0.000000}{${sin},${cos},0.000000}{0.000000,0.000000,1.000000}{${(x * scale).toFixed(3)},${(y * scale).toFixed(3)},${z.toFixed(3)}}`;
};

const safeResourceName = (name: string, fallback: string): string => {
  const cleaned = name.replace(/[^A-Za-z0-9_@.-]+/g, '-').replace(/^[.-]+/, '').slice(0, 120);
  return cleaned.includes('.') ? cleaned : fallback;
};

const uniqueName = (wanted: string, used: Set<string>): string => {
  const dot = wanted.lastIndexOf('.');
  const stem = dot > 0 ? wanted.slice(0, dot) : wanted;
  const ext = dot > 0 ? wanted.slice(dot) : '';
  let candidate = wanted;
  let suffix = 2;
  while (used.has(candidate.toLowerCase())) candidate = `${stem}-${suffix++}${ext}`;
  used.add(candidate.toLowerCase());
  return candidate;
};

/** Minimal standards-compliant GLB containing the measured truss envelope. */
const trussEnvelopeGlb = (lengthMm: number, widthMm: number, heightMm: number): Uint8Array => {
  const l = Math.max(1, lengthMm) / 1000 / 2;
  const w = Math.max(1, widthMm) / 1000 / 2;
  const h = Math.max(1, heightMm) / 1000 / 2;
  const positions = new Float32Array([
    -l, -w, -h, l, -w, -h, l, w, -h, -l, w, -h,
    -l, -w, h, l, -w, h, l, w, h, -l, w, h,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0,
  ]);
  const binaryLength = positions.byteLength + indices.byteLength;
  const binaryPadded = (binaryLength + 3) & ~3;
  const binary = new Uint8Array(binaryPadded);
  binary.set(new Uint8Array(positions.buffer), 0);
  binary.set(new Uint8Array(indices.buffer), positions.byteLength);
  const json = JSON.stringify({
    asset: { version: '2.0', generator: 'OpenShotDesigner' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'Truss envelope' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: binaryLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength, target: 34963 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [-l, -w, -h], max: [l, w, h] },
      { bufferView: 1, componentType: 5123, count: indices.length, type: 'SCALAR' },
    ],
  });
  const jsonBytes = strToU8(json);
  const jsonPadded = (jsonBytes.length + 3) & ~3;
  const totalLength = 12 + 8 + jsonPadded + 8 + binaryPadded;
  const out = new Uint8Array(totalLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonPadded, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.fill(0x20, 20, 20 + jsonPadded);
  out.set(jsonBytes, 20);
  const binHeader = 20 + jsonPadded;
  view.setUint32(binHeader, binaryPadded, true);
  view.setUint32(binHeader + 4, 0x004e4942, true);
  out.set(binary, binHeader + 8);
  return out;
};

export interface MvrExportResult {
  blob: Blob;
  fixtureCount: number;
  trussCount: number;
  embeddedGdtfCount: number;
  warnings: string[];
}

interface ResolvedResource {
  assetId: string;
  fileName: string;
  bytes: Uint8Array;
}

const loadResource = async (
  assetStore: AssetStore,
  assetId: string | undefined,
  fileName: string | undefined,
  fallback: string,
  usedNames: Set<string>,
  warnings: string[],
): Promise<ResolvedResource | null> => {
  if (!assetId) return null;
  const blob = await assetStore.get(assetId);
  if (!blob) {
    warnings.push(`Missing embedded resource ${fileName || assetId}; its MVR reference was omitted.`);
    return null;
  }
  const wanted = safeResourceName(fileName || fallback, fallback);
  return { assetId, fileName: uniqueName(wanted, usedNames), bytes: new Uint8Array(await blob.arrayBuffer()) };
};

/** MVR 1.6 export with real GDTF resources and truss geometry. */
export const exportProjectMvr = async (
  project: Project,
  options: { assetStore?: AssetStore; setupIds?: readonly string[] } = {},
): Promise<MvrExportResult> => {
  const assetStore = options.assetStore ?? createIdbAssetStore();
  const requestedSetupIds = options.setupIds ? new Set(options.setupIds) : null;
  const setupsToExport = requestedSetupIds
    ? project.setups.filter((setup) => requestedSetupIds.has(setup.id))
    : project.setups;
  if (!setupsToExport.length) throw new Error('No matching setup was selected for MVR export.');
  const warnings: string[] = [];
  const usedNames = new Set<string>(['generalscenedescription.xml']);
  const archive: Record<string, Uint8Array> = {};
  const resourcesByAsset = new Map<string, ResolvedResource>();
  const fixtureResources = new Map<string, ResolvedResource>();
  const trussGdtfResources = new Map<string, ResolvedResource>();
  const trussGeometryResources = new Map<string, ResolvedResource>();
  const setupById = new Map(project.setups.map((setup) => [setup.id, setup]));
  const activeSetup = setupById.get(project.activeSetupId) ?? project.setups[0];
  const exportedSetupIds = new Set(setupsToExport.map((setup) => setup.id));
  const exportedTrusses = (project.trussElements ?? []).filter((truss) => exportedSetupIds.has(truss.setupId ?? activeSetup?.id));
  const exportedProfileIds = new Set(exportedTrusses.flatMap((truss) => truss.profileId ? [truss.profileId] : []));

  const resolveOnce = async (assetId: string | undefined, fileName: string | undefined, fallback: string) => {
    if (!assetId) return null;
    const cached = resourcesByAsset.get(assetId);
    if (cached) return cached;
    const resource = await loadResource(assetStore, assetId, fileName, fallback, usedNames, warnings);
    if (resource) {
      resourcesByAsset.set(assetId, resource);
      archive[resource.fileName] = resource.bytes;
    }
    return resource;
  };

  for (const setup of setupsToExport) {
    for (const light of setup.elements.filter((element): element is LightElement => element.type === 'light')) {
      const resource = await resolveOnce(light.gdtfAssetId, light.gdtfFileName, `${light.id}.gdtf`);
      if (resource) fixtureResources.set(light.id, resource);
    }
  }
  for (const profile of (project.trussProfiles ?? []).filter((candidate) => exportedProfileIds.has(candidate.id))) {
    const gdtf = await resolveOnce(profile.gdtfAssetId, profile.gdtfFileName, `${profile.id}.gdtf`);
    if (gdtf) trussGdtfResources.set(profile.id, gdtf);
    const geometry = await resolveOnce(profile.geometryAssetId, profile.geometryFileName, `${profile.id}.glb`);
    if (geometry) trussGeometryResources.set(profile.id, geometry);
  }

  let fixtureCount = 0;
  let trussCount = 0;
  const profiles = new Map((project.trussProfiles ?? []).map((profile) => [profile.id, profile]));

  for (const truss of exportedTrusses) {
    const profile = truss.profileId ? profiles.get(truss.profileId) : undefined;
    if (profile && !trussGeometryResources.has(profile.id)) {
      const fileName = uniqueName(safeResourceName(`${profile.model || profile.id}.glb`, `${profile.id}.glb`), usedNames);
      const length = truss.lengthOverrideMm ?? profile.lengthMm ?? 1000;
      const bytes = trussEnvelopeGlb(length, profile.widthMm ?? 290, profile.heightMm ?? 290);
      const resource = { assetId: `generated:${profile.id}`, fileName, bytes };
      trussGeometryResources.set(profile.id, resource);
      archive[fileName] = bytes;
    }
  }

  const fixtureXml = (light: LightElement, setup: SceneSetup): string => {
    const resource = fixtureResources.get(light.id);
    const address = light.dmxUniverse && light.dmxAddress
      ? (light.dmxUniverse - 1) * 512 + light.dmxAddress
      : null;
    if (resource && !light.dmxModeName) warnings.push(`${light.name || light.id}: GDTF is embedded but not referenced because its GDTF mode is missing.`);
    const fixtureNumber = ++fixtureCount;
    return [
      `        <Fixture uuid="${light.mvrUuid || stableUuid(light.id)}" name="${xml(light.name || light.fixtureModel || light.fixtureType)}">`,
      `          <Matrix>${transformMatrix(light.x, light.y, light.rotation, setup)}</Matrix>`,
      ...(resource && light.dmxModeName ? [`          <GDTFSpec>${xml(resource.fileName)}</GDTFSpec>`, `          <GDTFMode>${xml(light.dmxModeName)}</GDTFMode>`] : []),
      ...(address ? ['          <Addresses>', `            <Address break="0">${address}</Address>`, '          </Addresses>'] : []),
      `          <FixtureID>${xml(light.name || `Fixture ${fixtureNumber}`)}</FixtureID>`,
      `          <FixtureIDNumeric>${fixtureNumber}</FixtureIDNumeric>`,
      `          <UnitNumber>${fixtureNumber}</UnitNumber>`,
      '        </Fixture>',
    ].join('\n');
  };

  const trussXml = (truss: TrussElement, setup: SceneSetup): string => {
    const profile = truss.profileId ? profiles.get(truss.profileId) : undefined;
    const geometry = profile ? trussGeometryResources.get(profile.id) : undefined;
    const gdtf = profile ? trussGdtfResources.get(profile.id) : undefined;
    if (gdtf && !profile?.gdtfModeName) warnings.push(`${truss.label || truss.id}: truss GDTF is embedded but not referenced because its GDTF mode is missing.`);
    const number = ++trussCount;
    return [
      `        <Truss uuid="${truss.mvrUuid || stableUuid(truss.id)}" name="${xml(truss.label || profile?.model || `Truss ${number}`)}">`,
      `          <Matrix>${transformMatrix(truss.x, truss.y, truss.rotation, setup, truss.elevationMm ?? 0)}</Matrix>`,
      '          <Geometries>',
      ...(geometry ? [`            <Geometry3D fileName="${xml(geometry.fileName)}" />`] : []),
      '          </Geometries>',
      ...(gdtf && profile?.gdtfModeName ? [`          <GDTFSpec>${xml(gdtf.fileName)}</GDTFSpec>`, `          <GDTFMode>${xml(profile.gdtfModeName)}</GDTFMode>`] : []),
      `          <FixtureID>${xml(truss.label || `Truss ${number}`)}</FixtureID>`,
      `          <FixtureIDNumeric>${number}</FixtureIDNumeric>`,
      `          <UnitNumber>${number}</UnitNumber>`,
      '        </Truss>',
    ].join('\n');
  };

  const layers = setupsToExport.map((setup) => {
    const fixtures = setup.elements.filter((element): element is LightElement => element.type === 'light');
    const trusses = exportedTrusses.filter((truss) => (truss.setupId ?? activeSetup?.id) === setup.id);
    return [
      `    <Layer uuid="${stableUuid(`layer-${setup.id}`)}" name="${xml(setup.name)}">`,
      '      <ChildList>',
      ...fixtures.map((fixture) => fixtureXml(fixture, setup)),
      ...trusses.map((truss) => trussXml(truss, setup)),
      '      </ChildList>',
      '    </Layer>',
    ].join('\n');
  }).join('\n');
  const description = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<GeneralSceneDescription verMajor="1" verMinor="6" provider="OpenShotDesigner" providerVersion="1.0.0">',
    '  <Scene>', '    <Layers>', layers, '    </Layers>', '  </Scene>',
    '</GeneralSceneDescription>', '',
  ].join('\n');
  archive['GeneralSceneDescription.xml'] = strToU8(description);
  return {
    blob: new Blob([zipSync(archive, { level: 6 })], { type: 'application/zip' }),
    fixtureCount,
    trussCount,
    embeddedGdtfCount: [...resourcesByAsset.values()].filter((resource) => resource.fileName.toLowerCase().endsWith('.gdtf')).length,
    warnings,
  };
};

export interface MvrImportResult {
  setups: SceneSetup[];
  trussProfiles: TrussProfile[];
  trussElements: TrussElement[];
  fixtureCount: number;
  trussCount: number;
  importedResourceCount: number;
  warnings: string[];
}

const childText = (node: Element, selector: string): string | undefined =>
  node.querySelector(`:scope > ${selector}`)?.textContent?.trim() || undefined;

const parseMatrix = (raw: string | undefined): { xMm: number; yMm: number; zMm: number; rotation: number } => {
  const rows = raw?.match(/\{([^}]+)\}/g)?.map((row) => row.slice(1, -1).split(',').map(Number));
  if (!rows || rows.length < 4 || rows.some((row) => row.some((value) => !Number.isFinite(value)))) {
    return { xMm: 0, yMm: 0, zMm: 0, rotation: 0 };
  }
  return { xMm: rows[3][0], yMm: rows[3][1], zMm: rows[3][2], rotation: Math.atan2(rows[1][0], rows[0][0]) * 180 / Math.PI };
};

/** GDTF archives are ZIP files with a root description.xml document. */
export const validateGdtfArchive = async (blob: Blob): Promise<void> => {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  } catch {
    throw new Error('The selected file is not a readable GDTF ZIP archive.');
  }
  const description = Object.entries(files).find(([name]) => name.toLowerCase() === 'description.xml')?.[1];
  if (!description) throw new Error('Invalid GDTF: description.xml is missing from the archive root.');
  const document = new DOMParser().parseFromString(strFromU8(description), 'application/xml');
  if (document.querySelector('parsererror') || document.documentElement.tagName !== 'GDTF') {
    throw new Error('Invalid GDTF: description.xml has no GDTF root document.');
  }
};

/** Import fixture patch, positions, trusses, and referenced GDTF/geometry resources from MVR 1.x. */
export const importProjectMvr = async (
  blob: Blob,
  assetStore: AssetStore = createIdbAssetStore(),
): Promise<MvrImportResult> => {
  const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const rootBytes = Object.entries(files).find(([name]) => name.toLowerCase() === 'generalscenedescription.xml')?.[1];
  if (!rootBytes) throw new Error('Not a valid MVR file: GeneralSceneDescription.xml is missing.');
  const document = new DOMParser().parseFromString(strFromU8(rootBytes), 'application/xml');
  const parseError = document.querySelector('parsererror');
  if (parseError) throw new Error(`Invalid MVR XML: ${parseError.textContent?.trim() || 'parse error'}`);
  const root = document.documentElement;
  if (root.tagName !== 'GeneralSceneDescription') throw new Error('Not a valid MVR GeneralSceneDescription document.');
  const warnings: string[] = [];
  if (root.getAttribute('verMajor') !== '1') warnings.push(`MVR ${root.getAttribute('verMajor') || '?'} may contain unsupported fields; known fixtures and trusses were imported.`);
  const byLowerName = new Map(Object.entries(files).map(([name, bytes]) => [name.toLowerCase(), { name, bytes }]));
  const importedAssets = new Map<string, string>();
  const storeResource = async (name: string | undefined, owner: string): Promise<string | undefined> => {
    if (!name) return undefined;
    const file = byLowerName.get(name.toLowerCase());
    if (!file) { warnings.push(`Referenced MVR resource ${name} is missing.`); return undefined; }
    const cached = importedAssets.get(file.name.toLowerCase());
    if (cached) return cached;
    const type = name.toLowerCase().endsWith('.gdtf') ? 'application/zip' : name.toLowerCase().endsWith('.glb') ? 'model/gltf-binary' : 'application/octet-stream';
    const ref = await assetStore.put(new Blob([file.bytes], { type }), { source: `MVR import: ${file.name}` }, owner);
    importedAssets.set(file.name.toLowerCase(), ref.id);
    return ref.id;
  };
  const setups: SceneSetup[] = [];
  const trussProfiles: TrussProfile[] = [];
  const trussElements: TrussElement[] = [];
  let fixtureCount = 0;
  let trussCount = 0;
  const layers = Array.from(document.querySelectorAll('Scene > Layers > Layer'));
  for (const [layerIndex, layer] of layers.entries()) {
    const setupId = createId('setup');
    const elements: LightElement[] = [];
    for (const fixture of Array.from(layer.querySelectorAll('Fixture'))) {
      const uuid = fixture.getAttribute('uuid') || stableUuid(createId('light'));
      const matrix = parseMatrix(childText(fixture, 'Matrix'));
      const absoluteAddress = Number(childText(fixture, 'Addresses > Address'));
      const gdtfFileName = childText(fixture, 'GDTFSpec');
      const gdtfAssetId = await storeResource(gdtfFileName, `mvr-fixture:${uuid}`);
      elements.push({
        id: createId('light'), type: 'light', name: fixture.getAttribute('name') || childText(fixture, 'FixtureID') || `Fixture ${fixtureCount + 1}`,
        x: matrix.xMm / 10, y: matrix.yMm / 10, rotation: matrix.rotation,
        fixtureType: 'led_panel', colorTemp: 5600, intensity: 100, beamAngle: 30, throwDistance: 5,
        ...(Number.isFinite(absoluteAddress) && absoluteAddress > 0 ? { dmxUniverse: Math.floor((absoluteAddress - 1) / 512) + 1, dmxAddress: ((absoluteAddress - 1) % 512) + 1 } : {}),
        dmxModeName: childText(fixture, 'GDTFMode'), gdtfFileName, gdtfAssetId, mvrUuid: uuid,
      });
      fixtureCount++;
    }
    for (const truss of Array.from(layer.querySelectorAll('Truss'))) {
      const uuid = truss.getAttribute('uuid') || stableUuid(createId('trussel'));
      const matrix = parseMatrix(childText(truss, 'Matrix'));
      const gdtfFileName = childText(truss, 'GDTFSpec');
      const geometryFileName = truss.querySelector(':scope > Geometries > Geometry3D')?.getAttribute('fileName') || undefined;
      const profileId = createId('trussprof');
      trussProfiles.push({
        id: profileId, model: truss.getAttribute('name') || `Imported truss ${trussCount + 1}`, geometry: 'other',
        gdtfFileName, gdtfModeName: childText(truss, 'GDTFMode'), gdtfAssetId: await storeResource(gdtfFileName, `mvr-truss:${uuid}`),
        geometryFileName, geometryAssetId: await storeResource(geometryFileName, `mvr-truss:${uuid}`),
      });
      trussElements.push({ id: createId('trussel'), label: truss.getAttribute('name') || undefined, profileId, setupId, x: matrix.xMm / 10, y: matrix.yMm / 10, rotation: matrix.rotation, elevationMm: matrix.zMm, mvrUuid: uuid });
      trussCount++;
    }
    setups.push({
      id: setupId, name: layer.getAttribute('name') || `MVR Layer ${layerIndex + 1}`, sceneNumber: `MVR-${layerIndex + 1}`,
      location: 'MVR import', timeOfDay: 'Day INT', elements, shots: [], currentBeat: 1, totalBeats: 1,
      aspectRatio: '16:9', canvasScale: 1, canvasOffset: { x: 50, y: 50 },
      gridSettings: { size: 30, snap: true, showGrid: false, unit: 'm', pixelsPerUnit: 100 },
    });
  }
  if (!setups.length) throw new Error('The MVR file contains no scene layers.');
  return { setups, trussProfiles, trussElements, fixtureCount, trussCount, importedResourceCount: importedAssets.size, warnings };
};
