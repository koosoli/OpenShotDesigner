import { describe, expect, it } from 'vitest';
import { gettingStartedSteps } from '../workspace/gettingStarted';
import type { Project } from '../../types';

describe('gettingStartedSteps', () => {
  it('ticks steps off from what the project holds', () => {
    const empty = { setups: [{ shots: [] }] } as unknown as Project;
    expect(gettingStartedSteps(empty).every((step) => !step.done)).toBe(true);
    const busy = {
      setups: [{ shots: [{ id: 's' }] }],
      scriptLines: [{ id: 'l' }],
      breakdownItems: [{ id: 'i' }],
      castAssignments: [{ id: 'a' }],
      productionDays: [{ id: 'd', scheduleBlockIds: ['b'], callSheet: { status: 'final' } }],
    } as unknown as Project;
    expect(gettingStartedSteps(busy).every((step) => step.done)).toBe(true);
  });
});
