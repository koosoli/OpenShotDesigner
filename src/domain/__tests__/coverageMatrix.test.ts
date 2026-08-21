import { describe, it, expect } from 'vitest';
import {
  coverageRowsFor,
  emptyCoverageMatrix,
  removeCoverageColumn,
  setCoverageCell,
} from '../scheduling/coverageMatrix';

describe('coverage matrix', () => {
  it('starts empty and registers rows/columns on first write', () => {
    let m = emptyCoverageMatrix();
    expect(m.cameraIds).toEqual([]);
    m = setCoverageCell(m, 'cue-1', 'CAM 1', 'Singer MCU');
    expect(m.rowKeys).toEqual(['cue-1']);
    expect(m.cameraIds).toEqual(['CAM 1']);
    expect(m.cells['cue-1']['CAM 1']).toBe('Singer MCU');
  });

  it('is immutable on write', () => {
    const before = setCoverageCell(emptyCoverageMatrix(), 'r1', 'c1', 'wide');
    const after = setCoverageCell(before, 'r2', 'c1', 'CU');
    expect(before.rowKeys).toEqual(['r1']);
    expect(after.rowKeys).toEqual(['r1', 'r2']);
    expect(before.cells['r2']).toBeUndefined();
  });

  it('reads ordered coverage for a row, skipping empties', () => {
    let m = setCoverageCell(emptyCoverageMatrix(), 'song-1', 'CAM 2', 'Guitar CU');
    m = setCoverageCell(m, 'song-1', 'CAM 1', 'Singer MS');
    m = setCoverageCell(m, 'song-1', 'CAM 3', '');
    expect(coverageRowsFor(m, 'song-1')).toEqual([
      { cameraId: 'CAM 2', text: 'Guitar CU' },
      { cameraId: 'CAM 1', text: 'Singer MS' },
    ]);
  });

  it('removes a column and its cells everywhere', () => {
    let m = setCoverageCell(emptyCoverageMatrix(), 'r1', 'CAM 5', 'Jib wide');
    m = setCoverageCell(m, 'r1', 'CAM 1', 'MS');
    m = removeCoverageColumn(m, 'CAM 5');
    expect(m.cameraIds).toEqual(['CAM 1']);
    expect(coverageRowsFor(m, 'r1')).toEqual([{ cameraId: 'CAM 1', text: 'MS' }]);
  });
});
