/**
 * The getting-started path: the production workflow end to end, each step
 * ticked off by what is actually in the project rather than by a flag the
 * user has to remember to set.
 */
import type { Project } from '../../types';
import type { ModuleId } from './types';

export interface GettingStartedStep {
  id: string;
  title: string;
  detail: string;
  /** Module that does this step. */
  module: ModuleId;
  done: boolean;
}

export const gettingStartedSteps = (project: Project): GettingStartedStep[] => [
  {
    id: 'script',
    title: 'Add the screenplay',
    detail: 'Import a .fountain, .fdx or .txt file, or write one. Scenes, cast and page counts follow from it.',
    module: 'script',
    done: (project.scriptLines?.length ?? 0) > 0,
  },
  {
    id: 'breakdown',
    title: 'Tag the breakdown',
    detail: 'Select words on the script page and tag props, wardrobe, vehicles, stunts and extras.',
    module: 'script',
    done: (project.breakdownItems?.length ?? 0) > 0,
  },
  {
    id: 'cast',
    title: 'Cast the roles',
    detail: 'Add your cast and crew, then link each character to a performer with a cast number.',
    module: 'contacts',
    done: (project.castAssignments?.length ?? 0) > 0,
  },
  {
    id: 'shots',
    title: 'Plan the shots',
    detail: 'Block the scene on the floor plan and drop a camera for each shot.',
    module: 'shots',
    done: project.setups.some((setup) => setup.shots.length > 0),
  },
  {
    id: 'schedule',
    title: 'Build the schedule',
    detail: 'Add shooting days and drag scene strips onto them. The DOOD and one-liner fill themselves.',
    module: 'schedule',
    done: (project.productionDays ?? []).some((day) => day.scheduleBlockIds.length > 0),
  },
  {
    id: 'callsheet',
    title: 'Send a call sheet',
    detail: 'Open a day’s call sheet, check it, and mark it final before you print or share it.',
    module: 'schedule',
    done: (project.productionDays ?? []).some((day) => day.callSheet?.status === 'final'),
  },
];
