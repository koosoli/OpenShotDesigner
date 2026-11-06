import type { PlanSymbolDefinition } from './symbolTypes';

type Model = 'cob' | 'fresnel' | 'panel' | 'tube' | 'floppy' | 'stand' | 'roller' | 'kit' | 'power' | 'apple' | 'cloth' | 'frame' | 'tablet' | 'control' | 'van';
interface OfferAsset {
  key: string;
  name: string;
  model: Model;
  width: number;
  depth: number;
  height: number;
  color?: string;
}

/** Equipment names from offer VP207BNS202603, 2026-11-03.
 * Dimensions are illustrative preview geometry. Fabric sizes are interpreted as feet.
 * Prices, client details and rental terms are deliberately outside the asset catalog. */
export const OFFER_EQUIPMENT: readonly OfferAsset[] = [
  { key: 'nanlite-2400b', name: 'Nanlite 2400B LED light', model: 'cob', width: 1000, depth: 1000, height: 2200 },
  { key: 'aputure-1200d-f10', name: 'Aputure 1200D + F10', model: 'fresnel', width: 900, depth: 900, height: 2100 },
  { key: 'aputure-f10', name: 'Aputure F10 Fresnel attachment', model: 'fresnel', width: 450, depth: 450, height: 450 },
  { key: 'aputure-600d', name: 'Aputure 600D', model: 'cob', width: 800, depth: 800, height: 1900 },
  { key: 'amaran-300c', name: 'Amaran 300C', model: 'cob', width: 750, depth: 750, height: 1800 },
  { key: 'amaran-f22c', name: 'Amaran F22C flexible panel', model: 'panel', width: 800, depth: 800, height: 1900 },
  { key: 'infinibar-pb12', name: 'Aputure INFINIBAR PB12', model: 'tube', width: 1200, depth: 100, height: 120 },
  { key: 'white-floppy', name: 'White floppy', model: 'floppy', width: 1200, depth: 700, height: 2100 },
  { key: 'stand-kit', name: 'Stand kit', model: 'kit', width: 1200, depth: 500, height: 450 },
  { key: 'cable-kit', name: 'Cable kit', model: 'kit', width: 800, depth: 500, height: 450 },
  { key: 'distribution-32a', name: '32 Amp distribution box', model: 'power', width: 500, depth: 350, height: 450 },
  { key: 'distribution-63a', name: '63 Amp distribution box', model: 'power', width: 650, depth: 450, height: 550 },
  { key: 'grip-kit', name: 'Grip kit', model: 'kit', width: 850, depth: 550, height: 500 },
  { key: 'flag-diff-kit', name: 'Flag and diffusion kit', model: 'kit', width: 1250, depth: 350, height: 900 },
  { key: 'apple-box-kit', name: 'Apple box kit', model: 'apple', width: 510, depth: 300, height: 420 },
  { key: 'super-wind-up', name: 'Super wind up stand', model: 'stand', width: 1200, depth: 1200, height: 2800 },
  { key: 'hi-hi-roller', name: 'Hi Hi roller stand', model: 'roller', width: 1100, depth: 1100, height: 2600 },
  { key: 'wind-up', name: 'Wind up stand', model: 'stand', width: 900, depth: 900, height: 2100 },
  { key: 'magic-cloth-20', name: '20x20 Magic Cloth (fabric only)', model: 'cloth', width: 6096, depth: 6096, height: 18 },
  { key: 'ub-12', name: '12x12 UB fabric', model: 'cloth', width: 3657.6, depth: 3657.6, height: 18, color: '#d4c8a2' },
  { key: 'grid-cloth-12', name: '12x12 Grid cloth', model: 'cloth', width: 3657.6, depth: 3657.6, height: 18 },
  { key: 'frame-12', name: '12x12 frame', model: 'frame', width: 3657.6, depth: 3657.6, height: 55 },
  { key: 'ub-8', name: '8x8 UB fabric', model: 'cloth', width: 2438.4, depth: 2438.4, height: 18, color: '#d4c8a2' },
  { key: 'grid-cloth-8', name: '8x8 Grid cloth', model: 'cloth', width: 2438.4, depth: 2438.4, height: 18 },
  { key: 'frame-8', name: '8x8 frame', model: 'frame', width: 2438.4, depth: 2438.4, height: 55 },
  { key: 'ipad', name: 'iPad lighting control tablet', model: 'tablet', width: 280, depth: 210, height: 15 },
  { key: 'black-out', name: 'Black out lighting control', model: 'control', width: 320, depth: 220, height: 100 },
  { key: 'cerise', name: 'Cerise (offer control equipment)', model: 'control', width: 320, depth: 220, height: 100 },
  { key: 'renault-trafic', name: 'Renault Trafic transport van', model: 'van', width: 2050, depth: 5600, height: 2550 },
];

const stroke = 'fill="none" stroke="currentColor" stroke-width="4"';
const glyphs: Record<Model, string> = {
  cob: `<circle cx="50" cy="50" r="22" ${stroke}/><path d="M72 40 90 30v40L72 60M28 50H12" ${stroke}/>`,
  fresnel: `<circle cx="50" cy="50" r="26" ${stroke}/><circle cx="50" cy="50" r="17" ${stroke}/><path d="M76 50h18" ${stroke}/>`,
  panel: `<rect x="12" y="22" width="76" height="56" ${stroke}/><path d="M25 22v56m25-56v56m25-56v56" ${stroke}/>`,
  tube: `<rect x="4" y="38" width="92" height="24" rx="5" ${stroke}/><path d="M12 38v24m76-24v24" ${stroke}/>`,
  floppy: `<rect x="10" y="10" width="65" height="55" ${stroke}/><path d="M75 35h15v55H25V65" ${stroke}/>`,
  stand: `<circle cx="50" cy="50" r="8" ${stroke}/><path d="M50 50 50 8M50 50 12 85M50 50 88 85" ${stroke}/>`,
  roller: `<path d="M50 45V8M50 45 15 80M50 45 85 80" ${stroke}/><circle cx="15" cy="83" r="7" ${stroke}/><circle cx="85" cy="83" r="7" ${stroke}/>`,
  kit: `<rect x="8" y="20" width="84" height="65" rx="5" ${stroke}/><path d="M35 20v-8h30v8M8 42h84M25 36v15m50-15v15" ${stroke}/>`,
  power: `<rect x="15" y="12" width="70" height="76" ${stroke}/><circle cx="35" cy="38" r="9" ${stroke}/><circle cx="65" cy="38" r="9" ${stroke}/><path d="M25 66h50" ${stroke}/>`,
  apple: `<rect x="10" y="18" width="80" height="64" ${stroke}/><rect x="35" y="42" width="30" height="12" rx="5" ${stroke}/>`,
  cloth: `<path d="M10 10h80v80H10Z" ${stroke}/><path d="M15 75 75 15M25 85 85 25" ${stroke}/>`,
  frame: `<rect x="8" y="8" width="84" height="84" ${stroke}/><rect x="16" y="16" width="68" height="68" ${stroke}/>`,
  tablet: `<rect x="18" y="5" width="64" height="90" rx="6" ${stroke}/><rect x="24" y="14" width="52" height="66" ${stroke}/>`,
  control: `<rect x="12" y="18" width="76" height="64" ${stroke}/><path d="M22 32h56M30 48v22m20-22v22m20-22v22" ${stroke}/>`,
  van: `<rect x="24" y="5" width="52" height="90" rx="8" ${stroke}/><path d="M26 28h48M24 60h52" ${stroke}/>`,
};

export const OFFER_SYMBOLS: PlanSymbolDefinition[] = OFFER_EQUIPMENT.map((item) => ({
  id: `production.${item.key}`, name: item.name,
  category: ['cob', 'fresnel', 'panel', 'tube'].includes(item.model) ? 'lighting' : 'grip',
  subCategory: 'Production equipment',
  keywords: [item.key.replaceAll('-', ' '), item.name, 'VP207BNS202603', 'rental equipment'],
  svg: glyphs[item.model], defaultWidth: item.width / 10, defaultHeight: item.depth / 10,
  defaultPhysicalSize: { widthMm: item.width, depthMm: item.depth },
  ...(['cob', 'fresnel', 'panel', 'tube'].includes(item.model) ? {
    fixtureGlyph: item.model === 'panel' ? 'led_panel' as const : item.model === 'tube' ? 'tube_light' as const : 'fresnel' as const,
  } : {}),
}));
