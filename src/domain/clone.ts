/**
 * Deep-clone with ID remapping (plan §3.1).
 *
 * Duplicating a setup or a project must regenerate EVERY nested id and remap
 * ALL internal references so the duplicate points only at duplicated entities.
 * This is also the operation used by "import as a new copy" so globally unique
 * identities are never reused.
 */

import type {
  AVScriptRow,
  CableElement,
  CameraElement,
  EquipmentItem,
  FloorPlanElement,
  Project,
  SceneSetup,
  ScriptLine,
  ScriptMark,
  Shot,
} from '../types';
import { createId } from './ids';

/** Remap helper: returns the new id for `oldId`, or `oldId` itself when unknown. */
const remap = (map: Map<string, string>, oldId: string | undefined): string | undefined => {
  if (oldId === undefined) return undefined;
  return map.get(oldId) ?? oldId;
};

const remapRequired = (map: Map<string, string>, oldId: string): string =>
  map.get(oldId) ?? oldId;

const cloneElement = (element: FloorPlanElement, idMap: Map<string, string>): FloorPlanElement => {
  const base = { ...element, id: remapRequired(idMap, element.id) } as FloorPlanElement;

  if ('path' in base && Array.isArray(base.path)) {
    (base as { path: unknown }).path = base.path.map((wp) => ({
      ...wp,
      id: remapRequired(waypointIdMapHolder.map!, wp.id),
    }));
  }
  if (base.type === 'cable') {
    const cable = base as CableElement;
    if (cable.path) {
      cable.path = cable.path.map((p) => ({ ...p, id: createId('cpp') }));
    }
    if (cable.fromElementId) cable.fromElementId = remap(idMap, cable.fromElementId);
    if (cable.toElementId) cable.toElementId = remap(idMap, cable.toElementId);
  }
  if (base.type === 'annotation') {
    const annotation = base as Extract<FloorPlanElement, { type: 'annotation' }>;
    annotation.targetElementId = remapRequired(idMap, annotation.targetElementId);
  }
  if (base.type === 'actor') {
    const actor = base as Extract<FloorPlanElement, { type: 'actor' }>;
    if (actor.speechCues) {
      actor.speechCues = actor.speechCues.map((cue) => ({ ...cue, id: createId('speech') }));
    }
    if (actor.lookAtTargetId) actor.lookAtTargetId = remap(idMap, actor.lookAtTargetId);
  }
  if (base.type === 'camera') {
    const camera = base as CameraElement;
    if (camera.associatedShotId) {
      camera.associatedShotId = remapRequired(shotIdMapHolder.map!, camera.associatedShotId);
    }
    if (camera.lookAtTargetId) camera.lookAtTargetId = remap(idMap, camera.lookAtTargetId);
  }
  return base;
};

/**
 * Holder for the shot-id map while cloning elements — cameras reference shots,
 * which are cloned in the same pass.
 */
const shotIdMapHolder: { map: Map<string, string> | null } = { map: null };

const cloneShot = (shot: Shot, elementIdMap: Map<string, string>, shotIdMap: Map<string, string>): Shot => {
  const next: Shot = {
    ...shot,
    id: remapRequired(shotIdMap, shot.id),
    cameraId: remapRequired(elementIdMap, shot.cameraId),
    subjectActorIds: (shot.subjectActorIds || []).map((id) => remapRequired(elementIdMap, id)),
  };
  if (shot.scriptLineId) next.scriptLineId = remapRequired(lineIdMapHolder.map!, shot.scriptLineId);

  if (shot.storyboardFrames) {
    const frames: Shot['storyboardFrames'] = {};
    for (const [slot, frame] of Object.entries(shot.storyboardFrames)) {
      // Slots are either the literal 'start' or a camera waypoint id.
      const newSlot = slot === 'start' ? slot : remapRequired(waypointIdMapHolder.map!, slot);
      frames[newSlot] = { ...frame };
    }
    next.storyboardFrames = frames;
  }
  return next;
};

const waypointIdMapHolder: { map: Map<string, string> | null } = { map: null };
const lineIdMapHolder: { map: Map<string, string> | null } = { map: null };

const cloneScriptLine = (line: ScriptLine, lineIdMap: Map<string, string>, shotIdMap: Map<string, string>): ScriptLine => {
  const next: ScriptLine = { ...line, id: remapRequired(lineIdMap, line.id) };
  if (line.linkedShotId) next.linkedShotId = remapRequired(shotIdMap, line.linkedShotId);
  return next;
};

const cloneScriptMark = (mark: ScriptMark, lineIdMap: Map<string, string>, shotIdMap: Map<string, string>): ScriptMark => {
  const next: ScriptMark = {
    ...mark,
    id: createId('mark'),
    shotId: remapRequired(shotIdMap, mark.shotId),
    startLineId: remapRequired(lineIdMap, mark.startLineId),
    endLineId: remapRequired(lineIdMap, mark.endLineId),
  };
  if (mark.wavyStartLineId) next.wavyStartLineId = remapRequired(lineIdMap, mark.wavyStartLineId);
  if (mark.wavyEndLineId) next.wavyEndLineId = remapRequired(lineIdMap, mark.wavyEndLineId);
  return next;
};

const cloneAvRow = (row: AVScriptRow, shotIdMap: Map<string, string>): AVScriptRow => {
  const next: AVScriptRow = { ...row, id: createId('av') };
  if (row.linkedShotId) next.linkedShotId = remapRequired(shotIdMap, row.linkedShotId);
  return next;
};

const cloneEquipmentItem = (item: EquipmentItem, elementIdMap: Map<string, string>): EquipmentItem => {
  const next: EquipmentItem = { ...item, id: createId('eq') };
  if (item.elementId) next.elementId = remap(elementIdMap, item.elementId);
  if (item.packageItems) {
    next.packageItems = item.packageItems.map((pkg) => ({ ...pkg, id: createId('pkg') }));
  }
  return next;
};

/**
 * Deep-clone a scene setup, regenerating every nested id and remapping every
 * internal reference. Cross-setup references (none exist today) are preserved
 * as-is by the `remap` fallback.
 */
export const cloneSetupWithNewIds = (
  setup: SceneSetup,
  /** Project-level screenplay line ids → new ids, so linings in this setup follow the shared script. */
  sharedLineIdMap?: Map<string, string>,
): SceneSetup => {
  const elementIdMap = new Map<string, string>();
  setup.elements.forEach((el) => elementIdMap.set(el.id, createId(el.type)));

  const shotIdMap = new Map<string, string>();
  setup.shots.forEach((shot) => shotIdMap.set(shot.id, createId('shot')));

  const lineIdMap = new Map<string, string>(sharedLineIdMap ?? []);
  (setup.scriptLines || []).forEach((line) => lineIdMap.set(line.id, createId('line')));

  const waypointIdMap = new Map<string, string>();
  setup.elements.forEach((el) => {
    if ('path' in el && Array.isArray(el.path)) {
      el.path.forEach((wp) => waypointIdMap.set(wp.id, createId('wp')));
    }
  });

  // Element/shot/line cloning needs the other maps; wire the holders.
  const prevShot = shotIdMapHolder.map;
  const prevWaypoint = waypointIdMapHolder.map;
  const prevLine = lineIdMapHolder.map;
  shotIdMapHolder.map = shotIdMap;
  waypointIdMapHolder.map = waypointIdMap;
  lineIdMapHolder.map = lineIdMap;

  try {
    const next: SceneSetup = {
      ...setup,
      id: createId('setup'),
      elements: setup.elements.map((el) => cloneElement(el, elementIdMap)),
      shots: setup.shots.map((shot) => cloneShot(shot, elementIdMap, shotIdMap)),
    };

    if (setup.scriptLines) {
      next.scriptLines = setup.scriptLines.map((line) => cloneScriptLine(line, lineIdMap, shotIdMap));
    }
    if (setup.scriptMarks) {
      next.scriptMarks = setup.scriptMarks.map((mark) => cloneScriptMark(mark, lineIdMap, shotIdMap));
    }
    if (setup.avScriptRows) {
      next.avScriptRows = setup.avScriptRows.map((row) => cloneAvRow(row, shotIdMap));
    }
    if (setup.customEquipment) {
      next.customEquipment = setup.customEquipment.map((item) => cloneEquipmentItem(item, elementIdMap));
    }
    if (setup.backgroundImage) {
      next.backgroundImage = { ...setup.backgroundImage, id: createId('bg') };
    }
    if (setup.backgroundImages) {
      next.backgroundImages = setup.backgroundImages.map((bg) => ({ ...bg, id: createId('bg') }));
    }
    if (setup.storyboardOrder) {
      next.storyboardOrder = setup.storyboardOrder.map((id) => remapRequired(shotIdMap, id));
    }
    if (setup.layers) {
      next.layers = setup.layers.map((layer) => ({ ...layer, id: createId('layer') }));
    }
    if (setup.groups) {
      next.groups = setup.groups.map((group) => ({
        ...group,
        id: createId('group'),
        childIds: group.childIds.map((childId) => remapRequired(elementIdMap, childId)),
      }));
    }
    return next;
  } finally {
    shotIdMapHolder.map = prevShot;
    waypointIdMapHolder.map = prevWaypoint;
    lineIdMapHolder.map = prevLine;
  }
};

/**
 * Deep-clone the vNext production collections, remapping every internal and
 * cross-collection reference (plan §3.1).
 */
const cloneProductionCollections = (
  project: Project,
  /** Screenplay line ids → new ids. Scene ids ARE heading-line ids, so they follow this map. */
  lineIdMap: Map<string, string>,
): Partial<Pick<Project, 'locations' | 'people' | 'castAssignments' | 'characters' | 'scriptScenes' | 'breakdownItems' | 'productionSegments' | 'productionDays' | 'scheduleBlocks' | 'productionCalendarEvents' | 'runOfShowCues' | 'logisticsContainers' | 'packedItems' | 'trussProfiles' | 'trussElements' | 'suspendedLoads' | 'riggingItems'>> => {
  const cueMap = new Map<string, string>();
  (project.runOfShowCues || []).forEach((c) => cueMap.set(c.id, createId('cue')));
  const containerMap = new Map<string, string>();
  (project.logisticsContainers || []).forEach((c) => containerMap.set(c.id, createId('container')));
  const trussProfileMap = new Map<string, string>();
  (project.trussProfiles || []).forEach((t) => trussProfileMap.set(t.id, createId('trussprofile')));
  const trussElementMap = new Map<string, string>();
  (project.trussElements || []).forEach((t) => trussElementMap.set(t.id, createId('truss')));

  const locationMap = new Map<string, string>();
  (project.locations || []).forEach((l) => locationMap.set(l.id, createId('loc')));
  const personMap = new Map<string, string>();
  (project.people || []).forEach((p) => personMap.set(p.id, createId('person')));
  const characterMap = new Map<string, string>();
  (project.characters || []).forEach((c) => characterMap.set(c.id, createId('char')));
  // A scene keeps pointing at its (remapped) heading line; scenes whose
  // heading no longer exists in the script get a fresh id.
  const sceneMap = new Map<string, string>();
  (project.scriptScenes || []).forEach((s) => sceneMap.set(s.id, lineIdMap.get(s.id) ?? createId('scene')));
  const itemMap = new Map<string, string>();
  (project.breakdownItems || []).forEach((i) => itemMap.set(i.id, createId('item')));
  const segmentMap = new Map<string, string>();
  (project.productionSegments || []).forEach((s) => segmentMap.set(s.id, createId('seg')));
  const dayMap = new Map<string, string>();
  (project.productionDays || []).forEach((d) => dayMap.set(d.id, createId('day')));
  const blockMap = new Map<string, string>();
  (project.scheduleBlocks || []).forEach((b) => blockMap.set(b.id, createId('block')));
  const calendarEventMap = new Map<string, string>();
  (project.productionCalendarEvents || []).forEach((event) => calendarEventMap.set(event.id, createId('event')));

  const result: ReturnType<typeof cloneProductionCollections> = {};

  if (project.locations) {
    result.locations = project.locations.map((l) => ({
      ...l,
      id: remapRequired(locationMap, l.id),
      ...(l.parentLocationId ? { parentLocationId: remap(locationMap, l.parentLocationId) } : {}),
      contactIds: (l.contactIds || []).map((id) => remap(personMap, id)!).filter(Boolean),
      referenceAssetIds: [...(l.referenceAssetIds || [])],
    }));
  }
  if (project.people) {
    result.people = project.people.map((p) => ({ ...p, id: remapRequired(personMap, p.id) }));
  }
  if (project.castAssignments) {
    result.castAssignments = project.castAssignments.map((a) => ({
      ...a,
      id: createId('cast'),
      characterId: remapRequired(characterMap, a.characterId),
      personId: remapRequired(personMap, a.personId),
    }));
  }
  if (project.characters) {
    result.characters = project.characters.map((c) => ({
      ...c,
      id: remapRequired(characterMap, c.id),
      // Absent-safe: clone also runs on imported JSON, where a hand-edited or
      // older file can be missing a field the type says is required. Crashing
      // mid-duplicate would leave the user with no copy and no explanation.
      aliases: [...(c.aliases ?? [])],
    }));
  }
  if (project.scriptScenes) {
    result.scriptScenes = project.scriptScenes.map((s) => ({
      ...s,
      id: remapRequired(sceneMap, s.id),
      locationId: remap(locationMap, s.locationId),
      // Absent-safe for the same reason as `aliases` below: an imported or
      // hand-edited file can be missing an array the type says is required,
      // and crashing mid-duplicate leaves the user with no copy at all.
      characterIds: (s.characterIds ?? []).map((id) => remapRequired(characterMap, id)),
      breakdownItemIds: (s.breakdownItemIds ?? []).map((id) => remapRequired(itemMap, id)),
    }));
  }
  if (project.breakdownItems) {
    // The copied script has fresh line ids, so an element's pointers into it
    // have to follow. They used to be copied verbatim, which left every tagged
    // element in a duplicated project pointing at the original's lines: the
    // breakdown looked intact but no element could say which scene it was in.
    // A pointer at a line the copy does not include is dropped rather than
    // kept dangling.
    result.breakdownItems = project.breakdownItems.map((i) => {
      const lineIds = i.sourceScriptLineIds
        ?.map((id) => lineIdMap.get(id))
        .filter((id): id is string => !!id);
      const ranges = i.sourceRanges
        ?.map((range) => {
          const lineId = lineIdMap.get(range.lineId);
          return lineId ? { ...range, lineId } : null;
        })
        .filter((range): range is NonNullable<typeof range> => !!range);
      return {
        ...i,
        id: remapRequired(itemMap, i.id),
        sourceScriptLineIds: lineIds,
        ...(ranges ? { sourceRanges: ranges } : {}),
      };
    });
  }
  if (project.productionSegments) {
    result.productionSegments = project.productionSegments.map((s) => ({
      ...s,
      id: remapRequired(segmentMap, s.id),
      locationId: remap(locationMap, s.locationId),
    }));
  }
  if (project.scheduleBlocks) {
    result.scheduleBlocks = project.scheduleBlocks.map((block) => {
      const base = { ...block, id: remapRequired(blockMap, block.id) };
      switch (base.kind) {
        case 'scene':
          return { ...base, scriptSceneId: remapRequired(sceneMap, base.scriptSceneId) };
        case 'setup':
          return base; // setup ids are per-setup-clone; cross-project setups don't exist
        case 'shots':
          return { ...base, shotIds: [...base.shotIds] };
        case 'cue':
          return base;
        case 'segment':
          return { ...base, segmentId: remapRequired(segmentMap, base.segmentId) };
        case 'manual':
          return { ...base };
      }
    });
  }
  if (project.productionDays) {
    result.productionDays = project.productionDays.map((d) => ({
      ...d,
      id: remapRequired(dayMap, d.id),
      scheduleBlockIds: d.scheduleBlockIds.map((id) => remapRequired(blockMap, id)),
    }));
  }
  if (project.productionCalendarEvents) {
    result.productionCalendarEvents = project.productionCalendarEvents.map((event) => ({
      ...event,
      id: remapRequired(calendarEventMap, event.id),
      assigneeIds: event.assigneeIds?.map((id) => remapRequired(personMap, id)),
      dependencyIds: event.dependencyIds?.map((id) => remapRequired(calendarEventMap, id)),
    }));
  }
  if (project.runOfShowCues) {
    result.runOfShowCues = project.runOfShowCues.map((cue) => ({
      ...cue,
      id: remapRequired(cueMap, cue.id),
    }));
  }
  if (project.logisticsContainers) {
    result.logisticsContainers = project.logisticsContainers.map((c) => ({
      ...c,
      id: remapRequired(containerMap, c.id),
      parentContainerId: remap(containerMap, c.parentContainerId),
    }));
  }
  if (project.packedItems) {
    result.packedItems = project.packedItems.map((i) => ({
      ...i,
      id: createId('packed'),
      containerId: remapRequired(containerMap, i.containerId),
    }));
  }
  if (project.trussProfiles) {
    result.trussProfiles = project.trussProfiles.map((t) => ({
      ...t,
      id: remapRequired(trussProfileMap, t.id),
    }));
  }
  if (project.trussElements) {
    result.trussElements = project.trussElements.map((t) => ({
      ...t,
      id: remapRequired(trussElementMap, t.id),
      profileId: remap(trussProfileMap, t.profileId),
    }));
  }
  if (project.suspendedLoads) {
    result.suspendedLoads = project.suspendedLoads.map((l) => ({
      ...l,
      id: createId('load'),
      trussElementId: remapRequired(trussElementMap, l.trussElementId),
    }));
  }
  if (project.riggingItems) {
    result.riggingItems = project.riggingItems.map((i) => ({
      ...i,
      id: createId('rig'),
      trussElementId: remap(trussElementMap, i.trussElementId),
    }));
  }
  return result;
};

/**
 * Deep-clone a whole project under a new id, remapping all nested ids and
 * references. `overrides` are applied last (e.g. a new title).
 */
export const cloneProjectWithNewIds = (
  project: Project,
  overrides: Partial<Project> = {},
): Project => {
  // The screenplay is project-level; its line map must exist BEFORE setups are
  // cloned so linings / shot links inside each setup remap through it.
  const lineIdMap = new Map<string, string>();
  (project.scriptLines || []).forEach((line) => lineIdMap.set(line.id, createId('line')));

  const setups = project.setups.map((setup) => cloneSetupWithNewIds(setup, lineIdMap));

  const setupIdMap = new Map<string, string>();
  project.setups.forEach((setup, i) => setupIdMap.set(setup.id, setups[i].id));

  const shotIdMap = new Map<string, string>();
  project.setups.forEach((setup, i) => {
    setup.shots.forEach((shot, j) => shotIdMap.set(shot.id, setups[i].shots[j].id));
  });

  const next: Project = {
    ...project,
    ...overrides,
    id: overrides.id ?? createId('proj'),
    setups,
    activeSetupId: remap(setupIdMap, project.activeSetupId) ?? setups[0]?.id ?? '',
    ...cloneProductionCollections(project, lineIdMap),
  };

  // Actor markers and binder notes both reference project-level script
  // characters; follow the character id remap (same collection order, so zip
  // old → new ids). Hoisted out of the block below because the binder needs it
  // too — two consumers of one map, not two maps.
  const characterIdMap = new Map<string, string>();
  if (project.characters && next.characters) {
    project.characters.forEach((character, index) => {
      const cloned = next.characters?.[index];
      if (cloned) characterIdMap.set(character.id, cloned.id);
    });
    if (characterIdMap.size > 0) {
      for (const setup of next.setups) {
        for (const element of setup.elements) {
          if (element.type === 'actor' && element.characterId) {
            element.characterId = remap(characterIdMap, element.characterId);
          }
        }
      }
    }
  }

  // Continuity takes point at a shot and at a production day, both of which
  // were just reissued. Carried through by the spread untouched they would
  // reference the ORIGINAL project, so every take in the duplicate would read
  // as orphaned — a log of footage that appears to belong to no shot.
  if (project.takes) {
    // Same-order zip, the idiom used for characters above: the collections are
    // cloned positionally, so index i in one is index i in the other.
    const dayIdMap = new Map<string, string>();
    project.productionDays?.forEach((day, index) => {
      const cloned = next.productionDays?.[index];
      if (cloned) dayIdMap.set(day.id, cloned.id);
    });

    next.takes = project.takes.map((take) => ({
      ...take,
      id: createId('take'),
      shotId: remapRequired(shotIdMap, take.shotId),
      ...(take.productionDayId
        ? { productionDayId: remap(dayIdMap, take.productionDayId) }
        : {}),
      // Copied, not shared: an edit in the duplicate must not reach back into
      // the original's take.
      ...(take.keywords ? { keywords: [...take.keywords] } : {}),
      ...(take.cameraOverrides ? { cameraOverrides: { ...take.cameraOverrides } } : {}),
      ...(take.slateOverrides ? { slateOverrides: { ...take.slateOverrides } } : {}),
    }));
  }

  /**
   * Binder notes point at a character and at the setups a look was established
   * on, both reissued above. Carried through by the spread they would name the
   * ORIGINAL project's records, so the duplicate's wardrobe notes would attach
   * to nothing — the same defect `takes` shipped with.
   */
  if (project.continuityNotes) {
    next.continuityNotes = project.continuityNotes.map((note) => ({
      ...note,
      id: createId('cnote'),
      ...(note.characterId ? { characterId: remap(characterIdMap, note.characterId) } : {}),
      ...(note.setupIds
        ? { setupIds: note.setupIds.map((setupId) => remapRequired(setupIdMap, setupId)) }
        : {}),
      // Copied, not shared: an edit in the duplicate must not reach the original.
      ...(note.photoAssetIds ? { photoAssetIds: [...note.photoAssetIds] } : {}),
    }));
  }

  // Named revisions capture the ORIGINAL project's state — they must not leak
  // into the duplicate (their snapshots reference foreign entity ids). Same
  // for the coverage matrix, which is keyed by cue ids that were just remapped.
  next.revisions = [];
  if (!overrides.coverageMatrix) {
    delete next.coverageMatrix;
  }

  if (project.scriptLines) {
    next.scriptLines = project.scriptLines.map((line) => cloneScriptLine(line, lineIdMap, shotIdMap));
  }
  if (project.avScriptRows) {
    next.avScriptRows = project.avScriptRows.map((row) => cloneAvRow(row, shotIdMap));
  }

  // Task boards: board/column/task/checklist ids are all regenerated; assignees
  // follow the people remap done in cloneProductionCollections (same ids).
  if (project.taskBoards) {
    const boardMap = new Map<string, string>();
    const columnMap = new Map<string, string>();
    next.taskBoards = project.taskBoards.map((board) => {
      const boardId = createId('board');
      boardMap.set(board.id, boardId);
      return {
        ...board,
        id: boardId,
        columns: board.columns.map((column) => {
          const columnId = createId('column');
          columnMap.set(column.id, columnId);
          return { ...column, id: columnId };
        }),
      };
    });
    const personMap = new Map<string, string>();
    (project.people || []).forEach((person, index) => {
      const cloned = next.people?.[index];
      if (cloned) personMap.set(person.id, cloned.id);
    });
    next.tasks = (project.tasks || [])
      .filter((task) => boardMap.has(task.boardId))
      .map((task) => ({
        ...task,
        id: createId('task'),
        boardId: remapRequired(boardMap, task.boardId),
        columnId: remapRequired(columnMap, task.columnId),
        assigneeIds: task.assigneeIds.map((id) => remapRequired(personMap, id)),
        labels: [...task.labels],
        checklist: task.checklist.map((item) => ({ ...item, id: createId('check') })),
        ...(task.link ? { link: { ...task.link } } : {}),
      }));
  }
  return next;
};
