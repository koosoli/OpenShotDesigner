import { describe, it, expect, beforeAll } from 'vitest';
import {
  flushPendingWrites,
  getActiveProjectId,
  initProjectLibrary,
  loadLibrary,
  newProjectId,
  readProject,
  removeProject,
  setActiveProjectId,
  subscribeSaveState,
  writeProject,
} from '../projectLibrary';
import type { Project } from '../../types';
import { CURRENT_PROJECT_SCHEMA_VERSION } from '../../domain/migrations';
import { makeCleanSetup, makeProject } from './fixtures';

const LIBRARY_KEY = 'openshotdesigner_library_v1';
const LEGACY_ID = 'legacy-proj-1';

const makeStorableProject = (overrides: Partial<Project> = {}): Project =>
  makeProject([makeCleanSetup({ id: 'lib-setup-1' })], overrides);

const withTwoShots = (project: Project): Project => {
  const setup = project.setups[0];
  setup.shots.push({
    ...setup.shots[0],
    id: 'lib-shot-2',
    name: 'Shot 2',
    shotNumber: '1/2',
  });
  return project;
};

describe('projectLibrary', () => {
  beforeAll(async () => {
    localStorage.clear();
    // Seed legacy (pre-migration) data exactly the way the old single-page app left it.
    const legacyProject = withTwoShots(makeStorableProject({ id: LEGACY_ID, title: 'Legacy Production' }));
    localStorage.setItem(`${'openshotdesigner_project_'}${LEGACY_ID}`, JSON.stringify(legacyProject));
    localStorage.setItem(
      LIBRARY_KEY,
      JSON.stringify([
        { id: LEGACY_ID, title: 'Legacy Production', updatedAt: '2025-01-01T00:00:00.000Z', setupCount: 1, shotCount: 2, hasScript: false },
      ]),
    );
    await initProjectLibrary();
  });

  it('hydrates legacy localStorage projects into the library', () => {
    const summaries = loadLibrary();
    expect(summaries.some((s) => s.id === LEGACY_ID)).toBe(true);
  });

  it('applies pending migrations when reading a stored legacy project', () => {
    const project = readProject(LEGACY_ID);
    expect(project).not.toBeNull();
    expect(project!.id).toBe(LEGACY_ID);
    expect(project!.title).toBe('Legacy Production');
    expect((project as unknown as Record<string, unknown>).schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
  });

  it('roundtrips a written project through readProject', () => {
    const project = withTwoShots(makeStorableProject({ id: 'roundtrip-1', title: 'Roundtrip' }));
    writeProject(project);
    const read = readProject('roundtrip-1');
    expect(read).not.toBeNull();
    const normalized = JSON.parse(JSON.stringify(read)) as Record<string, unknown>;
    expect(normalized.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
    delete normalized.schemaVersion;
    // Migration backfills these documented defaults; strip them so the
    // comparison focuses on the data the caller wrote.
    const backfilled = [
      'locations', 'people', 'castAssignments', 'characters', 'scriptScenes',
      'breakdownItems', 'productionSegments', 'productionDays', 'scheduleBlocks',
      'productionCalendarEvents',
      'runOfShowCues', 'logisticsContainers', 'packedItems', 'powerPlan',
      'trussProfiles', 'trussElements', 'suspendedLoads', 'riggingItems',
      'revisions',
    ];
    for (const key of backfilled) delete normalized[key];
    const stripLayerDefaults = (value: Record<string, unknown>) => {
      for (const setup of value.setups as Array<Record<string, unknown>>) {
        delete setup.layers;
        delete setup.groups;
      }
    };
    stripLayerDefaults(normalized);
    const original = JSON.parse(JSON.stringify(project)) as Record<string, unknown>;
    stripLayerDefaults(original);
    expect(normalized).toEqual(original);
  });

  it('summarizes projects with correct counts in loadLibrary', () => {
    const summaries = loadLibrary();
    const entry = summaries.find((s) => s.id === 'roundtrip-1');
    expect(entry).toBeDefined();
    expect(entry!.setupCount).toBe(1);
    expect(entry!.shotCount).toBe(2);
    expect(typeof entry!.updatedAt).toBe('string');
  });

  it('overwrites duplicate project ids instead of duplicating entries', () => {
    const project = withTwoShots(makeStorableProject({ id: 'dup-1', title: 'First title' }));
    writeProject(project);
    writeProject({ ...structuredClone(project), title: 'Second title' });
    const entries = loadLibrary().filter((s) => s.id === 'dup-1');
    expect(entries).toHaveLength(1);
    expect(readProject('dup-1')!.title).toBe('Second title');
  });

  it('removes projects from both the index and storage', () => {
    const project = makeStorableProject({ id: 'doomed-1' });
    writeProject(project);
    expect(readProject('doomed-1')).not.toBeNull();
    removeProject('doomed-1');
    expect(readProject('doomed-1')).toBeNull();
    expect(loadLibrary().some((s) => s.id === 'doomed-1')).toBe(false);
  });

  it('returns null for unknown ids', () => {
    expect(readProject('no-such-project')).toBeNull();
  });

  it('persists the active project id preference', () => {
    setActiveProjectId('roundtrip-1');
    expect(getActiveProjectId()).toBe('roundtrip-1');
  });

  it('generates fresh, non-empty project ids', () => {
    const a = newProjectId();
    const b = newProjectId();
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });

  it('notifies save-state subscribers, ending at "saved" once writes are flushed', async () => {
    const states: string[] = [];
    const unsubscribe = subscribeSaveState((state) => states.push(state));
    try {
      const project = makeStorableProject({ id: 'save-state-1' });
      writeProject(project);
      await flushPendingWrites();
      expect(states.length).toBeGreaterThan(0);
      expect(states).not.toContain('error');
      expect(states[states.length - 1]).toBe('saved');
    } finally {
      unsubscribe();
    }
  });

  it('stops notifying after unsubscribing', async () => {
    const states: string[] = [];
    const unsubscribe = subscribeSaveState((state) => states.push(state));
    unsubscribe();
    writeProject(makeStorableProject({ id: 'save-state-2' }));
    await flushPendingWrites();
    expect(states).toEqual([]);
    removeProject('save-state-2');
  });
});
