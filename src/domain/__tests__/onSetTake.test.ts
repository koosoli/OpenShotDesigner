import { describe, expect, it } from 'vitest';
import { recordOnSetTake, type Take } from '../continuity';

const take = (overrides: Partial<Take> = {}): Take => ({
  id: 'take-1',
  shotId: 'shot-1',
  productionDayId: 'day-1',
  takeNumber: 1,
  loggedAt: '2026-09-02T08:00:00.000Z',
  ...overrides,
});

describe('recordOnSetTake', () => {
  it('starts a new unjudged take for TAKE +', () => {
    const result = recordOnSetTake([], {
      id: 'take-1', shotId: 'shot-1', productionDayId: 'day-1', loggedAt: 'now',
    });
    expect(result).toEqual([expect.objectContaining({
      id: 'take-1', shotId: 'shot-1', productionDayId: 'day-1', takeNumber: 1,
    })]);
    expect(result[0].isGoodTake).toBeUndefined();
  });

  it('judges the latest open take without creating a duplicate', () => {
    const result = recordOnSetTake([take()], {
      id: 'unused', shotId: 'shot-1', productionDayId: 'day-1', loggedAt: 'now',
      judgement: true, comments: 'Print it', mos: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ isGoodTake: true, comments: 'Print it', mos: true });
  });

  it('never judges an open take from another shooting day', () => {
    const result = recordOnSetTake([take()], {
      id: 'take-2', shotId: 'shot-1', productionDayId: 'day-2', loggedAt: 'now',
      judgement: false,
    });
    expect(result).toHaveLength(2);
    expect(result[0].isGoodTake).toBeUndefined();
    expect(result[1]).toMatchObject({ id: 'take-2', productionDayId: 'day-2', isGoodTake: false });
  });
});
