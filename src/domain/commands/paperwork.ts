/**
 * Production paperwork as commands: the day-out-of-days, character
 * highlighter colours and the Exhibit G performer time sheets.
 *
 * Each is a small write, but each deserves a readable entry in the change
 * log ("Mark ADA travel on Day 3") rather than "Update project metadata",
 * and the rules — one override per cell, one time sheet per day — belong
 * here rather than in the panels that call them.
 */
import type { Project } from '../../types';
import { setDoodOverride } from '../reports/dood';
import type { DoodManualStatus } from '../reports/dood';
import type { PerformerTimeReport } from '../reports/exhibitG';
import type { ProductionReportNotes } from '../reports/productionReport';
import { createId } from '../ids';
import { revisionColorAt } from '../script/revisionColors';
import type { CommandResult } from './types';
import { commandTimestamp } from './types';

export interface SetDoodCellInput {
  rowId: string;
  dayId: string;
  /** null returns the cell to what the schedule says. */
  status: DoodManualStatus | null;
  /** For the log line. */
  label?: string;
}

export const setDoodCellCommand = (project: Project, input: SetDoodCellInput): CommandResult => {
  if (!input.rowId || !input.dayId) throw new Error('setDoodCell: rowId and dayId are required.');
  const dayName = project.productionDays?.find((day) => day.id === input.dayId)?.name ?? 'day';
  return {
    project: { ...project, doodOverrides: setDoodOverride(project.doodOverrides, input.rowId, input.dayId, input.status) },
    meta: {
      type: 'setDoodCell',
      entityId: input.rowId,
      timestamp: commandTimestamp(),
      description: input.status
        ? `Mark ${input.label ?? 'DOOD cell'} ${input.status} on ${dayName}`
        : `Reset ${input.label ?? 'DOOD cell'} on ${dayName} to the schedule`,
    },
  };
};

export interface SetDoodDropAfterDaysInput {
  /** undefined = default (10). */
  days: number | undefined;
}

export const setDoodDropAfterDaysCommand = (project: Project, input: SetDoodDropAfterDaysInput): CommandResult => {
  const days = input.days !== undefined && Number.isFinite(input.days) && input.days >= 0 ? Math.round(input.days) : undefined;
  return {
    project: { ...project, doodDropAfterDays: days },
    meta: {
      type: 'setDoodDropAfterDays',
      timestamp: commandTimestamp(),
      description: days === 0 ? 'Turn DOOD drops off' : `Drop performers after ${days ?? 10} free days`,
    },
  };
};

export interface SetCharacterColorInput {
  characterId: string;
  color: string;
  /**
   * The catalog to write into when the project has not persisted one yet
   * (characters derived from the script only).
   */
  fallbackCharacters?: Project['characters'];
}

export const setCharacterColorCommand = (project: Project, input: SetCharacterColorInput): CommandResult => {
  if (!/^#[0-9a-f]{6}$/i.test(input.color)) throw new Error('setCharacterColor: color must be #rrggbb.');
  const catalog = project.characters?.length ? project.characters : input.fallbackCharacters ?? [];
  const character = catalog.find((candidate) => candidate.id === input.characterId);
  if (!character) throw new Error(`setCharacterColor: no character ${input.characterId}.`);
  return {
    project: {
      ...project,
      characters: catalog.map((candidate) => (candidate.id === input.characterId ? { ...candidate, color: input.color } : candidate)),
    },
    meta: {
      type: 'setCharacterColor',
      entityId: input.characterId,
      timestamp: commandTimestamp(),
      description: `Highlight ${character.canonicalName} in ${input.color}`,
    },
  };
};

export interface SetScriptRevisionColorInput {
  /** Colour index (0 = White, 1 = Blue …); undefined = follow imported revisions. */
  index: number | undefined;
}

export const setScriptRevisionColorCommand = (project: Project, input: SetScriptRevisionColorInput): CommandResult => {
  const index = input.index !== undefined && Number.isFinite(input.index) && input.index >= 0 ? Math.floor(input.index) : undefined;
  return {
    project: { ...project, scriptRevisionColor: index },
    meta: {
      type: 'setScriptRevisionColor',
      timestamp: commandTimestamp(),
      description: index === undefined ? 'Revision colour follows imported drafts' : `Set script revision colour to ${revisionColorAt(index).label}`,
    },
  };
};

export interface SetScriptPageLockInput {
  /** The frozen pagination, or undefined to unlock. */
  lock: Record<string, number> | undefined;
}

export const setScriptPageLockCommand = (project: Project, input: SetScriptPageLockInput): CommandResult => ({
  project: { ...project, scriptPageLock: input.lock },
  meta: {
    type: 'setScriptPageLock',
    timestamp: commandTimestamp(),
    description: input.lock ? 'Lock script pages' : 'Unlock script pages',
  },
});

export interface SetScreenplayLayoutInput {
  /** Merged into the current settings; a field set to undefined goes back to its default. */
  layout: Partial<NonNullable<Project['screenplayLayout']>>;
}

/** Paper and automatic (CONT'D) for the screenplay's pages. */
export const setScreenplayLayoutCommand = (project: Project, input: SetScreenplayLayoutInput): CommandResult => {
  const merged = { ...(project.screenplayLayout ?? {}), ...input.layout };
  const layout: NonNullable<Project['screenplayLayout']> = {};
  if (merged.paper === 'a4') layout.paper = 'a4';
  if (merged.autoContd === false) layout.autoContd = false;
  if (merged.format === 'multicam') layout.format = 'multicam';
  if (merged.sceneContinued === true) layout.sceneContinued = true;
  return {
    project: { ...project, screenplayLayout: Object.keys(layout).length > 0 ? layout : undefined },
    meta: {
      type: 'setScreenplayLayout',
      timestamp: commandTimestamp(),
      description: 'paper' in input.layout
        ? `Set screenplay paper to ${input.layout.paper === 'a4' ? 'A4' : 'US Letter'}`
        : 'format' in input.layout
          ? `Set screenplay format to ${input.layout.format === 'multicam' ? 'multi-camera' : 'feature'}`
          : 'sceneContinued' in input.layout
            ? `Turn scene CONTINUED marks ${merged.sceneContinued ? 'on' : 'off'}`
            : `Turn automatic (CONT'D) ${merged.autoContd === false ? 'off' : 'on'}`,
    },
  };
};

export interface UpdatePerformerTimeReportInput {
  dayId: string;
  update: (report: PerformerTimeReport) => PerformerTimeReport;
  description?: string;
}

/** Create-or-update the one time sheet for a production day. */
export const updatePerformerTimeReportCommand = (
  project: Project,
  input: UpdatePerformerTimeReportInput,
): CommandResult => {
  if (typeof input.update !== 'function') throw new Error('updatePerformerTimeReport: update must be a function.');
  if (!project.productionDays?.some((day) => day.id === input.dayId)) {
    throw new Error(`updatePerformerTimeReport: no production day ${input.dayId}.`);
  }
  const list = project.performerTimeReports ?? [];
  const current = list.find((report) => report.dayId === input.dayId) ?? { id: createId('exhibitg'), dayId: input.dayId, entries: [] };
  const next = { ...input.update(current), id: current.id, dayId: input.dayId };
  const exists = list.some((report) => report.id === current.id);
  return {
    project: {
      ...project,
      performerTimeReports: exists ? list.map((report) => (report.id === current.id ? next : report)) : [...list, next],
    },
    meta: {
      type: 'updatePerformerTimeReport',
      entityId: current.id,
      timestamp: commandTimestamp(),
      description: input.description ?? 'Edit performer time report',
    },
  };
};

export interface UpdateProductionReportNotesInput {
  dayId: string;
  patch: Partial<Omit<ProductionReportNotes, 'dayId'>>;
}

/** Edit the hand-written part of a day's production report; empty fields are dropped. */
export const updateProductionReportNotesCommand = (project: Project, input: UpdateProductionReportNotesInput): CommandResult => {
  const day = project.productionDays?.find((candidate) => candidate.id === input.dayId);
  if (!day) throw new Error(`updateProductionReportNotes: no production day ${input.dayId}.`);
  const list = project.productionReportNotes ?? [];
  const current = list.find((entry) => entry.dayId === input.dayId) ?? { dayId: input.dayId };
  const merged: ProductionReportNotes = { ...current, ...input.patch, dayId: input.dayId };
  for (const key of Object.keys(merged) as Array<keyof ProductionReportNotes>) {
    if (key !== 'dayId' && (merged[key] === undefined || merged[key] === '')) delete merged[key];
  }
  const rest = list.filter((entry) => entry.dayId !== input.dayId);
  const isEmpty = Object.keys(merged).length === 1;
  return {
    project: { ...project, productionReportNotes: isEmpty ? rest : [...rest, merged] },
    meta: {
      type: 'updateProductionReportNotes',
      entityId: input.dayId,
      timestamp: commandTimestamp(),
      description: `Edit production report notes for ${day.name}`,
    },
  };
};
