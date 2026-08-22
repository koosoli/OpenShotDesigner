/**
 * The four representative test projects required by plan §44.
 *
 * Only the narrative one has ever existed — the example production shipped with
 * the app. Everything else the app supports (a concert with no script, a
 * broadcast studio with no screenplay, a bare floor plan with no production
 * around it at all) had no fixture and therefore no regression coverage.
 *
 * That is not a theoretical gap. The worst bug of the previous session was
 * exactly this shape: `castPersonIdsForDay` only walked `scene` blocks, so a
 * production scheduling setups or shots — the script-optional path the app
 * exists to support (rule 1) — printed "No cast scheduled" while its actors
 * stood on the plan. A concert fixture run through the call-sheet builder
 * would have failed the day the code was written.
 *
 * These are deliberately hand-built rather than generated from the sample
 * content: a fixture that shares a factory with the code under test stops being
 * independent evidence. They are small, literal, and readable in one screen
 * each, and they are consumed by `scenarios.test.ts`.
 */

import type {
  ActorElement,
  CableElement,
  CameraElement,
  LightElement,
  Project,
  SceneSetup,
  Shot,
} from '../../../types';
import type { CastAssignment, Person } from '../../people';
import type { ProductionDay, ScheduleBlock } from '../../scheduling';
import type { Character } from '../../script';
import type { PowerPlan } from '../../power';

const BASE_SETUP: Omit<SceneSetup, 'id' | 'name'> = {
  sceneNumber: '1',
  location: 'STAGE',
  timeOfDay: 'Day INT',
  elements: [],
  shots: [],
  currentBeat: 1,
  totalBeats: 1,
  aspectRatio: '16:9',
  canvasScale: 1,
  canvasOffset: { x: 0, y: 0 },
  gridSettings: { size: 30, snap: true, showGrid: true, unit: 'm', pixelsPerUnit: 30 },
};

const setup = (id: string, name: string, overrides: Partial<SceneSetup> = {}): SceneSetup => ({
  ...BASE_SETUP,
  id,
  name,
  ...overrides,
});

const BASE_PROJECT: Omit<Project, 'id' | 'title' | 'setups' | 'activeSetupId'> = {
  director: '',
  cinematographer: '',
  date: '2026-09-01',
  schemaVersion: 20,
  avScriptRows: [],
};

const project = (
  id: string,
  title: string,
  setups: SceneSetup[],
  overrides: Partial<Project> = {},
): Project => ({
  ...BASE_PROJECT,
  id,
  title,
  setups,
  activeSetupId: setups[0].id,
  ...overrides,
});

const camera = (id: string, label: string, x: number, y: number, extra: Partial<CameraElement> = {}): CameraElement => ({
  id,
  type: 'camera',
  name: `Camera ${label}`,
  cameraLabel: label,
  color: '#0284c7',
  x,
  y,
  rotation: -90,
  focalLength: 35,
  sensorFormat: 'Super35',
  fovAngle: 54,
  aspectRatio: '16:9',
  cameraHeight: 'Eye Level',
  rigType: 'Tripod',
  throwDistance: 300,
  path: [],
  ...extra,
});

const shot = (id: string, number: string, name: string, extra: Partial<Shot> = {}): Shot => ({
  id,
  shotNumber: number,
  name,
  shotSize: 'MS',
  ...extra,
} as Shot);

// ---------------------------------------------------------------------------
// 1. Narrative — a screenplay, scenes, cast, a scheduled shoot day.
// ---------------------------------------------------------------------------

const NARRATIVE_CHARACTERS: Character[] = [
  { id: 'char-alex', canonicalName: 'ALEX', aliases: [] },
  { id: 'char-sarah', canonicalName: 'SARAH', aliases: [] },
];

const NARRATIVE_PEOPLE: Person[] = [
  { id: 'p-alex', displayName: 'Ruth Oyelaran', kind: 'cast', role: 'Alex' },
  { id: 'p-sarah', displayName: 'Ingrid Falk', kind: 'cast', role: 'Sarah' },
  { id: 'p-gaffer', displayName: 'Tomas Berg', kind: 'crew', department: 'Lighting', role: 'Gaffer' },
];

const NARRATIVE_CAST: CastAssignment[] = [
  { id: 'ca-1', characterId: 'char-alex', personId: 'p-alex' },
  { id: 'ca-2', characterId: 'char-sarah', personId: 'p-sarah' },
];

/**
 * Narrative: the path that has always been covered. Present so the other three
 * are compared against something, not because it was missing.
 */
export const narrativeFixture = (): Project => {
  const alex: ActorElement = {
    id: 'el-alex',
    type: 'actor',
    name: 'ALEX',
    characterLetter: 'A',
    characterName: 'ALEX',
    characterId: 'char-alex',
    color: '#3b82f6',
    x: 300,
    y: 300,
    rotation: 90,
    isStanding: true,
    path: [],
  };
  const sarah: ActorElement = { ...alex, id: 'el-sarah', name: 'SARAH', characterLetter: 'S', characterName: 'SARAH', characterId: 'char-sarah', x: 460, y: 300 };

  const days: ProductionDay[] = [
    { id: 'day-1', name: 'Day 1', date: '2026-09-07', crewCall: '07:00', plannedWrap: '19:00', scheduleBlockIds: ['blk-1', 'blk-2'] },
  ];
  const blocks: ScheduleBlock[] = [
    { id: 'blk-1', kind: 'scene', scriptSceneId: 'scene-1', estimatedMinutes: 120 },
    { id: 'blk-2', kind: 'manual', label: 'Lunch', manualType: 'meal', estimatedMinutes: 45 },
  ];

  return project(
    'fixture-narrative',
    'Narrative fixture',
    [
      setup('setup-1', 'Sc 1 — Living room', {
        sceneNumber: '1',
        location: 'INT. LIVING ROOM - NIGHT',
        timeOfDay: 'Night INT',
        elements: [alex, sarah, camera('el-cam-a', 'A', 380, 460)],
        shots: [shot('shot-1', '1', 'Master')],
      }),
    ],
    {
      characters: NARRATIVE_CHARACTERS,
      castAssignments: NARRATIVE_CAST,
      people: NARRATIVE_PEOPLE,
      productionDays: days,
      scheduleBlocks: blocks,
      scriptScenes: [
        {
          id: 'scene-1',
          sceneNumber: '1',
          heading: 'INT. LIVING ROOM - NIGHT',
          intExt: 'INT',
          characterIds: ['char-alex', 'char-sarah'],
          breakdownItemIds: [],
        },
      ],
      breakdownItems: [{ id: 'bd-1', category: 'prop', name: 'Ledger' }],
    } as Partial<Project>,
  );
};

// ---------------------------------------------------------------------------
// 2. Concert — no script at all. Cast reaches the sheet through the plan.
// ---------------------------------------------------------------------------

const CONCERT_PEOPLE: Person[] = [
  { id: 'p-singer', displayName: 'Mira Anand', kind: 'cast', role: 'Lead vocal' },
  { id: 'p-drummer', displayName: 'Kofi Mensah', kind: 'cast', role: 'Drums' },
  { id: 'p-le', displayName: 'Petra Nowak', kind: 'crew', department: 'Lighting', role: 'Lighting Designer' },
  { id: 'p-foh', displayName: 'Dan Whitfield', kind: 'crew', department: 'Sound', role: 'FOH Engineer' },
];

const CONCERT_POWER: PowerPlan = {
  sources: [
    { id: 'src-1', name: 'Stage left distro', kind: 'three_phase_400v_63a', voltageV: 230, phases: 3, ampsPerPhaseA: 63 },
  ],
  circuits: [
    { id: 'cir-1', name: 'LX 1', sourceId: 'src-1', maxAmperesA: 16, consumerIds: ['con-1'], phaseLeg: 1 },
    { id: 'cir-2', name: 'LX 2', sourceId: 'src-1', maxAmperesA: 16, consumerIds: ['con-2'], phaseLeg: 2 },
  ],
  consumers: [
    { id: 'con-1', name: 'Wash bar SL', quantity: 6, powerWattsOverride: 200, circuitId: 'cir-1' },
    { id: 'con-2', name: 'Wash bar SR', quantity: 6, powerWattsOverride: 200, circuitId: 'cir-2' },
  ],
}

/**
 * Concert: the script-optional path. There is no screenplay, no scene, no
 * character — the people on the sheet have to be reached through the setup the
 * day schedules. Every derivation that starts from `scriptScenes` must degrade
 * to something honest here rather than to an empty document.
 */
export const concertFixture = (): Project => {
  const singer: ActorElement = {
    id: 'el-singer',
    type: 'actor',
    name: 'Lead vocal',
    characterLetter: 'V',
    color: '#f59e0b',
    x: 400,
    y: 200,
    rotation: 90,
    isStanding: true,
    path: [
      { id: 'wp-1', x: 400, y: 200, beat: 1 },
      { id: 'wp-2', x: 620, y: 260, beat: 2 },
    ],
  };

  const wash: LightElement = {
    id: 'el-wash',
    type: 'light',
    name: 'Wash bar SL',
    fixtureType: 'par_can',
    colorTemp: 0,
    rgbColor: '#ff0055',
    intensity: 80,
    beamAngle: 30,
    throwDistance: 400,
    x: 240,
    y: 120,
    rotation: 45,
    dmxUniverse: 1,
    dmxAddress: 1,
    dmxChannelCount: 8,
  };

  const dmxRun: CableElement = {
    id: 'el-dmx',
    type: 'cable',
    name: 'DMX to LX1',
    x: 200,
    y: 600,
    x2: 240,
    y2: 120,
    rotation: 0,
    cableType: 'dmx',
    fromLabel: 'Console',
    toLabel: 'LX 1',
    path: [{ id: 'cp-1', x: 200, y: 380 }],
  } as unknown as CableElement;

  const days: ProductionDay[] = [
    {
      id: 'c-day-1',
      name: 'Show day',
      date: '2026-09-20',
      crewCall: '08:00',
      plannedWrap: '01:00',
      scheduleBlockIds: ['c-blk-1', 'c-blk-2', 'c-blk-3', 'c-blk-4'],
    },
  ];
  // NOTE: setup and cue strips — no `scene` strip anywhere in this fixture.
  const blocks: ScheduleBlock[] = [
    { id: 'c-blk-1', kind: 'manual', label: 'Load in', manualType: 'load_in', estimatedMinutes: 240 },
    { id: 'c-blk-2', kind: 'setup', setupId: 'c-setup-1', estimatedMinutes: 120 },
    { id: 'c-blk-3', kind: 'cue', cueId: 'cue-1', estimatedMinutes: 90 },
    { id: 'c-blk-4', kind: 'manual', label: 'Strike', manualType: 'strike', estimatedMinutes: 120 },
  ];

  return project(
    'fixture-concert',
    'Concert fixture',
    [
      setup('c-setup-1', 'Main stage', {
        location: 'Arena — main stage',
        elements: [singer, wash, dmxRun, camera('c-cam-1', 'A', 400, 700)],
        shots: [shot('c-shot-1', '1', 'Wide on stage')],
      }),
    ],
    {
      people: CONCERT_PEOPLE,
      productionDays: days,
      scheduleBlocks: blocks,
      powerPlan: CONCERT_POWER,
      runOfShowCues: [
        { id: 'cue-1', label: 'Song 1 — Opener', order: 1, plannedDurationSeconds: 240 },
        { id: 'cue-2', label: 'Song 2', order: 2, plannedDurationSeconds: 210 },
      ],
      // Deliberately absent: scriptLines, scriptScenes, characters,
      // castAssignments, breakdownItems.
    } as Partial<Project>,
  );
};

// ---------------------------------------------------------------------------
// 3. Broadcast — cameras, signal paths, no screenplay.
// ---------------------------------------------------------------------------

const BROADCAST_PEOPLE: Person[] = [
  { id: 'b-dir', displayName: 'Ana Ruiz', kind: 'crew', department: 'Production', role: 'Director' },
  { id: 'b-vis', displayName: 'Sam Okoro', kind: 'crew', department: 'Production', role: 'Vision Mixer' },
  { id: 'b-cam1', displayName: 'Lena Fischer', kind: 'crew', department: 'Camera', role: 'Camera Operator' },
];

/**
 * Broadcast: several cameras with signal paths back to a gallery, scheduled by
 * segment rather than by scene. Exercises the cable/signal side with no
 * narrative structure anywhere in the project.
 */
export const broadcastFixture = (): Project => {
  const cameras = [
    camera('b-cam-a', 'A', 200, 500, { rigType: 'Broadcast Pedestal' }),
    camera('b-cam-b', 'B', 400, 520, { rigType: 'Broadcast Pedestal' }),
    camera('b-cam-c', 'C', 600, 500, { rigType: 'Jib / Crane' }),
  ];

  const sdiRuns: CableElement[] = cameras.map((cam, index) => ({
    id: `b-sdi-${index}`,
    type: 'cable',
    name: `SDI ${cam.cameraLabel}`,
    x: cam.x,
    y: cam.y,
    x2: 800,
    y2: 700,
    rotation: 0,
    cableType: 'sdi',
    fromLabel: `CAM ${cam.cameraLabel}`,
    toLabel: 'CCU',
    fromElementId: cam.id,
  } as unknown as CableElement));

  const days: ProductionDay[] = [
    {
      id: 'b-day-1',
      name: 'Transmission day',
      date: '2026-10-02',
      crewCall: '06:00',
      scheduleBlockIds: ['b-blk-1', 'b-blk-2', 'b-blk-3'],
    },
  ];
  const blocks: ScheduleBlock[] = [
    { id: 'b-blk-1', kind: 'segment', segmentId: 'seg-1', estimatedMinutes: 30 },
    { id: 'b-blk-2', kind: 'segment', segmentId: 'seg-2', estimatedMinutes: 45 },
    { id: 'b-blk-3', kind: 'shots', shotIds: ['b-shot-1'], estimatedMinutes: 20 },
  ];

  return project(
    'fixture-broadcast',
    'Broadcast fixture',
    [
      setup('b-setup-1', 'Studio 3', {
        location: 'Studio 3',
        elements: [...cameras, ...sdiRuns],
        shots: [shot('b-shot-1', '1', 'Presenter two-shot')],
      }),
    ],
    {
      people: BROADCAST_PEOPLE,
      productionDays: days,
      scheduleBlocks: blocks,
      productionSegments: [
        { id: 'seg-1', name: 'Opening titles', kind: 'sequence', plannedDurationSeconds: 90 },
        { id: 'seg-2', name: 'Interview', kind: 'interview', plannedDurationSeconds: 600 },
      ],
    } as Partial<Project>,
  );
};

// ---------------------------------------------------------------------------
// 4. Floor plan only — the scenario the plan says must always work.
// ---------------------------------------------------------------------------

/**
 * A bare apartment plan: walls, furniture, one hand-drawn annotation. No
 * script, no schedule, no people, no shots, no account, no server.
 *
 * Plan §44: "This scenario must always remain supported." Every derivation has
 * to survive a project with nothing but geometry in it, and every report has to
 * say so plainly rather than crash or render a blank document.
 */
export const floorPlanOnlyFixture = (): Project =>
  project('fixture-floorplan', 'Apartment plan', [
    setup('f-setup-1', 'Apartment', {
      location: 'Flat 4B',
      elements: [
        { id: 'f-wall-n', type: 'wall', name: 'North', x: 100, y: 100, x2: 700, y2: 100, thickness: 12, rotation: 0 },
        { id: 'f-wall-e', type: 'wall', name: 'East', x: 700, y: 100, x2: 700, y2: 500, thickness: 12, rotation: 0 },
        { id: 'f-wall-s', type: 'wall', name: 'South', x: 100, y: 500, x2: 700, y2: 500, thickness: 12, rotation: 0 },
        { id: 'f-wall-w', type: 'wall', name: 'West', x: 100, y: 100, x2: 100, y2: 500, thickness: 12, rotation: 0 },
        { id: 'f-door', type: 'door', name: 'Front door', x: 100, y: 440, rotation: 0, width: 60, swingAngle: 90, swingDirection: 'left' },
        { id: 'f-sofa', type: 'prop', name: 'Sofa', propType: 'sofa', x: 260, y: 200, rotation: 0, width: 180, height: 80, color: '#64748b' },
        { id: 'f-table', type: 'prop', name: 'Coffee table', propType: 'table_coffee', x: 280, y: 320, rotation: 0, width: 110, height: 60, color: '#78716c' },
        {
          id: 'f-ink',
          type: 'stroke',
          name: 'Note',
          x: 480,
          y: 300,
          rotation: 0,
          points: [
            { x: 480, y: 300 },
            { x: 540, y: 330 },
            { x: 600, y: 300 },
          ],
          strokeColor: '#ef4444',
          strokeWidth: 3,
        },
      ] as SceneSetup['elements'],
      shots: [],
    }),
  ]);

/** Every scenario, for tests that must hold across all four. */
export const allScenarioFixtures = (): Array<{ label: string; project: Project }> => [
  { label: 'narrative', project: narrativeFixture() },
  { label: 'concert', project: concertFixture() },
  { label: 'broadcast', project: broadcastFixture() },
  { label: 'floor plan only', project: floorPlanOnlyFixture() },
];
