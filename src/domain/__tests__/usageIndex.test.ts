import { describe, expect, it } from 'vitest';
import { buildUsageIndex, usageCountFor, usagesFor } from '../usage';
import type { Project } from '../../types';

const GRID = { size: 40, snap: true, showGrid: true, unit: 'm' as const, pixelsPerUnit: 40 };

const fixture = (): Project => ({
  id: 'project-usage',
  title: 'Usage fixture',
  director: 'Director',
  cinematographer: 'DP',
  date: '2026-09-04',
  activeSetupId: 'setup-1',
  people: [
    { id: 'p-crew', displayName: 'Crew Member', kind: 'crew' },
    { id: 'p-cast', displayName: 'Cast Member', kind: 'cast' },
    { id: 'p-stranger', displayName: 'Stranger', kind: 'contact' },
  ],
  characters: [{ id: 'ch-hero', canonicalName: 'HERO', aliases: [] }],
  castAssignments: [{ id: 'ca-1', characterId: 'ch-hero', personId: 'p-cast', castNumber: 1 }],
  locations: [
    { id: 'loc-stage', name: 'Main Stage', type: 'stage', referenceAssetIds: [] },
    { id: 'loc-unused', name: 'Nowhere', type: 'location', referenceAssetIds: [] },
  ],
  scriptScenes: [
    {
      id: 'sc-1',
      sceneNumber: '1',
      heading: 'INT. STAGE - DAY',
      locationId: 'loc-stage',
      characterIds: ['ch-hero'],
      breakdownItemIds: [],
    },
  ],
  setups: [
    {
      id: 'setup-1',
      name: 'Setup 1: Master',
      sceneNumber: '1',
      location: 'Main Stage',
      locationId: 'loc-stage',
      timeOfDay: 'Day INT',
      elements: [
        {
          id: 'actor-1',
          type: 'actor',
          x: 0,
          y: 0,
          rotation: 0,
          name: 'Hero marker',
          characterLetter: 'H',
          characterId: 'ch-hero',
          color: '#fff',
          isStanding: true,
          path: [],
        },
      ],
      shots: [
        {
          id: 'shot-1',
          sceneNumber: '1',
          shotNumber: '1A',
          name: 'Master wide',
          cameraId: 'cam-a',
          cameraLabel: 'A',
          shotSize: 'WS',
          lensMm: 35,
          cameraAngle: 'Eye Level',
          movement: 'Static',
          aspectRatio: '16:9',
          frameRate: 24,
          subjectActorIds: [],
          storyboardImage: 'asset-sha256-board',
          framingDescription: 'Wide on the stage',
          status: 'planned',
          takesCount: 0,
          estDurationSeconds: 30,
          order: 0,
        },
      ],
      customEquipment: [{ id: 'eq-1', category: 'lighting', name: 'Panel', quantity: 2 }],
      currentBeat: 1,
      totalBeats: 1,
      gridSettings: GRID,
      canvasScale: 1,
      canvasOffset: { x: 0, y: 0 },
    },
    {
      id: 'setup-2',
      name: 'Setup 2: Unscheduled',
      sceneNumber: '2',
      location: 'Elsewhere',
      timeOfDay: 'Night EXT',
      elements: [],
      shots: [
        {
          id: 'shot-2',
          sceneNumber: '2',
          shotNumber: '2A',
          name: 'Loose insert',
          cameraId: 'cam-a',
          cameraLabel: 'A',
          shotSize: 'CU',
          lensMm: 50,
          cameraAngle: 'Eye Level',
          movement: 'Static',
          aspectRatio: '16:9',
          frameRate: 24,
          subjectActorIds: [],
          framingDescription: 'Insert',
          status: 'planned',
          takesCount: 0,
          estDurationSeconds: 10,
          order: 0,
        },
      ],
      currentBeat: 1,
      totalBeats: 1,
      gridSettings: GRID,
      canvasScale: 1,
      canvasOffset: { x: 0, y: 0 },
    },
  ],
  scheduleBlocks: [
    { id: 'b-setup', kind: 'setup', setupId: 'setup-1' },
    { id: 'b-shots', kind: 'shots', shotIds: ['shot-1', 'ghost-shot'] },
    { id: 'b-scene', kind: 'scene', scriptSceneId: 'sc-1' },
  ],
  productionDays: [
    {
      id: 'day-1',
      name: 'Day 1',
      date: '2026-09-05',
      scheduleBlockIds: ['b-setup', 'b-shots'],
      callSheet: {
        personCalls: [
          { id: 'call-1', personId: 'p-cast', time: '07:00', note: 'Make-up' },
          // Dangling call: unknown person, must be ignored without crashing.
          { id: 'call-ghost', personId: 'ghost', time: '09:00' },
        ],
        locationMaps: [{ id: 'map-1', locationName: 'Main Stage', lat: 49.6, lng: 6.1, assetId: 'map-asset' }],
      },
    },
  ],
  tasks: [
    {
      id: 'task-1',
      boardId: 'board',
      columnId: 'col',
      title: 'Fit costume',
      assigneeIds: ['p-cast'],
      labels: [],
      checklist: [],
      order: 0,
      createdAt: '2026-09-01',
    },
    {
      id: 'task-2',
      boardId: 'board',
      columnId: 'col',
      title: 'Lock the stage',
      assigneeIds: [],
      labels: [],
      checklist: [],
      order: 1,
      createdAt: '2026-09-01',
      link: { kind: 'location', id: 'loc-stage' },
    },
    {
      id: 'task-ghost',
      boardId: 'board',
      columnId: 'col',
      title: 'Ghost work',
      // Dangling assignee: unknown person, must be ignored without crashing.
      assigneeIds: ['ghost'],
      labels: [],
      checklist: [],
      order: 2,
      createdAt: '2026-09-01',
    },
  ],
  takes: [
    { id: 'take-1', shotId: 'shot-1', productionDayId: 'day-1', takeNumber: 1 },
    // Dangling take: unknown shot, must be ignored without crashing.
    { id: 'take-ghost', shotId: 'ghost-shot', takeNumber: 1 },
  ],
  budget: {
    settings: { currency: 'EUR', defaultVatPercent: 17, weekDays: 5 },
    lines: [],
    equipmentRates: [],
    actuals: [{ id: 'actual-1', category: 'cast', label: 'Extra pay', amount: 100, entryId: 'person:p-cast' }],
  },
});

describe('buildUsageIndex', () => {
  it('lists person usages across cast, days, call times, tasks and budget', () => {
    const index = buildUsageIndex(fixture());
    const sections = usagesFor(index, 'person', 'p-cast').map((entry) => entry.section);
    expect(sections).toContain('Cast');
    expect(sections).toContain('Schedule');
    expect(sections).toContain('Call times');
    expect(sections).toContain('Tasks');
    expect(sections).toContain('Budget');
    expect(usageCountFor(index, 'person', 'p-cast')).toBeGreaterThan(0);
  });

  it('lists location usages across scenes, script, days, call sheets and tasks', () => {
    const index = buildUsageIndex(fixture());
    const sections = usagesFor(index, 'location', 'loc-stage').map((entry) => entry.section);
    expect(sections).toContain('Scenes');
    expect(sections).toContain('Script');
    expect(sections).toContain('Schedule');
    expect(sections).toContain('Call sheets');
    expect(sections).toContain('Tasks');
  });

  it('lists shot usages across schedule, takes and storyboard', () => {
    const index = buildUsageIndex(fixture());
    const sections = usagesFor(index, 'shot', 'shot-1').map((entry) => entry.section);
    expect(sections).toContain('Schedule');
    expect(sections).toContain('Takes');
    expect(sections).toContain('Storyboard');
  });

  it('lists setup usages across shots, schedule and script', () => {
    const index = buildUsageIndex(fixture());
    const sections = usagesFor(index, 'setup', 'setup-1').map((entry) => entry.section);
    expect(sections).toContain('Shots');
    expect(sections).toContain('Schedule');
    expect(sections).toContain('Script');
  });

  it('leaves unreferenced entities empty without omitting their keys', () => {
    const index = buildUsageIndex(fixture());
    expect(usagesFor(index, 'person', 'p-stranger')).toEqual([]);
    expect(usagesFor(index, 'location', 'loc-unused')).toEqual([]);
    expect(usagesFor(index, 'shot', 'shot-2')).toEqual([]);
  });

  it('ignores dangling references instead of crashing or inventing keys', () => {
    const index = buildUsageIndex(fixture());
    expect(usagesFor(index, 'person', 'ghost')).toEqual([]);
    expect(usagesFor(index, 'shot', 'ghost-shot')).toEqual([]);
    expect('ghost' in index.person).toBe(false);
    expect('ghost-shot' in index.shot).toBe(false);
  });
});
