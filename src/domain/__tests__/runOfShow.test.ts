import { describe, it, expect } from 'vitest';
import {
  sortCues,
  computeCueStarts,
  totalRunTime,
  validateCueList,
  renumberCuesByPosition,
  sortAndRenumberCues,
  moveCueInList,
  buildRunOfShowSheet,
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

describe('renumberCuesByPosition', () => {
  it('numbers by array position, honouring an order the caller has already chosen', () => {
    const a = cue(0);
    const b = cue(1);
    const c = cue(2);
    // The caller hands over c, a, b — the reordering it just performed.
    const out = renumberCuesByPosition([c, a, b]);
    expect(out.map((x) => [x.id, x.order])).toEqual([
      [c.id, 0],
      [a.id, 1],
      [b.id, 2],
    ]);
  });

  it('leaves already-correct cues identical so React keeps their identity', () => {
    const a = cue(0);
    const b = cue(5);
    const out = renumberCuesByPosition([a, b]);
    expect(out[0]).toBe(a);
    expect(out[1]).not.toBe(b);
    expect(out[1].order).toBe(1);
  });

  it('does not mutate the input', () => {
    const a = cue(3);
    renumberCuesByPosition([a]);
    expect(a.order).toBe(3);
  });
});

describe('sortAndRenumberCues', () => {
  it('sorts an arbitrary array by stored order before closing the gaps', () => {
    const a = cue(4);
    const b = cue(0);
    const c = cue(2);
    const out = sortAndRenumberCues([a, b, c]);
    expect(out.map((x) => [x.id, x.order])).toEqual([
      [b.id, 0],
      [c.id, 1],
      [a.id, 2],
    ]);
  });
});

describe('moveCueInList', () => {
  const list = () => [cue(0), cue(1), cue(2), cue(3)];

  it('moves a cue down and renumbers 0..n-1', () => {
    const cues = list();
    const out = moveCueInList(cues, 0, 2);
    expect(out.map((x) => x.id)).toEqual([cues[1].id, cues[2].id, cues[0].id, cues[3].id]);
    expect(out.map((x) => x.order)).toEqual([0, 1, 2, 3]);
  });

  it('moves a cue up', () => {
    const cues = list();
    const out = moveCueInList(cues, 3, 1);
    expect(out.map((x) => x.id)).toEqual([cues[0].id, cues[3].id, cues[1].id, cues[2].id]);
    expect(out.map((x) => x.order)).toEqual([0, 1, 2, 3]);
  });

  it('does not undo the move by re-sorting on the old order (the reorder bug)', () => {
    const cues = list();
    const once = moveCueInList(cues, 0, 3);
    expect(once.map((x) => x.id)).toEqual([cues[1].id, cues[2].id, cues[3].id, cues[0].id]);
    // Feeding the result back in must keep the new order, not snap back.
    const twice = moveCueInList(once, 3, 0);
    expect(twice.map((x) => x.id)).toEqual(cues.map((x) => x.id));
  });

  it('takes indices in the running order, not in the stored array', () => {
    const a = cue(2);
    const b = cue(0);
    const c = cue(1);
    // Running order is b, c, a; moving index 0 moves b.
    const out = moveCueInList([a, b, c], 0, 2);
    expect(out.map((x) => x.id)).toEqual([c.id, a.id, b.id]);
  });

  it('clamps a target past either end rather than losing the cue', () => {
    const cues = list();
    expect(moveCueInList(cues, 2, 99).map((x) => x.id)).toEqual([
      cues[0].id,
      cues[1].id,
      cues[3].id,
      cues[2].id,
    ]);
    expect(moveCueInList(cues, 2, -5).map((x) => x.id)).toEqual([
      cues[2].id,
      cues[0].id,
      cues[1].id,
      cues[3].id,
    ]);
  });

  it('leaves the order alone for an out-of-range source index', () => {
    const cues = list();
    expect(moveCueInList(cues, 9, 0).map((x) => x.id)).toEqual(cues.map((x) => x.id));
    expect(moveCueInList([], 0, 1)).toEqual([]);
  });

  it('does not mutate the input array or its cues', () => {
    const cues = list();
    const snapshot = cues.map((x) => x.id);
    moveCueInList(cues, 0, 3);
    expect(cues.map((x) => x.id)).toEqual(snapshot);
    expect(cues.map((x) => x.order)).toEqual([0, 1, 2, 3]);
  });

  it('duplicating: an inserted copy sharing its source order lands by position', () => {
    const cues = list();
    const source = cues[1];
    const copy: RunOfShowCue = { ...source, id: createId('cue'), label: `${source.label} (copy)` };
    const next = [...cues];
    next.splice(2, 0, copy);
    const out = renumberCuesByPosition(next);
    expect(out.map((x) => x.id)).toEqual([
      cues[0].id,
      source.id,
      copy.id,
      cues[2].id,
      cues[3].id,
    ]);
    expect(out.map((x) => x.order)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('buildRunOfShowSheet', () => {
  const segments = [{ id: 'seg1', name: 'Opening block' }];

  it('numbers rows 1..n in running order and resolves starts from the show start', () => {
    const cues = [
      cue(2, { label: 'Second', plannedDurationSeconds: 120 }),
      cue(1, { label: 'First', plannedDurationSeconds: 60 }),
    ];
    const sheet = buildRunOfShowSheet(cues, segments, 72000);
    expect(sheet.rows.map((r) => [r.number, r.label, r.startSeconds])).toEqual([
      [1, 'First', 72000],
      [2, 'Second', 72060],
    ]);
    expect(sheet.totalRunTimeSeconds).toBe(180);
  });

  it('keeps an unknown duration and an unresolvable start as null, never 0', () => {
    const cues = [cue(1), cue(2, { plannedDurationSeconds: 30 })];
    const sheet = buildRunOfShowSheet(cues);
    expect(sheet.rows[0].durationSeconds).toBeNull();
    expect(sheet.rows[1].startSeconds).toBeNull();
    expect(sheet.totalRunTimeSeconds).toBeNull();
  });

  it('resolves the segment name and drops a dangling segment reference', () => {
    const cues = [
      cue(1, { segmentId: 'seg1', plannedDurationSeconds: 10 }),
      cue(2, { segmentId: 'gone', plannedDurationSeconds: 10 }),
    ];
    const sheet = buildRunOfShowSheet(cues, segments);
    expect(sheet.rows[0].segmentName).toBe('Opening block');
    expect(sheet.rows[1].segmentName).toBeUndefined();
  });

  it('lists only the departments that have notes, in reading order', () => {
    const cues = [
      cue(1, {
        plannedDurationSeconds: 10,
        audioNotes: 'Playback A',
        cameraNotes: 'Cam 2 on the door',
        stageNotes: '   ',
      }),
    ];
    const sheet = buildRunOfShowSheet(cues);
    expect(sheet.rows[0].notes).toEqual([
      { department: 'Camera', text: 'Cam 2 on the door' },
      { department: 'Audio', text: 'Playback A' },
    ]);
  });

  it('carries the validation issues, de-duplicated', () => {
    const sheet = buildRunOfShowSheet([cue(1, { label: '' }), cue(2, { plannedDurationSeconds: 5 })]);
    const codes = sheet.issues.map((i) => i.code).sort();
    expect(codes).toEqual(['EMPTY_CUE_LABEL', 'MISSING_DURATION']);
    expect(new Set(sheet.issues.map((i) => `${i.code}:${i.entityId}`)).size).toBe(sheet.issues.length);
  });

  it('yields an empty sheet for an empty cue list', () => {
    expect(buildRunOfShowSheet([])).toEqual({ rows: [], totalRunTimeSeconds: 0, issues: [] });
  });
});
