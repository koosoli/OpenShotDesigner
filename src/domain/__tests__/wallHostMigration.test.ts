import { describe, expect, it } from 'vitest';
import type { WallElement, WindowElement } from '../../types';
import { migrateV38ToV39 } from '../migrations/v38-to-v39';
import { clearMissingWallHosts, moveWallOpenings, remapCopiedWallHosts } from '../plan/editWallOpenings';
import { resolveWallOpenings } from '../plan/wallOpenings';

const wall: WallElement = { id: 'wall', type: 'wall', name: 'Wall', x: 0, y: 0, x2: 200, y2: 0, rotation: 0, thickness: 12 };
const opening: WindowElement = { id: 'window', type: 'window', name: 'Window', x: 100, y: 0, width: 80, depth: 12, rotation: 0 };
const overlapping = { ...wall, id: 'overlap' };

describe('schema 39 wall hosts', () => {
  it('preserves poses and migrates only unique hosts', () => {
    const fixture = { schemaVersion: 38, setups: [{ elements: [wall, opening] }, { elements: [wall, overlapping, opening] }] };
    const result = migrateV38ToV39(fixture);
    expect(result.schemaVersion).toBe(39);
    expect(result.setups[0].elements).toEqual([wall, { ...opening, hostWallId: 'wall' }]);
    expect(result.setups[1].elements).toEqual(fixture.setups[1].elements);
    expect(fixture.setups[0].elements[1]).toEqual(opening);
  });

  it('remaps an opening to the copied host', () => {
    const copy = { ...wall, id: 'copy', x: 30, y: 30, x2: 230, y2: 30 };
    const windowCopy = { ...opening, x: 130, y: 30, hostWallId: 'wall' };
    const elements = remapCopiedWallHosts([copy, windowCopy], new Map([['wall', 'copy']]));
    expect(elements).toEqual([copy, { ...windowCopy, hostWallId: 'copy' }]);
    expect(remapCopiedWallHosts([windowCopy], new Map())).toEqual([{ ...windowCopy, hostWallId: null }]);
  });

  it('keeps an explicit host when overlapping walls compete', () => {
    const hosted = { ...opening, hostWallId: 'wall' };
    expect([...resolveWallOpenings([overlapping, wall], [hosted]).keys()]).toEqual(['wall']);
    const moved = { ...wall, x: 20, x2: 220 };
    expect(moveWallOpenings([overlapping, wall, hosted], [overlapping, moved, hosted])[2]).toEqual({ ...hosted, x: 120 });
    const [detached] = clearMissingWallHosts([hosted, overlapping]);
    expect(detached).toEqual({ ...hosted, hostWallId: null });
    expect(resolveWallOpenings([overlapping], [{ ...hosted, hostWallId: null }]).size).toBe(0);
  });
});
