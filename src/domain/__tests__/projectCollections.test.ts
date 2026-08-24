/**
 * Every persisted collection, checked as a set rather than one at a time.
 *
 * The trap this exists for is structural, not local. A feature adds a
 * collection to `Project`; the type compiles, the feature works, its own tests
 * pass — and nothing notices that duplicating a project leaves the copy's
 * records pointing at the original's entities, or that deleting the thing they
 * hang off leaves them behind. That is exactly how the continuity `takes`
 * collection shipped: `clone.ts` never remapped it, so every take in a
 * duplicated project referenced a shot that belonged to another project.
 *
 * A per-collection test would not have caught it, because nobody writes the
 * test for the case they did not think of. So these tests enumerate the
 * collections instead and assert a property across all of them. When the next
 * feature adds one, the enumeration is what fails — and the failure names the
 * collection and the rule it broke.
 */
import { describe, expect, it } from 'vitest';
import { cloneProjectWithNewIds } from '../clone';
import { CURRENT_PROJECT_SCHEMA_VERSION, migrateProject } from '../migrations';
import type { Project } from '../../types';

/**
 * Collections whose records carry their own ids, and which must therefore be
 * reissued when a project is duplicated. Adding a row here is deliberate work:
 * the point is to notice.
 */
const ID_BEARING_COLLECTIONS = [
  'locations',
  'people',
  'characters',
  'scriptScenes',
  'breakdownItems',
  'productionSegments',
  'productionDays',
  'scheduleBlocks',
  'productionCalendarEvents',
  'runOfShowCues',
  'logisticsContainers',
  'packedItems',
  'trussProfiles',
  'trussElements',
  'suspendedLoads',
  'riggingItems',
  'takes',
  'continuityNotes',
] as const;

type CollectionName = (typeof ID_BEARING_COLLECTIONS)[number];

/** A record for each collection, with the fields that make it self-consistent. */
const seedRecord = (name: CollectionName, id: string): Record<string, unknown> => {
  switch (name) {
    case 'scheduleBlocks':
      return { id, kind: 'shots', shotIds: [] };
    case 'productionDays':
      return { id, name: 'Day 1', scheduleBlockIds: [] };
    case 'productionCalendarEvents':
      return { id, title: 'Prep', startDate: '2026-09-01', endDate: '2026-09-02', category: 'preproduction' };
    case 'packedItems':
      return { id, containerId: 'logisticsContainers-seed', label: 'Case', quantity: 1 };
    case 'logisticsContainers':
      return { id, kind: 'case', name: 'Case' };
    case 'trussElements':
      return { id, x: 0, y: 0, rotation: 0 };
    case 'suspendedLoads':
      return { id, trussElementId: 'trussElements-seed', label: 'Load', quantity: 1 };
    case 'riggingItems':
      return { id, kind: 'motor', trussElementId: 'trussElements-seed' };
    case 'takes':
      return { id, shotId: 'shot-seed', takeNumber: 1 };
    case 'continuityNotes':
      return { id, department: 'wardrobe', description: 'Navy overcoat' };
    case 'people':
      return { id, displayName: 'Someone' };
    case 'characters':
      return { id, canonicalName: 'SOMEONE', aliases: [] };
    case 'locations':
      return { id, name: 'Somewhere' };
    case 'scriptScenes':
      return { id, sceneNumber: '1', heading: 'INT. ROOM - DAY', characterIds: [], breakdownItemIds: [] };
    case 'breakdownItems':
      return { id, category: 'prop', name: 'Thing', sourceScriptLineIds: [] };
    case 'runOfShowCues':
      return { id, label: 'Cue', order: 1 };
    case 'trussProfiles':
      return { id, manufacturer: 'Generic', model: 'Box', geometry: 'box', lengthMm: 3000 };
    case 'productionSegments':
      return { id, name: 'Segment', order: 1 };
    default:
      return { id, name: name };
  }
};

const projectWithEveryCollection = (): Project => {
  const project = {
    id: 'project-original',
    title: 'Every collection',
    director: '',
    cinematographer: '',
    date: '2026-08-24',
    activeSetupId: 'setup-1',
    setups: [
      {
        id: 'setup-1',
        name: 'Setup',
        sceneNumber: '1',
        location: 'INT. ROOM',
        timeOfDay: 'Day INT',
        elements: [],
        shots: [
          {
            id: 'shot-seed',
            sceneNumber: '1',
            shotNumber: '1/1',
            name: 'Shot',
            cameraId: '',
            cameraLabel: 'A',
            shotSize: 'MS',
            lensMm: 35,
            cameraAngle: 'Eye Level',
            movement: 'Static',
            aspectRatio: '16:9',
            frameRate: 24,
            subjectActorIds: [],
            framingDescription: '',
            status: 'planned',
            takesCount: 0,
            estDurationSeconds: 10,
            order: 1,
          },
        ],
      },
    ],
  } as unknown as Record<string, unknown>;

  for (const name of ID_BEARING_COLLECTIONS) {
    project[name] = [seedRecord(name, `${name}-seed`)];
  }
  return project as unknown as Project;
};

const idsOf = (project: Project, name: CollectionName): string[] =>
  ((project as unknown as Record<string, Array<{ id: string }>>)[name] ?? []).map(
    (record) => record.id,
  );

describe('cloning a project', () => {
  const original = projectWithEveryCollection();
  const clone = cloneProjectWithNewIds(original);

  it.each(ID_BEARING_COLLECTIONS)('carries %s onto the duplicate', (name) => {
    expect(idsOf(clone, name)).toHaveLength(idsOf(original, name).length);
  });

  /**
   * The property that actually matters. A duplicate sharing ids with its
   * source is not a copy — edit one and the other changes, and any later merge
   * or export cannot tell them apart.
   */
  it.each(ID_BEARING_COLLECTIONS)('issues fresh ids for %s', (name) => {
    const before = idsOf(original, name);
    const after = idsOf(clone, name);
    for (const id of after) {
      expect(before).not.toContain(id);
    }
  });

  it('leaves the original untouched', () => {
    for (const name of ID_BEARING_COLLECTIONS) {
      expect(idsOf(original, name)).toEqual([`${name}-seed`]);
    }
  });

  /**
   * Cross-collection references must follow their target into the copy. A take
   * pointing at the ORIGINAL project's shot is the bug that prompted all of
   * this: it looked fine in the type system and read as orphaned on screen.
   */
  it('repoints references at the copied entities, not the originals', () => {
    const take = (clone.takes ?? [])[0];
    expect(take?.shotId).toBe(clone.setups[0].shots[0].id);
    expect(take?.shotId).not.toBe('shot-seed');

    const load = (clone.suspendedLoads ?? [])[0];
    expect(load?.trussElementId).toBe((clone.trussElements ?? [])[0]?.id);

    const packed = (clone.packedItems ?? [])[0];
    expect(packed?.containerId).toBe((clone.logisticsContainers ?? [])[0]?.id);
  });
});

/**
 * A collection is only really "persisted" if an old project carrying it still
 * loads. Enumerated for the same reason as the clone rules: the failure mode
 * is a collection nobody thought to check, and it surfaces months later as an
 * unopenable project rather than as a test failure.
 */
describe('migrating a project that carries every collection', () => {
  const legacy = () => {
    const project = projectWithEveryCollection() as unknown as Record<string, unknown>;
    // The version before the newest one, so the tail of the chain runs.
    project.schemaVersion = CURRENT_PROJECT_SCHEMA_VERSION - 1;
    return project;
  };

  it('reaches the current version', () => {
    const { project } = migrateProject(legacy());
    expect(project.schemaVersion).toBe(CURRENT_PROJECT_SCHEMA_VERSION);
  });

  it.each(ID_BEARING_COLLECTIONS)('keeps %s intact through the migration', (name) => {
    const { project } = migrateProject(legacy());
    expect(idsOf(project, name)).toEqual([`${name}-seed`]);
  });

  it('is deterministic', () => {
    expect(migrateProject(legacy()).project).toEqual(migrateProject(legacy()).project);
  });
});

/**
 * Clone runs on imported JSON, which is untrusted: a hand-edited or older file
 * can be missing an array the type says is required. Losing the duplicate
 * entirely, with a TypeError and no message, is the worst available outcome —
 * far worse than a copy with an empty list.
 */
describe('cloning an imported project with fields missing', () => {
  it('does not throw when required arrays are absent', () => {
    const project = projectWithEveryCollection() as unknown as Record<string, unknown>;
    project.characters = [{ id: 'char-1', canonicalName: 'NO ALIASES' }];
    project.scriptScenes = [{ id: 'scene-1', sceneNumber: '1', heading: 'INT. ROOM - DAY' }];

    const clone = cloneProjectWithNewIds(project as unknown as Project);
    expect(clone.characters?.[0].aliases).toEqual([]);
    expect(clone.scriptScenes?.[0].characterIds).toEqual([]);
    expect(clone.scriptScenes?.[0].breakdownItemIds).toEqual([]);
  });
});
