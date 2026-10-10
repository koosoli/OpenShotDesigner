/**
 * Production details and master plans as commands.
 *
 * Making a setup a location's master plan touches both sides — the location's
 * `masterPlanId` and the setup's `masterPlanForLocationId` — and used to be two
 * separate writes from the Inspector: two undo steps, and the first built the
 * setups list from the render-time project, so it could undo a setup edit made
 * in the same moment. One command keeps both sides in step in one write.
 */
import type { Project } from '../../types';
import type { CommandResult } from './types';
import { commandTimestamp } from './types';

export type ProductionDetailsUpdate = Partial<
  Pick<Project, 'title' | 'director' | 'cinematographer' | 'productionCompany' | 'date' | 'logo' | 'logoName'>
> & {
  /** Merged into the existing company info, one field at a time. */
  productionCompanyInfo?: Partial<NonNullable<Project['productionCompanyInfo']>>;
  /** Merged into the continuity crew names (sound mixer, script supervisor). */
  continuityCrew?: Partial<NonNullable<Project['continuityCrew']>>;
};

const FIELD_LABEL: Record<string, string> = {
  title: 'production title',
  director: 'director',
  cinematographer: 'cinematographer',
  productionCompany: 'production company',
  date: 'production date',
  logo: 'logo',
  logoName: 'logo',
  productionCompanyInfo: 'company details',
  continuityCrew: 'continuity crew',
};

export const updateProductionDetailsCommand = (project: Project, input: { updates: ProductionDetailsUpdate }): CommandResult => {
  const { productionCompanyInfo, continuityCrew, ...rest } = input.updates;
  const next: Project = { ...project, ...rest };
  if (continuityCrew) {
    next.continuityCrew = { ...(project.continuityCrew ?? {}), ...continuityCrew };
  }
  if (productionCompanyInfo) {
    next.productionCompanyInfo = { ...(project.productionCompanyInfo ?? {}), ...productionCompanyInfo };
  }
  const fields = [...new Set(Object.keys(input.updates).map((key) => FIELD_LABEL[key] ?? key))];
  return {
    project: next,
    meta: { type: 'updateProductionDetails', timestamp: commandTimestamp(), description: `Edit ${fields.join(', ') || 'production details'}` },
  };
};

const withSetup = (project: Project, setupId: string, update: (setup: Project['setups'][number]) => Project['setups'][number]) =>
  project.setups.map((setup) => (setup.id === setupId ? update(setup) : setup));

/** Make `setupId` the master plan for its assigned location; any previous claimant is demoted. */
export const setMasterPlanCommand = (project: Project, input: { setupId: string }): CommandResult => {
  const setup = project.setups.find((candidate) => candidate.id === input.setupId);
  const locationId = setup?.locationId;
  if (!setup || !locationId) throw new Error('setMasterPlan: the setup has no location.');
  return {
    project: {
      ...project,
      locations: (project.locations ?? []).map((location) =>
        location.id === locationId
          ? { ...location, masterPlanId: setup.id }
          : location.masterPlanId === setup.id ? { ...location, masterPlanId: undefined } : location),
      setups: project.setups.map((candidate) =>
        candidate.id === setup.id
          ? { ...candidate, masterPlanForLocationId: locationId }
          : candidate.masterPlanForLocationId === locationId ? { ...candidate, masterPlanForLocationId: undefined } : candidate),
    },
    meta: { type: 'setMasterPlan', entityId: setup.id, timestamp: commandTimestamp(), description: `Make ${setup.name} the master plan` },
  };
};

/** Stop `setupId` being its location's master plan (both sides). */
export const clearMasterPlanCommand = (project: Project, input: { setupId: string }): CommandResult => {
  const setup = project.setups.find((candidate) => candidate.id === input.setupId);
  return {
    project: {
      ...project,
      locations: (project.locations ?? []).map((location) => (location.masterPlanId === input.setupId ? { ...location, masterPlanId: undefined } : location)),
      setups: withSetup(project, input.setupId, (candidate) => ({ ...candidate, masterPlanForLocationId: undefined })),
    },
    meta: { type: 'clearMasterPlan', entityId: input.setupId, timestamp: commandTimestamp(), description: `${setup?.name ?? 'Setup'} is no longer a master plan` },
  };
};

/**
 * Assign a setup to a location (or none). A setup that was the master plan of
 * the location it leaves stops being one, on both sides.
 */
export const setSetupLocationCommand = (project: Project, input: { setupId: string; locationId: string | undefined }): CommandResult => {
  const setup = project.setups.find((candidate) => candidate.id === input.setupId);
  const leaving = setup?.locationId && setup.locationId !== input.locationId ? setup.locationId : undefined;
  const wasMaster = !!leaving && (setup?.masterPlanForLocationId === leaving
    || (project.locations ?? []).some((location) => location.id === leaving && location.masterPlanId === input.setupId));
  return {
    project: {
      ...project,
      locations: wasMaster
        ? (project.locations ?? []).map((location) => (location.id === leaving ? { ...location, masterPlanId: undefined } : location))
        : project.locations,
      setups: withSetup(project, input.setupId, (candidate) => ({
        ...candidate,
        locationId: input.locationId,
        ...(wasMaster ? { masterPlanForLocationId: undefined } : {}),
      })),
    },
    meta: { type: 'setSetupLocation', entityId: input.setupId, timestamp: commandTimestamp(), description: 'Assign scene location' },
  };
};
