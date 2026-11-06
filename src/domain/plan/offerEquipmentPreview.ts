import { OFFER_EQUIPMENT } from '../assets/offerEquipment';
import { block, rod, stand, type EquipmentPart, type EquipmentSymbol } from './equipmentPreviewGeometry';
import { panel, roundHead } from './lightPreview';
import { vehiclePreview } from './vehiclePreview';

/** Generic silhouettes for the offer's named equipment, not manufacturer CAD. */
export function offerEquipmentPreview(symbolId: string): EquipmentSymbol | undefined {
  const item = OFFER_EQUIPMENT.find(({ key }) => symbolId === `production.${key}`);
  if (!item) return undefined;
  const { width: w, depth: d, height: h } = item;
  const metal = '#8794a3';
  const dark = '#35404e';
  const fabric = item.color ?? '#e7e3d8';
  let parts: EquipmentPart[];
  switch (item.model) {
    case 'cob':
    case 'fresnel': {
      const size = item.key === 'nanlite-2400b' ? 440 : 310;
      parts = [
        ...(h > 600 ? stand(h - size, w * .44, false) : []),
        ...roundHead(h - size * .40, size * 1.2, size, '#f5e8cd', item.model === 'fresnel'),
      ];
      break;
    }
    case 'panel':
      parts = [...stand(h - 550, w * .43, false), ...panel(h - 300, 600, 600, '#f6edda')];
      break;
    case 'tube':
      parts = [block(0, 0, 20, w, d, h - 20, dark), block(0, 0, h, w - 30, d - 25, 8, '#e8e8ff')];
      break;
    case 'stand':
    case 'roller':
      parts = [...stand(h, w * .42, false), block(60, 0, h * .5, 130, 110, 180, dark),
        rod([60, 0, h * .5], [190, 0, h * .5], 28, metal)];
      if (item.model === 'roller') {
        for (const a of [0, 2.0944, 4.1888]) {
          parts.push(block(Math.cos(a) * w * .42, Math.sin(a) * w * .42, 0, 110, 90, 90, dark));
        }
      }
      break;
    case 'floppy':
      parts = [...stand(1300, 320, false), block(0, 0, 900, w, 35, 1200, fabric),
        block(0, 170, 300, w, 25, 1200, fabric)];
      break;
    case 'cloth':
      parts = [block(0, 0, 0, w, d, h, fabric)];
      break;
    case 'frame':
      parts = [-1, 1].flatMap((side) => [
        block(0, side * (d - 40) / 2, 0, w, 40, h, metal),
        block(side * (w - 40) / 2, 0, 0, 40, d - 80, h, metal),
      ]);
      break;
    case 'apple':
      parts = [0, 1, 2].flatMap((i) => [
        block(0, 0, i * 140, w, d, 115, '#a88051'),
        block(0, -d / 2 - 1, i * 140 + 40, 120, 5, 30, '#493a2b'),
      ]);
      break;
    case 'tablet':
      parts = [block(0, 0, 0, w, d, h, dark), block(0, 0, h, w - 25, d - 25, 2, '#527e9b')];
      break;
    case 'control':
    case 'power':
      parts = [block(0, 0, 0, w, d, h, dark), block(0, 0, h, w * .8, d * .7, 5, '#637487'),
        ...[-1, 1].map((side) => rod([side * w * .24, -d / 2 - 12, h * .6], [side * w * .24, -d / 2, h * .6], 55, '#65a0cf'))];
      break;
    case 'van':
      return vehiclePreview('broadcast_van', undefined, '#c5cbd2');
    default:
      parts = [block(0, 0, 0, w, d, h, dark), block(0, 0, h * .78, w + 10, d + 10, 20, metal),
        ...[-1, 1].map((side) => block(side * w * .3, -d / 2 - 8, h * .6, 55, 18, 55, metal))];
  }
  return { parts, footprint: [w, d] };
}
