/**
 * What the daily production report adds on top of the day's progress
 * (`dailyProgress.ts`): the things a production office expects on the same
 * sheet but that are not shooting progress.
 *
 *  - **To date** — where the production stands after this day: days shot,
 *    scenes and pages completed, shots covered, takes logged. A DPR is read
 *    as a running total as much as a day.
 *  - **Cast times** — straight from the day's Exhibit G sheet, so the times on
 *    the DPR and the time report cannot disagree.
 *  - **Notes** — delays, accidents and remarks: the only hand-written part,
 *    stored per day (`Project.productionReportNotes`).
 */
import type { Project } from '../../types';
import { dailyProgressReport } from './dailyProgress';
import { exhibitGTotals, formatMinutes } from './exhibitG';

export interface ProductionReportNotes {
  dayId: string;
  /** Lost time and why ("Rain 10:40–11:25, moved to cover set"). */
  delays?: string;
  /** Accidents or injuries — required on most productions even when "none". */
  accidents?: string;
  notes?: string;
  preparedBy?: string;
}

export interface ProductionReportToDate {
  /** This day's position in the schedule (1-based) and the schedule length. */
  dayNumber: number;
  daysTotal: number;
  /** Distinct scenes completed on this day or any earlier one. */
  scenesCompleted: number;
  /** Scenes in the screenplay (omitted scenes excluded). */
  scenesTotal: number;
  /** Null when any completed or scripted scene has no recorded length. */
  pagesCompletedEighths: number | null;
  pagesTotalEighths: number | null;
  shotsCovered: number;
  takesLogged: number;
}

export interface ProductionReportCastRow {
  castNumber?: number;
  name: string;
  role?: string;
  status?: string;
  reportMakeup?: string;
  reportOnSet?: string;
  meal1?: string;
  meal2?: string;
  dismissOnSet?: string;
  /** "8h 30m", or "—" when the sheet is incomplete. */
  worked: string;
  mealPenalties: number;
}

const span = (from?: string, to?: string): string | undefined => (from || to ? `${from ?? '?'}–${to ?? '?'}` : undefined);

/** Running totals up to and including `dayId`, in schedule order. */
export const productionReportToDate = (project: Project, dayId: string): ProductionReportToDate | null => {
  const days = project.productionDays ?? [];
  const index = days.findIndex((day) => day.id === dayId);
  if (index < 0) return null;
  const blocks = project.scheduleBlocks ?? [];
  const sources = { setups: project.setups, scriptScenes: project.scriptScenes };
  const takes = project.takes ?? [];

  const completedScenes = new Set<string>();
  const coveredShots = new Set<string>();
  for (const day of days.slice(0, index + 1)) {
    const report = dailyProgressReport(day, blocks, sources, takes);
    for (const scene of report.scenes) if (scene.complete) completedScenes.add(scene.sceneNumber);
  }
  const shootingDayIds = new Set(days.slice(0, index + 1).map((day) => day.id));
  const takesToDate = takes.filter((take) => take.productionDayId !== undefined && shootingDayIds.has(take.productionDayId));
  for (const take of takesToDate) if (take.isGoodTake === true && take.slateTag === undefined) coveredShots.add(take.shotId);

  const scenes = (project.scriptScenes ?? []).filter((scene) => !scene.omitted);
  const lengthOf = (sceneNumber: string) => scenes.find((scene) => scene.sceneNumber?.trim() === sceneNumber)?.pageLengthEighths;
  const completedLengths = [...completedScenes].map(lengthOf);
  const pagesCompletedEighths = completedLengths.every((length) => typeof length === 'number')
    ? completedLengths.reduce<number>((sum, length) => sum + (length as number), 0)
    : null;
  const pagesTotalEighths = scenes.length > 0 && scenes.every((scene) => typeof scene.pageLengthEighths === 'number')
    ? scenes.reduce((sum, scene) => sum + (scene.pageLengthEighths as number), 0)
    : null;

  return {
    dayNumber: index + 1,
    daysTotal: days.length,
    scenesCompleted: completedScenes.size,
    scenesTotal: scenes.length,
    pagesCompletedEighths,
    pagesTotalEighths,
    shotsCovered: coveredShots.size,
    takesLogged: takesToDate.length,
  };
};

/** The day's cast block, from its Exhibit G sheet (empty when there is none). */
export const productionReportCast = (project: Project, dayId: string): ProductionReportCastRow[] => {
  const sheet = (project.performerTimeReports ?? []).find((report) => report.dayId === dayId);
  if (!sheet) return [];
  return sheet.entries.map((entry) => {
    const totals = exhibitGTotals(entry, sheet.limits);
    return {
      ...(entry.castNumber !== undefined ? { castNumber: entry.castNumber } : {}),
      name: entry.name,
      ...(entry.role ? { role: entry.role } : {}),
      ...(entry.status ? { status: entry.status } : {}),
      ...(entry.reportMakeup ? { reportMakeup: entry.reportMakeup } : {}),
      ...(entry.reportOnSet ? { reportOnSet: entry.reportOnSet } : {}),
      ...(span(entry.meal1Out, entry.meal1In) ? { meal1: span(entry.meal1Out, entry.meal1In) } : {}),
      ...(span(entry.meal2Out, entry.meal2In) ? { meal2: span(entry.meal2Out, entry.meal2In) } : {}),
      ...(entry.dismissOnSet ? { dismissOnSet: entry.dismissOnSet } : {}),
      worked: totals.workedMinutes === undefined ? '—' : formatMinutes(totals.workedMinutes),
      mealPenalties: totals.mealPenalties,
    };
  });
};

export const productionReportNotesFor = (project: Project, dayId: string): ProductionReportNotes =>
  (project.productionReportNotes ?? []).find((entry) => entry.dayId === dayId) ?? { dayId };
