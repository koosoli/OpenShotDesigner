import { describe, it, expect } from 'vitest';
import {
  sortCues,
  computeCueStarts,
  totalRunTime,
  validateCueList,
  type RunOfShowCue,
} from '../scheduling/runOfShow';
import { createId } from '../ids';

const cue = (order: number, extra?: Partial<RunOfShowCue>): RunOfShowCue => ({
  id: createId('cue'),
  label: `Cue ${order}`,
  order,
  ...extra,
});

describe('sortCues', () => {
  it('sorts by order ascending and is stable for equal orders', () => {
    const a = cue(2);
    const b = cue(1);
    const c = cue(1);
    const d = cue(3);
    const sorted = sortCues([a, b, c, d]);
    expect(sorted.map((x) => x.id)).toEqual([b.id, c.id, a.id, d.id]);
  });

  it('does not mutate the input array', () => {
    const a = cue(1);
    const b = cue(0);
    const input = [a, b];
    sortCues(input);
    expect(input.map((x) => x.id)).toEqual([a.id, b.id]);
  });
});

describe('computeCueStarts', () => {
  it('accumulates durations from showStartSeconds (default 0) when no explicit starts', () => {
    const cues = [
      cue(1, { plannedDurationSeconds: 60 }),
      cue(2, { plannedDurationSeconds: 30 }),
      cue(3, { plannedDurationSeconds: 10 }),
    ];
    expect(computeCueStarts(cues)).toEqual([
      { cueId: cues[0].id, startSeconds: 0 },
      { cueId: cues[1].id, startSeconds: 60 },
      { cueId: cues[2].id, startSeconds: 90 },
    ]);
  });

  it('honours an explicit showStartSeconds for the first cue', () => {
    const cues = [cue(1, { plannedDurationSeconds: 45 })];
    expect(computeCueStarts(cues, 3600)).toEqual([{ cueId: cues[0].id, startSeconds: 3600 }]);
  });

  it('parses explicit HH:MM and HH:MM:SS starts', () => {
    const cues = [
      cue(1, { plannedStart: '20:00', plannedDurationSeconds: 90 }),
      cue(2, { plannedStart: '20:01:45', plannedDurationSeconds: 15 }),
    ];
    expect(computeCueStarts(cues)).toEqual([
      { cueId: cues[0].id, startSeconds: 72000 },
      { cueId: cues[1].id, startSeconds: 72105 },
    ]);
  });

  it('an explicit start resets the accumulation timeline', () => {
    const cues = [
      cue(1, { plannedStart: '19:00', plannedDurationSeconds: 600 }),
      cue(2, { plannedDurationSeconds: 60 }),
    ];
    expect(computeCueStarts(cues)).toEqual([
      { cueId: cues[0].id, startSeconds: 68400 },
      { cueId: cues[1].id, startSeconds: 69000 },
    ]);
  });

  it('propagates null after a cue with no duration until the next explicit start', () => {
    const cues = [
      cue(1, { plannedDurationSeconds: 60 }),
      cue(2), // no duration → next accumulated start unknown
      cue(3, { plannedDurationSeconds: 30 }),
      cue(4, { plannedStart: '22:00', plannedDurationSeconds: 30 }),
      cue(5, { plannedDurationSeconds: 30 }),
    ];
    const starts = computeCueStarts(cues);
    expect(starts.map((s) => s.startSeconds)).toEqual([0, 60, null, 79200, 79230]);
  });

  it('returns null for unparseable plannedStart values', () => {
    const cues = [cue(1, { plannedStart: 'not-a-time' })];
    expect(computeCueStarts(cues)).toEqual([{ cueId: cues[0].id, startSeconds: null }]);
  });

  it('rejects out-of-range minutes/seconds', () => {
    const cues = [cue(1, { plannedStart: '12:75' })];
    expect(computeCueStarts(cues)[0].startSeconds).toBeNull();
  });
});

describe('totalRunTime', () => {
  it('sums all durations', () => {
    const cues = [
      cue(1, { plannedDurationSeconds: 90 }),
      cue(2, { plannedDurationSeconds: 30 }),
    ];
    expect(totalRunTime(cues)).toBe(120);
  });

  it('returns null when any cue lacks a duration (unknown ≠ 0)', () => {
    const cues = [cue(1, { plannedDurationSeconds: 90 }), cue(2)];
    expect(totalRunTime(cues)).toBeNull();
  });

  it('returns 0 for an empty list', () => {
    expect(totalRunTime([])).toBe(0);
  });
});

describe('validateCueList', () => {
  it('flags duplicate ids as DUPLICATE_CUE_ID errors', () => {
    const shared = createId('cue');
    const issues = validateCueList([
      cue(1, { id: shared }),
      cue(2, { id: shared, plannedDurationSeconds: 10 }),
    ]);
    expect(issues.filter((i) => i.code === 'DUPLICATE_CUE_ID')).toHaveLength(1);
    expect(issues.find((i) => i.code === 'DUPLICATE_CUE_ID')?.severity).toBe('error');
  });

  it('flags empty/whitespace labels as EMPTY_CUE_LABEL errors', () => {
    const issues = validateCueList([
      cue(1, { label: '' }),
      cue(2, { label: '   ', plannedDurationSeconds: 5 }),
    ]);
    const empty = issues.filter((i) => i.code === 'EMPTY_CUE_LABEL');
    expect(empty).toHaveLength(2);
    expect(empty.every((i) => i.severity === 'error')).toBe(true);
  });

  it('warns per cue without a duration (MISSING_DURATION)', () => {
    const issues = validateCueList([cue(1), cue(2), cue(3, { plannedDurationSeconds: 5 })]);
    const missing = issues.filter((i) => i.code === 'MISSING_DURATION');
    expect(missing).toHaveLength(2);
    expect(missing.every((i) => i.severity === 'warning')).toBe(true);
  });

  it('warns OVERLAPPING_CUES when an explicit start precedes the previous resolved start', () => {
    const issues = validateCueList([
      cue(1, { plannedStart: '20:10', plannedDurationSeconds: 300 }),
      cue(2, { plannedStart: '20:05', plannedDurationSeconds: 60 }),
    ]);
    const overlap = issues.find((i) => i.code === 'OVERLAPPING_CUES');
    expect(overlap).toBeDefined();
    expect(overlap?.severity).toBe('warning');
  });

  it('does not flag non-overlapping or accumulated cues', () => {
    const issues = validateCueList([
      cue(1, { plannedStart: '20:00', plannedDurationSeconds: 300 }),
      cue(2, { plannedStart: '20:05', plannedDurationSeconds: 60 }),
      cue(3, { plannedDurationSeconds: 60 }),
    ]);
    expect(issues).toEqual([]);
  });
});
