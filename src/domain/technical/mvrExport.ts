import { strToU8, zipSync } from 'fflate';
import type { LightElement, Project, SceneSetup } from '../../types';

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

const matrix = (light: LightElement, setup: SceneSetup): string => {
  const radians = (light.rotation * Math.PI) / 180;
  const cos = Math.cos(radians).toFixed(6);
  const sin = Math.sin(radians).toFixed(6);
  const scale = millimetresPerPixel(setup);
  return `{${cos},${(-Number(sin)).toFixed(6)},0.000000}{${sin},${cos},0.000000}{0.000000,0.000000,1.000000}{${(light.x * scale).toFixed(3)},${(light.y * scale).toFixed(3)},0.000}`;
};

const fixtureXml = (light: LightElement, setup: SceneSetup, index: number): string => {
  const address = light.dmxUniverse && light.dmxAddress
    ? (light.dmxUniverse - 1) * 512 + light.dmxAddress
    : null;
  return [
    `        <Fixture uuid="${stableUuid(light.id)}" name="${xml(light.name || light.fixtureModel || light.fixtureType)}">`,
    `          <Matrix>${matrix(light, setup)}</Matrix>`,
    ...(light.dmxModeName ? [`          <GDTFMode>${xml(light.dmxModeName)}</GDTFMode>`] : []),
    ...(address ? ['          <Addresses>', `            <Address break="0">${address}</Address>`, '          </Addresses>'] : []),
    `          <FixtureID>${xml(light.name || `Fixture ${index + 1}`)}</FixtureID>`,
    `          <FixtureIDNumeric>${index + 1}</FixtureIDNumeric>`,
    `          <UnitNumber>${index + 1}</UnitNumber>`,
    '        </Fixture>',
  ].join('\n');
};

export interface MvrExportResult {
  blob: Blob;
  fixtureCount: number;
  warning?: string;
}

/**
 * MVR 1.6 fixture/patch export. GDTF files are intentionally not referenced:
 * the project currently stores catalogue profile ids, not the licensed .gdtf
 * archive bytes, and MVR requires every referenced resource inside the ZIP.
 */
export const exportProjectMvr = (project: Project): MvrExportResult => {
  let fixtureCount = 0;
  const layers = project.setups.map((setup) => {
    const fixtures = setup.elements.filter((element): element is LightElement => element.type === 'light');
    const body = fixtures.map((fixture) => fixtureXml(fixture, setup, fixtureCount++)).join('\n');
    return [
      `    <Layer uuid="${stableUuid(`layer-${setup.id}`)}" name="${xml(setup.name)}">`,
      '      <ChildList>',
      body,
      '      </ChildList>',
      '    </Layer>',
    ].join('\n');
  }).join('\n');
  const description = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<GeneralSceneDescription verMajor="1" verMinor="6" provider="OpenShotDesigner" providerVersion="1.0.0">',
    '  <Scene>',
    '    <Layers>',
    layers,
    '    </Layers>',
    '  </Scene>',
    '</GeneralSceneDescription>',
    '',
  ].join('\n');
  const archive = zipSync({ 'GeneralSceneDescription.xml': strToU8(description) }, { level: 6 });
  return {
    blob: new Blob([archive], { type: 'application/zip' }),
    fixtureCount,
    warning: 'Fixture positions and DMX patch exported. GDTF resource files and truss geometry are not yet embedded.',
  };
};
