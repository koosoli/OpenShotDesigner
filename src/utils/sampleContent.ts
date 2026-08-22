import { Project, ScriptLine, ScriptMark } from '../types';
import {
  SAMPLE_DIALOGUE_SCREENPLAY,
  SAMPLE_NOIR_SCREENPLAY,
  SAMPLE_SCREENPLAY,
} from '../constants/presets';
import { parseScreenplay } from '../components/script/screenplayParser';
import { createId } from '../domain/ids';
import type { CastAssignment, Person } from '../domain/people';
import type { Character } from '../domain/script';
import type { PowerCircuit, PowerConsumer, PowerPlan, PowerSource } from '../domain/power';
import type { RiggingItem, SuspendedLoad, TrussElement, TrussProfile } from '../domain/rigging';
import type { Location } from '../domain/locations';
import type { LogisticsContainer, PackedItem } from '../domain/logistics';
import type { MoodBoard, MoodBoardCard, MoodBoardSection } from '../domain/moodboard';
import type { Task, TaskBoard, TaskColumn, TaskPriority } from '../domain/tasks';
import type {
  CoverageMatrix,
  ProductionCalendarEvent,
  ProductionDay,
  RunOfShowCue,
  ScheduleBlock,
} from '../domain/scheduling';

/**
 * The screenplay that ships with the example scenes, and the linings that tie
 * it to their shots. Ranges are found by their text rather than by line number,
 * so editing the sample screenplay can never silently mis-line it.
 */

/**
 * Which bundled screenplay to parse: one template's own script or both
 * scenes concatenated (the combined default keeps existing consumers working).
 */
export type SampleScreenplayVariant = 'dialogue' | 'noir' | 'full';

const SAMPLE_SCREENPLAY_BY_VARIANT: Record<SampleScreenplayVariant, string> = {
  dialogue: SAMPLE_DIALOGUE_SCREENPLAY,
  noir: SAMPLE_NOIR_SCREENPLAY,
  full: SAMPLE_SCREENPLAY,
};

export const parseSampleScreenplay = (
  which: SampleScreenplayVariant = 'full'
): ScriptLine[] => parseScreenplay(SAMPLE_SCREENPLAY_BY_VARIANT[which], 'Sample scene.fountain');

interface SampleLining {
  /** Template setup this lining belongs to. */
  templateId: string;
  /** Shot id as it appears in SAMPLE_SCENES. */
  shotId: string;
  from: string;
  to: string;
  label: string;
  description: string;
  color: string;
}

const SAMPLE_LININGS: SampleLining[] = [
  {
    templateId: 'setup-dialogue-classic',
    shotId: 'shot-1a',
    from: 'Rain on the window',
    to: 'She leaves.',
    label: '1/1',
    description: 'Master',
    color: '#0284c7',
  },
  {
    templateId: 'setup-dialogue-classic',
    shotId: 'shot-1b',
    from: 'You want to tell me',
    to: 'walk out of a building',
    label: '1/2',
    description: 'OTS Alex',
    color: '#dc2626',
  },
  {
    templateId: 'setup-dialogue-classic',
    shotId: 'shot-1c',
    from: "I don't know what",
    to: 'Ask your brother',
    label: '1/3',
    description: 'OTS Sarah, push in',
    color: '#16a34a',
  },
  {
    templateId: 'setup-noir-interrogation',
    shotId: 'shot-2a',
    from: 'A woman died in that stairwell',
    to: 'You had nothing an hour ago',
    label: '2/1',
    description: 'CU Suspect',
    color: '#0284c7',
  },
  {
    templateId: 'setup-noir-interrogation',
    shotId: 'shot-2b',
    from: 'Twelve minutes',
    to: 'So I broke a rule',
    label: '2/2',
    description: 'Two-shot',
    color: '#dc2626',
  },
];

/**
 * Linings for one template scene against a parsed copy of the sample
 * screenplay. `mapShotId` lets a caller that re-ids the cloned shots point the
 * linings at the new ids.
 */
export const sampleMarksFor = (
  templateId: string,
  lines: ScriptLine[],
  sceneNumber: string,
  mapShotId: (shotId: string) => string | undefined = (id) => id
): ScriptMark[] => {
  const idOf = (needle: string) => lines.find((line) => line.text.startsWith(needle))?.id;

  return SAMPLE_LININGS.filter((lining) => lining.templateId === templateId)
    .map((lining, index) => {
      const startLineId = idOf(lining.from);
      const endLineId = idOf(lining.to);
      const shotId = mapShotId(lining.shotId);
      if (!startLineId || !endLineId || !shotId) return null;
      return {
        id: `sample-mark-${templateId}-${index}-${Date.now().toString(36)}`,
        shotId,
        startLineId,
        endLineId,
        label: lining.label,
        description: lining.description,
        color: lining.color,
        sceneNumber,
      } as ScriptMark;
    })
    .filter((mark): mark is ScriptMark => !!mark);
};

export { SAMPLE_DIALOGUE_SCREENPLAY, SAMPLE_NOIR_SCREENPLAY, SAMPLE_SCREENPLAY };

/**
 * Example scheduling data for template projects: shoot days with strips on the
 * board, calendar lines on the timeline, populated call-sheet details and a
 * coverage matrix — so every schedule tab demonstrates how it works (plan §42:
 * a feature that renders empty teaches nothing). References the stable
 * SAMPLE_SCENES template ids; entity ids are generated fresh per project.
 */
export interface SampleScheduleMeta {
  people: Person[];
  productionDays: ProductionDay[];
  scheduleBlocks: ScheduleBlock[];
  productionCalendarEvents: ProductionCalendarEvent[];
  coverageMatrix: CoverageMatrix;
  productionCompany?: string;
  productionCompanyInfo?: {
    address?: string;
    phone?: string;
    email?: string;
    website?: string;
  };
}

/** ISO date `offset` days from today, local time. */
const isoFromToday = (offset: number): string => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

export const sampleScheduleMeta = (): SampleScheduleMeta => {
  // Departments use the canonical PRODUCTION_DEPARTMENTS names so the crew list
  // groups them, and the crew roles use the canonical KEY_CREW_ROLES titles so
  // the Key crew block on the Crew page resolves every head.
  const people: Person[] = [
    { id: createId('person'), displayName: 'Mara Vogel', kind: 'crew', department: 'Direction', role: 'Director', phone: '+49 170 555 0101', email: 'mara@lanternsample.example' },
    { id: createId('person'), displayName: 'Jonas Feld', kind: 'crew', department: 'Camera', role: 'Director of Photography', phone: '+49 170 555 0102', email: 'jonas@lanternsample.example' },
    { id: createId('person'), displayName: 'Priya Anand', kind: 'crew', department: 'Direction', role: '1st Assistant Director', phone: '+49 170 555 0103', email: 'priya@lanternsample.example' },
    { id: createId('person'), displayName: 'Elif Kaya', kind: 'crew', department: 'Production', role: 'Producer', phone: '+49 170 555 0106', email: 'elif@lanternsample.example' },
    { id: createId('person'), displayName: 'Tom Reilly', kind: 'crew', department: 'Lighting / Electric', role: 'Gaffer', phone: '+49 170 555 0104' },
    { id: createId('person'), displayName: 'Dana Osei', kind: 'crew', department: 'Grip', role: 'Key Grip', phone: '+49 170 555 0107' },
    { id: createId('person'), displayName: 'Alex Kim', kind: 'crew', department: 'Sound', role: 'Production Sound Mixer', phone: '+49 170 555 0105' },
    { id: createId('person'), displayName: 'Ruth Adeyemi', kind: 'crew', department: 'Direction', role: 'Script Supervisor', phone: '+49 170 555 0108' },
    { id: createId('person'), displayName: 'Alex Hunter', kind: 'cast', department: 'Cast', role: 'Lead — "Sarah"', phone: '+49 171 555 0201', email: 'alex.hunter@casting.example' },
    { id: createId('person'), displayName: 'Marco Lenz', kind: 'cast', department: 'Cast', role: 'Lead — "Alex"', phone: '+49 171 555 0203', email: 'marco.lenz@casting.example' },
    { id: createId('person'), displayName: 'Noah Brecht', kind: 'cast', department: 'Cast', role: 'Lead — "Suspect"', phone: '+49 171 555 0202', address: 'Hamburg (travelling in)', hotelName: 'Hotel Astoria', hotelAddress: 'Kohlfurter Strasse 8, Berlin', hotelCheckIn: isoFromToday(6), hotelCheckOut: isoFromToday(9) },
    { id: createId('person'), displayName: 'Yara Solis', kind: 'cast', department: 'Cast', role: 'Lead — "Detective"', phone: '+49 171 555 0204', address: 'Munich (travelling in)', hotelName: 'Hotel Astoria', hotelAddress: 'Kohlfurter Strasse 8, Berlin', hotelCheckIn: isoFromToday(6), hotelCheckOut: isoFromToday(9) },
  ];

  /** Sample-data helper: the actor cast as a given character name. */
  const castByRoleName = (characterName: string): string =>
    people.find((person) => (person.role ?? '').includes(`"${characterName}"`))?.id ?? '';

  const bRehearsal: ScheduleBlock = { id: createId('block'), kind: 'manual', label: 'Blocking rehearsal', manualType: 'rehearsal', estimatedMinutes: 30 };
  const bScene1: ScheduleBlock = { id: createId('block'), kind: 'setup', setupId: 'setup-dialogue-classic', estimatedMinutes: 180 };
  const bPickups1: ScheduleBlock = { id: createId('block'), kind: 'shots', shotIds: ['shot-1c'], estimatedMinutes: 30 };
  const bLunch: ScheduleBlock = { id: createId('block'), kind: 'manual', label: 'Lunch', manualType: 'meal', estimatedMinutes: 45 };
  const bScene2: ScheduleBlock = { id: createId('block'), kind: 'setup', setupId: 'setup-noir-interrogation', estimatedMinutes: 150 };
  const bMove: ScheduleBlock = { id: createId('block'), kind: 'manual', label: 'Company move to studio', manualType: 'move', estimatedMinutes: 30 };
  const bPickups2: ScheduleBlock = { id: createId('block'), kind: 'shots', shotIds: ['shot-2b'], estimatedMinutes: 25 };

  const productionDays: ProductionDay[] = [
    {
      id: createId('day'),
      name: 'Day 1 — Diner dialogue',
      date: isoFromToday(7),
      crewCall: '09:00',
      plannedWrap: '18:00',
      callSheet: {
        type: 'shoot',
        parking: 'Crew lot behind the diner, gate code 4413',
        nearestHospital: 'St. Clare General, 2.1 km',
        weatherSummary: 'Clear, 21 °C, light wind',
        safetyNotes: 'Hot surfaces on the kitchen set — gloves required during resets.',
        generalNotes: 'Unit base at the diner. Catering next to the truck bay.',
      },
      scheduleBlockIds: [bRehearsal.id, bScene1.id, bPickups1.id, bLunch.id],
    },
    {
      id: createId('day'),
      name: 'Day 2 — Interrogation room',
      date: isoFromToday(8),
      crewCall: '08:30',
      plannedWrap: '17:30',
      callSheet: {
        type: 'shoot',
        parking: 'Studio underground, level -1',
        nearestHospital: 'Urban Medical Center, 4 km',
        weatherSummary: 'Overcast, 17 °C (interior day)',
        safetyNotes: 'Low-key lighting rig — mind cable runs in the dark.',
        generalNotes: 'Art department resets the room at lunch.',
        pickupNotes: 'Unit driver runs the hotel shuttle; crew van leaves the production office at 07:45.',
        pickups: [
          { id: createId('pickup'), personId: castByRoleName('Suspect'), time: '07:15', location: 'Hotel Astoria lobby', notes: 'Straight to make-up on arrival.' },
          { id: createId('pickup'), personId: castByRoleName('Detective'), time: '07:15', location: 'Hotel Astoria lobby' },
        ],
      },
      scheduleBlockIds: [bScene2.id, bMove.id, bPickups2.id],
    },
  ];

  const scheduleBlocks: ScheduleBlock[] = [bRehearsal, bScene1, bPickups1, bLunch, bScene2, bMove, bPickups2];

  const productionCalendarEvents: ProductionCalendarEvent[] = [
    { id: createId('event'), title: 'Prep & tech scout', startDate: isoFromToday(-4), endDate: isoFromToday(5), category: 'preproduction', status: 'in_progress', color: '#0ea5e9', notes: 'Location lock, set build, camera tests.' },
    { id: createId('event'), title: 'Principal photography', startDate: isoFromToday(7), endDate: isoFromToday(8), category: 'shoot', status: 'planned', color: '#059669' },
    { id: createId('event'), title: 'Post-production', startDate: isoFromToday(9), endDate: isoFromToday(28), category: 'post', status: 'planned', color: '#7c3aed' },
  ];

  const camA = 'Cam A';
  const camB = 'Cam B';
  const camC = 'Cam C';
  const rowMaster = createId('crow');
  const rowCoverage = createId('crow');
  const rowCloseups = createId('crow');
  const coverageMatrix: CoverageMatrix = {
    cameraIds: [camA, camB, camC],
    rowKeys: [rowMaster, rowCoverage, rowCloseups],
    rowLabels: {
      [rowMaster]: 'Blocking & master',
      [rowCoverage]: 'Dialogue coverage',
      [rowCloseups]: 'Reaction close-ups',
    },
    cells: {
      [rowMaster]: { [camA]: 'Wide master', [camB]: 'L-R over-shoulder' },
      [rowCoverage]: { [camA]: 'OTS Suspect', [camB]: 'OTS Sarah', [camC]: 'Insert: tape recorder' },
      [rowCloseups]: { [camB]: 'MCU Suspect', [camC]: 'MCU Sarah' },
    },
  };

  return {
    people,
    productionDays,
    scheduleBlocks,
    productionCalendarEvents,
    coverageMatrix,
    productionCompany: 'Lantern Sample Pictures',
    productionCompanyInfo: {
      address: '12 Backlot Avenue, Berlin',
      phone: '+49 30 555 0143',
      email: 'unit@lanternsample.example',
      website: 'lanternsample.example',
    },
  };
};

/**
 * Example data for the remaining module pages of a template project:
 * locations, run-of-show cues, the task board, mood boards and logistics.
 * Ships alongside `sampleScheduleMeta` so every page demonstrates how it works
 * (plan §42: a feature that renders empty teaches nothing). Takes the sample
 * people so tasks can show real assignees; ids are generated fresh per project.
 */
export interface SamplePlanningMeta {
  locations: Location[];
  runOfShowCues: RunOfShowCue[];
  taskBoards: TaskBoard[];
  tasks: Task[];
  moodBoards: MoodBoard[];
  logisticsContainers: LogisticsContainer[];
  packedItems: PackedItem[];
}

const crewIdsByRole = (people: Person[], role: string): string[] => {
  const id = people.find((p) => p.kind === 'crew' && p.role === role)?.id;
  return id ? [id] : [];
};

const isoTimestampDaysAgo = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

export const samplePlanningMeta = (people: Person[]): SamplePlanningMeta => {
  const locations: Location[] = [
    {
      id: createId('loc'),
      name: 'Riverside Diner',
      aliases: ['Day 1 diner'],
      type: 'location',
      address: '14 Riverside Promenade, Berlin',
      lat: 52.4979,
      lng: 13.4372,
      notes: 'Shoot after closing. Window booth by the north window; the practical neon sign stays on. Unit base in the rear lot (see Day 1 call sheet).',
      referenceAssetIds: [],
    },
    {
      id: createId('loc'),
      name: 'Kreuzberg Studio, Stage 2',
      type: 'studio',
      address: 'Kohlfurter Strasse 41, Berlin',
      lat: 52.4966,
      lng: 13.4189,
      notes: 'Interrogation-room set for Day 2. Full blackout available, rigging grid at 6 m, dimmer room next to the loading dock.',
      referenceAssetIds: [],
    },
    {
      id: createId('loc'),
      name: 'Lantern Sample Pictures — production office',
      type: 'location',
      address: '12 Backlot Avenue, Berlin',
      lat: 52.5200,
      lng: 13.4050,
      notes: 'Production office and paperwork hub. Same address as the company contact on the call sheets.',
      referenceAssetIds: [],
    },
  ];

  const runOfShowCues: RunOfShowCue[] = [
    { id: createId('cue'), label: 'Welcome & cold open', plannedStart: '19:00', plannedDurationSeconds: 120, order: 0, lightingNotes: 'House half; stage wash to 30%.', cameraNotes: 'Wide on the crane, then a single on the host.', audioNotes: 'Music bed under the welcome VO.' },
    { id: createId('cue'), label: 'Interview: Sarah’s story', plannedDurationSeconds: 600, order: 1, cameraNotes: 'Two-shot to open, then slow push to MCU.', audioNotes: 'Lavaliers live from the top; handheld as backup.', stageNotes: 'Two chairs center, tape-recorder table camera-right.' },
    { id: createId('cue'), label: 'Live demo: the tape recorder', plannedDurationSeconds: 300, order: 2, cameraNotes: 'Cut to the insert cam on the close-up monitor.', stageNotes: 'Spare reels and batteries standing by in the prop drawer.', productionNotes: 'Host walks the demo; no presenter swap mid-cue.' },
    { id: createId('cue'), label: 'Guest Q&A', plannedDurationSeconds: 480, order: 3, audioNotes: 'Two handhelds from opposite aisles; runner relays questions.', productionNotes: 'Hard out at 20:20 regardless of queue length.' },
    { id: createId('cue'), label: 'Outro & thank-yous', plannedDurationSeconds: 180, order: 4, cameraNotes: 'Slow pull back to full stage.', videoNotes: 'Roll end credits over black.' },
  ];

  const column = (title: string, order: number, isDone?: boolean): TaskColumn => ({
    id: createId('column'),
    title,
    order,
    ...(isDone ? { isDone: true } : {}),
  });
  const colBacklog = column('Backlog', 0);
  const colTodo = column('To do', 1);
  const colInProgress = column('In progress', 2);
  const colReview = column('Review', 3);
  const colDone = column('Done', 4, true);

  const taskBoards: TaskBoard[] = [
    {
      id: createId('board'),
      title: 'Production prep',
      columns: [colBacklog, colTodo, colInProgress, colReview, colDone],
    },
  ];

  const nowIso = new Date().toISOString();
  const task = (
    title: string,
    columnId: string,
    order: number,
    extra: {
      priority?: TaskPriority;
      dueDate?: string;
      labels?: string[];
      assigneeIds?: string[];
      description?: string;
      checklist?: Task['checklist'];
      completedAt?: string;
    },
  ): Task => ({
    id: createId('task'),
    boardId: taskBoards[0].id,
    columnId,
    title,
    order,
    createdAt: nowIso,
    assigneeIds: extra.assigneeIds ?? [],
    labels: extra.labels ?? [],
    checklist: extra.checklist ?? [],
    ...(extra.priority ? { priority: extra.priority } : {}),
    ...(extra.description ? { description: extra.description } : {}),
    ...(extra.dueDate ? { dueDate: extra.dueDate } : {}),
    ...(extra.completedAt ? { completedAt: extra.completedAt } : {}),
  });

  const tasks: Task[] = [
    task('Scout & lock the riverside diner', colDone.id, 0, {
      priority: 'high',
      dueDate: isoFromToday(-1),
      labels: ['locations'],
      assigneeIds: crewIdsByRole(people, '1st Assistant Director'),
      description: 'Booth confirmed with the owner; parking and load-in noted in the Day 1 call sheet.',
      completedAt: isoTimestampDaysAgo(0.5),
    }),
    task('Insurance paperwork', colInProgress.id, 0, {
      priority: 'urgent',
      dueDate: isoFromToday(1),
      labels: ['paperwork', 'blocked'],
      assigneeIds: crewIdsByRole(people, '1st Assistant Director'),
      description: 'Blocked: waiting on the broker for the studio certificate before Day 1.',
      checklist: [
        { id: createId('check'), text: 'Confirm equipment rider values', done: true },
        { id: createId('check'), text: 'Certificate of insurance for the studio', done: false },
        { id: createId('check'), text: 'Add the studio as additional insured', done: false },
      ],
    }),
    task('Camera tests for the interrogation look', colInProgress.id, 1, {
      priority: 'high',
      dueDate: isoFromToday(2),
      labels: ['camera'],
      assigneeIds: crewIdsByRole(people, 'Director of Photography'),
      description: 'Low-key single-source setup on Stage 2; compare hard blind slats vs. soft top light.',
    }),
    task('Order catering for Day 1', colTodo.id, 0, {
      priority: 'normal',
      dueDate: isoFromToday(4),
      labels: ['catering', 'day-1'],
      assigneeIds: crewIdsByRole(people, 'Gaffer'),
    }),
    task('Review camera-test selects', colReview.id, 0, {
      priority: 'normal',
      dueDate: isoFromToday(3),
      labels: ['camera', 'review'],
      assigneeIds: crewIdsByRole(people, 'Director'),
    }),
    task('Wrap gifts: collect quotes', colBacklog.id, 0, {
      priority: 'low',
      labels: ['wrap'],
    }),
  ];

  const moodBoards: MoodBoard[] = (() => {
    const section = (title: string, order: number): MoodBoardSection => ({ id: createId('section'), title, order });
    const colorLight = section('Colour & light', 0);
    const cameraDetails = section('Camera & details', 1);
    const card = (cardSectionId: string, order: number, cardTags: string[], extra: Partial<Pick<MoodBoardCard, 'caption' | 'colorNotes' | 'lensNotes' | 'lightingNotes' | 'notes'>>): MoodBoardCard => ({
      id: createId('card'),
      tags: cardTags,
      sectionId: cardSectionId,
      order,
      ...(extra.caption ? { caption: extra.caption } : {}),
      ...(extra.colorNotes ? { colorNotes: extra.colorNotes } : {}),
      ...(extra.lensNotes ? { lensNotes: extra.lensNotes } : {}),
      ...(extra.lightingNotes ? { lightingNotes: extra.lightingNotes } : {}),
      ...(extra.notes ? { notes: extra.notes } : {}),
    });
    return [
      {
        id: createId('board'),
        title: 'Look & feel',
        sections: [colorLight, cameraDetails],
        cards: [
          card(colorLight.id, 0, ['night', 'rain', 'neon'], {
            caption: 'Neon rain on glass',
            colorNotes: 'Teal against sodium orange.',
            lightingNotes: 'Practical neon signs only; wet down the street.',
          }),
          card(colorLight.id, 1, ['noir', 'low-key'], {
            caption: 'Interrogation room, single hard source',
            colorNotes: 'Near-monochrome, deep shadows.',
            lightingNotes: 'Hard key through venetian blinds; negative fill camera-left.',
          }),
          card(cameraDetails.id, 0, ['diner', 'dusk'], {
            caption: 'Diner window booth at dusk',
            colorNotes: 'Tungsten amber against blue hour.',
            lensNotes: '40 mm close focus; let the window flare.',
          }),
          card(cameraDetails.id, 1, ['props', 'insert'], {
            caption: 'Tape-recorder insert',
            lensNotes: '100 mm macro, shallow.',
            notes: 'Top light, slow rack to the reels.',
          }),
        ],
        collage: { mode: 'grid', columns: 2, showCaptions: true },
      },
    ];
  })();

  const camCase = createId('container');
  const lightCase = createId('container');
  const logisticsContainers: LogisticsContainer[] = [
    {
      id: camCase,
      kind: 'case',
      name: 'Camera case A',
      tareWeightKg: 4.2,
      maxPayloadKg: 15,
      usableVolumeLiters: 58,
      notes: 'Foam inserts for the body and the zoom set.',
    },
    {
      id: lightCase,
      kind: 'case',
      name: 'Lighting case B',
      tareWeightKg: 7.6,
      maxPayloadKg: 25,
      usableVolumeLiters: 112,
      notes: 'Stands ride in the lid compartment.',
    },
  ];

  const packedItems: PackedItem[] = [
    { id: createId('packed'), containerId: camCase, label: 'Camera body', quantity: 1, unitWeightKg: 1.35, packedVolumeLiters: 5.5 },
    { id: createId('packed'), containerId: camCase, label: 'Zoom lens set', quantity: 1, unitWeightKg: 2.9, packedVolumeLiters: 7 },
    { id: createId('packed'), containerId: camCase, label: 'Batteries', quantity: 4, unitWeightKg: 0.21 },
    { id: createId('packed'), containerId: camCase, label: 'Media cards', quantity: 6 },
    { id: createId('packed'), containerId: lightCase, label: 'LED panel', quantity: 2, unitWeightKg: 3.2, packedVolumeLiters: 13, volumeIsEstimate: true },
    { id: createId('packed'), containerId: lightCase, label: 'Light stands', quantity: 3, unitWeightKg: 1.1 },
    { id: createId('packed'), containerId: lightCase, label: 'Gel & diffusion kit', quantity: 1 },
  ];

  return {
    locations,
    runOfShowCues,
    taskBoards,
    tasks,
    moodBoards,
    logisticsContainers,
    packedItems,
  };
};

/**
 * Example technical data for a template project: the studio rig for Day 2 and
 * the distribution feeding it. Ships alongside {@link sampleScheduleMeta} and
 * {@link samplePlanningMeta} so the Rigging and Power pages demonstrate how
 * they work instead of opening empty (plan §42).
 *
 * Every figure is an explicit planning input — nothing is inferred from a model
 * name (rule 28) — and one consumer deliberately has NO wattage so the
 * "unknown is excluded, never counted as 0" behaviour is visible in the sample
 * (rule 13). Planning aid only, not an electrical or structural design
 * (rule 15).
 */
export interface SampleTechnicalMeta {
  trussProfiles: TrussProfile[];
  trussElements: TrussElement[];
  suspendedLoads: SuspendedLoad[];
  riggingItems: RiggingItem[];
  powerPlan: PowerPlan & { consumers: PowerConsumer[] };
}

export const sampleTechnicalMeta = (): SampleTechnicalMeta => {
  const boxProfile: TrussProfile = {
    id: createId('trussprofile'),
    manufacturer: 'Generic',
    model: '300 mm box truss, 3 m bay',
    geometry: 'box',
    lengthMm: 3000,
    widthMm: 300,
    heightMm: 300,
    selfWeightKg: 22,
    source: { provider: 'manual', version: 'sample data', license: 'example only' },
  };

  const gridUpstage: TrussElement = {
    id: createId('truss'),
    label: 'Grid A — upstage',
    profileId: boxProfile.id,
    x: 240,
    y: 180,
    rotation: 0,
  };
  const gridDownstage: TrussElement = {
    id: createId('truss'),
    label: 'Grid B — downstage',
    profileId: boxProfile.id,
    x: 240,
    y: 460,
    rotation: 0,
  };

  const suspendedLoads: SuspendedLoad[] = [
    { id: createId('load'), trussElementId: gridUpstage.id, label: 'LED panel + yoke', weightKg: 11.5, quantity: 2, source: 'manual' },
    { id: createId('load'), trussElementId: gridUpstage.id, label: 'Overhead diffusion frame', weightKg: 6, quantity: 1, source: 'manual' },
    { id: createId('load'), trussElementId: gridDownstage.id, label: 'Fresnel + safety bond', weightKg: 8.2, quantity: 2, source: 'manual' },
    // Weight unknown on purpose: the rig report must show it as unknown rather
    // than quietly treating the hang as weightless.
    { id: createId('load'), trussElementId: gridDownstage.id, label: 'Practical neon sign (weight TBC)', quantity: 1, source: 'unknown' },
  ];

  const riggingItems: RiggingItem[] = [
    { id: createId('rig'), kind: 'motor', trussElementId: gridUpstage.id, positionMm: 300, capacityKg: 250, label: 'Chain hoist SL' },
    { id: createId('rig'), kind: 'motor', trussElementId: gridUpstage.id, positionMm: 2700, capacityKg: 250, label: 'Chain hoist SR' },
    { id: createId('rig'), kind: 'hang_point', trussElementId: gridDownstage.id, positionMm: 500, label: 'Grid clamp — house steel' },
    { id: createId('rig'), kind: 'safety', trussElementId: gridDownstage.id, label: 'Safety bonds on every fixture', notes: 'Checked by the key grip before each shooting day.' },
  ];

  const distro: PowerSource = {
    id: createId('psrc'),
    name: 'Stage 2 distro (3-phase)',
    kind: 'three_phase_400v_63a',
    voltageV: 230,
    ampsPerPhaseA: 63,
    phases: 3,
    notes: 'Phase voltage is line-to-neutral; the 400 V figure is line-to-line.',
  };

  const circuitKey: PowerCircuit = { id: createId('pcirc'), name: 'C1 — key side', sourceId: distro.id, maxAmperesA: 16, consumerIds: [], phaseLeg: 1 };
  const circuitFill: PowerCircuit = { id: createId('pcirc'), name: 'C2 — fill & backlight', sourceId: distro.id, maxAmperesA: 16, consumerIds: [], phaseLeg: 2 };
  const circuitPractical: PowerCircuit = { id: createId('pcirc'), name: 'C3 — practicals & video village', sourceId: distro.id, maxAmperesA: 16, consumerIds: [], phaseLeg: 3 };

  const powerConsumers: PowerConsumer[] = [
    { id: createId('pcons'), name: 'LED panel — key', quantity: 1, powerWattsOverride: 1200, circuitId: circuitKey.id, trussElementId: gridUpstage.id, distroZone: 'Stage left' },
    { id: createId('pcons'), name: 'LED panel — soft top', quantity: 1, powerWattsOverride: 650, circuitId: circuitKey.id, trussElementId: gridUpstage.id, distroZone: 'Stage left' },
    { id: createId('pcons'), name: 'Fresnel — backlight', quantity: 2, powerWattsOverride: 1000, circuitId: circuitFill.id, trussElementId: gridDownstage.id, distroZone: 'Stage right' },
    { id: createId('pcons'), name: 'Practical table lamp', quantity: 1, powerWattsOverride: 60, circuitId: circuitPractical.id, distroZone: 'Floor' },
    { id: createId('pcons'), name: 'Video village (monitors + recorder)', quantity: 1, powerWattsOverride: 320, circuitId: circuitPractical.id, distroZone: 'Video village' },
    // No wattage on purpose — shows as "excluded from totals", never as 0 W.
    { id: createId('pcons'), name: 'Hired haze machine (draw TBC)', quantity: 1, circuitId: circuitPractical.id, distroZone: 'Floor' },
  ];

  return {
    trussProfiles: [boxProfile],
    trussElements: [gridUpstage, gridDownstage],
    suspendedLoads,
    riggingItems,
    powerPlan: {
      sources: [distro],
      circuits: [circuitKey, circuitFill, circuitPractical],
      consumers: powerConsumers,
    },
  };
};

/**
 * Cast the sample production: link each script character to the sample actor
 * playing them, matched by the character name quoted in the actor's role.
 * Characters the screenplay has but nobody is cast for simply stay uncast —
 * casting is never invented.
 */
export const sampleCastAssignments = (
  characters: readonly Character[],
  people: readonly Person[],
): CastAssignment[] => {
  const assignments: CastAssignment[] = [];
  for (const character of characters) {
    const name = character.canonicalName.trim().toLowerCase();
    const actor = people.find(
      (person) => person.kind === 'cast' && (person.role ?? '').toLowerCase().includes(`"${name}"`),
    );
    if (!actor) continue;
    assignments.push({ id: createId('cast'), characterId: character.id, personId: actor.id });
  }
  return assignments;
};

/**
 * Fill an EXISTING project with the example production data it is missing.
 *
 * The full example dataset only lands when a project is created from a
 * template. A project started empty — or created before a module existed — has
 * no way to see what the Schedule, Crew, Rigging or Power pages are for. This
 * builds the patch that fills those gaps.
 *
 * Strictly additive: a collection that already has anything in it is left
 * completely alone, and the returned patch only contains keys that were empty.
 * Nothing the user made is ever overwritten or merged into.
 */
export interface ExampleFillResult {
  /** Project patch to apply; empty when nothing was missing. */
  patch: Partial<Project>;
  /** Human-readable names of what was filled, for the confirmation message. */
  filled: string[];
}

/** A collection counts as present when it exists and holds at least one item. */
const hasItems = (value: unknown): boolean => Array.isArray(value) && value.length > 0;

export const buildExampleProductionFill = (project: Project): ExampleFillResult => {
  const schedule = sampleScheduleMeta();
  const planning = samplePlanningMeta(schedule.people);
  const technical = sampleTechnicalMeta();

  const patch: Partial<Project> = {};
  const filled: string[] = [];

  const fillArray = <K extends keyof Project>(key: K, value: Project[K], label: string): void => {
    if (hasItems(project[key])) return;
    patch[key] = value;
    if (!filled.includes(label)) filled.push(label);
  };

  // People first: tasks and pick-ups reference them, so they must land together
  // or not at all — a task assigned to a person who was not added would dangle.
  const peopleMissing = !hasItems(project.people);
  if (peopleMissing) {
    patch.people = schedule.people;
    filled.push('crew & cast');
  }

  fillArray('productionDays', schedule.productionDays, 'shooting days & call sheets');
  fillArray('scheduleBlocks', schedule.scheduleBlocks, 'shooting days & call sheets');
  fillArray('productionCalendarEvents', schedule.productionCalendarEvents, 'production calendar');
  fillArray('locations', planning.locations, 'locations');
  fillArray('runOfShowCues', planning.runOfShowCues, 'run of show');
  fillArray('taskBoards', planning.taskBoards, 'task board');
  fillArray('tasks', planning.tasks, 'task board');
  fillArray('moodBoards', planning.moodBoards, 'mood board');
  fillArray('logisticsContainers', planning.logisticsContainers, 'logistics');
  fillArray('packedItems', planning.packedItems, 'logistics');
  fillArray('trussProfiles', technical.trussProfiles, 'rigging');
  fillArray('trussElements', technical.trussElements, 'rigging');
  fillArray('suspendedLoads', technical.suspendedLoads, 'rigging');
  fillArray('riggingItems', technical.riggingItems, 'rigging');

  // Tasks and pick-ups only make sense with the people they reference. When the
  // project already had its own crew, drop the parts that point at ours.
  if (!peopleMissing) {
    if (patch.tasks) patch.tasks = patch.tasks.map((task) => ({ ...task, assigneeIds: [] }));
    if (patch.productionDays) {
      patch.productionDays = patch.productionDays.map((day) =>
        day.callSheet?.pickups
          ? { ...day, callSheet: { ...day.callSheet, pickups: undefined } }
          : day,
      );
    }
  }

  if (!project.coverageMatrix || project.coverageMatrix.rowKeys.length === 0) {
    patch.coverageMatrix = schedule.coverageMatrix;
    filled.push('coverage matrix');
  }

  if (!project.powerPlan || project.powerPlan.sources.length === 0) {
    patch.powerPlan = technical.powerPlan;
    filled.push('power plan');
  }

  return { patch, filled };
};
