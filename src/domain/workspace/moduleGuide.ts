/**
 * What each workspace module is FOR.
 *
 * The app has sixteen modules and, until now, no explanation of any of them
 * inside the app itself. The documentation is a 560-line README somewhere else,
 * and the only in-product explanation was a tooltip repeating the tab's own
 * name. Someone opening "Run of show" for the first time had to guess.
 *
 * Deliberately NOT a tour. A tour interrupts at the moment the user is least
 * able to absorb it, points at controls they have no reason to press yet, and
 * teaches nothing that survives being clicked through. What is missing here is
 * not a sequence of steps; it is an answer to "what is this panel, and why
 * would I be in it".
 *
 * So each entry answers three questions and stops:
 *
 *  - `purpose`  — what this panel is, in one sentence.
 *  - `feeds`    — where its content comes from, because almost everything here
 *                 is derived. Not knowing that is the single biggest source of
 *                 confusion in an app this connected: people look for a "add
 *                 gear" button when the gear list is already following the
 *                 floor plan.
 *  - `output`   — what leaves the app because of it. Optional, because not
 *                 every module produces paperwork.
 *
 * Kept beside the preset definitions rather than in the components so the
 * wording is reviewable in one place and cannot drift per panel.
 */
import type { ModuleId } from './types';

export interface ModuleGuide {
  purpose: string;
  feeds: string;
  output?: string;
}

/**
 * Guidance per module.
 *
 * `Partial` on purpose: a module with nothing worth saying should say nothing
 * rather than carry a sentence written to fill the slot.
 */
export const MODULE_GUIDE: Partial<Record<ModuleId | 'inspector', ModuleGuide>> = {
  inspector: {
    purpose: 'Edit whatever is selected on the plan, and the scene it belongs to.',
    feeds: 'Follows your selection. With nothing selected it shows the scene and how the plan is drawn.',
  },
  shots: {
    purpose: 'The coverage for this scene: one row per shot, in the order you intend to shoot it.',
    feeds: 'Cameras you place on the floor plan appear here; adding a shot can create its camera.',
    output: 'Shot list, coverage matrix and the shot plan PDF.',
  },
  storyboard: {
    purpose: 'Frames per shot, drawn, photographed or simulated from the viewfinder.',
    feeds: 'One slot per shot and per waypoint, so a moving shot can carry a frame at each beat.',
    output: 'Storyboard pages in the export studio.',
  },
  script: {
    purpose: 'The screenplay, and the lines each shot covers.',
    feeds: 'Lining a passage links it to a shot; scene numbers flow into the schedule and the breakdown.',
    output: 'Lined script, sides, AV script and script reports.',
  },
  equipment: {
    purpose: 'Everything the scene needs, and the DMX patch for the fixtures on it.',
    feeds: 'Derived from the cameras, lights and props on the floor plan. Anything you add by hand is kept on top of that.',
    output: 'Gear manifest, DMX patch sheet and the load list.',
  },
  schedule: {
    purpose: 'Which scenes shoot on which day, and the call sheet for each day.',
    feeds: 'Scenes and setups become strips; the call sheet derives from the day, its cast, locations and crew.',
    output: 'Stripboard, DOOD and issued call sheets.',
  },
  moodboard: {
    purpose: 'Reference images for the look, grouped as you like.',
    feeds: 'Images you add. Nothing else writes here.',
    output: 'Moodboard pages in the export studio.',
  },
  locations: {
    purpose: 'The places you shoot, with addresses, contacts and access notes.',
    feeds: 'Scenes link to a location; the call sheet prints the address and map for the day.',
  },
  power: {
    purpose: 'Distro, circuits and what is plugged into them.',
    feeds: 'Lights on the plan become consumers with a rated draw; you assign them to circuits.',
    output: 'Power and load report.',
  },
  logistics: {
    purpose: 'Vehicles, transport and what has to move between locations.',
    feeds: 'Days and locations from the schedule.',
    output: 'Logistics sheet.',
  },
  run_of_show: {
    purpose: 'A cue-by-cue running order, for anything performed rather than shot in takes.',
    feeds: 'Its own cues. Useful for live events and multi-camera; ignore it for narrative.',
    output: 'Run of show sheet.',
  },
  continuity: {
    purpose: 'The take log: what was shot, which was good, and what changed between takes.',
    feeds: "The day's scheduled shots. Logging a take numbers it against the slate automatically.",
    output: 'Continuity binder, camera and sound reports, daily progress.',
  },
  rigging: {
    purpose: 'Truss runs and what hangs on them, with the weights that follow.',
    feeds: 'You build runs from profiles; fixtures on the plan can be hung on a run.',
    output: 'Rigging plot and load calculations.',
  },
  contacts: {
    purpose: 'Everyone on the production — crew, cast and the people you call.',
    feeds: 'Characters from the script can be cast to people here; key roles fill the paperwork header.',
    output: 'Crew list and the call sheet contact pages.',
  },
  tasks: {
    purpose: 'What still has to be done before a day can shoot.',
    feeds: 'Tasks you write, optionally assigned to a person and due on a shooting day.',
  },
  budget: {
    purpose: 'What the production costs, estimated and actual.',
    feeds: 'Crew rates and gear rates you enter; day counts come from the schedule.',
    output: 'Budget and cost report.',
  },
};

/** Guidance for one module, or undefined when there is nothing worth saying. */
export const moduleGuideFor = (moduleId: string): ModuleGuide | undefined =>
  MODULE_GUIDE[moduleId as ModuleId | 'inspector'];
