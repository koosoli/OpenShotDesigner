type Point = readonly [x: number, y: number, z: number];
type Section = readonly [width: number, height: number];

export interface EquipmentPart {
  color: string;
  corners: { x: number; y: number; z: number }[];
  /** Lamp head, lens or barn doors: rotates with a light's pan and tilt. Stands and bases do not. */
  head?: boolean;
}

export function headParts(parts: EquipmentPart[]): EquipmentPart[] {
  return parts.map(part => ({ ...part, head: true }));
}

export interface EquipmentSymbol {
  parts: EquipmentPart[];
  footprint: readonly [length: number, width: number];
  facingUp?: boolean;
}

const rectangle = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const circle = Array.from({ length: 12 }, (_, index) => {
  const angle = index * Math.PI / 6;
  return [Math.cos(angle), Math.sin(angle)];
});

/** Build two matching rings along an axis, in millimetres. Local +X faces forward. */
export function prism(from: Point, to: Point, start: Section, end: Section, color: string, round = false): EquipmentPart {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const dz = to[2] - from[2];
  const horizontal = Math.hypot(dx, dy);
  const length = Math.hypot(horizontal, dz);
  const lateral: Point = horizontal ? [-dy / horizontal, dx / horizontal, 0] : [1, 0, 0];
  const up: Point = [-dz * lateral[1] / length, dz * lateral[0] / length, horizontal / length];
  const ring = (origin: Point, [width, height]: Section) => (round ? circle : rectangle).map(([a, b]) => ({
    x: origin[0] + a * width / 2 * lateral[0] + b * height / 2 * up[0],
    y: origin[1] + a * width / 2 * lateral[1] + b * height / 2 * up[1],
    z: origin[2] + a * width / 2 * lateral[2] + b * height / 2 * up[2],
  }));
  return { color, corners: [...ring(from, start), ...ring(to, end)] };
}

export function block(x: number, y: number, bottom: number, length: number, width: number, height: number, color: string) {
  return prism([x, y, bottom], [x, y, bottom + height], [length, width], [length, width], color);
}

export function rod(from: Point, to: Point, diameter: number, color: string) {
  return prism(from, to, [diameter, diameter], [diameter, diameter], color, true);
}

export const equipmentFinish = {
  shell: '#404b59',
  trim: '#556474',
  metal: '#82909e',
  grip: '#29323e',
};

export function stand(top: number, spread: number, tripod: boolean): EquipmentPart[] {
  const hub = tripod ? Math.max(90, top - 115) : 170;
  const { metal, trim, grip } = equipmentFinish;
  return [
    ...[0, 1, 2].flatMap((index) => {
      const angle = index * Math.PI * 2 / 3;
      const x = Math.cos(angle) * spread;
      const y = Math.sin(angle) * spread;
      const foot = block(x, y, 0, 75, 55, 26, grip);
      if (!tripod) return [rod([0, 0, hub], [x, y, 24], 34, metal), foot];
      const joint: Point = [x * .54, y * .54, hub * .46 + 24 * .54];
      return [rod([0, 0, hub], joint, 61, trim), rod(joint, [x, y, 24], 36, metal), foot];
    }),
    rod([0, 0, tripod ? hub - 35 : 55], [0, 0, top], tripod ? 62 : 43, trim),
  ];
}
