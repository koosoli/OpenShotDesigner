import { getSymbolById } from './symbolRegistry';
const kinds: Readonly<Record<string, string>> = {
  'lighting.fresnel': 'fresnel', 'lighting.led-panel': 'led_panel', 'lighting.led-par': 'par_can',
  'lighting.moving-head-wash': 'moving_head', 'lighting.moving-head-spot': 'moving_head', 'lighting.follow-spot': 'spotlight',
};
/** The same emitter classification is used by the inspector and 3D simulation. */
export const symbolFixtureKind = (id: string) => getSymbolById(id)?.fixtureGlyph ?? kinds[id];
