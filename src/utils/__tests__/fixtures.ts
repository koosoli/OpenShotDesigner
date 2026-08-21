import type {
  ActorElement,
  AVScriptRow,
  BackgroundImage,
  CableElement,
  CameraElement,
  EquipmentItem,
  EquipmentPackageItem,
  GridSettings,
  Project,
  SceneSetup,
  ScriptLine,
  ScriptMark,
  Shot,
  Waypoint,
} from '../../types';

let counter = 0;

/** Deterministic unique-enough id for fixture entities (tests override ids explicitly when they care). */
export const nextId = (prefix: string): string => `${prefix}-fx-${++counter}`;

export const makeGridSettings = (overrides: Partial<GridSettings> = {}): GridSettings => ({
  size: 30,
  snap: true,
  showGrid: false,
  unit: 'm',
  pixelsPerUnit: 30,
  ...overrides,
});

export const makeWaypoint = (overrides: Partial<Waypoint> = {}): Waypoint => ({
  id: nextId('wp'),
  x: 0,
  y: 0,
  beat: 1,
  ...overrides,
});

export const makeActor = (overrides: Partial<ActorElement> = {}): ActorElement => ({
  id: nextId('actor'),
  type: 'actor',
  name: 'Actor',
  characterLetter: 'A',
  color: '#3b82f6',
  x: 100,
  y: 100,
  rotation: 0,
  isStanding: true,
  path: [],
  speechCues: [],
  ...overrides,
});

export const makeCamera = (overrides: Partial<CameraElement> = {}): CameraElement => ({
  id: nextId('cam'),
  type: 'camera',
  name: 'Camera A',
  cameraLabel: 'A',
  color: '#0284c7',
  x: 200,
  y: 200,
  rotation: 0,
  locked: false,
  visible: true,
  focalLength: 35,
  sensorFormat: 'Super35',
  fovAngle: 40,
  aspectRatio: '16:9',
  cameraHeight: 'Eye Level',
  rigType: 'Tripod',
  throwDistance: 210,
  path: [],
  ...overrides,
});

export const makeCable = (overrides: Partial<CableElement> = {}): CableElement => ({
  id: nextId('cable'),
  type: 'cable',
  name: 'SDI run',
  x: 0,
  y: 0,
  rotation: 0,
  x2: 50,
  y2: 50,
  cableType: 'sdi_12g',
  fromLabel: 'CAM A',
  toLabel: 'CCU 1',
  path: [],
  ...overrides,
});

export const makeShot = (overrides: Partial<Shot> = {}): Shot => ({
  id: nextId('shot'),
  sceneNumber: '1',
  shotNumber: '1/1',
  name: 'Shot 1',
  cameraId: 'cam-a-fx-1',
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
  estDurationSeconds: 5,
  order: 1,
  ...overrides,
});

export const makeScriptLine = (overrides: Partial<ScriptLine> = {}): ScriptLine => ({
  id: nextId('line'),
  lineNumber: 1,
  text: 'A line of screenplay.',
  ...overrides,
});

export const makeScriptMark = (overrides: Partial<ScriptMark> = {}): ScriptMark => ({
  id: nextId('mark'),
  shotId: 'shot-a-fx-1',
  startLineId: 'line-a-fx-1',
  endLineId: 'line-a-fx-1',
  label: '1A',
  color: '#0284c7',
  ...overrides,
});

export const makeAVRow = (overrides: Partial<AVScriptRow> = {}): AVScriptRow => ({
  id: nextId('av'),
  shotNumber: '1',
  video: '',
  audio: '',
  ...overrides,
});

export const makePackageItem = (overrides: Partial<EquipmentPackageItem> = {}): EquipmentPackageItem => ({
  id: nextId('pkg'),
  category: 'camera',
  name: 'Battery',
  quantity: 1,
  ...overrides,
});

export const makeEquipmentItem = (overrides: Partial<EquipmentItem> = {}): EquipmentItem => ({
  id: nextId('eq'),
  category: 'camera',
  name: 'Camera rig',
  quantity: 1,
  ...overrides,
});

export const makeBackgroundImage = (overrides: Partial<BackgroundImage> = {}): BackgroundImage => ({
  id: nextId('bg'),
  url: 'data:image/png;base64,AAA',
  name: 'floorplan.png',
  x: 0,
  y: 0,
  width: 800,
  height: 450,
  opacity: 1,
  locked: false,
  visible: true,
  ...overrides,
});

export const makeSetup = (overrides: Partial<SceneSetup> = {}): SceneSetup => ({
  id: nextId('setup'),
  name: 'Setup 1',
  sceneNumber: '1',
  location: 'INT. LOCATION - DAY',
  timeOfDay: 'Day INT',
  elements: [],
  shots: [],
  currentBeat: 1,
  totalBeats: 1,
  aspectRatio: '16:9',
  gridSettings: makeGridSettings(),
  canvasScale: 1,
  canvasOffset: { x: 50, y: 50 },
  ...overrides,
});

export const makeProject = (
  setups?: SceneSetup[],
  overrides: Partial<Project> = {},
): Project => {
  const resolvedSetups = setups ?? [makeSetup()];
  return {
    id: nextId('proj'),
    title: 'Test Project',
    director: 'Nobody',
    cinematographer: '',
    date: '2026-01-01',
    setups: resolvedSetups,
    activeSetupId: resolvedSetups[0]?.id ?? '',
    ...overrides,
  };
};

/**
 * Small but fully consistent setup: every reference resolves, so validation
 * reports zero errors on it. Use as the base for clean fixtures.
 */
export const makeCleanSetup = (overrides: Partial<SceneSetup> = {}): SceneSetup => {
  const actor = makeActor({ id: 'clean-act-a', name: 'Alice', characterLetter: 'A' });
  const camera = makeCamera({ id: 'clean-cam-a', name: 'Camera A', associatedShotId: 'clean-shot-1' });
  const shot = makeShot({
    id: 'clean-shot-1',
    name: 'Shot 1',
    cameraId: 'clean-cam-a',
    subjectActorIds: ['clean-act-a'],
  });
  return makeSetup({ id: 'clean-setup', elements: [actor, camera], shots: [shot], ...overrides });
};

/**
 * Rich setup exercising every cloneable reference:
 * cameras with paths + associatedShotId + lookAtTargetId, actors with
 * lookAtTargetId and waypoints, a cable with path points, three shots with
 * storyboardFrames keyed by 'start' and a waypoint id, script lines/marks with
 * a wavy range, AV rows, custom equipment with package items and a background image.
 */
export const buildRichSetup = (): SceneSetup => {
  const actorA = makeActor({
    id: 'fx-act-a',
    name: 'Alice',
    characterLetter: 'A',
    lookAtTargetId: 'fx-cam-a',
    path: [makeWaypoint({ id: 'fx-wp-act-a-0', beat: 1 })],
    speechCues: [{ id: 'fx-speech-act-a-1', beat: 1, text: 'Hello there.' }],
  });
  const actorB = makeActor({
    id: 'fx-act-b',
    name: 'Bob',
    characterLetter: 'B',
    lookAtTargetId: 'fx-act-a',
  });
  const camA = makeCamera({
    id: 'fx-cam-a',
    name: 'Camera A',
    cameraLabel: 'A',
    associatedShotId: 'fx-shot-1',
    lookAtTargetId: 'fx-act-b',
    path: [makeWaypoint({ id: 'fx-wp-cam-a-1', x: 10, y: 10, beat: 2 })],
  });
  const camB = makeCamera({
    id: 'fx-cam-b',
    name: 'Camera B',
    cameraLabel: 'B',
    associatedShotId: 'fx-shot-3',
  });
  const cable = makeCable({
    id: 'fx-cable-1',
    path: [
      { id: 'fx-cpp-0', x: 1, y: 1 },
      { id: 'fx-cpp-1', x: 2, y: 2 },
    ],
  });

  const frames = {
    start: { image: 'data:image/png;base64,START', note: 'base frame' },
    'fx-wp-cam-a-1': { image: 'data:image/png;base64,KEY1' },
  };

  const shots: Shot[] = [
    makeShot({
      id: 'fx-shot-1',
      name: 'Wide',
      cameraId: 'fx-cam-a',
      subjectActorIds: ['fx-act-a'],
      scriptLineId: 'fx-line-2',
      storyboardFrames: { ...frames },
    }),
    makeShot({
      id: 'fx-shot-2',
      name: 'Two shot',
      shotNumber: '1/2',
      cameraId: 'fx-cam-a',
      subjectActorIds: ['fx-act-a', 'fx-act-b'],
      order: 2,
    }),
    makeShot({
      id: 'fx-shot-3',
      name: 'CU Bob',
      shotNumber: '1/3',
      cameraId: 'fx-cam-b',
      subjectActorIds: ['fx-act-b'],
      order: 3,
    }),
  ];

  const scriptLines: ScriptLine[] = [
    makeScriptLine({ id: 'fx-line-1', lineNumber: 1, text: 'INT. ROOM - DAY', linkedShotId: 'fx-shot-1' }),
    makeScriptLine({ id: 'fx-line-2', lineNumber: 2, text: 'Alice enters.' }),
    makeScriptLine({ id: 'fx-line-3', lineNumber: 3, text: 'They talk.' }),
  ];

  const scriptMarks: ScriptMark[] = [
    makeScriptMark({
      id: 'fx-mark-1',
      shotId: 'fx-shot-1',
      startLineId: 'fx-line-1',
      endLineId: 'fx-line-3',
      wavyStartLineId: 'fx-line-2',
      wavyEndLineId: 'fx-line-2',
      label: '1A',
    }),
  ];

  const avScriptRows: AVScriptRow[] = [
    makeAVRow({ id: 'fx-av-1', shotNumber: '1', video: 'Wide of room', audio: '', linkedShotId: 'fx-shot-1' }),
  ];

  const customEquipment: EquipmentItem[] = [
    makeEquipmentItem({
      id: 'fx-eq-1',
      name: 'Camera package',
      elementId: 'fx-cam-a',
      isPackage: true,
      packageItems: [makePackageItem({ id: 'fx-pkg-1', name: 'V-mount battery' })],
    }),
  ];

  return makeSetup({
    id: 'fx-setup-1',
    name: 'Rich Setup',
    elements: [actorA, actorB, camA, camB, cable],
    shots,
    scriptLines,
    scriptMarks,
    avScriptRows,
    customEquipment,
    backgroundImage: makeBackgroundImage({ id: 'fx-bg-1' }),
  });
};

/** Recursively collect every id-like string: `id` properties plus storyboardFrames keys ('start' excluded). */
export const collectIds = (value: unknown, out: Set<string> = new Set()): Set<string> => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectIds(item, out));
  } else if (value && typeof value === 'object') {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'id' && typeof val === 'string') {
        out.add(val);
      } else if (key === 'storyboardFrames' && val && typeof val === 'object') {
        Object.keys(val as Record<string, unknown>).forEach((slot) => {
          if (slot !== 'start') out.add(slot);
        });
        collectIds(val, out);
      } else {
        collectIds(val, out);
      }
    }
  }
  return out;
};

export const intersectIds = (a: Set<string>, b: Set<string>): string[] =>
  [...a].filter((id) => b.has(id));
