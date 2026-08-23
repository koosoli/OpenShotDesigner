import { describe, expect, it } from 'vitest';
import {
  avCoverage,
  avRowNumber,
  isDanglingRow,
  rowsAfterShotRemoval,
  rowsForMissingShots,
} from '../script';
import type { AvLinkedShot } from '../script';
import type { AVScriptRow } from '../../types';

const shots: AvLinkedShot[] = [
  { id: 's1', shotNumber: '1/1', name: 'Master', shotSize: 'WS' },
  { id: 's2', shotNumber: '1/2', name: 'OTS Sarah', shotSize: 'MCU' },
  { id: 's3', shotNumber: '1/3', name: 'Insert' },
];

const row = (over: Partial<AVScriptRow>): AVScriptRow => ({
  id: over.id ?? 'r',
  shotNumber: over.shotNumber ?? '1',
  video: over.video ?? '',
  audio: over.audio ?? '',
  ...over,
});

/**
 * The reported defect: an AV row numbered "2" had nothing to do with shot
 * "1/2", because the row stored its own copy of a number the shot list owns
 * and renumbers.
 */
describe('avRowNumber', () => {
  it('takes the linked shot’s number, not its own stale copy', () => {
    expect(avRowNumber(row({ shotNumber: '2', linkedShotId: 's2' }), shots)).toBe('1/2');
  });

  it('survives the shot list being renumbered', () => {
    const linked = row({ shotNumber: '1/2', linkedShotId: 's2' });
    const renumbered: AvLinkedShot[] = [{ ...shots[1], shotNumber: '1B' }];
    expect(avRowNumber(linked, renumbered)).toBe('1B');
  });

  it('keeps its own number when there is no link, or the shot is gone', () => {
    expect(avRowNumber(row({ shotNumber: '7' }), shots)).toBe('7');
    expect(avRowNumber(row({ shotNumber: '7', linkedShotId: 'ghost' }), shots)).toBe('7');
  });
});

describe('isDanglingRow', () => {
  it('spots a link to a shot that no longer exists', () => {
    expect(isDanglingRow(row({ linkedShotId: 'ghost' }), shots)).toBe(true);
    expect(isDanglingRow(row({ linkedShotId: 's1' }), shots)).toBe(false);
    expect(isDanglingRow(row({}), shots)).toBe(false);
  });
});

describe('avCoverage', () => {
  it('reports the shots nobody has scripted, in shot-list order', () => {
    const coverage = avCoverage([row({ id: 'r1', linkedShotId: 's2' })], shots);
    expect(coverage.missingShots.map((s) => s.shotNumber)).toEqual(['1/1', '1/3']);
    expect(coverage.inStep).toBe(false);
  });

  it('is in step when every shot has a row and every link resolves', () => {
    const rows = shots.map((shot, i) => row({ id: `r${i}`, linkedShotId: shot.id }));
    expect(avCoverage(rows, shots).inStep).toBe(true);
  });

  /** A lower third is not a camera; it must not be nagged about for ever. */
  it('does not ask a graphics row to become a shot', () => {
    const rows = [
      ...shots.map((shot, i) => row({ id: `r${i}`, linkedShotId: shot.id })),
      row({ id: 'gfx', shotNumber: 'GFX 1', noShot: true, video: 'LOWER THIRD: name and title' }),
    ];
    const coverage = avCoverage(rows, shots);
    expect(coverage.inStep).toBe(true);
    expect(coverage.shotlessRows.map((r) => r.id)).toEqual(['gfx']);
  });

  it('separates a dangling link from a deliberate one', () => {
    const coverage = avCoverage([row({ id: 'x', linkedShotId: 'ghost' })], shots);
    expect(coverage.danglingRows.map((r) => r.id)).toEqual(['x']);
    expect(coverage.inStep).toBe(false);
  });
});

describe('rowsForMissingShots', () => {
  it('builds one row per shot, carrying its number, name and size', () => {
    let n = 0;
    const made = rowsForMissingShots(shots.slice(0, 2), () => `new-${++n}`, (shot) => `Framed on ${shot.name}`);
    expect(made).toEqual([
      { id: 'new-1', shotNumber: '1/1', shotName: 'Master', shotSize: 'WS', video: 'Framed on Master', audio: '', linkedShotId: 's1' },
      { id: 'new-2', shotNumber: '1/2', shotName: 'OTS Sarah', shotSize: 'MCU', video: 'Framed on OTS Sarah', audio: '', linkedShotId: 's2' },
    ]);
  });

  /** Nobody can guess the voice-over, and a placeholder reads as written copy. */
  it('leaves the audio column empty', () => {
    expect(rowsForMissingShots(shots, () => 'x')[0].audio).toBe('');
  });
});

describe('rowsAfterShotRemoval', () => {
  const removed = new Set(['s2']);

  it('drops a row nobody wrote in — it was only scaffolding', () => {
    const rows = [row({ id: 'blank', linkedShotId: 's2', video: '', audio: '' })];
    expect(rowsAfterShotRemoval(rows, removed, shots)).toEqual([]);
  });

  it('keeps written copy, unlinked, with the number frozen at what it read', () => {
    const rows = [row({ id: 'written', shotNumber: 'stale', linkedShotId: 's2', audio: 'VO: and then everything changed.' })];
    const after = rowsAfterShotRemoval(rows, removed, shots);
    expect(after).toHaveLength(1);
    expect(after[0].linkedShotId).toBeUndefined();
    expect(after[0].shotNumber).toBe('1/2');
    expect(after[0].audio).toBe('VO: and then everything changed.');
  });

  it('leaves rows for other shots alone', () => {
    const rows = [row({ id: 'other', linkedShotId: 's1', video: 'Master' }), row({ id: 'free' })];
    expect(rowsAfterShotRemoval(rows, removed, shots).map((r) => r.id)).toEqual(['other', 'free']);
  });
});
