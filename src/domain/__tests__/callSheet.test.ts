import { describe, it, expect } from 'vitest';
import {
  applyOverrides,
  deriveCallSheet,
  publishSheet,
  type CallSheetData,
} from '../reports';
import type { ProductionDay, ScheduleBlock } from '../scheduling';
import type { Person } from '../people';

const day: ProductionDay = {
  id: 'day-1',
  name: 'Day 1',
  date: '2026-09-01',
  crewCall: '08:00',
  scheduleBlockIds: ['b-scene', 'b-setup', 'b-meal'],
};

const blocks: ScheduleBlock[] = [
  { id: 'b-scene', kind: 'scene', scriptSceneId: 'scene-17', estimatedMinutes: 120 },
  { id: 'b-setup', kind: 'setup', setupId: 'setup-3' },
  { id: 'b-meal', kind: 'manual', label: 'Lunch', manualType: 'meal', estimatedMinutes: 45 },
];

const people: Person[] = [
  { id: 'p1', displayName: 'Jane Doe', kind: 'cast', role: 'Lead' },
  { id: 'p2', displayName: 'Crew One', kind: 'crew', department: 'Camera', role: 'Operator' },
];

describe('deriveCallSheet', () => {
  it('derives schedule entries with resolved labels and estimates', () => {
    const sheet = deriveCallSheet({
      day,
      blocks,
      productionTitle: 'My Film',
      people,
      resolveSceneLabel: (id) => (id === 'scene-17' ? 'Scene 17 — Kitchen' : undefined),
      resolveSetupLabel: (id) => (id === 'setup-3' ? 'Setup 3 — CU' : undefined),
    });

    expect(sheet.schedule.map((e) => e.label)).toEqual([
      'Scene 17 — Kitchen',
      'Setup 3 — CU',
      'Lunch',
    ]);
    expect(sheet.cast.map((c) => c.displayName)).toEqual(['Jane Doe']);
    expect(sheet.crew.map((c) => c.displayName)).toEqual(['Crew One']);
    expect(sheet.crewCall).toBe('08:00');
    expect(sheet.schedule.map((entry) => entry.scheduledStart)).toEqual(['08:00', '10:00', undefined]);
  });

  it('includes only cast assigned to characters scheduled for the day', () => {
    const sheet = deriveCallSheet({
      day,
      blocks,
      productionTitle: 'My Film',
      people: [
        ...people,
        { id: 'p3', displayName: 'Day Player', kind: 'cast', role: 'Neighbor' },
      ],
      castPersonIds: ['p1'],
      resolveSceneLabel: () => 'S',
      resolveSetupLabel: () => 'U',
    });
    expect(sheet.cast.map((person) => person.displayName)).toEqual(['Jane Doe']);
  });

  it('warns on unresolved references and missing estimates', () => {
    const sheet = deriveCallSheet({ day, blocks, productionTitle: 'My Film' });
    expect(sheet.warnings.some((w) => w.includes('Scene scene-17'))).toBe(true);
    expect(sheet.warnings.some((w) => w.toLowerCase().includes('estimate'))).toBe(true);
    expect(sheet.schedule[0].unresolved).toBe(true);
  });

  it('returns null total when any block lacks an estimate', () => {
    const sheet = deriveCallSheet({
      day,
      blocks,
      productionTitle: 'My Film',
      resolveSceneLabel: () => 'S',
      resolveSetupLabel: () => 'SU',
    });
    expect(sheet.totalEstimatedMinutes).toBeNull();
  });

  it('totals when every block is estimated', () => {
    const fullBlocks: ScheduleBlock[] = [
      { id: 'b-scene', kind: 'scene', scriptSceneId: 's1', estimatedMinutes: 60 },
      { id: 'b-setup', kind: 'setup', setupId: 'u1', estimatedMinutes: 30 },
      { id: 'b-meal', kind: 'manual', label: 'Lunch', estimatedMinutes: 45 },
    ];
    const sheet = deriveCallSheet({
      day,
      blocks: fullBlocks,
      productionTitle: 'My Film',
      resolveSceneLabel: () => 'S',
      resolveSetupLabel: () => 'U',
    });
    expect(sheet.totalEstimatedMinutes).toBe(135);
  });

  it('uses resolved shot names for individually scheduled shot groups', () => {
    const shotDay: ProductionDay = {
      ...day,
      scheduleBlockIds: ['b-shots'],
    };
    const sheet = deriveCallSheet({
      day: shotDay,
      blocks: [{ id: 'b-shots', kind: 'shots', shotIds: ['shot-1', 'shot-2'], estimatedMinutes: 25 }],
      productionTitle: 'My Film',
      resolveShotLabel: (ids) => ids.map((id) => id === 'shot-1' ? 'Shot 1A — Master' : 'Shot 1B — Close-up').join(' + '),
    });

    expect(sheet.schedule[0]).toMatchObject({
      label: 'Shot 1A — Master + Shot 1B — Close-up',
      kind: 'shots',
      estimatedMinutes: 25,
      unresolved: false,
    });
  });
});

describe('overrides & publishing', () => {
  const base: CallSheetData = deriveCallSheet({
    day,
    blocks,
    productionTitle: 'My Film',
    resolveSceneLabel: () => 'S',
    resolveSetupLabel: () => 'U',
  });

  it('applies only known fields as explicit overrides', () => {
    const overridden = applyOverrides(base, [
      { field: 'crewCall', value: '07:30' },
      { field: 'nonexistentField', value: 'ignored' },
    ]);
    expect(overridden.crewCall).toBe('07:30');
    expect(overridden.schedule).toEqual(base.schedule);
  });

  it('publishes a frozen revision with lifecycle metadata', () => {
    const sheet = publishSheet(base, [{ field: 'crewCall', value: '07:30' }]);
    expect(sheet.lifecycle).toBe('published');
    expect(sheet.overrides).toHaveLength(1);
    expect(typeof sheet.generatedAt).toBe('string');
  });
});
