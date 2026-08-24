/**
 * The shooting-day checklist, derived.
 *
 * The continuity log and the day's tick-off list are the same document — on a
 * set they are the same job, and building them as two screens is how they end
 * up disagreeing. So nothing here stores "this shot is done": a shot is covered
 * when it has a good take, and that is read from the takes every time.
 *
 * Planned and actual stay two separate sets, deliberately. An unplanned shot
 * never joins the plan retroactively; if it did, the checklist could no longer
 * report that 4C was missed — it would just show a day where everything was
 * covered. The wrap report wants both lists, and `dayChecklist` returns both.
 *
 * The day's planned shots are resolved from all three ways of scheduling —
 * scene, setup and shots blocks — for the same reason `reports/dayCast.ts`
 * does: a production that schedules by setup is a path the app supports, and
 * handling only scene blocks would print an empty checklist for it.
 */

import type { ScheduleBlock } from '../scheduling';
import type { Take } from './types';

/** The slice of a project this derivation needs; keeps it pure and testable. */
export interface ChecklistSources {
  setups?: Array<{
    id: string;
    sceneNumber?: string;
    shots?: Array<{ id: string; shotNumber?: string; name?: string; unplanned?: boolean }>;
  }>;
  scriptScenes?: Array<{ id: string; sceneNumber?: string }>;
}

export interface ChecklistShot {
  shotId: string;
  setupId: string;
  sceneNumber?: string;
  shotNumber?: string;
  name?: string;
  unplanned: boolean;
  takeCount: number;
  /** True when at least one take is explicitly marked good. */
  covered: boolean;
  /** Logged, but nothing marked good yet — the shot an AD still worries about. */
  attemptedNotCovered: boolean;
}

export interface DayChecklist {
  /** Shots scheduled for the day, in schedule order. */
  planned: ChecklistShot[];
  /**
   * Shots with takes on this day that were never scheduled for it — the
   * pickups, safeties and "we are here anyway" inserts. Kept apart from
   * `planned` so the plan-versus-reality comparison stays honest.
   */
  unscheduled: ChecklistShot[];
  /** Planned shots with no takes at all. The wrap-time gap list. */
  notShot: ChecklistShot[];
  /** Planned shots with takes but no good one. The other gap list. */
  noGoodTake: ChecklistShot[];
}

/** Takes logged against one shot. */
export const takesForShot = (takes: readonly Take[], shotId: string): Take[] =>
  takes.filter((take) => take.shotId === shotId);

/**
 * How many takes a shot has.
 *
 * Derived from the log, with the legacy `Shot.takesCount` as a fallback for
 * shots that have no take records at all. Both halves matter:
 *
 *  - Once anything is logged, the records win. Storing a second counter that
 *    could disagree with them would mean one of the two is a lie.
 *  - A project written before the log existed carries a real number that was
 *    typed by a real person. Reporting 0 for it would be inventing a fact in
 *    the other direction, so the stored value stands until the log has
 *    something to say. This is why the v23→v24 migration does not fabricate
 *    take records from the count: there is no file name, day or good-take flag
 *    to put in them, and blank records would look like a log that was kept.
 */
export const takesCountFor = (
  takes: readonly Take[],
  shotId: string,
  storedCount?: number,
): number => {
  const logged = takesForShot(takes, shotId).length;
  if (logged > 0) return logged;
  return storedCount ?? 0;
};

/** Takes logged on one production day, in log order. */
export const takesForDay = (takes: readonly Take[], productionDayId: string): Take[] =>
  takes
    .filter((take) => take.productionDayId === productionDayId)
    .slice()
    .sort((a, b) => (a.loggedAt ?? '').localeCompare(b.loggedAt ?? ''));

/**
 * Every shot scheduled on a day, in schedule order, from scenes, setups and
 * shots blocks alike. Ids only; `dayChecklist` resolves them.
 */
export const shotIdsScheduledOn = (
  scheduleBlockIds: readonly string[],
  blocks: readonly ScheduleBlock[],
  sources: ChecklistSources,
): string[] => {
  const byId = new Map(blocks.map((block) => [block.id, block] as const));
  const setups = sources.setups ?? [];
  const ordered: string[] = [];
  const seen = new Set<string>();

  const addShot = (shotId: string): void => {
    if (seen.has(shotId)) return;
    seen.add(shotId);
    ordered.push(shotId);
  };
  /**
   * Expanding a setup (or a scene) yields the shots that were PLANNED on it —
   * an unplanned pickup added to the setup today is deliberately not among
   * them. Without this, adding a pickup to a scheduled setup quietly enrols it
   * in the plan, and the checklist stops being able to say which shot was
   * actually missed: it just shows one more covered row.
   *
   * A `shots` block that names the id explicitly still schedules it — that is
   * someone deciding to plan it, which is a different act.
   */
  const addSetup = (setupId: string): void => {
    const setup = setups.find((candidate) => candidate.id === setupId);
    for (const shot of setup?.shots ?? []) {
      if (shot.unplanned === true) continue;
      addShot(shot.id);
    }
  };

  for (const blockId of scheduleBlockIds) {
    const block = byId.get(blockId);
    if (!block) continue;
    switch (block.kind) {
      case 'scene': {
        // Scenes reach shots through the setups carrying the scene's number,
        // which is the same link the breakdown and the stripboard use.
        const scene = sources.scriptScenes?.find(
          (candidate) => candidate.id === block.scriptSceneId,
        );
        const sceneNumber = scene?.sceneNumber;
        if (!sceneNumber) break;
        for (const setup of setups) {
          if (setup.sceneNumber === sceneNumber) addSetup(setup.id);
        }
        break;
      }
      case 'setup':
        addSetup(block.setupId);
        break;
      case 'shots':
        for (const shotId of block.shotIds) addShot(shotId);
        break;
      default:
        // Banners, cues and segments schedule no shots of their own.
        break;
    }
  }

  return ordered;
};

type IndexedShot = NonNullable<ChecklistSources['setups']>[number]['shots'];
type ShotEntry = { setupId: string; sceneNumber?: string; shot: NonNullable<IndexedShot>[number] };

/**
 * Shots by id, built once per derivation.
 *
 * Searching every setup for each shot is O(shots × setups), and grouping takes
 * the same way is O(shots × takes). Both are invisible on the example project
 * and dominate on a feature — where this runs on every keystroke in the panel.
 */
const indexShots = (sources: ChecklistSources): Map<string, ShotEntry> => {
  const index = new Map<string, ShotEntry>();
  for (const setup of sources.setups ?? []) {
    for (const shot of setup.shots ?? []) {
      index.set(shot.id, { setupId: setup.id, sceneNumber: setup.sceneNumber, shot });
    }
  }
  return index;
};

const groupTakesByShot = (takes: readonly Take[]): Map<string, Take[]> => {
  const grouped = new Map<string, Take[]>();
  for (const take of takes) {
    const list = grouped.get(take.shotId);
    if (list) list.push(take);
    else grouped.set(take.shotId, [take]);
  }
  return grouped;
};

const describeShot = (
  shotId: string,
  shotsById: Map<string, ShotEntry>,
  takesByShot: Map<string, Take[]>,
): ChecklistShot | null => {
  const entry = shotsById.get(shotId);
  if (!entry) return null;
  const shotTakes = takesByShot.get(shotId) ?? [];
  const covered = shotTakes.some((take) => take.isGoodTake === true);
  return {
    shotId,
    setupId: entry.setupId,
    sceneNumber: entry.sceneNumber,
    shotNumber: entry.shot.shotNumber,
    name: entry.shot.name,
    unplanned: entry.shot.unplanned === true,
    takeCount: shotTakes.length,
    covered,
    attemptedNotCovered: shotTakes.length > 0 && !covered,
  };
};

/**
 * The day's checklist: what was planned, what was covered, and what was shot
 * that nobody planned.
 *
 * `takes` is scoped to the day for coverage, so a shot carried over from
 * yesterday shows today's takes rather than yesterday's — the checklist
 * answers "did we get it TODAY", which is the question at wrap. A take
 * pointing at a shot that no longer exists is dropped from the counts and
 * surfaced by `orphanedTakes` instead of silently vanishing.
 */
export const dayChecklist = (
  scheduleBlockIds: readonly string[],
  blocks: readonly ScheduleBlock[],
  sources: ChecklistSources,
  allTakes: readonly Take[],
  productionDayId: string,
): DayChecklist => {
  const dayTakes = takesForDay(allTakes, productionDayId);
  const plannedIds = shotIdsScheduledOn(scheduleBlockIds, blocks, sources);
  const plannedSet = new Set(plannedIds);
  const shotsById = indexShots(sources);
  const takesByShot = groupTakesByShot(dayTakes);

  const planned = plannedIds
    .map((shotId) => describeShot(shotId, shotsById, takesByShot))
    .filter((entry): entry is ChecklistShot => entry !== null);

  const unscheduledIds: string[] = [];
  const seen = new Set<string>();
  for (const take of dayTakes) {
    if (plannedSet.has(take.shotId) || seen.has(take.shotId)) continue;
    seen.add(take.shotId);
    unscheduledIds.push(take.shotId);
  }
  const unscheduled = unscheduledIds
    .map((shotId) => describeShot(shotId, shotsById, takesByShot))
    .filter((entry): entry is ChecklistShot => entry !== null);

  return {
    planned,
    unscheduled,
    notShot: planned.filter((entry) => entry.takeCount === 0),
    noGoodTake: planned.filter((entry) => entry.attemptedNotCovered),
  };
};

/**
 * The whole production's checklist: every shot in the film against every take
 * ever logged.
 *
 * Not a union of the days. A shot nobody scheduled would be invisible in that
 * union, and "did we schedule it" is a different question from "do we have
 * it" — which is the one being asked at this scope. So `planned` is every
 * shot that exists, in scene order, and coverage counts takes from any day: a
 * shot got on Day 1 and re-shot on Day 4 is covered, even though neither day's
 * own checklist would say so on its own.
 *
 * `unscheduled` is therefore always empty. Nothing can be off-plan when the
 * plan is everything, and shots added on the day are ordinary members here,
 * flagged by their own `unplanned` field. Takes pointing at deleted shots stay
 * with `orphanedTakes`, exactly as in the per-day view.
 */
export const productionChecklist = (
  sources: ChecklistSources,
  allTakes: readonly Take[],
): DayChecklist => {
  const shotsById = indexShots(sources);
  const takesByShot = groupTakesByShot(allTakes);

  const planned = [...shotsById.keys()]
    .map((shotId) => describeShot(shotId, shotsById, takesByShot))
    .filter((entry): entry is ChecklistShot => entry !== null);

  return {
    planned,
    unscheduled: [],
    notShot: planned.filter((entry) => entry.takeCount === 0),
    noGoodTake: planned.filter((entry) => entry.attemptedNotCovered),
  };
};

/**
 * Takes whose shot has been deleted. Flagged rather than dropped, the way the
 * power page flags a consumer whose light was struck: the log records
 * something that physically happened, and discarding it silently loses
 * metadata for footage that still exists on a card somewhere.
 */
export const orphanedTakes = (takes: readonly Take[], sources: ChecklistSources): Take[] => {
  const known = new Set<string>();
  for (const setup of sources.setups ?? []) {
    for (const shot of setup.shots ?? []) known.add(shot.id);
  }
  return takes.filter((take) => !known.has(take.shotId));
};
