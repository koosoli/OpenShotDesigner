/**
 * Derive a day's call sheet straight from the project.
 *
 * `deriveCallSheet` takes twenty inputs and five resolvers, which is right for
 * a pure function that must not know how this app stores its scenes. But the
 * wiring that turns a `Project` into those inputs lived inside
 * `SchedulePanel`, so the only way to obtain a day's call sheet was to render
 * that panel.
 *
 * That had a consequence beyond tidiness. An issued REV is immutable, and the
 * live document silently becomes a draft again the moment any derived source
 * changes — the schedule, the cast, a location, the production company. Only
 * the call-sheet workspace could see that, so a producer looking anywhere else
 * had no way to learn that the sheet the crew is holding no longer matches the
 * plan. The readiness centre can now ask the same question, because the
 * question finally has an answer outside a React tree.
 *
 * Every building block below was already domain code. Only the assembly moved.
 */
import type { Project } from '../../types';
import type { ProductionDay } from '../scheduling';
import { buildStripboardLabelContext } from '../scheduling';
import { deriveCallSheet } from './callSheet';
import type { CallSheetData } from './callSheet';
import { castFilterForDay } from './dayCast';
import { resolveDayLocations } from './dayLocations';
import { buildStripContextResolver } from './stripContext';

/**
 * Resolvers shared by every day of one project.
 *
 * Built once and passed to `callSheetForDay` because they scan the whole
 * project: doing it per day turns a look-ahead (which needs the NEXT day too)
 * into a repeated full-project walk.
 */
export interface CallSheetProjectContext {
  labels: ReturnType<typeof buildStripboardLabelContext>;
  strips: ReturnType<typeof buildStripContextResolver>;
}

export const buildCallSheetProjectContext = (project: Project): CallSheetProjectContext => ({
  labels: buildStripboardLabelContext(project),
  strips: buildStripContextResolver({
    scriptScenes: project.scriptScenes,
    locations: project.locations,
    setups: project.setups,
  }),
});

/**
 * The call sheet for `day` as it stands right now.
 *
 * `context` is optional so a single-day caller can stay a one-liner; pass one
 * when deriving several days, which is what the readiness sweep does.
 */
export const callSheetForDay = (
  project: Project,
  day: ProductionDay,
  context: CallSheetProjectContext = buildCallSheetProjectContext(project),
): CallSheetData => {
  const days = project.productionDays ?? [];
  const blocks = project.scheduleBlocks ?? [];

  const locationsFor = (target: ProductionDay) =>
    resolveDayLocations(target.scheduleBlockIds, blocks, {
      locations: project.locations,
      scriptScenes: project.scriptScenes,
      setups: project.setups,
    });

  const castFor = (target: ProductionDay) =>
    castFilterForDay(target.scheduleBlockIds, blocks, {
      scriptScenes: project.scriptScenes,
      setups: project.setups,
      castAssignments: project.castAssignments,
    });

  // Look-ahead: the next day in board order, for the "tomorrow" panel.
  const index = days.findIndex((candidate) => candidate.id === day.id);
  const following = index >= 0 ? days[index + 1] : undefined;

  return deriveCallSheet({
    ...(project.documentLanguage ? { documentLanguage: project.documentLanguage } : {}),
    day,
    blocks,
    ...(following
      ? {
          nextDay: {
            day: following,
            locations: locationsFor(following),
            castPersonIds: castFor(following),
          },
        }
      : {}),
    productionTitle: project.title,
    productionCompany: project.productionCompany,
    productionCompanyInfo: project.productionCompanyInfo,
    productionLogo: project.logo,
    standingCallSheet: project.standingCallSheet,
    people: project.people ?? [],
    castPersonIds: castFor(day),
    locations: locationsFor(day),
    resolveSceneLabel: (id) => context.labels.sceneNames.get(id),
    resolveSetupLabel: (id) => context.labels.setupNames.get(id),
    resolveSegmentLabel: (id) => context.labels.segmentNames.get(id),
    resolveShotLabel: (ids) =>
      ids
        .map((id) => context.labels.shotNames.get(id))
        .filter((label): label is string => Boolean(label))
        .join(' + ') || undefined,
    resolveStripContext: context.strips,
  });
};
