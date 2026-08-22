import { describe, expect, it } from 'vitest';
import {
  STANDING_CALL_SHEET_FIELDS,
  hasStandingContent,
  resolveStandingCallSheet,
} from '../reports';
import type { StandingCallSheet } from '../reports';

const standing: StandingCallSheet = {
  walkieChannels: 'Ch 1 Production · Ch 2 Camera · Ch 3 Grip/Electric',
  unitBase: 'Depot yard, Gate 4',
  nearestHospital: 'St Anne’s, 12 Mill Road · 555 0100',
  safetyNotes: 'Hi-vis on the yard at all times.',
};

describe('resolveStandingCallSheet', () => {
  it('inherits the production value when the day says nothing', () => {
    const resolved = resolveStandingCallSheet(standing, {});
    expect(resolved.walkieChannels).toEqual({
      value: 'Ch 1 Production · Ch 2 Camera · Ch 3 Grip/Electric',
      origin: 'production',
    });
  });

  it('lets a day override one field without disturbing the others', () => {
    const resolved = resolveStandingCallSheet(standing, {
      nearestHospital: 'County General · 555 0999',
    });
    expect(resolved.nearestHospital).toEqual({
      value: 'County General · 555 0999',
      origin: 'day',
    });
    expect(resolved.walkieChannels.origin).toBe('production');
  });

  /**
   * Blank has to mean "inherit", because a cleared input and a never-set field
   * produce the same stored value. A day that genuinely has no walkie plan says
   * so in words — one meaning per stored value.
   */
  it('treats a blank or whitespace day value as inherit, not as empty', () => {
    expect(resolveStandingCallSheet(standing, { walkieChannels: '' }).walkieChannels).toEqual({
      value: standing.walkieChannels,
      origin: 'production',
    });
    expect(resolveStandingCallSheet(standing, { walkieChannels: '   ' }).walkieChannels.origin).toBe(
      'production',
    );
    // And with nothing to inherit, blank stays unset rather than becoming ''.
    expect(resolveStandingCallSheet({}, { walkieChannels: '  ' }).walkieChannels).toEqual({
      origin: 'unset',
    });
  });

  it('reports unset when neither level has a value', () => {
    expect(resolveStandingCallSheet(standing, {}).parking).toEqual({ origin: 'unset' });
    expect(resolveStandingCallSheet(undefined, undefined).generalNotes).toEqual({ origin: 'unset' });
  });

  it('covers every declared field, so nothing can be silently forgotten', () => {
    const resolved = resolveStandingCallSheet(standing, {});
    for (const field of STANDING_CALL_SHEET_FIELDS) {
      expect(resolved[field]).toBeDefined();
    }
    expect(Object.keys(resolved).sort()).toEqual([...STANDING_CALL_SHEET_FIELDS].sort());
  });

  /**
   * The behaviour the whole design exists for: change the production value and
   * every day that has not overridden it changes with it. If days held copies,
   * this test would need to touch each of them.
   */
  it('changes every inheriting day at once', () => {
    const days = [{}, { parking: 'Street only' }, {}];
    const before = days.map((day) => resolveStandingCallSheet(standing, day).walkieChannels.value);
    const after = days.map(
      (day) => resolveStandingCallSheet({ ...standing, walkieChannels: 'Ch 4 added' }, day).walkieChannels.value,
    );
    expect(new Set(before).size).toBe(1);
    expect(after).toEqual(['Ch 4 added', 'Ch 4 added', 'Ch 4 added']);
  });

  it('leaves the overriding day alone when the production value changes', () => {
    const day = { parking: 'Street only' };
    const after = resolveStandingCallSheet({ ...standing, parking: 'Yard bays 1-8' }, day);
    expect(after.parking).toEqual({ value: 'Street only', origin: 'day' });
  });
});

describe('hasStandingContent', () => {
  it('is true when anything is set and false when nothing is', () => {
    expect(hasStandingContent(standing)).toBe(true);
    expect(hasStandingContent({})).toBe(false);
    expect(hasStandingContent(undefined)).toBe(false);
    expect(hasStandingContent({ parking: '   ' })).toBe(false);
  });
});
