import { describe, expect, it } from 'vitest';
import { restackElement } from '../plan/stacking';
import type { FloorPlanElement } from '../../types';

const el = (id: string, type: string, extra: Record<string, unknown> = {}) =>
  ({ id, type, name: id, x: 0, y: 0, rotation: 0, ...extra }) as unknown as FloorPlanElement;
const order = (elements: FloorPlanElement[]) => elements.map((e) => `${e.id}${e.aboveWalls ? '^' : ''}`);

describe('restackElement', () => {
  const plan = [el('wall', 'wall'), el('rug', 'prop'), el('sofa', 'prop'), el('actor', 'actor')];

  it('lifts an object over the walls on the first bring forward', () => {
    expect(order(restackElement(plan, 'rug', 'forward'))).toEqual(['wall', 'rug^', 'sofa', 'actor']);
  });

  it('then moves it up among the raised objects, and back down again', () => {
    const raisedBoth = restackElement(restackElement(plan, 'rug', 'forward'), 'sofa', 'forward');
    expect(order(restackElement(raisedBoth, 'rug', 'forward'))).toEqual(['wall', 'sofa^', 'rug^', 'actor']);
    // The lowest raised object steps back under the walls.
    expect(order(restackElement(raisedBoth, 'rug', 'backward'))).toEqual(['wall', 'rug', 'sofa^', 'actor']);
  });

  it('brings to front over the walls and sends to back under them', () => {
    expect(order(restackElement(plan, 'rug', 'front'))).toEqual(['wall', 'sofa', 'actor', 'rug^']);
    const raised = restackElement(plan, 'rug', 'front');
    expect(order(restackElement(raised, 'rug', 'back'))).toEqual(['rug', 'wall', 'sofa', 'actor']);
  });

  it('leaves kinds that are never under walls to plain swaps', () => {
    expect(order(restackElement(plan, 'wall', 'forward'))).toEqual(['rug', 'wall', 'sofa', 'actor']);
  });
});
