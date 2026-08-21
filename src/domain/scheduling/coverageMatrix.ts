/**
 * Multi-camera coverage matrix (plan §15.3).
 *
 * Plans camera RESPONSIBILITY per cue/row — complementary to individual
 * shots: live productions often plan coverage rather than a deterministic
 * edit shot-by-shot. Rows may follow the run-of-show cue list or be fully
 * manual entries, so coverage works without any screenplay or cue sheet
 * (plan rule 1).
 */

import { createId } from '../ids';

export interface CoverageMatrix {
  /** Ordered camera column ids (camera labels or free-form names). */
  cameraIds: string[];
  /** Ordered row keys (cue ids or custom row keys). */
  rowKeys: string[];
  /** Display labels for custom (non-cue) rows, keyed by row key. Optional and absent-safe. */
  rowLabels?: Record<string, string>;
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

/** Register a camera column without writing a cell (keeps column ordering stable). */
export const registerCoverageCamera = (matrix: CoverageMatrix, cameraId: string): CoverageMatrix =>
  matrix.cameraIds.includes(cameraId) ? matrix : { ...matrix, cameraIds: [...matrix.cameraIds, cameraId] };

/**
 * Append a manual row (usable with or without run-of-show cues). Returns the
 * new row key alongside the updated matrix so callers can preselect it.
 */
export const addCustomCoverageRow = (
  matrix: CoverageMatrix,
  label = 'New row',
): { matrix: CoverageMatrix; rowKey: string } => {
  const rowKey = createId('crow');
  return {
    matrix: {
      ...matrix,
      rowKeys: [...matrix.rowKeys, rowKey],
      rowLabels: { ...(matrix.rowLabels ?? {}), [rowKey]: label },
    },
    rowKey,
  };
};

export const renameCoverageRow = (matrix: CoverageMatrix, rowKey: string, label: string): CoverageMatrix => ({
  ...matrix,
  rowLabels: { ...(matrix.rowLabels ?? {}), [rowKey]: label },
});

/**
 * Remove a custom row together with every cell and label. Cue rows are owned
 * by the cue list; removing one here only drops it from the matrix layout.
 */
export const removeCoverageRow = (matrix: CoverageMatrix, rowKey: string): CoverageMatrix => {
  const cells: CoverageMatrix['cells'] = {};
  for (const [key, row] of Object.entries(matrix.cells)) {
    if (key === rowKey) continue;
    cells[key] = row;
  }
  const rowLabels = { ...(matrix.rowLabels ?? {}) };
  delete rowLabels[rowKey];
  return { ...matrix, rowKeys: matrix.rowKeys.filter((key) => key !== rowKey), rowLabels, cells };
};

export const coverageRowsFor = (
  matrix: CoverageMatrix,
  rowKey: string,
): Array<{ cameraId: string; text: string }> =>
  matrix.cameraIds
    .map((cameraId) => ({ cameraId, text: matrix.cells[rowKey]?.[cameraId] || '' }))
    .filter((entry) => entry.text !== '');
