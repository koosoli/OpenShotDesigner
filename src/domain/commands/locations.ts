/**
 * Locations as commands.
 *
 * Fourth cluster, and it turned up a gap while being moved. `LocationsPanel`
 * cleared `setup.locationId` and `setup.masterPlanForLocationId` on delete, and
 * re-parented child locations — but it never cleared `scriptScene.locationId`,
 * which `resolveDayLocations` also reads.
 *
 * The failure is quiet, which is why it survived: a dangling scene link does
 * not throw, it falls through to the slugline text. So the call sheet stops
 * printing the address and the map for that day and prints "INT. WAREHOUSE -
 * NIGHT" instead, and nothing anywhere says the link is broken. The unit
 * drives to a heading.
 */
import type { Project } from '../../types';
import type { CommandResult } from './types';
import { commandTimestamp } from './types';

const locationsOf = (project: Project) => project.locations ?? [];

const nameOf = (project: Project, locationId: string): string =>
  locationsOf(project).find((location) => location.id === locationId)?.name?.trim() ||
  `location ${locationId.slice(0, 8)}`;

export interface RemoveLocationInput {
  locationId: string;
}

/**
 * Delete a location and clear every link to it.
 *
 * Children are re-parented to top level rather than deleted: a sub-location is
 * a real place ("Stage 2, north end"), and losing it because its parent was
 * tidied away would be worse than leaving it unfiled.
 */
export const removeLocationCommand = (
  project: Project,
  input: RemoveLocationInput,
): CommandResult => {
  if (typeof input.locationId !== 'string' || input.locationId.trim() === '') {
    throw new Error('removeLocation: locationId must be a non-empty string.');
  }
  if (!locationsOf(project).some((location) => location.id === input.locationId)) {
    throw new Error(`removeLocation: unknown location id "${input.locationId}".`);
  }
  const label = nameOf(project, input.locationId);

  // Counted before the write so the description reports what actually changed.
  const reparented = locationsOf(project).filter(
    (location) => location.parentLocationId === input.locationId,
  ).length;
  const clearedSetups = project.setups.filter(
    (setup) =>
      setup.locationId === input.locationId ||
      setup.masterPlanForLocationId === input.locationId,
  ).length;
  const clearedScenes = (project.scriptScenes ?? []).filter(
    (scene) => scene.locationId === input.locationId,
  ).length;
  const links = reparented + clearedSetups + clearedScenes;

  return {
    project: {
      ...project,
      locations: locationsOf(project)
        .filter((location) => location.id !== input.locationId)
        .map((location) =>
          location.parentLocationId === input.locationId
            ? { ...location, parentLocationId: undefined }
            : location,
        ),
      setups: project.setups.map((setup) =>
        setup.locationId === input.locationId ||
        setup.masterPlanForLocationId === input.locationId
          ? { ...setup, locationId: undefined, masterPlanForLocationId: undefined }
          : setup,
      ),
      // The link the panel forgot. Without this the day resolves to the
      // slugline instead of the address, and the call sheet prints a heading
      // where a map should be.
      ...(project.scriptScenes
        ? {
            scriptScenes: project.scriptScenes.map((scene) =>
              scene.locationId === input.locationId
                ? { ...scene, locationId: undefined }
                : scene,
            ),
          }
        : {}),
    },
    meta: {
      type: 'removeLocation',
      entityId: input.locationId,
      timestamp: commandTimestamp(),
      description:
        links === 0
          ? `Remove ${label}`
          : `Remove ${label} and clear ${links} link${links === 1 ? '' : 's'}`,
    },
    ...(links > 0
      ? {
          warnings: [
            `Re-parented ${reparented} sub-location${reparented === 1 ? '' : 's'}; cleared ${clearedSetups} plan link${clearedSetups === 1 ? '' : 's'} and ${clearedScenes} scene link${clearedScenes === 1 ? '' : 's'}.`,
          ],
        }
      : {}),
  };
};

export interface SetLocationsInput {
  update: (previous: NonNullable<Project['locations']>) => NonNullable<Project['locations']>;
  description: string;
}

/**
 * Rewrite the location list.
 *
 * An updater, not a finished array: `runCommand` applies the command against
 * the newest project inside the state updater, so a caller that resolved the
 * list at render time would hand over a stale snapshot.
 */
export const setLocationsCommand = (
  project: Project,
  input: SetLocationsInput,
): CommandResult => {
  if (typeof input.update !== 'function') {
    throw new Error('setLocations: update must be a function.');
  }
  return {
    project: { ...project, locations: input.update(locationsOf(project)) },
    meta: {
      type: 'setLocations',
      timestamp: commandTimestamp(),
      description: input.description,
    },
  };
};
