import * as Y from 'yjs';
import type { Project, SceneSetup } from '../types';
import { CURRENT_PROJECT_SCHEMA_VERSION } from '../domain/migrations';
import { validateProject } from '../domain/validation';
import { collectProjectAssetIds } from '../domain/media/projectAssetReferences';
import { createId } from '../domain/ids';
import { assertAllowedKeys, assertEditorType, assertSafeJson, FORBIDDEN_KEYS, parseSharedJson } from './security';

export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
export const MAX_OBJECTS = 2000;
export const LOCAL_ORIGIN = 'local-editor';
const COLLECTIONS = ['elements', 'shots', 'layers', 'groups'] as const;
const SETTINGS = ['name', 'sceneNumber', 'location', 'timeOfDay', 'gridSettings', 'totalBeats', 'shootMode', 'aspectRatio', 'sunSettings', 'storyboardOrder'] as const;
const POSE = new Set(['x', 'y', 'x2', 'y2', 'rotation', 'width', 'height', 'start', 'end', 'curveOffset', 'points', 'path', 'basePivot', 'lookAtPoint']);
type RecordValue = Record<string, unknown>;
const encode = (value: unknown) => JSON.stringify(value ?? null);

/** A room shares only the visible plan, never crew/contact/script/other-scene data. */
export function roomProject(project: Project): Project {
  const source = project.setups.find((s) => s.id === project.activeSetupId) ?? project.setups[0];
  if (!source) throw new Error('Open a floor plan first.');
  const setup: SceneSetup = JSON.parse(JSON.stringify(source));
  delete setup.scriptSceneId;
  delete setup.locationId;
  delete setup.masterPlanForLocationId;
  delete setup.scriptLines;
  delete setup.scriptMarks;
  delete setup.scriptText;
  delete setup.scriptTitle;
  delete setup.avScriptRows;
  delete setup.customEquipment;
  for (const element of setup.elements) {
    if (element.type === 'actor') delete element.characterId;
  }
  for (const shot of setup.shots) {
    delete shot.scriptLineId;
  }
  const result: Project = {
    id: 'collaboration-plan', title: `${project.title} — shared plan`,
    schemaVersion: CURRENT_PROJECT_SCHEMA_VERSION, director: '', cinematographer: '',
    date: project.date, setups: [setup], activeSetupId: setup.id,
  };
  assertRoomProject(result);
  return result;
}

/** Fail closed instead of showing guests an apparently complete plan with missing images. */
export function assertRoomProject(project: Project): void {
  assertSafeJson(project);
  const raw = JSON.stringify(project);
  if (new TextEncoder().encode(raw).length > MAX_DOCUMENT_BYTES) throw new Error('Shared plans are limited to 2 MiB.');
  if (project.schemaVersion !== CURRENT_PROJECT_SCHEMA_VERSION || project.setups?.length !== 1) throw new Error('Unsupported shared-plan version.');
  const setup = project.setups[0];
  if (!setup || setup.id !== project.activeSetupId || !Array.isArray(setup.elements) || !Array.isArray(setup.shots)) throw new Error('Invalid shared plan.');
  if (typeof project.title !== 'string' || typeof setup.name !== 'string' || typeof setup.location !== 'string' ||
      !setup.gridSettings || !Number.isFinite(setup.gridSettings.pixelsPerUnit) || setup.gridSettings.pixelsPerUnit <= 0 ||
      !Number.isFinite(setup.totalBeats) || setup.totalBeats < 1) throw new Error('Invalid shared plan settings.');
  if (setup.totalBeats > 10_000 || !Number.isInteger(setup.totalBeats) || !Number.isFinite(setup.canvasScale) || setup.canvasScale < 0.01 || setup.canvasScale > 100 ||
      !setup.canvasOffset || ![setup.canvasOffset.x, setup.canvasOffset.y].every(Number.isFinite) || setup.gridSettings.size < 1) throw new Error('Invalid shared geometry settings.');
  assertEditorType(setup.gridSettings, 'GridSettings');
  if (setup.sunSettings != null) assertEditorType(setup.sunSettings, 'SunSettings');
  setup.elements.forEach((item) => assertEditorType(item, 'FloorPlanElement'));
  setup.shots.forEach((item) => assertEditorType(item, 'Shot'));
  setup.layers?.forEach((item) => assertEditorType(item, 'PlanLayer'));
  setup.groups?.forEach((item) => assertEditorType(item, 'PlanGroup'));
  for (const collection of COLLECTIONS) {
    const items = setup[collection];
    if (items !== undefined && !Array.isArray(items)) throw new Error('Invalid shared collection.');
    if (items?.some((item) => !item || typeof item.id !== 'string' || !item.id || item.id.length > 256)) throw new Error('Invalid shared object identity.');
  }
  if (setup.groups?.some((g) => !Array.isArray(g.childIds) || g.childIds.some((id) => typeof id !== 'string'))) throw new Error('Invalid shared group.');
  if (COLLECTIONS.reduce((n, key) => n + (setup[key]?.length ?? 0), 0) > MAX_OBJECTS) throw new Error('Shared plans are limited to 2,000 objects.');
  if (collectProjectAssetIds(project).length || setup.backgroundImage || setup.backgroundImages?.length ||
      setup.shots.some((s) => s.storyboardImage || s.storyboardImageEnd || Object.keys(s.storyboardFrames ?? {}).length)) {
    throw new Error('Collaboration preview currently supports plans without background images, storyboard images or custom asset files. Export the original .osd project to share those resources.');
  }
  for (const element of setup.elements) {
    if (!['actor','camera','light','wall','door','window','prop','track','road','text','measurement','arrow','shape','cable','stroke','annotation'].includes(element.type) ||
        typeof element.id !== 'string' || !element.id || typeof element.name !== 'string' ||
        ![element.x, element.y, element.rotation].every(Number.isFinite)) throw new Error('Invalid shared element.');
    const record = element as unknown as RecordValue;
    for (const key of ['path', 'points', 'speechCues', 'modifiers']) {
      if (record[key] !== undefined && !Array.isArray(record[key])) throw new Error(`Invalid shared ${key}.`);
    }
    for (const key of ['color', 'wallColor', 'rgbColor', 'backgroundColor', 'lineColor']) {
      if (record[key] !== undefined && (typeof record[key] !== 'string' || /url\s*\(/i.test(record[key] as string))) throw new Error('Invalid shared color.');
    }
    for (const key of ['x2', 'y2', 'width', 'height', 'thickness', 'fontSize', 'strokeWidth']) {
      if (record[key] !== undefined && !Number.isFinite(record[key])) throw new Error('Invalid shared geometry.');
    }
  }
  const errors = validateProject(project).filter((i) => i.severity === 'error');
  if (errors.length) throw new Error(`Invalid shared plan: ${errors[0].message}`);
}

/** Flat, stable field keys avoid independently creating conflicting nested Y.Maps. */
function fields(project: Project): Map<string, string> {
  const setup = project.setups[0];
  const out = new Map<string, string>();
  for (const key of SETTINGS) out.set(`setting:${key}`, encode(setup[key]));
  for (const collection of COLLECTIONS) {
    out.set(`order:${collection}`, encode((setup[collection] ?? []).map((item) => item.id)));
    for (const item of setup[collection] ?? []) {
      const record = item as unknown as RecordValue;
      const prefix = `${collection}:${encode(record.id)}:`;
      out.set(`${prefix}@exists`, 'true');
      const pose: RecordValue = {};
      for (const [key, value] of Object.entries(record)) {
        if (POSE.has(key)) pose[key] = value;
        else out.set(prefix + key, encode(value));
      }
      out.set(`${prefix}@pose`, encode(pose));
    }
  }
  return out;
}

export function seedDocument(doc: Y.Doc, project: Project): void {
  if (doc.getMap('meta').has('seed')) throw new Error('This room already has a plan.');
  assertRoomProject(project);
  doc.transact(() => {
    doc.getMap('meta').set('seed', JSON.stringify(project));
    const data = doc.getMap<string>('plan');
    fields(project).forEach((value, key) => data.set(key, value));
  }, 'seed');
}

export type SharedChanges = Map<string, string | undefined>;

export function localChanges(before: Project, after: Project): SharedChanges {
  if (before.id !== after.id || after.setups.length !== 1 || before.setups.length !== 1 ||
      after.setups[0].id !== before.setups[0].id || after.activeSetupId !== before.activeSetupId) {
    throw new Error('This session shares one fixed plan. Your changed project stays local; start a new session to share it.');
  }
  // Local production modules are not part of the wire document or its schema.
  roomProject(after);
  const previous = fields(before);
  const next = fields(after);
  const changes: SharedChanges = new Map();
  for (const [key, value] of next) if (previous.get(key) !== value) changes.set(key, value);
  for (const key of previous.keys()) if (!next.has(key)) changes.set(key, key.endsWith(':@exists') ? 'false' : undefined);
  return changes;
}

export function applyLocalChanges(doc: Y.Doc, changes: ReadonlyMap<string, string | undefined>): void {
  const data = doc.getMap<string>('plan');
  doc.transact(() => {
    for (const [key, value] of changes) {
      if (value === undefined) { if (data.has(key)) data.delete(key); }
      else if (data.get(key) !== value) data.set(key, value);
    }
  }, LOCAL_ORIGIN);
}

export function writeLocalChanges(doc: Y.Doc, before: Project, after: Project): void {
  applyLocalChanges(doc, localChanges(before, after));
}

export function readDocument(doc: Y.Doc): Project | null {
  if ([...doc.share.keys()].some((key) => !['meta', 'plan'].includes(key))) throw new Error('Unexpected shared root.');
  if (doc.store.pendingStructs || doc.store.pendingDs || doc.store.clients.size > 1024 ||
      [...doc.store.clients.values()].reduce((sum, structs) => sum + structs.length, 0) > 100_000) throw new Error('Unsupported or excessive synchronization history.');
  const meta = doc.getMap('meta');
  const wire = doc.getMap('plan');
  if (meta._start || wire._start || meta.size > 1 || wire.size > 50_000) throw new Error('Unsupported shared map structure.');
  if ([...meta.keys()].some((key) => key !== 'seed') || [...wire.values()].some((value) => typeof value !== 'string')) throw new Error('Invalid shared map values.');
  const seed = doc.getMap<string>('meta').get('seed');
  if (seed === undefined) {
    if (wire.size) throw new Error('Uninitialized room cannot contain plan records.');
    return null;
  }
  if (typeof seed !== 'string' || !seed || seed.length > MAX_DOCUMENT_BYTES) throw new Error('Invalid shared seed.');
  return decodeFields(seed, new Map(wire.entries()) as Map<string, string>);
}

/** Pure projection of real local intents over received state; never mutate Yjs during React render. */
export function readWithPendingChanges(doc: Y.Doc, changes: ReadonlyMap<string, string | undefined>): Project | null {
  const shared = readDocument(doc);
  if (!shared || !changes.size) return shared;
  const data = new Map(doc.getMap<string>('plan').entries());
  for (const [key, value] of changes) {
    if (value === undefined) data.delete(key); else data.set(key, value);
  }
  return decodeFields(doc.getMap<string>('meta').get('seed')!, data);
}

function decodeFields(seed: string, data: ReadonlyMap<string, string>): Project {
  const result = parseSharedJson(seed) as Project;
  assertAllowedKeys(result, ['id', 'title', 'schemaVersion', 'director', 'cinematographer', 'date', 'setups', 'activeSetupId']);
  if (result.id !== 'collaboration-plan' || result.director !== '' || result.cinematographer !== '') throw new Error('Unexpected shared project identity.');
  assertRoomProject(result);
  const setup = result.setups[0];
  assertAllowedKeys(setup, ['id', 'name', 'sceneNumber', 'scriptPage', 'location', 'timeOfDay', 'elements', 'shots', 'storyboardOrder', 'backgroundImage', 'backgroundImages', 'layers', 'groups', 'currentBeat', 'totalBeats', 'shootMode', 'aspectRatio', 'gridSettings', 'sunSettings', 'canvasScale', 'canvasOffset', 'scriptFormatMode']);
  data.forEach((value, key) => {
    if (key.length > 400 || value.length > MAX_DOCUMENT_BYTES || !/^(?:setting:|order:|elements:|shots:|layers:|groups:)/.test(key)) throw new Error('Unexpected shared field.');
    if (key.startsWith('setting:') && !(SETTINGS as readonly string[]).includes(key.slice(8))) throw new Error('Unexpected shared setting.');
    if (key.startsWith('order:') && !(COLLECTIONS as readonly string[]).includes(key.slice(6))) throw new Error('Unexpected shared collection order.');
  });
  for (const key of SETTINGS) {
    const value = data.get(`setting:${key}`);
    if (value !== undefined) {
      const decoded = parseSharedJson(value);
      if (decoded === null) delete (setup as unknown as RecordValue)[key];
      else (setup as unknown as RecordValue)[key] = decoded;
    }
  }
  for (const collection of COLLECTIONS) {
    const records = new Map<string, RecordValue>();
    const prefix = `${collection}:`;
    data.forEach((value, key) => {
      if (!key.startsWith(prefix)) return;
      // IDs are JSON encoded; find the separator after the terminating quote.
      const match = key.slice(prefix.length).match(/^("(?:[^"\\]|\\.)*"):(.*)$/s);
      if (!match) throw new Error('Invalid shared object key.');
      const id = parseSharedJson(match[1]) as string;
      const field = match[2];
      if (typeof id !== 'string' || id.length > 256 || FORBIDDEN_KEYS.has(field)) throw new Error('Invalid shared object field.');
      const decoded = parseSharedJson(value);
      if (field === '@pose') {
        if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('Invalid shared pose.');
        assertAllowedKeys(decoded, [...POSE]);
      } else if (field === '@exists') {
        if (typeof decoded !== 'boolean') throw new Error('Invalid shared existence marker.');
      } else if (field.startsWith('@') || (field === 'id' && decoded !== id)) throw new Error('Invalid shared identity field.');
      const record = records.get(id) ?? Object.create(null) as RecordValue;
      record[field] = decoded;
      records.set(id, record);
    });
    const items = [...records.values()].filter((record) => record['@exists'] === true).map((record) => {
      const { '@pose': pose, '@exists': _exists, ...rest } = record;
      return { ...rest, ...(pose as RecordValue) };
    });
    // Stable order for simultaneous insertions; layer order remains an explicit field.
    const order = data.get(`order:${collection}`);
    const orderedIds = order ? parseSharedJson(order) as string[] : (setup[collection] ?? []).map((item) => item.id);
    if (!Array.isArray(orderedIds) || orderedIds.length > MAX_OBJECTS || orderedIds.some((id) => typeof id !== 'string')) throw new Error('Invalid shared order.');
    const seedOrder = new Map(orderedIds.map((id, index) => [id, index]));
    items.sort((a, b) => (seedOrder.get(a.id as string) ?? 1e9) - (seedOrder.get(b.id as string) ?? 1e9) || String(a.id).localeCompare(String(b.id)));
    (setup as unknown as RecordValue)[collection] = items;
  }
  // Check types BEFORE reference repair calls methods on remote fields.
  setup.elements.forEach((item) => assertEditorType(item, 'FloorPlanElement'));
  setup.shots.forEach((item) => assertEditorType(item, 'Shot'));
  setup.groups?.forEach((item) => assertEditorType(item, 'PlanGroup'));
  // Delete wins across references as well as object records.
  const ids = new Set(setup.elements.map((e) => e.id));
  setup.shots = setup.shots.filter((s) => ids.has(s.cameraId)).map((s) => ({ ...s, subjectActorIds: s.subjectActorIds?.filter((id) => ids.has(id)) }));
  const shots = new Set(setup.shots.map((s) => s.id));
  setup.storyboardOrder = setup.storyboardOrder?.filter((id) => shots.has(id));
  setup.groups = setup.groups?.map((g) => ({ ...g, childIds: g.childIds.filter((id) => ids.has(id)) })).filter((g) => g.childIds.length > 0);
  for (const e of setup.elements) {
    if (e.type === 'camera' && e.associatedShotId && !shots.has(e.associatedShotId)) delete e.associatedShotId;
    if ('lookAtTargetId' in e && e.lookAtTargetId && !ids.has(e.lookAtTargetId)) delete e.lookAtTargetId;
  }
  assertRoomProject(result);
  return result;
}

/** Keep each participant's viewport and library identity local. */
export function projectView(shared: Project, local?: Project): Project {
  const setup = shared.setups[0];
  const old = local?.setups.find((s) => s.id === setup.id);
  return { ...shared, ...local, id: local?.id ?? createId('proj'), setups: [{ ...old, ...setup,
    canvasOffset: old?.canvasOffset ?? setup.canvasOffset,
    canvasScale: old?.canvasScale ?? setup.canvasScale,
    currentBeat: old?.currentBeat ?? setup.currentBeat,
  }] };
}
