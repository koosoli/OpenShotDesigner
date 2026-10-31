import type { Project } from '../types';
import { CURRENT_PROJECT_SCHEMA_VERSION } from '../domain/migrations';
import { collectProjectAssetIds } from '../domain/media/projectAssetReferences';
import { validateProject } from '../domain/validation';
import { createId } from '../domain/ids';
import type { ScheduleBlock } from '../domain/scheduling';
import { assertEditorType, assertSafeJson, FORBIDDEN_KEYS, MAX_JSON_NODES } from './security';
import { MAX_DOCUMENT_BYTES, MAX_OBJECTS, MAX_SHARED_FIELDS } from './limits';

export const PRODUCTION_ID = 'collaboration-project';
const POSE = new Set(['x', 'y', 'x2', 'y2', 'rotation', 'width', 'height', 'start', 'end', 'curveOffset', 'points', 'path', 'basePivot', 'lookAtPoint']);
type RecordValue = Record<string, unknown>;
type WireNode = ['o'] | ['r', string[]] | ['v', unknown] | ['d'];
interface Tree { node?: WireNode; children: Map<string, Tree> }
const isObject = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);
const isElement = (path: string[]) => path.length === 4 && path[0] === 'setups' && path[2] === 'elements';
const isParagraph = (path: string[]) => path.at(-2) === 'scriptLines' || path.at(-2) === 'omittedBody';

/** Media is removed only from a deep copy, including named milestone snapshots. */
export function productionProject(project: Project, omitMedia = true, title = `${project.title} — shared project`): Project {
  const copy = JSON.parse(JSON.stringify(project)) as Project;
  const prepare = (value: Project, snapshot = false) => {
    if (snapshot && value.revisions?.length) throw new Error('Revision snapshots cannot contain further revisions.');
    delete value.updatedAt;
    if (omitMedia) {
      delete value.logo;
      for (const setup of value.setups) {
        delete setup.backgroundImage; delete setup.backgroundImages;
        for (const shot of setup.shots) {
          delete shot.storyboardImage; delete shot.storyboardImageEnd; delete shot.storyboardFrames;
        }
        for (const row of setup.avScriptRows ?? []) delete row.storyboardImage;
        for (const element of setup.elements) if (element.type === 'light') delete element.gdtfAssetId;
      }
      for (const row of value.avScriptRows ?? []) delete row.storyboardImage;
      for (const person of value.people ?? []) delete person.headshotAssetId;
      for (const location of value.locations ?? []) {
        location.referenceAssetIds = [];
        // Legacy projects can use entire inline image URLs as photo-map keys.
        // Retain scout captions/EXIF metadata without retaining those image bytes.
        if (location.scout?.photos) location.scout.photos = Object.fromEntries(Object.values(location.scout.photos).map((photo, index) => [`photo-${index + 1}`, photo]));
      }
      for (const board of value.moodBoards ?? []) for (const card of board.cards) delete card.assetId;
      for (const day of value.productionDays ?? []) if (day.callSheet) {
        delete day.callSheet.mapAssetId; delete day.callSheet.locationMaps;
      }
      for (const profile of value.trussProfiles ?? []) { delete profile.gdtfAssetId; delete profile.geometryAssetId; }
    }
    for (const revision of value.revisions ?? []) prepare(revision.snapshot, true);
    canonicalNavigation(value);
  };
  prepare(copy);
  copy.id = PRODUCTION_ID;
  copy.schemaVersion = CURRENT_PROJECT_SCHEMA_VERSION;
  copy.title = title;
  canonicalNavigation(copy);
  assertProductionProject(copy);
  return copy;
}

function hasMedia(project: Project): boolean {
  return !!project.logo || collectProjectAssetIds(project).length > 0 ||
    (project.avScriptRows ?? []).some((row) => !!row.storyboardImage) || project.setups.some((setup) =>
      !!setup.backgroundImage || !!setup.backgroundImages?.length ||
      (setup.avScriptRows ?? []).some((row) => !!row.storyboardImage) ||
      setup.shots.some((shot) => !!shot.storyboardImage || !!shot.storyboardImageEnd || !!Object.keys(shot.storyboardFrames ?? {}).length) ||
      setup.elements.some((element) => element.type === 'light' && !!element.gdtfAssetId)) ||
    (project.people ?? []).some((person) => !!person.headshotAssetId) ||
    (project.locations ?? []).some((location) => location.referenceAssetIds.length > 0) ||
    (project.moodBoards ?? []).some((board) => board.cards.some((card) => !!card.assetId)) ||
    (project.productionDays ?? []).some((day) => !!day.callSheet?.mapAssetId || !!day.callSheet?.locationMaps?.length) ||
    (project.trussProfiles ?? []).some((profile) => !!profile.gdtfAssetId || !!profile.geometryAssetId);
}

/** Called before render or reference repair; all nested module fields are closed schemas. */
export function assertProductionProject(project: Project): void {
  assertSafeJson(project, true);
  assertEditorType(project, 'Project');
  if (project.id !== PRODUCTION_ID || project.schemaVersion !== CURRENT_PROJECT_SCHEMA_VERSION) throw new Error('Unsupported shared-production version. Start a new session with the current app.');
  if (new TextEncoder().encode(JSON.stringify(project)).length > MAX_DOCUMENT_BYTES) throw new Error('Shared productions are limited to 2 MiB, excluding media.');
  const inspect = (value: Project, snapshot = false) => {
    if (!value.setups.length || value.setups.length > 100 || (snapshot && value.revisions?.length)) throw new Error('Invalid shared production or nested revision.');
    if (hasMedia(value)) throw new Error('Images and file attachments cannot be synchronized. They remain in the original project.');
    for (const setup of value.setups) {
      if ([setup.elements, setup.shots, setup.layers ?? [], setup.groups ?? []].reduce((n, items) => n + items.length, 0) > MAX_OBJECTS) throw new Error('Each shared plan is limited to 2,000 objects.');
      if (setup.totalBeats < 1 || setup.totalBeats > 10_000 || !Number.isInteger(setup.totalBeats) || setup.canvasScale < 0.01 || setup.canvasScale > 100 || setup.gridSettings.size < 1 || setup.gridSettings.pixelsPerUnit <= 0) throw new Error('Invalid shared geometry settings.');
      for (const element of setup.elements) {
        for (const [key, child] of Object.entries(element)) {
          if (POSE.has(key) && typeof child === 'number' && Math.abs(child) > 1e6) throw new Error('Invalid shared geometry.');
          if (/color$/i.test(key) && typeof child === 'string' && /url\s*\(/i.test(child)) throw new Error('Invalid shared color.');
        }
      }
    }
    const errors = validateProject(value).filter((issue) => issue.severity === 'error');
    if (errors.length) throw new Error(`Invalid shared production: ${errors[0].message}`);
    for (const revision of value.revisions ?? []) inspect(revision.snapshot, true);
  };
  inspect(project);
}

/** Navigation, playback, timestamps and the browser's library id are never published. */
function canonicalNavigation(project: Project): void {
  project.id = PRODUCTION_ID;
  Object.assign(project, projectReferences(project, PRODUCTION_ID));
  delete project.updatedAt;
  project.activeSetupId = project.setups[0]?.id ?? '';
  for (const setup of project.setups) {
    setup.canvasOffset = { x: 0, y: 0 }; setup.canvasScale = 1; setup.currentBeat = 1;
  }
}

function projectReferences(project: Project, id: string): Partial<Project> {
  return {
    ...(project.reviewComments ? { reviewComments: project.reviewComments.map((comment) => comment.targetKind === 'project' ? { ...comment, targetId: id } : comment) } : {}),
    ...(project.moodBoards ? { moodBoards: project.moodBoards.map((board) => ({ ...board, cards: board.cards.map((card) => card.linkedEntity?.kind === 'project' ? { ...card, linkedEntity: { ...card.linkedEntity, id } } : card) })) } : {}),
  };
}

/** Stable id paths merge unrelated records and fields; screenplay paragraphs stay atomic. */
export function productionFields(project: Project): Map<string, string> {
  // New local attachments remain personal; adding one must not end a session.
  // Remote documents never pass through this omission path.
  const copy = productionProject(project, true, project.title);
  const fields = new Map<string, string>();
  const set = (path: string[], value: WireNode) => {
    const key = `p:${JSON.stringify(path)}`;
    if (path.length > 32 || key.length > 2048 || fields.size >= MAX_SHARED_FIELDS) throw new Error('Shared production exceeds its field limit.');
    fields.set(key, JSON.stringify(value));
  };
  const visit = (value: unknown, path: string[]) => {
    if (Array.isArray(value) && value.every((item) => isObject(item) && typeof item.id === 'string')) {
      const ids = value.map((item) => item.id as string);
      if (new Set(ids).size !== ids.length || ids.some((id) => !id || id.length > 256 || FORBIDDEN_KEYS.has(id))) throw new Error('Invalid or duplicate shared identity.');
      set(path, ['r', ids]);
      value.forEach((item, index) => visit(item, [...path, ids[index]]));
    } else if (isObject(value) && isParagraph(path)) {
      set(path, ['o']); set([...path, '@content'], ['v', value]);
    } else if (isObject(value)) {
      set(path, ['o']);
      const pose: RecordValue = {};
      for (const [key, child] of Object.entries(value)) {
        if (child === undefined) continue;
        if (isElement(path) && POSE.has(key)) pose[key] = child;
        else visit(child, [...path, key]);
      }
      if (isElement(path)) set([...path, '@pose'], ['v', pose]);
    } else set(path, ['v', value]);
  };
  visit(copy, []);
  return fields;
}

/** Only bounded, canonical paths can construct objects; arbitrary prototype keys never do. */
export function decodeProductionFields(data: ReadonlyMap<string, string>): Project {
  if (data.size > MAX_SHARED_FIELDS) throw new Error('Shared production exceeds its field limit.');
  const root: Tree = { children: new Map() };
  let nodes = 1;
  for (const [key, raw] of data) {
    if (!key.startsWith('p:') || key.length > 2048 || raw.length > MAX_DOCUMENT_BYTES) throw new Error('Unexpected shared production field.');
    const path: unknown = JSON.parse(key.slice(2));
    if (!Array.isArray(path) || path.length > 32 || path.some((part) => typeof part !== 'string' || part.length > 256 || FORBIDDEN_KEYS.has(part)) || JSON.stringify(path) !== key.slice(2)) throw new Error('Invalid shared production path.');
    const node: unknown = JSON.parse(raw);
    if (!Array.isArray(node) || !['o', 'r', 'v', 'd'].includes(node[0]) || node.length !== (node[0] === 'o' || node[0] === 'd' ? 1 : 2)) throw new Error('Invalid shared production node.');
    if (node[0] === 'r' && (!Array.isArray(node[1]) || node[1].length > 5000 || node[1].some((id: unknown) => typeof id !== 'string' || !id || id.length > 256 || FORBIDDEN_KEYS.has(id)) || new Set(node[1]).size !== node[1].length)) throw new Error('Invalid shared production order.');
    if (node[0] === 'v') assertSafeJson({ [path.at(-1) ?? 'value']: node[1] }, true);
    let tree = root;
    for (const part of path) {
      let child = tree.children.get(part);
      if (!child) {
        if (++nodes > MAX_JSON_NODES) throw new Error('Shared production path complexity limit exceeded.');
        child = { children: new Map<string, Tree>() };
      }
      tree.children.set(part, child); tree = child;
    }
    tree.node = node as WireNode;
  }
  const read = (tree: Tree, path: string[]): unknown => {
    const node = tree.node;
    if (!node || node[0] === 'd') return undefined;
    if (node[0] === 'v') return node[1];
    if (node[0] === 'r') {
      const order = new Map(node[1].map((id, index) => [id, index]));
      return [...tree.children].sort(([a], [b]) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9) || a.localeCompare(b)).flatMap(([id, child]) => {
        const value = read(child, [...path, id]);
        if (value === undefined) return [];
        if (!isObject(value) || value.id !== id) throw new Error('Invalid shared production identity.');
        return [value];
      });
    }
    const object: RecordValue = Object.create(null) as RecordValue;
    for (const [key, child] of tree.children) {
      const value = read(child, [...path, key]);
      if (value === undefined) continue;
      if (key === '@content') {
        if (!isParagraph(path) || !isObject(value)) throw new Error('Invalid shared paragraph.');
        Object.assign(object, value);
      } else if (key === '@pose') {
        if (!isElement(path) || !isObject(value) || Object.keys(value).some((field) => !POSE.has(field))) throw new Error('Invalid shared pose.');
        Object.assign(object, value);
      } else {
        if (isElement(path) && POSE.has(key) || isParagraph(path)) throw new Error('Shared poses and paragraphs must be atomic.');
        object[key] = value;
      }
    }
    return object;
  };
  const result = read(root, []) as Project;
  // Type validation MUST precede all method calls in reference reconciliation.
  assertSafeJson(result, true); assertEditorType(result, 'Project');
  reconcileReferences(result);
  assertProductionProject(result);
  return result;
}

/** Delete wins for required references when disconnected participants merge. */
function reconcileReferences(project: Project): void {
  const shotIds = new Set<string>();
  const setupIds = new Set(project.setups.map((setup) => setup.id));
  if (!setupIds.has(project.activeSetupId)) project.activeSetupId = project.setups[0]?.id ?? '';
  for (const setup of project.setups) {
    const ids = new Set(setup.elements.map((element) => element.id));
    setup.shots = setup.shots.filter((shot) => ids.has(shot.cameraId)).map((shot) => ({ ...shot, subjectActorIds: shot.subjectActorIds.filter((id) => ids.has(id)) }));
    const shots = new Set(setup.shots.map((shot) => shot.id));
    const lines = new Set([...(project.scriptLines ?? []), ...(setup.scriptLines ?? [])].map((line) => line.id));
    for (const shot of setup.shots) if (shot.scriptLineId && !lines.has(shot.scriptLineId)) delete shot.scriptLineId;
    setup.scriptMarks = setup.scriptMarks?.filter((mark) => shots.has(mark.shotId) && lines.has(mark.startLineId) && lines.has(mark.endLineId));
    for (const row of setup.avScriptRows ?? []) if (row.linkedShotId && !shots.has(row.linkedShotId)) delete row.linkedShotId;
    for (const item of setup.customEquipment ?? []) if (item.elementId && !ids.has(item.elementId)) delete item.elementId;
    shots.forEach((id) => shotIds.add(id));
    setup.storyboardOrder = setup.storyboardOrder?.filter((id) => shots.has(id));
    setup.groups = setup.groups?.map((group) => ({ ...group, childIds: group.childIds.filter((id) => ids.has(id)) })).filter((group) => group.childIds.length);
    for (const element of setup.elements) {
      if (element.type === 'camera' && element.associatedShotId && !shots.has(element.associatedShotId)) delete element.associatedShotId;
      if ('lookAtTargetId' in element && element.lookAtTargetId && !ids.has(element.lookAtTargetId)) delete element.lookAtTargetId;
    }
  }
  for (const line of [...project.scriptLines ?? [], ...project.setups.flatMap((setup) => setup.scriptLines ?? [])]) if (line.linkedShotId && !shotIds.has(line.linkedShotId)) delete line.linkedShotId;
  const people = new Set((project.people ?? []).map((person) => person.id));
  const characters = new Set((project.characters ?? []).map((character) => character.id));
  project.castAssignments = project.castAssignments?.filter((assignment) => people.has(assignment.personId) && characters.has(assignment.characterId));
  project.takes = project.takes?.filter((take) => shotIds.has(take.shotId));
  const scenes = new Set((project.scriptScenes ?? []).map((scene) => scene.id));
  const cues = new Set((project.runOfShowCues ?? []).map((cue) => cue.id));
  const segments = new Set((project.productionSegments ?? []).map((segment) => segment.id));
  project.scheduleBlocks = project.scheduleBlocks?.flatMap<ScheduleBlock>((block) => {
    if (block.kind === 'setup' && !setupIds.has(block.setupId) || block.kind === 'scene' && !scenes.has(block.scriptSceneId) || block.kind === 'cue' && !cues.has(block.cueId) || block.kind === 'segment' && !segments.has(block.segmentId)) return [];
    if (block.kind === 'shots') return [{ ...block, shotIds: block.shotIds.filter((id) => shotIds.has(id)) }];
    return [block];
  });
  const blocks = new Set((project.scheduleBlocks ?? []).map((block) => block.id));
  for (const day of project.productionDays ?? []) day.scheduleBlockIds = day.scheduleBlockIds.filter((id) => blocks.has(id));
  const events = new Set((project.productionCalendarEvents ?? []).map((event) => event.id));
  for (const event of project.productionCalendarEvents ?? []) if (event.dependencyIds) event.dependencyIds = event.dependencyIds.filter((id) => events.has(id));
}

export function productionView(shared: Project, local?: Project): Project {
  const activeSetupId = local && shared.setups.some((setup) => setup.id === local.activeSetupId) ? local.activeSetupId : shared.activeSetupId;
  const id = local?.id ?? createId('proj');
  const attachment = <T extends object>(remote: T, old: T | undefined, keys: readonly (keyof T)[]): T => {
    const result = { ...remote };
    for (const key of keys) if (old?.[key] !== undefined) result[key] = old[key];
    return result;
  };
  const records = <T extends { id: string }>(remote: T[] | undefined, old: T[] | undefined, merge: (value: T, old: T | undefined) => T) => {
    const byId = new Map(old?.map((value) => [value.id, value]));
    return remote?.map((value) => merge(value, byId.get(value.id)));
  };
  return { ...attachment(shared, local, ['logo']), ...projectReferences(shared, id), id, ...(local?.updatedAt ? { updatedAt: local.updatedAt } : {}), activeSetupId,
    setups: shared.setups.map((setup) => {
      const old = local?.setups.find((candidate) => candidate.id === setup.id);
      return { ...attachment(setup, old, ['backgroundImage', 'backgroundImages']),
        shots: records(setup.shots, old?.shots, (shot, previous) => attachment(shot, previous, ['storyboardImage', 'storyboardImageEnd', 'storyboardFrames']))!,
        avScriptRows: records(setup.avScriptRows, old?.avScriptRows, (row, previous) => attachment(row, previous, ['storyboardImage'])),
        elements: records(setup.elements, old?.elements, (element, previous) => element.type === 'light' && previous?.type === 'light' ? attachment(element, previous, ['gdtfAssetId']) : element)!,
        canvasOffset: old?.canvasOffset ?? setup.canvasOffset, canvasScale: old?.canvasScale ?? setup.canvasScale, currentBeat: old?.currentBeat ?? setup.currentBeat };
    }),
    avScriptRows: records(shared.avScriptRows, local?.avScriptRows, (row, previous) => attachment(row, previous, ['storyboardImage'])),
    people: records(shared.people, local?.people, (person, previous) => attachment(person, previous, ['headshotAssetId'])),
    locations: records(shared.locations, local?.locations, (location, previous) => ({ ...attachment(location, previous, ['referenceAssetIds']),
      ...(location.scout && previous?.scout?.photos ? { scout: { ...location.scout, photos: previous.scout.photos } } : {}),
    })),
    moodBoards: records(projectReferences(shared, id).moodBoards ?? shared.moodBoards, local?.moodBoards, (board, previous) => ({ ...board, cards: records(board.cards, previous?.cards, (card, old) => attachment(card, old, ['assetId']))! })),
    productionDays: records(shared.productionDays, local?.productionDays, (day, previous) => ({ ...day, ...(day.callSheet ? { callSheet: attachment(day.callSheet, previous?.callSheet, ['mapAssetId', 'locationMaps']) } : {}) })),
    trussProfiles: records(shared.trussProfiles, local?.trussProfiles, (profile, previous) => attachment(profile, previous, ['gdtfAssetId', 'geometryAssetId'])),
    revisions: records(shared.revisions, local?.revisions, (revision, previous) => ({ ...revision, snapshot: productionView(revision.snapshot, previous?.snapshot) })),
  };
}
