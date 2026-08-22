/**
 * Printable stripboard / coverage data (plan §15, rule 4: no business logic in
 * components).
 *
 * The schedule workspace and the whole-plan exporter both need the same board:
 * the same strip labels, the same colours, the same day totals. Deriving it
 * here means the "complete package" export cannot drift away from what the
 * Schedule tab prints (rule 37: paperwork derives from canonical project data).
 *
 * Everything is optional-collection safe: a project with no screenplay, no
 * segments and no shooting days yields an empty board rather than throwing —
 * scheduling never requires a script (rule 1).
 */

import type { ScheduleBlock } from './types';
import type { CoverageMatrix } from './coverageMatrix';

/** The banner sub-kinds a manual strip can carry. */
export type ManualType = NonNullable<Extract<ScheduleBlock, { kind: 'manual' }>['manualType']>;

export interface StripboardLabelContext {
  sceneNames: Map<string, string>;
  setupNames: Map<string, string>;
  segmentNames: Map<string, string>;
  shotNames: Map<string, string>;
}

export const MANUAL_TYPE_LABELS: Record<ManualType, string> = {
  meal: 'Meal',
  move: 'Move',
  rehearsal: 'Rehearsal',
  load_in: 'Load In',
  strike: 'Strike',
  other: 'Other',
};

export const BLOCK_KIND_LABELS: Record<ScheduleBlock['kind'], string> = {
  scene: 'Scene',
  setup: 'Setup',
  segment: 'Segment',
  manual: 'Banner',
  shots: 'Shots',
  cue: 'Cue',
};

/** Strip colours by kind; banners are toned by their manual type. */
export const STRIP_PRINT_TONES: Record<string, string> = {
  scene: '#1e293b',
  setup: '#0f766e',
  segment: '#7c3aed',
  shots: '#b45309',
  cue: '#0369a1',
  meal: '#b91c1c',
  move: '#c2410c',
  rehearsal: '#4d7c0f',
  load_in: '#0f766e',
  strike: '#64748b',
  other: '#475569',
};

export const blockPrintTone = (block: ScheduleBlock): string =>
  block.kind === 'manual'
    ? STRIP_PRINT_TONES[block.manualType ?? 'other']
    : STRIP_PRINT_TONES[block.kind];

/**
 * Human label for a block, resolved against the project's optional
 * collections. An id that no longer resolves degrades to a short readable stub
 * instead of rendering a raw uuid or crashing the printout.
 */
export const blockLabel = (block: ScheduleBlock, ctx: StripboardLabelContext): string => {
  switch (block.kind) {
    case 'scene':
      return ctx.sceneNames.get(block.scriptSceneId) ?? `Scene ${block.scriptSceneId.slice(0, 6)}`;
    case 'setup':
      return ctx.setupNames.get(block.setupId) ?? `Setup ${block.setupId.slice(0, 6)}`;
    case 'segment':
      return ctx.segmentNames.get(block.segmentId) ?? `Segment ${block.segmentId.slice(0, 6)}`;
    case 'manual':
      return block.label || MANUAL_TYPE_LABELS[block.manualType ?? 'other'];
    case 'shots':
      return block.shotIds.length === 1
        ? ctx.shotNames.get(block.shotIds[0]) ?? 'Unresolved shot'
        : `${block.shotIds.length} shots · ${block.shotIds
            .map((id) => ctx.shotNames.get(id)?.split(' — ')[0])
            .filter(Boolean)
            .join(', ')}`;
    case 'cue':
      return `Cue ${block.cueId.slice(0, 6)}`;
    default:
      return 'Block';
  }
};

/** Minimal project shape the board needs — keeps this pure and testable. */
export interface StripboardProjectLike {
  scriptScenes?: Array<{ id: string; sceneNumber: string | number; heading: string }>;
  setups?: Array<{ id: string; name: string; shots?: Array<{ id: string; shotNumber: string | number; name: string }> }>;
  productionSegments?: Array<{ id: string; name: string }>;
  productionDays?: Array<{
    id: string;
    name: string;
    date?: string;
    crewCall?: string;
    plannedWrap?: string;
    scheduleBlockIds: string[];
  }>;
  scheduleBlocks?: ScheduleBlock[];
  coverageMatrix?: CoverageMatrix;
  runOfShowCues?: Array<{ id: string; label: string }>;
}

export const buildStripboardLabelContext = (
  project: StripboardProjectLike,
): StripboardLabelContext => {
  const sceneNames = new Map<string, string>();
  for (const scene of project.scriptScenes ?? []) {
    sceneNames.set(scene.id, `Scene ${scene.sceneNumber} — ${scene.heading}`);
  }
  const setupNames = new Map<string, string>();
  const shotNames = new Map<string, string>();
  for (const setup of project.setups ?? []) {
    setupNames.set(setup.id, setup.name || 'Setup');
    for (const shot of setup.shots ?? []) {
      shotNames.set(shot.id, `Shot ${shot.shotNumber} — ${shot.name}`);
    }
  }
  const segmentNames = new Map<string, string>();
  for (const segment of project.productionSegments ?? []) {
    segmentNames.set(segment.id, segment.name);
  }
  return { sceneNames, setupNames, segmentNames, shotNames };
};

export interface PrintableStripboardItem {
  label: string;
  kindLabel: string;
  minutes?: number;
  tone: string;
}

export interface PrintableStripboardDayData {
  id: string;
  name: string;
  date?: string;
  crewCall?: string;
  plannedWrap?: string;
  items: PrintableStripboardItem[];
  totalMinutes: number;
}

/**
 * The board exactly as it prints: days in order, each day's strips in their
 * stored order. Block ids that no longer exist are skipped rather than
 * rendering an empty strip.
 */
export const buildPrintableStripboardDays = (
  project: StripboardProjectLike,
  ctx: StripboardLabelContext = buildStripboardLabelContext(project),
): PrintableStripboardDayData[] => {
  const blocks = project.scheduleBlocks ?? [];
  const byId = new Map(blocks.map((block) => [block.id, block] as const));
  return (project.productionDays ?? []).map((day) => {
    const items = day.scheduleBlockIds
      .map((id) => byId.get(id))
      .filter((block): block is ScheduleBlock => Boolean(block))
      .map((block) => ({
        label: blockLabel(block, ctx),
        kindLabel: BLOCK_KIND_LABELS[block.kind],
        minutes: 'estimatedMinutes' in block ? block.estimatedMinutes : undefined,
        tone: blockPrintTone(block),
      }));
    return {
      id: day.id,
      name: day.name,
      date: day.date,
      crewCall: day.crewCall,
      plannedWrap: day.plannedWrap,
      items,
      totalMinutes: items.reduce((sum, item) => sum + (item.minutes ?? 0), 0),
    };
  });
};

export interface PrintableCoverageRowData {
  label: string;
  cells: string[];
}

/**
 * Coverage rows in matrix order. Rows whose cue was deleted keep their stored
 * cells but fall back to a readable stub label, so a printout never silently
 * drops planned coverage.
 */
export const buildPrintableCoverageRows = (
  project: StripboardProjectLike,
): PrintableCoverageRowData[] => {
  const matrix = project.coverageMatrix;
  if (!matrix) return [];
  const cues = project.runOfShowCues ?? [];
  const labelFor = (key: string): string =>
    matrix.rowLabels?.[key] ?? cues.find((cue) => cue.id === key)?.label ?? `Row ${key.slice(0, 6)}`;
  return matrix.rowKeys.map((key) => ({
    label: labelFor(key),
    cells: matrix.cameraIds.map((cameraId) => matrix.cells[key]?.[cameraId] ?? ''),
  }));
};
