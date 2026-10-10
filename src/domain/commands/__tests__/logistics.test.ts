/**
 * Logistics, take-list and production-detail commands that replaced free-form
 * `updateProjectMeta` writes in the Logistics, Continuity and Call sheet panels.
 */
import { describe, expect, it } from 'vitest';
import type { Project } from '../../../types';
import type { LogisticsContainer } from '../../logistics';
import { setLogisticsDayFilterCommand, updateLogisticsCommand } from '../logistics';
import { updateTakesCommand } from '../continuity';
import { updateProductionDetailsCommand } from '../productionDetails';

const project = (overrides: Partial<Project> = {}): Project =>
  ({
    id: 'p',
    title: 'Test',
    setups: [],
    activeSetupId: '',
    productionDays: [{ id: 'd1', name: 'Day 1' }],
    ...overrides,
  }) as unknown as Project;

describe('updateLogisticsCommand', () => {
  it('applies updaters to the committed lists and labels the undo step', () => {
    const container = { id: 'c1', kind: 'case', name: 'Camera case' } as LogisticsContainer;
    const result = updateLogisticsCommand(project(), {
      containers: (current) => [...current, container],
      description: 'Add Camera case',
    });
    expect(result.project.logisticsContainers).toEqual([container]);
    expect(result.project.packedItems).toBeUndefined();
    expect(result.meta.description).toBe('Add Camera case');
  });

  it('rejects an empty update', () => {
    expect(() => updateLogisticsCommand(project(), {})).toThrow(/nothing to update/);
  });
});

describe('setLogisticsDayFilterCommand', () => {
  it('sets and clears the filter', () => {
    expect(setLogisticsDayFilterCommand(project(), { productionDayId: 'd1' }).project.logisticsDayFilterId).toBe('d1');
    expect(setLogisticsDayFilterCommand(project({ logisticsDayFilterId: 'd1' }), {}).project.logisticsDayFilterId).toBeUndefined();
  });

  it('rejects an unknown day', () => {
    expect(() => setLogisticsDayFilterCommand(project(), { productionDayId: 'nope' })).toThrow(/unknown production day/);
  });
});

describe('updateTakesCommand', () => {
  it('runs the updater on the current takes', () => {
    const result = updateTakesCommand(project(), { update: (takes) => [...takes, { id: 't1' } as never], description: 'Log take' });
    expect(result.project.takes).toHaveLength(1);
    expect(result.meta.description).toBe('Log take');
  });
});

describe('updateProductionDetailsCommand', () => {
  it('merges continuity crew names field by field', () => {
    const start = project({ continuityCrew: { soundMixer: 'Ana' } } as Partial<Project>);
    const result = updateProductionDetailsCommand(start, { updates: { continuityCrew: { scriptSupervisor: 'Ben' } } });
    expect(result.project.continuityCrew).toEqual({ soundMixer: 'Ana', scriptSupervisor: 'Ben' });
    expect(result.meta.description).toBe('Edit continuity crew');
  });
});
