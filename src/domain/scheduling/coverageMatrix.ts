/**
 * Multi-camera coverage matrix (plan §15.3).
 *
 * Plans camera RESPONSIBILITY per cue/row — complementary to individual
 * shots: live productions often plan coverage rather than a deterministic
 * edit shot-by-shot.
 */

export interface CoverageMatrix {
  /** Ordered camera column ids (camera labels or free-form names). */
  cameraIds: string[];
  /** Ordered row keys (cue ids or custom row keys). */
  rowKeys: string[];
  /** cells[rowKey][cameraId] = responsibility text, e.g. 'Singer MCU'. */
  cells: Record<string, Record<string, string>>;
}

export const emptyCoverageMatrix = (): CoverageMatrix => ({
  cameraIds: [],
  rowKeys: [],
  cells: {},
});

/** Immutable cell write; keeps row/camera registration tidy. */
export const setCoverageCell = (
  matrix: CoverageMatrix,
  rowKey: string,
  cameraId: string,
  value: string,
): CoverageMatrix => {
  const cameraIds = matrix.cameraIds.includes(cameraId)
    ? matrix.cameraIds
    : [...matrix.cameraIds, cameraId];
  const rowKeys = matrix.rowKeys.includes(rowKey) ? matrix.rowKeys : [...matrix.rowKeys, rowKey];
  const row = { ...(matrix.cells[rowKey] || {}), [cameraId]: value };
  return { cameraIds, rowKeys, cells: { ...matrix.cells, [rowKey]: row } };
};

export const removeCoverageColumn = (matrix: CoverageMatrix, cameraId: string): CoverageMatrix => {
  const cells: CoverageMatrix['cells'] = {};
  for (const [rowKey, row] of Object.entries(matrix.cells)) {
    const next = { ...row };
    delete next[cameraId];
    if (Object.keys(next).length > 0) cells[rowKey] = next;
  }
  return { ...matrix, cameraIds: matrix.cameraIds.filter((id) => id !== cameraId), cells };
};

export const coverageRowsFor = (
  matrix: CoverageMatrix,
  rowKey: string,
): Array<{ cameraId: string; text: string }> =>
  matrix.cameraIds
    .map((cameraId) => ({ cameraId, text: matrix.cells[rowKey]?.[cameraId] || '' }))
    .filter((entry) => entry.text !== '');
