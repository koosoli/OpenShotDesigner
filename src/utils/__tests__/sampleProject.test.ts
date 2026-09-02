import { describe, expect, it } from 'vitest';
import { createProject } from '../projectLibrary';
import { keyCrewMember } from '../../domain/people';
import { castFilterForDay, castPersonIdsForDay } from '../../domain/reports';
import { attachBreakdownItemsToScenes, scenesForBreakdownItem } from '../../domain/script';
import { deriveScriptBreakdown } from '../../domain/script/logic';
import { validateProject } from '../../domain/validation';

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

  it('round-trips through JSON without dangling references', () => {
    const roundTripped = JSON.parse(JSON.stringify(project));
    expect(validateProject(roundTripped).filter((issue) => issue.severity === 'error')).toEqual([]);
  });

  it('persists the bundled page counts so scheduled strips can print pages immediately', () => {
    expect(project.scriptScenes?.map((scene) => scene.pageLengthEighths)).toEqual([24, 24]);
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
    ['breakdown elements', 'breakdownItems'],
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

  it('ships individual call times that resolve to real people', () => {
    const personIds = new Set((project.people ?? []).map((p) => p.id));
    const calls = (project.productionDays ?? []).flatMap((day) => day.callSheet?.personCalls ?? []);
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(personIds.has(call.personId)).toBe(true);
      expect(call.time).toBeTruthy();
    }
  });

  it('ships map pins on the example locations, so the sun planner works', () => {
    const pinned = (project.locations ?? []).filter((l) => l.lat !== undefined && l.lng !== undefined);
    expect(pinned.length).toBeGreaterThan(0);
    for (const location of pinned) {
      expect(Math.abs(location.lat!)).toBeLessThanOrEqual(90);
      expect(Math.abs(location.lng!)).toBeLessThanOrEqual(180);
    }
  });

  it('links the example actors on the plan to the script characters they play', () => {
    // The chain a call sheet depends on: actor marker -> character -> cast
    // assignment. Broken, a day scheduled by setup lists no cast at all.
    const characterIds = new Set((project.characters ?? []).map((c) => c.id));
    const actors = project.setups.flatMap((setup) =>
      setup.elements.filter((element) => element.type === 'actor'),
    );
    const linked = actors.filter((actor) => 'characterId' in actor && actor.characterId);
    expect(linked.length).toBeGreaterThan(0);
    for (const actor of linked) {
      expect(characterIds.has((actor as { characterId: string }).characterId)).toBe(true);
    }
  });

  it('resolves cast for a day scheduled by setup, not just by scene', () => {
    const day = (project.productionDays ?? [])[0];
    expect(day).toBeDefined();
    const called = castPersonIdsForDay(day.scheduleBlockIds, project.scheduleBlocks ?? [], {
      scriptScenes: project.scriptScenes,
      setups: project.setups,
      castAssignments: project.castAssignments,
    });
    expect(called.length).toBeGreaterThan(0);
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

/**
 * The example elements are tagged by matching the opening words of an action
 * line, so a wording change in the sample screenplay silently unhooks them —
 * the element would still exist but belong to no scene, which is exactly the
 * failure mode that made the example call sheet list no cast.
 */
describe('example breakdown elements reach the scenes they were tagged in', () => {
  const project = createProject({ title: 'Sample', withSampleScenes: true });
  const lines = project.scriptLines ?? [];
  const items = project.breakdownItems ?? [];
  const scenes = deriveScriptBreakdown(lines).scenes;

  it('tags every example element against a line that still exists', () => {
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(scenesForBreakdownItem(item, lines, scenes).length).toBeGreaterThan(0);
    }
  });

  it('covers both example scenes', () => {
    const attached = attachBreakdownItemsToScenes(scenes, lines, items);
    for (const scene of attached) {
      expect(scene.breakdownItemIds.length).toBeGreaterThan(0);
    }
  });
});

/**
 * Reported against the classic two-person dialogue template: a scene with cast
 * was scheduled on a shoot day and the call sheet showed no cast.
 *
 * The cause was id drift. `buildCharacterCatalog` mints a fresh id for every
 * cue it finds, and only `mergeCharacterCatalogs` — given the persisted
 * catalog — keeps a stable one. Both places that re-derived the scene list
 * passed `[]` instead, so every scene ended up stamped with character ids that
 * existed nowhere else, and `castAssignments`, which key on the persisted ids,
 * matched nothing.
 *
 * It is asserted here rather than on the derivation alone because the whole
 * point is that two independently-derived halves have to agree.
 */
describe('scene character ids stay in step with the cast list', () => {
  const project = createProject({ title: 'Sample', withSampleScenes: true });
  const lines = project.scriptLines ?? [];

  it('derives scenes whose characters exist in the persisted catalog', () => {
    const scenes = deriveScriptBreakdown(lines, project.characters ?? [], project.locations ?? []).scenes;
    const known = new Set((project.characters ?? []).map((character) => character.id));
    const referenced = scenes.flatMap((scene) => scene.characterIds);
    expect(referenced.length).toBeGreaterThan(0);
    for (const id of referenced) expect(known.has(id)).toBe(true);
  });

  /** Deriving without the catalog is what produced the bug; pin the reason. */
  it('drifts when derived without the catalog, which is why callers must pass it', () => {
    const scenes = deriveScriptBreakdown(lines, [], []).scenes;
    const known = new Set((project.characters ?? []).map((character) => character.id));
    const referenced = scenes.flatMap((scene) => scene.characterIds);
    expect(referenced.some((id) => known.has(id))).toBe(false);
  });

  it('resolves scheduled scenes to the cast actually assigned to them', () => {
    const scenes = deriveScriptBreakdown(lines, project.characters ?? [], project.locations ?? []).scenes;
    const scene = scenes.find((candidate) => candidate.characterIds.length > 0)!;
    const block = { id: 'blk-test', kind: 'scene' as const, scriptSceneId: scene.id };
    const ids = castFilterForDay(['blk-test'], [block], {
      scriptScenes: scenes,
      setups: project.setups,
      castAssignments: project.castAssignments,
    });
    expect(ids && ids.length).toBeGreaterThan(0);
  });
});

/**
 * The invariant behind the reported bug, stated directly.
 *
 * `ContactsPanel` derives the character list to populate its cast pickers, and
 * stores the chosen `characterId` in `castAssignments`. If deriving twice can
 * produce different ids for the same character, then every assignment made
 * before a reload dangles afterwards — the assignment is still in the file,
 * pointing at a character that no longer exists under that id, and the call
 * sheet simply shows no cast. Silent, and unrecoverable by the user.
 */
describe('character ids survive being re-derived', () => {
  const project = createProject({ title: 'Sample', withSampleScenes: true });
  const lines = project.scriptLines ?? [];

  const derive = (catalog: typeof project.characters) =>
    deriveScriptBreakdown(lines, catalog ?? [], project.locations ?? []).characters;

  it('is stable when the persisted catalog is passed', () => {
    const first = derive(project.characters);
    const second = derive(project.characters);
    expect(first.map((c) => c.id)).toEqual(second.map((c) => c.id));
    expect(first.length).toBeGreaterThan(0);
  });

  it('is NOT stable without it, which is why the catalog has to be persisted', () => {
    const first = derive([]);
    const second = derive([]);
    expect(first.map((c) => c.canonicalName)).toEqual(second.map((c) => c.canonicalName));
    expect(first.map((c) => c.id)).not.toEqual(second.map((c) => c.id));
  });

  it('keeps a cast assignment resolvable across a re-derivation', () => {
    const catalog = derive(project.characters);
    const assignment = { id: 'ca-x', characterId: catalog[0].id, personId: 'p-1' };
    const afterReload = derive(catalog);
    expect(afterReload.some((c) => c.id === assignment.characterId)).toBe(true);
  });
});
