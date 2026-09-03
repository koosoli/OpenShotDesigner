import { describe, expect, it } from 'vitest';
import { scheduleHealthSummary, scheduleIssues } from '../scheduling/health';
import { distanceKm, hasPin, widestSeparation } from '../locations/distance';
import {
  formatClockMinutes,
  formatDurationHours,
  minutesBetweenDays,
  parseClockMinutes,
} from '../scheduling/clock';
import type { HealthLocation } from '../scheduling/health';
import type { ProductionDay, ScheduleBlock } from '../scheduling';

const day = (partial: Partial<ProductionDay> & { id: string; name: string }): ProductionDay => ({
  scheduleBlockIds: [],
  ...partial,
});

const codes = (issues: ReturnType<typeof scheduleIssues>): string[] =>
  issues.map((issue) => issue.code);

/** Two pins ~40 km apart: Luxembourg City and Trier. */
const LUX: HealthLocation = { name: 'Grund', lat: 49.6116, lng: 6.1319 };
const TRIER: HealthLocation = { name: 'Porta Nigra', lat: 49.7596, lng: 6.6439 };
const NEARBY: HealthLocation = { name: 'Kirchberg', lat: 49.6297, lng: 6.1633 };

describe('parseClockMinutes', () => {
  it('reads a plain 24-hour time', () => {
    expect(parseClockMinutes('07:30')).toBe(450);
    expect(parseClockMinutes('7:05')).toBe(425);
  });

  it('refuses anything it cannot read exactly', () => {
    // These fields are free text so "O/C" stays expressible. A parser that
    // pulled a number out of "on set 08:00" would then have to decide what
    // "TBC" means.
    for (const input of ['O/C', 'on set 08:00', '25:00', '07:60', '', undefined]) {
      expect(parseClockMinutes(input)).toBeNull();
    }
  });
});

describe('formatClockMinutes / formatDurationHours', () => {
  it('wraps a clock past midnight', () => {
    expect(formatClockMinutes(1500)).toBe('01:00');
  });

  it('does not wrap a duration', () => {
    expect(formatDurationHours(1500)).toBe('25h 00m');
    expect(formatDurationHours(545)).toBe('9h 05m');
  });
});

describe('minutesBetweenDays', () => {
  it('measures across midnight', () => {
    // 23:00 wrap, 08:00 call is nine hours, not fifteen negative ones.
    expect(minutesBetweenDays(23 * 60, 8 * 60)).toBe(540);
  });

  it('measures within one day when the call is later than the wrap', () => {
    expect(minutesBetweenDays(6 * 60, 18 * 60)).toBe(720);
  });
});

describe('distanceKm', () => {
  it('is zero for the same point', () => {
    expect(distanceKm({ lat: 49.6, lng: 6.1 }, { lat: 49.6, lng: 6.1 })).toBe(0);
  });

  it('measures a known separation to within a kilometre', () => {
    const km = distanceKm(
      { lat: LUX.lat as number, lng: LUX.lng as number },
      { lat: TRIER.lat as number, lng: TRIER.lng as number },
    );
    expect(km).toBeGreaterThan(38);
    expect(km).toBeLessThan(42);
  });
});

describe('hasPin', () => {
  it('rejects out-of-range and non-finite coordinates', () => {
    expect(hasPin({ lat: 91, lng: 0 })).toBe(false);
    expect(hasPin({ lat: 0, lng: 181 })).toBe(false);
    expect(hasPin({ lat: Number.NaN, lng: 0 })).toBe(false);
    expect(hasPin(undefined)).toBe(false);
    expect(hasPin({ lat: 0, lng: 0 })).toBe(true);
  });
});

describe('widestSeparation', () => {
  it('is null with fewer than two pinned points', () => {
    expect(widestSeparation([LUX, { name: 'No pin' }])).toBeNull();
  });

  it('picks the furthest pair, not the first', () => {
    const widest = widestSeparation([NEARBY, LUX, TRIER]);
    expect([widest?.from.name, widest?.to.name].sort()).toEqual(['Grund', 'Porta Nigra']);
  });
});

describe('company_moves', () => {
  it('notes a day with more locations than the threshold', () => {
    const issues = scheduleIssues({
      days: [day({ id: 'd1', name: 'Day 1' })],
      blocks: [],
      locationsForDay: () => [
        { name: 'Kitchen' },
        { name: 'Street' },
        { name: 'Office' },
      ],
    });
    expect(codes(issues)).toContain('company_moves');
    expect(issues[0].message).toContain('2 company moves');
  });

  it('counts two strips at one address as one location', () => {
    const issues = scheduleIssues({
      days: [day({ id: 'd1', name: 'Day 1' })],
      blocks: [],
      locationsForDay: () => [{ name: 'Kitchen' }, { name: ' kitchen ' }, { name: 'Street' }],
    });
    expect(codes(issues)).not.toContain('company_moves');
  });
});

describe('distant_locations and cast_split_across_locations', () => {
  it('warns when the day spans further than the threshold', () => {
    const issues = scheduleIssues({
      days: [day({ id: 'd1', name: 'Day 1' })],
      blocks: [],
      locationsForDay: () => [LUX, TRIER],
    });
    expect(codes(issues)).toContain('distant_locations');
  });

  it('stays quiet for two addresses in one city', () => {
    const issues = scheduleIssues({
      days: [day({ id: 'd1', name: 'Day 1' })],
      blocks: [],
      locationsForDay: () => [LUX, NEARBY],
    });
    expect(issues).toEqual([]);
  });

  it('does not treat an unpinned location as the origin', () => {
    // (0, 0) is in the Atlantic; counting a location with no pin as being
    // there makes every day look like a world tour.
    const issues = scheduleIssues({
      days: [day({ id: 'd1', name: 'Day 1' })],
      blocks: [],
      locationsForDay: () => [LUX, { name: 'Unlocated set' }],
    });
    expect(codes(issues)).not.toContain('distant_locations');
  });

  it('names the cast booked across the spread', () => {
    const issues = scheduleIssues({
      days: [day({ id: 'd1', name: 'Day 1' })],
      blocks: [],
      locationsForDay: () => [LUX, TRIER],
      castForDay: () => new Set(['p2', 'p1']),
      locationsForPersonOnDay: (id) => (id === 'p1' ? [LUX, TRIER] : [LUX]),
      personName: (id) => ({ p1: 'JENNA', p2: 'MARCUS' })[id],
    });
    const split = issues.find((issue) => issue.code === 'cast_split_across_locations');
    // Sorted, so the message is stable rather than Set-ordered.
    expect(split?.message).toContain('JENNA');
    expect(split?.message).not.toContain('MARCUS');
  });

  it('does not claim every called performer crosses the full day-wide spread', () => {
    const issues = scheduleIssues({
      days: [day({ id: 'd1', name: 'Day 1' })],
      blocks: [],
      locationsForDay: () => [LUX, TRIER],
      castForDay: () => new Set(['p1']),
      personName: () => 'JENNA',
    });
    expect(codes(issues)).not.toContain('cast_split_across_locations');
  });

  it('skips the cast check when the caller cannot answer it', () => {
    const issues = scheduleIssues({
      days: [day({ id: 'd1', name: 'Day 1' })],
      blocks: [],
      locationsForDay: () => [LUX, TRIER],
    });
    expect(codes(issues)).not.toContain('cast_split_across_locations');
  });
});

describe('short_turnaround', () => {
  const days = [
    day({ id: 'd1', name: 'Day 1', crewCall: '08:00', plannedWrap: '23:00' }),
    day({ id: 'd2', name: 'Day 2', crewCall: '07:00', plannedWrap: '19:00' }),
  ];

  it('warns on a nine-hour turnaround', () => {
    const issues = scheduleIssues({ days, blocks: [], locationsForDay: () => [] });
    const short = issues.find((issue) => issue.code === 'short_turnaround');
    expect(short?.productionDayId).toBe('d2');
    expect(short?.relatedDayId).toBe('d1');
    expect(short?.message).toContain('8h 00m');
  });

  it('reports it against the day whose call would have to move', () => {
    const issues = scheduleIssues({ days, blocks: [], locationsForDay: () => [] });
    expect(issues.find((issue) => issue.code === 'short_turnaround')?.dayName).toBe('Day 2');
  });

  it('respects a production working to a longer turnaround', () => {
    const roomy = [
      day({ id: 'd1', name: 'Day 1', crewCall: '08:00', plannedWrap: '19:00' }),
      day({ id: 'd2', name: 'Day 2', crewCall: '08:00', plannedWrap: '19:00' }),
    ];
    expect(
      codes(scheduleIssues({ days: roomy, blocks: [], locationsForDay: () => [] })),
    ).not.toContain('short_turnaround');
    expect(
      codes(
        scheduleIssues(
          { days: roomy, blocks: [], locationsForDay: () => [] },
          { minTurnaroundMinutes: 840 },
        ),
      ),
    ).toContain('short_turnaround');
  });

  it('says nothing when a day has no wrap time', () => {
    const undated = [
      day({ id: 'd1', name: 'Day 1', crewCall: '08:00' }),
      day({ id: 'd2', name: 'Day 2', crewCall: '07:00' }),
    ];
    expect(
      codes(scheduleIssues({ days: undated, blocks: [], locationsForDay: () => [] })),
    ).not.toContain('short_turnaround');
  });
});

describe('day_overruns', () => {
  const blocks: ScheduleBlock[] = [
    { id: 'b1', kind: 'manual', label: 'Setup A', estimatedMinutes: 400 },
    { id: 'b2', kind: 'manual', label: 'Setup B', estimatedMinutes: 300 },
    { id: 'b3', kind: 'manual', label: 'Unestimated' },
  ];

  it('warns when the work does not fit the published window', () => {
    const issues = scheduleIssues({
      days: [
        day({
          id: 'd1',
          name: 'Day 1',
          crewCall: '08:00',
          plannedWrap: '18:00',
          scheduleBlockIds: ['b1', 'b2'],
        }),
      ],
      blocks,
      locationsForDay: () => [],
    });
    const overrun = issues.find((issue) => issue.code === 'day_overruns');
    expect(overrun?.message).toContain('11h 40m of work');
    expect(overrun?.message).toContain('10h 00m day');
  });

  it('stays silent when any strip has no estimate', () => {
    // A partial sum would print "11h in a 10h day" from a number the user
    // cannot reconcile with anything on screen.
    const issues = scheduleIssues({
      days: [
        day({
          id: 'd1',
          name: 'Day 1',
          crewCall: '08:00',
          plannedWrap: '18:00',
          scheduleBlockIds: ['b1', 'b2', 'b3'],
        }),
      ],
      blocks,
      locationsForDay: () => [],
    });
    expect(codes(issues)).not.toContain('day_overruns');
  });

  it('measures a window that runs past midnight', () => {
    const issues = scheduleIssues({
      days: [
        day({
          id: 'd1',
          name: 'Nights',
          crewCall: '18:00',
          plannedWrap: '04:00',
          scheduleBlockIds: ['b1', 'b2'],
        }),
      ],
      blocks,
      locationsForDay: () => [],
    });
    // 11h40m of work in a 10h window.
    expect(codes(issues)).toContain('day_overruns');
  });
});

describe('scheduleHealthSummary', () => {
  it('splits the count by severity', () => {
    const issues = scheduleIssues({
      days: [day({ id: 'd1', name: 'Day 1' })],
      blocks: [],
      locationsForDay: () => [LUX, TRIER, { name: 'Third' }],
    });
    // company_moves is a note; distant_locations is a warning.
    expect(scheduleHealthSummary(issues)).toEqual({ warnings: 1, notes: 1 });
  });
});

describe('cast_unavailable', () => {
  const scheduledDay = day({ id: 'd1', name: 'Day 1', date: '2026-09-02' });

  const issuesFor = (
    unavailableOn: (personId: string, dayName: string) => boolean,
    cast = new Set(['p1']),
  ) =>
    scheduleIssues({
      days: [scheduledDay],
      blocks: [],
      locationsForDay: () => [{ name: 'Studio' }],
      castForDay: () => cast,
      personUnavailableOn: (personId, day) => unavailableOn(personId, day.name),
      personName: (personId) =>
        personId === 'p1' ? 'Zoe Cast' : personId === 'p2' ? 'Amy Cast' : personId,
    });

  it('warns when a scheduled cast member is marked unavailable that day', () => {
    const issues = issuesFor((_id, dayName) => dayName === 'Day 1');
    expect(codes(issues)).toContain('cast_unavailable');
    const issue = issues.find((entry) => entry.code === 'cast_unavailable');
    expect(issue?.severity).toBe('warning');
    expect(issue?.message).toContain('Zoe Cast');
    expect(issue?.message).toContain('Day 1');
  });

  it('names every unavailable performer in one issue, alphabetically', () => {
    const issues = issuesFor(
      (personId) => personId === 'p1' || personId === 'p2',
      new Set(['p2', 'p3', 'p1']),
    );
    // p3 is free, so the issue names exactly the two who are not — in the
    // order the sheet reads, not the order the set iterates.
    const issue = issues.find((entry) => entry.code === 'cast_unavailable');
    expect(issue?.message).toMatch(/Amy Cast, Zoe Cast/);
  });

  it('stays silent when nobody scheduled is unavailable', () => {
    const issues = issuesFor(() => false);
    expect(codes(issues)).not.toContain('cast_unavailable');
  });

  it('is skipped entirely when the caller cannot answer availability', () => {
    const issues = scheduleIssues({
      days: [scheduledDay],
      blocks: [],
      locationsForDay: () => [{ name: 'Studio' }],
      castForDay: () => new Set(['p1']),
    });
    expect(codes(issues)).not.toContain('cast_unavailable');
  });
});
