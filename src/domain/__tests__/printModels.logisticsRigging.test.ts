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
    // And so, therefore, does the truck's rolled-up total: a driver must not
    // read 70 kg off a truck holding an unweighed case.
    expect(model.groups[0].containers[0].load.rolledUpWeightKg).toBeNull();
    expect(model.groups[0].containers[0].load.nestedContainerCount).toBe(1);

    expect(model.unassignedItems.map((i) => i.label)).toEqual(['Orphan']);
    expect(model.unassignedItems[0].lineWeightKg).toBe(3);
    expect(model.fleet).toMatchObject({
      containerCount: 2,
      itemCount: 3,
      // The one top-level container has an unknown rolled-up weight, so the
      // fleet figure counts it as excluded rather than summing part of it.
      knownWeightKg: 0,
      topLevelWithUnknownWeight: 1,
      unknownWeightItemCount: 1,
    });
    expect(model.scopeLabel).toBeUndefined();
  });

  it('rolls a nested case up into its truck once every weight is known', () => {
    const project = baseProject({
      logisticsContainers: [
        { id: 'truck', kind: 'truck', name: 'Grip truck', maxPayloadKg: 100, tareWeightKg: 50 },
        { id: 'case', kind: 'case', name: 'Lens case', parentContainerId: 'truck', tareWeightKg: 8 },
      ],
      packedItems: [
        { id: 'i1', containerId: 'truck', label: 'Stands', quantity: 4, unitWeightKg: 5 },
        { id: 'i2', containerId: 'case', label: 'Lens', quantity: 2, unitWeightKg: 3 },
      ],
    });
    const truck = buildLogisticsPrintModel(project).groups[0].containers[0];
    expect(truck.load.totalWeightKg).toBe(70);
    expect(truck.load.rolledUpWeightKg).toBe(84);
    // The payload verdict is judged on the rolled-up figure.
    expect(truck.load.rolledUpPayloadUtilization).toBeCloseTo(0.84, 10);
  });

  it('names the shoot day and destination on each container, inherited from the parent', () => {
    const project = baseProject({
      productionDays: [{ id: 'day-1', name: 'Day 1', date: '2026-03-04', scheduleBlockIds: [] }],
      locations: [{ id: 'loc-1', name: 'Warehouse', type: 'other', referenceAssetIds: [] }],
      logisticsContainers: [
        {
          id: 'truck',
          kind: 'truck',
          name: 'Grip truck',
          productionDayId: 'day-1',
          locationId: 'loc-1',
        },
        { id: 'case', kind: 'case', name: 'Lens case', parentContainerId: 'truck' },
      ],
      packedItems: [],
    });
    const [truck, lensCase] = buildLogisticsPrintModel(project).groups[0].containers;
    expect(truck.dayLabel).toBe('Day 1 · 2026-03-04');
    expect(truck.locationLabel).toBe('Warehouse');
    expect(truck.routingInherited).toBe(false);
    expect(lensCase.dayLabel).toBe('Day 1 · 2026-03-04');
    expect(lensCase.routingInherited).toBe(true);
  });

  it('prints one day when the project is scoped to it, keeping unrouted containers', () => {
    const project = baseProject({
      productionDays: [
        { id: 'day-1', name: 'Day 1', scheduleBlockIds: [] },
        { id: 'day-2', name: 'Day 2', scheduleBlockIds: [] },
      ],
      locations: [{ id: 'loc-1', name: 'Warehouse', type: 'other', referenceAssetIds: [] }],
      logisticsDayFilterId: 'day-1',
      logisticsContainers: [
        { id: 'truck', kind: 'truck', name: 'Day one truck', productionDayId: 'day-1', locationId: 'loc-1' },
        { id: 'van', kind: 'van', name: 'Day two van', productionDayId: 'day-2' },
        { id: 'spare', kind: 'case', name: 'Unrouted case' },
      ],
      packedItems: [
        { id: 'i1', containerId: 'truck', label: 'Stands', quantity: 1, unitWeightKg: 5 },
        { id: 'i2', containerId: 'van', label: 'Dolly', quantity: 1, unitWeightKg: 40 },
      ],
    });
    const model = buildLogisticsPrintModel(project);
    expect(model.groups.map((g) => g.id)).toEqual(['truck', 'spare']);
    expect(model.scopeLabel).toBe('Day 1 · Warehouse');
    // The other day's item is off this sheet.
    expect(model.fleet.itemCount).toBe(1);
    expect(model.fleet.containerCount).toBe(2);
  });

  it('falls back to the whole production when the scoped day no longer exists', () => {
    const project = baseProject({
      productionDays: [{ id: 'day-1', name: 'Day 1', scheduleBlockIds: [] }],
      logisticsDayFilterId: 'deleted-day',
      logisticsContainers: [
        { id: 'truck', kind: 'truck', name: 'Truck', productionDayId: 'day-1' },
      ],
      packedItems: [],
    });
    const model = buildLogisticsPrintModel(project);
    expect(model.scopeLabel).toBeUndefined();
    expect(model.groups).toHaveLength(1);
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
    // The one clamp on the run at the default 0.5 kg assumption is now part of
    // the printed total, and is itemised so the sum can be checked.
    expect(run.clampCount).toBe(1);
    expect(run.safetyCount).toBe(0);
    expect(run.clampsKg).toBe(0.5);
    expect(run.cableAllowanceKg).toBeUndefined();
    // Known subtotal is displayed above, but an incomplete load must never be
    // promoted to a safety-relevant total or a WITHIN verdict.
    expect(run.totalKg).toBeNull();
    expect(run.capacity.verdict).toBe('unknown');
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

  it("prints the project's stored hardware assumptions and counts them in the total", () => {
    const model = buildRiggingPrintModel(
      baseProject({
        trussProfiles: [{ id: 'p1', geometry: 'box', selfWeightKg: 20 }],
        trussElements: [{ id: 't1', profileId: 'p1', x: 0, y: 0, rotation: 0 }],
        riggingItems: [
          { id: 'r1', kind: 'clamp', trussElementId: 't1' },
          { id: 'r2', kind: 'safety', trussElementId: 't1' },
        ],
        riggingAssumptions: { clampWeightKg: 1, safetyWeightKg: 0.25, cableAllowanceKg: 4 },
      }),
    );
    expect(model.assumptions).toEqual({
      clampWeightKg: 1,
      safetyWeightKg: 0.25,
      cableAllowanceKg: 4,
    });
    expect(model.runs[0].clampsKg).toBe(1.25);
    expect(model.runs[0].cableAllowanceKg).toBe(4);
    expect(model.runs[0].totalKg).toBe(25.25);
  });

  it('reads the weight of a catalogue-linked load from the fixture catalogue', () => {
    const project = baseProject({
      trussProfiles: [{ id: 'p1', geometry: 'box', selfWeightKg: 10 }],
      trussElements: [{ id: 't1', profileId: 'p1', x: 0, y: 0, rotation: 0 }],
      suspendedLoads: [
        {
          id: 'l1',
          trussElementId: 't1',
          label: 'Key',
          quantity: 2,
          source: 'profile',
          fixtureProfileId: 'prof-1',
        },
        {
          id: 'l2',
          trussElementId: 't1',
          label: 'Unweighed',
          quantity: 1,
          source: 'profile',
          fixtureProfileId: 'prof-2',
        },
      ],
      riggingAssumptions: {},
    });
    const model = buildRiggingPrintModel(project, {
      fixtureProfiles: [
        { id: 'prof-1', category: 'lighting', manufacturer: 'Aputure', model: 'LS 600c Pro', categories: [], modes: [], weightKg: 6 },
        { id: 'prof-2', category: 'lighting', manufacturer: 'Nobody', model: 'Unweighed 1K', categories: [], modes: [] },
      ],
    });
    const run = model.runs[0];
    expect(run.loads[0].weightKg).toBe(6);
    expect(run.loads[0].lineWeightKg).toBe(12);
    expect(run.loads[0].sourceLabel).toBe('Catalogue');
    // A catalogue entry with no published mass prints as unknown, never as 0.
    expect(run.loads[1].weightKg).toBeUndefined();
    expect(run.unknownLoadCount).toBe(1);
    expect(run.totalKg).toBeNull();
  });
});
