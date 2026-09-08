import React from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { scheduleHealthSourcesFor, scheduleIssues } from '../../domain/scheduling';
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
  const { project, displaySettings } = useFloorPlan();

  const issues = React.useMemo(
    () => scheduleIssues(scheduleHealthSourcesFor(project)),
    // Memoised on the slices `scheduleHealthSourcesFor` reads, not on
    // `project`: the object identity changes on every keystroke anywhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      project.productionDays,
      project.scheduleBlocks,
      project.locations,
      project.scriptScenes,
      project.setups,
      project.castAssignments,
      project.people,
    ],
  );

  // Off unless asked for. These sit above the content someone opened the panel
  // to read, and advice nobody requested earns less patience than advice they
  // switched on — so the toggle lives in Viewing Options and the default is
  // quiet. The hook above still runs: the checks are cheap and keeping them
  // unconditional keeps this a display decision, not a behavioural one.
  if (displaySettings.showPlanningWarnings !== true) return null;

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
