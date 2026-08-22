import { describe, expect, it } from 'vitest';
import { createProject } from '../projectLibrary';
import { keyCrewMember } from '../../domain/people';

/**
 * A template project has to demonstrate every module. The first-run project
 * used to be hand-rolled separately from this factory and shipped only scenes
 * and a screenplay, so the very first project a user opened had an empty
 * schedule, crew list, rig and power plan. These tests pin the contract.
 */
describe('sample project content', () => {
  const project = createProject({ title: 'Sample', withSampleScenes: true });

  it('ships the example scenes and their screenplay', () => {
    expect(project.setups.length).toBeGreaterThan(1);
    expect(project.scriptText?.length ?? 0).toBeGreaterThan(0);
    expect((project.scriptLines ?? []).length).toBeGreaterThan(0);
  });

  it.each([
    ['people', 'people'],
    ['production days', 'productionDays'],
    ['schedule blocks', 'scheduleBlocks'],
    ['calendar events', 'productionCalendarEvents'],
    ['locations', 'locations'],
    ['run-of-show cues', 'runOfShowCues'],
    ['task boards', 'taskBoards'],
    ['tasks', 'tasks'],
    ['mood boards', 'moodBoards'],
    ['logistics containers', 'logisticsContainers'],
    ['packed items', 'packedItems'],
    ['truss profiles', 'trussProfiles'],
    ['truss elements', 'trussElements'],
    ['suspended loads', 'suspendedLoads'],
    ['rigging items', 'riggingItems'],
    ['characters', 'characters'],
    ['cast assignments', 'castAssignments'],
  ] as const)('ships example %s', (_label, key) => {
    const value = (project as unknown as Record<string, unknown[]>)[key];
    expect(Array.isArray(value)).toBe(true);
    expect(value.length).toBeGreaterThan(0);
  });

  it('ships a coverage matrix with cameras, rows and filled cells', () => {
    const matrix = project.coverageMatrix;
    expect(matrix?.cameraIds.length).toBeGreaterThan(0);
    expect(matrix?.rowKeys.length).toBeGreaterThan(0);
    expect(Object.keys(matrix?.cells ?? {}).length).toBeGreaterThan(0);
  });

  it('ships a power plan with sources, circuits and consumers', () => {
    expect(project.powerPlan?.sources.length).toBeGreaterThan(0);
    expect(project.powerPlan?.circuits.length).toBeGreaterThan(0);
    expect((project.powerPlan?.consumers ?? []).length).toBeGreaterThan(0);
  });

  it('assigns every phase leg on the 3-phase supply so the balance report reads', () => {
    const threePhase = project.powerPlan?.sources.filter((s) => s.phases === 3) ?? [];
    expect(threePhase.length).toBeGreaterThan(0);
    const legs = (project.powerPlan?.circuits ?? [])
      .filter((c) => threePhase.some((s) => s.id === c.sourceId))
      .map((c) => c.phaseLeg);
    expect(new Set(legs)).toEqual(new Set([1, 2, 3]));
  });

  it('keeps one consumer and one load explicitly unknown, never zero', () => {
    const unknownConsumer = (project.powerPlan?.consumers ?? []).find(
      (c) => c.powerWattsOverride === undefined,
    );
    expect(unknownConsumer).toBeDefined();
    const unknownLoad = (project.suspendedLoads ?? []).find((l) => l.weightKg === undefined);
    expect(unknownLoad).toBeDefined();
  });

  it('fills the key crew roles the paperwork refers to by name', () => {
    for (const role of ['director', 'cinematographer', 'first_ad', 'gaffer', 'producer']) {
      expect(keyCrewMember(project.people ?? [], role)).toBeDefined();
    }
  });

  it('mirrors the sample director and DP into the legacy project fields', () => {
    expect(project.director).toBe(keyCrewMember(project.people ?? [], 'director')?.displayName);
    expect(project.cinematographer).toBe(
      keyCrewMember(project.people ?? [], 'cinematographer')?.displayName,
    );
  });

  it('does not overwrite a director the caller supplied', () => {
    const named = createProject({ withSampleScenes: true, director: 'My Name' });
    expect(named.director).toBe('My Name');
  });

  it('casts the script characters against the sample actors', () => {
    const characterIds = new Set((project.characters ?? []).map((c) => c.id));
    const personIds = new Set((project.people ?? []).map((p) => p.id));
    for (const assignment of project.castAssignments ?? []) {
      expect(characterIds.has(assignment.characterId)).toBe(true);
      expect(personIds.has(assignment.personId)).toBe(true);
    }
    expect((project.castAssignments ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('points every truss reference at a truss that exists', () => {
    const trussIds = new Set((project.trussElements ?? []).map((t) => t.id));
    for (const load of project.suspendedLoads ?? []) {
      expect(trussIds.has(load.trussElementId)).toBe(true);
    }
    for (const consumer of project.powerPlan?.consumers ?? []) {
      if (consumer.trussElementId) expect(trussIds.has(consumer.trussElementId)).toBe(true);
    }
  });

  it('points every consumer at a circuit, and every circuit at a source', () => {
    const circuitIds = new Set((project.powerPlan?.circuits ?? []).map((c) => c.id));
    const sourceIds = new Set((project.powerPlan?.sources ?? []).map((s) => s.id));
    for (const consumer of project.powerPlan?.consumers ?? []) {
      if (consumer.circuitId) expect(circuitIds.has(consumer.circuitId)).toBe(true);
    }
    for (const circuit of project.powerPlan?.circuits ?? []) {
      expect(sourceIds.has(circuit.sourceId)).toBe(true);
    }
  });

  it('gives every scheduled day strips that resolve to real blocks', () => {
    const blockIds = new Set((project.scheduleBlocks ?? []).map((b) => b.id));
    for (const day of project.productionDays ?? []) {
      expect(day.scheduleBlockIds.length).toBeGreaterThan(0);
      for (const id of day.scheduleBlockIds) expect(blockIds.has(id)).toBe(true);
    }
  });

  it('ships lodging for the travelling cast', () => {
    const withHotel = (project.people ?? []).filter((p) => p.hotelName);
    expect(withHotel.length).toBeGreaterThan(0);
    for (const person of withHotel) {
      expect(person.hotelAddress).toBeTruthy();
      expect(person.hotelCheckIn).toBeTruthy();
    }
  });

  it('ships call-sheet pick-ups that resolve to real people', () => {
    const personIds = new Set((project.people ?? []).map((p) => p.id));
    const pickups = (project.productionDays ?? []).flatMap((day) => day.callSheet?.pickups ?? []);
    expect(pickups.length).toBeGreaterThan(0);
    for (const pickup of pickups) {
      expect(personIds.has(pickup.personId)).toBe(true);
      expect(pickup.id).toBeTruthy();
    }
  });

  it('leaves a project created WITHOUT samples empty of example data', () => {
    const blank = createProject({ title: 'Blank' });
    expect(blank.people ?? []).toHaveLength(0);
    expect(blank.productionDays ?? []).toHaveLength(0);
    expect(blank.powerPlan).toBeUndefined();
  });

  it('gives each sample project fresh ids', () => {
    const other = createProject({ title: 'Second', withSampleScenes: true });
    const first = new Set((project.people ?? []).map((p) => p.id));
    for (const person of other.people ?? []) expect(first.has(person.id)).toBe(false);
  });
});
