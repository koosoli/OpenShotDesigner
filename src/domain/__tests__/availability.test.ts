import { describe, expect, it } from 'vitest';
import { personUnavailableOn } from '../people/availability';
import type { Person, UnavailableRange } from '../people/types';

const range = (partial: Partial<UnavailableRange>): UnavailableRange => ({
  id: 'r1',
  from: '2026-09-01',
  to: '2026-09-05',
  ...partial,
});

const personWith = (ranges: UnavailableRange[] | undefined): Person =>
  ({ id: 'p1', displayName: 'Sarah Cast', ...(ranges ? { unavailableRanges: ranges } : {}) }) as Person;

describe('personUnavailableOn', () => {
  it('is inclusive of both ends of the range', () => {
    const person = personWith([range({})]);
    expect(personUnavailableOn(person, '2026-09-01')).toBe(true);
    expect(personUnavailableOn(person, '2026-09-03')).toBe(true);
    expect(personUnavailableOn(person, '2026-09-05')).toBe(true);
    expect(personUnavailableOn(person, '2026-08-31')).toBe(false);
    expect(personUnavailableOn(person, '2026-09-06')).toBe(false);
  });

  it('matches across any of the person’s ranges', () => {
    const person = personWith([
      range({ id: 'a', from: '2026-09-01', to: '2026-09-02' }),
      range({ id: 'b', from: '2026-10-10', to: '2026-10-12' }),
    ]);
    expect(personUnavailableOn(person, '2026-10-11')).toBe(true);
    expect(personUnavailableOn(person, '2026-09-15')).toBe(false);
  });

  /**
   * An unbounded or unreadable end must never match anything. Matching
   * everything would block half the schedule on what may be a typo.
   */
  it('treats a malformed range as covering nothing', () => {
    const person = personWith([range({ to: '' }), range({ id: 'x', from: 'nope', to: '2026-09-05' })]);
    expect(personUnavailableOn(person, '2026-09-03')).toBe(false);
  });

  it('treats an inverted range as covering nothing', () => {
    const person = personWith([range({ from: '2026-09-05', to: '2026-09-01' })]);
    expect(personUnavailableOn(person, '2026-09-03')).toBe(false);
  });

  it('answers false for every kind of nothing', () => {
    expect(personUnavailableOn(undefined, '2026-09-03')).toBe(false);
    expect(personUnavailableOn(personWith(undefined), '2026-09-03')).toBe(false);
    expect(personUnavailableOn(personWith([]), '2026-09-03')).toBe(false);
    expect(personUnavailableOn(personWith([range({})]), undefined)).toBe(false);
    expect(personUnavailableOn(personWith([range({})]), '21/09/2026')).toBe(false);
  });
});
