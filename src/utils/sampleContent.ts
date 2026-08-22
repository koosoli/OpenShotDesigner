import { ScriptLine, ScriptMark } from '../types';
import { SAMPLE_SCREENPLAY } from '../constants/presets';
import { parseScreenplay } from '../components/script/screenplayParser';
import { createId } from '../domain/ids';
import type { Person } from '../domain/people';
import type {
  CoverageMatrix,
  ProductionCalendarEvent,
  ProductionDay,
  ScheduleBlock,
} from '../domain/scheduling';

/**
 * The screenplay that ships with the example scenes, and the linings that tie
 * it to their shots. Ranges are found by their text rather than by line number,
 * so editing the sample screenplay can never silently mis-line it.
 */

export const parseSampleScreenplay = (): ScriptLine[] =>
  parseScreenplay(SAMPLE_SCREENPLAY, 'Sample scene.fountain');

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
    from: 'I was having a smoke',
    to: 'Marcus says nothing',
    label: '2/1',
    description: 'CU Marcus',
    color: '#0284c7',
  },
  {
    templateId: 'setup-noir-interrogation',
    shotId: 'shot-2b',
    from: 'Miller stands',
    to: 'holding the door',
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

export { SAMPLE_SCREENPLAY };

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
  const people: Person[] = [
    { id: createId('person'), displayName: 'Mara Vogel', kind: 'crew', department: 'Directing', role: 'Director', phone: '+49 170 555 0101', email: 'mara@lanternsample.example' },
    { id: createId('person'), displayName: 'Jonas Feld', kind: 'crew', department: 'Camera', role: 'Director of Photography', phone: '+49 170 555 0102', email: 'jonas@lanternsample.example' },
    { id: createId('person'), displayName: 'Priya Anand', kind: 'crew', department: 'Production', role: '1st Assistant Director', phone: '+49 170 555 0103', email: 'priya@lanternsample.example' },
    { id: createId('person'), displayName: 'Tom Reilly', kind: 'crew', department: 'Lighting', role: 'Gaffer', phone: '+49 170 555 0104' },
    { id: createId('person'), displayName: 'Alex Kim', kind: 'crew', department: 'Sound', role: 'Sound Mixer', phone: '+49 170 555 0105' },
    { id: createId('person'), displayName: 'Alex Hunter', kind: 'cast', role: 'Lead — "Sarah"', phone: '+49 171 555 0201', email: 'alex.hunter@casting.example' },
    { id: createId('person'), displayName: 'Noah Brecht', kind: 'cast', role: 'Lead — "Marcus"', phone: '+49 171 555 0202' },
  ];

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
      [rowCoverage]: { [camA]: 'OTS Marcus', [camB]: 'OTS Sarah', [camC]: 'Insert: tape recorder' },
      [rowCloseups]: { [camB]: 'MCU Marcus', [camC]: 'MCU Sarah' },
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
