import { describe, expect, it } from 'vitest';
import { personalCallsToIcs, shootingDaysToIcs } from '../scheduling/calendarExport';
import type { ProductionDay } from '../scheduling/types';

const days: ProductionDay[] = [
  {
    id: 'day-1',
    name: 'Day 1',
    date: '2026-09-03',
    crewCall: '07:00',
    plannedWrap: '19:00',
    scheduleBlockIds: [],
    callSheet: {
      personCalls: [{ id: 'call-1', personId: 'p1', time: '06:15', note: 'Make-up' }],
    },
  },
];

describe('calendar export', () => {
  it('exports shooting-day times as floating local calendar times', () => {
    const result = shootingDaysToIcs(days, 'Feature, One');
    expect(result).toContain('SUMMARY:Feature\\, One — Day 1');
    expect(result).toContain('DTSTART:20260903T070000');
    expect(result).toContain('DTEND:20260903T190000');
  });

  it('uses a personal call in preference to general crew call', () => {
    const result = personalCallsToIcs(days, 'Feature', 'p1', 'Alex');
    expect(result).toContain('DTSTART:20260903T061500');
    expect(result).toContain('DESCRIPTION:Make-up');
  });
});
