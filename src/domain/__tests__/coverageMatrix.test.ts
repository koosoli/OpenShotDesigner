import { describe, it, expect } from 'vitest';
import {
  addCustomCoverageRow,
  coverageRowsFor,
  emptyCoverageMatrix,
  registerCoverageCamera,
  removeCoverageColumn,
  removeCoverageRow,
  renameCoverageRow,
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

  it('registers a camera column without writing a cell', () => {
    let m = registerCoverageCamera(emptyCoverageMatrix(), 'Drone');
    m = registerCoverageCamera(m, 'Drone');
    expect(m.cameraIds).toEqual(['Drone']);
    expect(m.rowKeys).toEqual([]);
    expect(m.cells).toEqual({});
  });

  it('adds manual rows with labels and unique keys (works without cues)', () => {
    let m = emptyCoverageMatrix();
    const first = addCustomCoverageRow(m, 'Soundcheck');
    m = first.matrix;
    const second = addCustomCoverageRow(m);
    m = second.matrix;
    expect(first.rowKey).not.toBe(second.rowKey);
    expect(m.rowKeys).toEqual([first.rowKey, second.rowKey]);
    expect(m.rowLabels?.[first.rowKey]).toBe('Soundcheck');
    // Default label when none provided.
    expect(m.rowLabels?.[second.rowKey]).toBe('New row');
  });

  it('renames a manual row without touching other rows', () => {
    let m = emptyCoverageMatrix();
    const a = addCustomCoverageRow(m, 'One');
    m = a.matrix;
    const b = addCustomCoverageRow(m, 'Two');
    m = b.matrix;
    m = renameCoverageRow(m, b.rowKey, 'Half-time');
    expect(m.rowLabels?.[a.rowKey]).toBe('One');
    expect(m.rowLabels?.[b.rowKey]).toBe('Half-time');
  });

  it('removes a manual row together with its cells and label', () => {
    let m = emptyCoverageMatrix();
    const row = addCustomCoverageRow(m, 'Temp');
    m = row.matrix;
    m = setCoverageCell(m, row.rowKey, 'CAM 1', 'wide');
    m = removeCoverageRow(m, row.rowKey);
    expect(m.rowKeys).toEqual([]);
    expect(m.rowLabels?.[row.rowKey]).toBeUndefined();
    expect(m.cells[row.rowKey]).toBeUndefined();
  });
});
