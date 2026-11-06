import { block, prism, rod, type EquipmentPart, type EquipmentSymbol } from './equipmentPreviewGeometry';

/** Illustrative planning models, not manufacturer dimensions or technical data. */
export function accessoryAssetPreview(id: string, paint: string): EquipmentSymbol | undefined {
  const metal = '#8897a5';
  const dark = '#303b49';
  const white = '#dce2e6';
  let parts: EquipmentPart[];
  let footprint: readonly [number, number] = [1000, 600];
  switch (id) {
    case 'arch.double-sink':
      parts = [block(0, 0, 0, 1000, 600, 800, paint), block(0, 0, 800, 1000, 600, 40, white),
        ...[-250, 250].flatMap(x => [block(x, 0, 840, 380, 360, 15, metal),
          rod([x, 200, 840], [x, 200, 1050], 30, metal), rod([x, 200, 1050], [x, 0, 1050], 30, metal)])];
      break;
    case 'arch.bidet':
      parts = [prism([0, 0, 0], [0, 0, 330], [220, 300], [380, 500], white, true),
        block(0, 0, 330, 380, 480, 30, '#84929c'),
        ...[-200, 200].map(x => block(x, 0, 330, 50, 600, 90, white)),
        ...[-275, 275].map(y => block(0, y, 330, 400, 50, 90, white)),
        rod([0, 230, 420], [0, 230, 580], 30, metal), rod([0, 230, 580], [0, 100, 580], 30, metal)];
      footprint = [450, 600];
      break;
    case 'arch.urinal':
      parts = [block(0, 180, 450, 400, 65, 650, white),
        prism([0, 0, 400], [0, 0, 600], [240, 240], [400, 400], white, true),
        block(0, 0, 600, 300, 280, 15, '#85929b'),
        ...[-180, 180].map(x => block(x, 0, 600, 40, 350, 150, white)),
        rod([0, 160, 1100], [0, 160, 1280], 40, metal)];
      footprint = [450, 600];
      break;
    case 'arch.corner-counter':
      parts = [block(0, -300, 0, 1000, 400, 850, paint), block(-300, 200, 0, 400, 600, 850, paint),
        block(0, -300, 850, 1000, 400, 40, white), block(-300, 200, 850, 400, 600, 40, white)];
      footprint = [1000, 1000];
      break;
    case 'arch.single-door':
    case 'arch.window': {
      const window = id === 'arch.window';
      const bottom = window ? 900 : 0;
      const top = window ? 2100 : 2200;
      parts = [block(-475, 0, bottom, 50, 100, top - bottom, white), block(475, 0, bottom, 50, 100, top - bottom, white),
        block(0, 0, top - 50, 1000, 100, 50, white),
        block(0, 0, bottom, 900, 30, top - bottom - 50, window ? '#648eaa' : '#ae885d')];
      if (window) parts.push(block(0, 0, bottom, 1000, 100, 50, white), block(0, 0, bottom, 35, 80, top - bottom, white));
      else parts.push(rod([350, -20, 1000], [350, -80, 1000], 40, metal));
      footprint = [1000, 100];
      break;
    }
    case 'grip.cable-ramp':
      parts = [{ color: dark, corners: [-500, 500].flatMap(x => [
        { x, y: -250, z: 0 }, { x, y: 250, z: 0 }, { x, y: 100, z: 75 }, { x, y: -100, z: 75 },
      ]) },
        block(0, 0, 40, 1000, 200, 35, '#d7ae3c')];
      footprint = [1000, 500];
      break;
    case 'fireplace':
      parts = [block(0, 0, 0, 1200, 500, 100, paint), block(0, 0, 1100, 1200, 500, 120, paint),
        ...[-500, 500].map(x => block(x, 0, 100, 200, 500, 1000, paint)),
        block(0, 230, 100, 800, 40, 1000, dark), ...[-230, 230].map(x => rod([x - 100, 0, 140], [x + 100, 70, 180], 90, '#73543c'))];
      footprint = [1200, 500];
      break;
    case 'gun':
    case 'rifle': {
      const rifle = id === 'rifle';
      const length = rifle ? 1000 : 240;
      parts = [block(-length * .18, 0, 50, length * .5, 60, 85, dark),
        rod([0, 0, 100], [length * .5, 0, 100], 35, metal),
        block(-length * .18, 0, 0, 65, 55, 80, '#745c43')];
      if (rifle) parts.push(block(-400, 0, 45, 200, 70, 100, '#745c43'), block(-80, 0, 0, 100, 50, 80, dark));
      footprint = [length, 100];
      break;
    }
    case 'bomb':
      parts = [prism([0, 0, 0], [0, 0, 300], [240, 240], [240, 240], dark, true),
        rod([0, 0, 300], [100, 0, 400], 25, '#9e8259')];
      footprint = [240, 240];
      break;
    case 'letter':
      parts = [block(0, 0, 0, 220, 110, 3, '#e5dec8'),
        rod([-110, -55, 4], [0, 0, 4], 2, '#8d887a'), rod([0, 0, 4], [110, -55, 4], 2, '#8d887a')];
      footprint = [220, 110];
      break;
    case 'box':
      parts = [block(0, 0, 0, 600, 600, 600, paint), block(0, 0, 600, 80, 600, 3, '#ac926c')];
      footprint = [600, 600];
      break;
    case 'circle':
      parts = [rod([0, 0, 0], [0, 0, 400], 600, paint)];
      footprint = [600, 600];
      break;
    default:
      if (!id.startsWith('lighting.modifier.')) return undefined;
      return modifierPreview(id.slice('lighting.modifier.'.length));
  }
  return { parts, footprint };
}

function modifierPreview(kind: string): EquipmentSymbol {
  const white = '#dfdfd5';
  const dark = '#343d49';
  let parts: EquipmentPart[];
  switch (kind) {
    case 'softbox':
      parts = [prism([0, 0, 0], [0, 0, 450], [180, 180], [800, 800], dark),
        prism([0, 0, 450], [0, 0, 460], [800, 800], [800, 800], white)];
      break;
    case 'lantern': {
      const rings = [100, 540, 760, 800, 760, 540, 100];
      parts = rings.slice(1).map((diameter, i) => prism([0, 0, i * 110], [0, 0, (i + 1) * 110],
        [rings[i], rings[i]], [diameter, diameter], white, true));
      parts.push(rod([0, 0, 660], [0, 0, 740], 100, dark));
      break;
    }
    case 'snoot':
    case 'fresnel':
    case 'reflector':
      parts = [prism([0, 0, 0], [0, 0, 300], [200, 200], kind === 'snoot' ? [100, 100] : [500, 500], dark, true),
        rod([0, 0, 300], [0, 0, 310], kind === 'snoot' ? 90 : 490, kind === 'fresnel' ? '#7fa3b5' : white)];
      break;
    case 'barn-doors':
      parts = [block(0, 0, 0, 350, 350, 35, dark), ...[-1, 1].flatMap(side => [
        block(side * 300, 0, 0, 250, 350, 20, dark), block(0, side * 300, 0, 350, 250, 20, dark)])];
      break;
    case 'grid':
    case 'eggcrate':
      parts = [...Array.from({ length: 7 }, (_, i) => block(-375 + i * 125, 0, 0, 12, 800, 70, dark)),
        ...Array.from({ length: 7 }, (_, i) => block(0, -375 + i * 125, 0, 800, 12, 70, dark))];
      break;
    default:
      parts = [block(0, 0, 0, 800, 800, 8, kind === 'gel' ? '#cc9962' : white),
        ...[-390, 390].map(x => block(x, 0, 0, 20, 800, 20, dark))];
  }
  return { parts, footprint: [800, 800] };
}
