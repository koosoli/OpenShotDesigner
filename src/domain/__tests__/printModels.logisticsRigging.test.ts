/**
 * The two print-model builders behind the Logistics and Rigging paper reports.
 *
 * They are pure `Project` → props mappings, so they are tested here next to the
 * domain logic they lean on rather than through a rendered component. What
 * matters is that unknowns survive the trip to paper as unknowns (rule 13) and
 * that nothing packed or hung quietly falls off the sheet.
 */
import { describe, it, expect } from 'vitest';
import { buildLogisticsPrintModel } from '../../components/reports/LogisticsPrintView';
import { buildRiggingPrintModel } from '../../components/reports/RiggingPrintView';
import type { Project } from '../../types';

const baseProject = (overrides: Partial<Project>): Project =>
  ({
    title: 'Test Production',
    productionCompany: 'Test Co',
    director: '',
    cinematographer: '',
    date: '2026-01-01',
    setups: [],
    activeSetupId: '',
    ...overrides,
  }) as Project;

describe('buildLogisticsPrintModel', () => {
  it('groups nested containers under their top-level container and keeps unknowns unknown', () => {
    const project = baseProject({
      logisticsContainers: [
        { id: 'truck', kind: 'truck', name: 'Grip truck', maxPayloadKg: 1000, tareWeightKg: 50 },
        { id: 'case', kind: 'case', name: 'Lens case', parentContainerId: 'truck' },
      ],
      packedItems: [
        { id: 'i1', containerId: 'truck', label: 'Stands', quantity: 4, unitWeightKg: 5 },
        { id: 'i2', containerId: 'case', label: 'Mystery box', quantity: 1 },
        { id: 'i3', containerId: 'nowhere', label: 'Orphan', quantity: 2, unitWeightKg: 1.5 },
      ],
    });

    const model = buildLogisticsPrintModel(project);
    expect(model.productionTitle).toBe('Test Production');
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0].containers.map((c) => c.id)).toEqual(['truck', 'case']);
    expect(model.groups[0].containers[1].depth).toBe(1);
    expect(model.groups[0].containers[1].parentName).toContain('Grip truck');

    // 50 kg tare + 4 × 5 kg.
    expect(model.groups[0].containers[0].load.totalWeightKg).toBe(70);
    // The nested case holds an item with no weight, so its total stays unknown.
    expect(model.groups[0].containers[1].load.totalWeightKg).toBeNull();

    expect(model.unassignedItems.map((i) => i.label)).toEqual(['Orphan']);
    expect(model.unassignedItems[0].lineWeightKg).toBe(3);
    expect(model.fleet).toMatchObject({
      containerCount: 2,
      itemCount: 3,
      knownWeightKg: 70,
      unknownWeightItemCount: 1,
    });
  });

  it('leaves a line weight undefined when the unit weight is unknown', () => {
    const project = baseProject({
      logisticsContainers: [{ id: 'c', kind: 'case', name: 'Case' }],
      packedItems: [{ id: 'i', containerId: 'c', label: 'Unweighed', quantity: 3 }],
    });
    const item = buildLogisticsPrintModel(project).groups[0].containers[0].items[0];
    expect(item.lineWeightKg).toBeUndefined();
    expect(item.unitWeightKg).toBeUndefined();
  });
});

describe('buildRiggingPrintModel', () => {
  const project = baseProject({
    trussProfiles: [
      { id: 'p1', manufacturer: 'Generic', model: 'Box 3m', geometry: 'box', lengthMm: 3000, selfWeightKg: 20 },
    ],
    trussElements: [
      { id: 't1', label: 'Upstage grid', profileId: 'p1', x: 0, y: 0, rotation: 0 },
      { id: 't2', profileId: 'missing', x: 0, y: 0, rotation: 0 },
    ],
    suspendedLoads: [
      { id: 'l1', trussElementId: 't1', label: 'LED bar', weightKg: 10, quantity: 2, source: 'profile' },
      { id: 'l2', trussElementId: 't1', label: 'Mystery', quantity: 1, source: 'unknown' },
    ],
    riggingItems: [
      { id: 'r1', kind: 'motor', trussElementId: 't1', capacityKg: 250, positionMm: 300 },
      { id: 'r2', kind: 'clamp', trussElementId: 't1' },
      { id: 'r3', kind: 'safety', trussElementId: 'deleted-run', label: 'Loose steel' },
    ],
  });

  it('carries the domain load and capacity figures onto the sheet', () => {
    const model = buildRiggingPrintModel(project);
    const run = model.runs[0];
    expect(run.name).toBe('Upstage grid');
    expect(run.profileLabel).toBe('Generic Box 3m');
    expect(run.lengthMm).toBe(3000);
    expect(run.lengthFromProfile).toBe(true);
    expect(run.selfWeightKg).toBe(20);
    expect(run.loadsKg).toBe(20);
    expect(run.unknownLoadCount).toBe(1);
    expect(run.totalKg).toBe(40);
    expect(run.capacity.verdict).toBe('within');
    expect(run.capacity.capacityKg).toBe(250);
    expect(run.loads[0].lineWeightKg).toBe(20);
    expect(run.loads[1].lineWeightKg).toBeUndefined();
    expect(run.hardware).toHaveLength(2);
  });

  it('reports no verdict for a run whose profile is missing, and keeps orphaned hardware visible', () => {
    const model = buildRiggingPrintModel(project);
    const orphanProfileRun = model.runs[1];
    expect(orphanProfileRun.profileLabel).toBe('Unknown profile');
    expect(orphanProfileRun.selfWeightKg).toBeNull();
    expect(orphanProfileRun.totalKg).toBeNull();
    expect(orphanProfileRun.capacity.verdict).toBe('unknown');

    expect(model.unassignedHardware.map((h) => h.label)).toEqual(['Loose steel']);
  });
});
