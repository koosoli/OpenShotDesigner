import type { PropType } from '../../types';
import { block, prism, rod, type EquipmentSymbol } from './equipmentPreviewGeometry';

const profiles = {
  car: [4700, 1820, 1500, 345],
  vehicle_police: [4800, 1870, 1520, 345],
  vehicle_suv: [4900, 1950, 1880, 405],
  vehicle_truck: [7300, 2450, 3350, 490],
  broadcast_truck: [11200, 2550, 3800, 520],
  broadcast_van: [5600, 2050, 2550, 380],
  sat_truck: [7900, 2460, 3250, 480],
} as const satisfies Partial<Record<PropType, readonly [length: number, width: number, height: number, wheelRadius: number]>>;

type Vehicle = keyof typeof profiles;
const libraryVehicles: Partial<Record<string, Vehicle>> = {
  'broadcast.ob-van': 'broadcast_truck',
  'broadcast.eng-van': 'broadcast_van',
  'broadcast.satellite-truck': 'sat_truck',
};
const glass = '#527a90';
const rubber = '#262a30';
const trim = '#68717b';

export function vehiclePreview(propType: PropType | undefined, symbolId: string | undefined, paint: string): EquipmentSymbol | undefined {
  const kind = symbolId ? libraryVehicles[symbolId] : propType;
  if (!kind || !Object.hasOwn(profiles, kind)) return undefined;
  const vehicle = kind as Vehicle;
  const [length, width, height, radius] = profiles[vehicle];
  const boxTruck = vehicle === 'vehicle_truck' || vehicle === 'broadcast_truck' || vehicle === 'sat_truck';
  const van = vehicle === 'broadcast_van';
  const hood = height * (boxTruck || van ? .48 : .62);
  const bodyBottom = radius * .60;
  const bodyWidth = width * .93;
  const parts = [block(0, 0, bodyBottom, length, bodyWidth, hood - bodyBottom, paint)];

  // All profiles use +X at the nose. Placement rotates that to match the library symbol.
  const axles = vehicle === 'broadcast_truck' ? [-.33, -.22, .32] : [-.32, .32];
  for (const axle of axles) {
    for (const side of [-1, 1]) {
      const x = axle * length;
      parts.push(
        rod([x, side * width * .37, radius], [x, side * width * .495, radius], radius * 2, rubber),
        rod([x, side * width * .49, radius], [x, side * width * .50, radius], radius * 1.18, trim),
      );
    }
  }

  const roofStart = boxTruck ? .26 : van ? -.46 : vehicle === 'vehicle_suv' ? -.39 : -.24;
  const roofEnd = boxTruck ? .46 : van ? .35 : .16;
  const roofLength = (roofEnd - roofStart) * length;
  const roofCenter = (roofStart + roofEnd) * length / 2;
  const roofWidth = width * (boxTruck || van ? .85 : .74);
  const roofHeight = boxTruck ? height * .81 : height;
  const roofCap = 75;
  parts.push(
    prism([roofCenter, 0, hood], [roofCenter, 0, roofHeight - roofCap],
      [roofLength + length * (boxTruck || van ? .06 : .15), bodyWidth * .98], [roofLength, roofWidth], glass),
    block(roofCenter, 0, roofHeight - roofCap, roofLength, roofWidth, roofCap, paint),
  );
  if (boxTruck) {
    parts.push(block(-length * .133, 0, height * .26, length * .706, bodyWidth, height * .74, paint));
  } else if (van) {
    parts.push(block(-length * .16, 0, hood, length * .60, bodyWidth, height - hood - roofCap, paint));
  }

  for (const side of [-1, 1]) {
    parts.push(
      block(length / 2 - 12, side * width * .31, hood * .72, 24, width * .21, 105, '#fff0cc'),
      block(12 - length / 2, side * width * .34, hood * .73, 24, width * .15, 115, '#c63347'),
    );
  }
  if (vehicle === 'vehicle_police') {
    parts.push(block(0, -225, height, 255, 450, 105, '#2563eb'), block(0, 225, height, 255, 450, 105, '#ef4444'));
  }
  if (vehicle === 'sat_truck') {
    parts.push(
      rod([-1400, 0, height], [-1400, 0, height + 210], 240, trim),
      prism([-1400, 0, height + 210], [-1280, 0, height + 420], [270, 270], [1320, 1320], '#d4dbe3', true),
    );
  }
  return { parts, footprint: [length, width], facingUp: true };
}
