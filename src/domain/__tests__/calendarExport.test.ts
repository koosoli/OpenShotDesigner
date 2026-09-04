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

const extractUids = (ics: string): string[] =>
  ics
    .replaceAll('\r\n ', '')
    .split('\r\n')
    .filter((line) => line.startsWith('UID:'))
    .map((line) => line.slice('UID:'.length));

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

  it('emits TZID-qualified times when a time zone is given', () => {
    const result = shootingDaysToIcs(days, 'Feature', { timeZone: 'Europe/Berlin' });
    expect(result).toContain('DTSTART;TZID=Europe/Berlin:20260903T070000');
    expect(result).toContain('DTEND;TZID=Europe/Berlin:20260903T190000');
  });

  it('stamps every event with DTSTAMP', () => {
    const result = shootingDaysToIcs(days, 'Feature');
    expect(result).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
  });

  it('keeps a stable UID across two exports of the same event', () => {
    const first = extractUids(shootingDaysToIcs(days, 'Feature'));
    const second = extractUids(shootingDaysToIcs(days, 'Feature'));
    expect(first).toEqual(['day-1@openshotdesigner']);
    expect(second).toEqual(first);
  });

  it('emits one UID per event so re-import updates instead of duplicating', () => {
    const result = shootingDaysToIcs(days, 'Feature');
    const uids = extractUids(result);
    expect(uids).toHaveLength(1);
    expect(new Set(uids).size).toBe(uids.length);
  });

  it('defaults SEQUENCE to 0 and bumps it from the latest call-sheet issue revision', () => {
    expect(shootingDaysToIcs(days, 'Feature')).toContain('SEQUENCE:0');
    const revised: ProductionDay[] = [
      {
        ...days[0],
        callSheet: {
          ...days[0].callSheet,
          issues: [
            { id: 'i1', revision: 1, issuedAt: '2026-09-01T08:00:00Z', snapshotJson: '{}', acknowledgements: [] },
            { id: 'i2', revision: 2, issuedAt: '2026-09-02T08:00:00Z', snapshotJson: '{}', acknowledgements: [] },
          ],
        },
        scheduleBlockIds: [],
      },
    ];
    expect(shootingDaysToIcs(revised, 'Feature')).toContain('SEQUENCE:2');
  });

  it('folds lines longer than 75 octets with a CRLF+space continuation', () => {
    const long: ProductionDay[] = [
      { ...days[0], notes: 'x'.repeat(100), scheduleBlockIds: [] },
    ];
    const result = shootingDaysToIcs(long, 'Feature');
    expect(result).toContain('\r\n ');
    const unfolded = result.replaceAll('\r\n ', '');
    expect(unfolded).toContain(`DESCRIPTION:${'x'.repeat(100)}`);
  });

  it('passes LOCATION and DESCRIPTION through escaped', () => {
    const located: ProductionDay[] = [
      {
        ...days[0],
        notes: 'Unit; call, early',
        callSheet: { ...days[0].callSheet, unitBase: 'Studio A, Lot 1' },
        scheduleBlockIds: [],
      },
    ];
    const result = shootingDaysToIcs(located, 'Feature');
    expect(result).toContain('LOCATION:Studio A\\, Lot 1');
    expect(result).toContain('DESCRIPTION:Unit\\; call\\, early');
  });

  it('omits VALARM by default and emits one when alarmMinutesBefore is set', () => {
    expect(shootingDaysToIcs(days, 'Feature')).not.toContain('BEGIN:VALARM');
    const result = shootingDaysToIcs(days, 'Feature', { alarmMinutesBefore: 15 });
    expect(result).toContain('BEGIN:VALARM');
    expect(result).toContain('TRIGGER:-PT15M');
    expect(result).toContain('ACTION:DISPLAY');
  });
});
