import React from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { castFilterForDay, resolveDayLocations } from '../../domain/reports';
import { scheduleIssues } from '../../domain/scheduling';
import { PlanningWarnings } from '../common/PlanningWarnings';

/**
 * Schedule health warnings above the stripboard.
 *
 * Reads the context directly rather than taking the panel's derivations as
 * props: `SchedulePanel` builds those inside its render, so passing them in
 * would either recompute this on every keystroke or need the panel to memoise
 * three helpers it currently has no reason to.
 *
 * The thresholds are the domain's documented defaults. They are agreements
 * rather than facts — ten hours' turnaround in some territories, twelve in
 * others — and the honest place to make them configurable is the project, not
 * a constant hidden in a component. Left at the defaults until there is a
 * settings home for them, which is a smaller lie than picking a number here
 * and never saying so.
 */
export interface ScheduleHealthProps {
  isLight: boolean;
}

export const ScheduleHealth: React.FC<ScheduleHealthProps> = ({ isLight }) => {
  const { project } = useFloorPlan();

  const issues = React.useMemo(() => {
    const days = project.productionDays ?? [];
    const blocks = project.scheduleBlocks ?? [];
    const people = project.people ?? [];

    return scheduleIssues({
      days,
      blocks,
      locationsForDay: (day) =>
        resolveDayLocations(day.scheduleBlockIds, blocks, {
          locations: project.locations,
          scriptScenes: project.scriptScenes,
          setups: project.setups,
        }),
      castForDay: (day) => {
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
      personName: (personId) => people.find((person) => person.id === personId)?.displayName,
    });
  }, [
    project.productionDays,
    project.scheduleBlocks,
    project.locations,
    project.scriptScenes,
    project.setups,
    project.castAssignments,
    project.people,
  ]);

  return (
    <PlanningWarnings
      title="Schedule health"
      clearMessage={
        'Checked company moves, how far a day spreads, the cast booked across that distance, ' +
        'turnaround between wrap and the next call, and whether the work fits the published day. ' +
        'Nothing found — which is these five questions answered, not a verdict on the schedule.'
      }
      issues={issues}
      isLight={isLight}
    />
  );
};
