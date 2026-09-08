/**
 * Wire a whole project into the schedule-health checks.
 *
 * `scheduleIssues` deliberately takes resolvers rather than a `Project`: it is
 * pure domain logic and should not know how this app stores its scenes. But
 * the resolvers themselves are not a rendering concern, and they lived inside
 * `ScheduleHealth.tsx` — so the only way to ask "is this schedule sound?" was
 * to render that component. The readiness centre could not, which is why it
 * reported nothing about company moves, turnaround or day overruns while the
 * stripboard panel three tabs away had all of it.
 *
 * One function, two callers, one answer. That is the whole point.
 */
import type { Project } from '../../types';
import type { ProductionDay } from './types';
import { castFilterForDay, resolveDayLocations } from '../reports';
import { personUnavailableOn } from '../people';
import type { ScheduleHealthSources } from './health';

/**
 * Build the resolver bundle `scheduleIssues` needs from a project.
 *
 * Cheap enough to call per render — every resolver is a lookup over arrays the
 * caller already holds — but callers that re-render on unrelated keystrokes
 * should still memoise on the project slices it reads:
 * `productionDays`, `scheduleBlocks`, `locations`, `scriptScenes`, `setups`,
 * `castAssignments`, `people`.
 */
export const scheduleHealthSourcesFor = (project: Project): ScheduleHealthSources => {
  const days = project.productionDays ?? [];
  const blocks = project.scheduleBlocks ?? [];
  const people = project.people ?? [];

  return {
    days,
    blocks,
    locationsForDay: (day: ProductionDay) =>
      resolveDayLocations(day.scheduleBlockIds, blocks, {
        locations: project.locations,
        scriptScenes: project.scriptScenes,
        setups: project.setups,
      }),
    castForDay: (day: ProductionDay) => {
      // `undefined` from the filter means "no cast model at all" — a concert,
      // a broadcast — which is not the same as "nobody is called". An empty
      // set is the honest answer there: the check needs named performers to
      // say anything, and it says nothing.
      const personIds = castFilterForDay(day.scheduleBlockIds, blocks, {
        scriptScenes: project.scriptScenes,
        setups: project.setups,
        castAssignments: project.castAssignments,
      });
      return new Set(personIds ?? []);
    },
    personName: (personId: string) =>
      people.find((person) => person.id === personId)?.displayName,
    personUnavailableOn: (personId: string, day: ProductionDay) =>
      personUnavailableOn(
        people.find((person) => person.id === personId),
        day.date,
      ),
  };
};
