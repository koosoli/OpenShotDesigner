/**
 * The copy of a project as it was when this browser last opened it from, or
 * saved it to, a cloud file — the common ancestor a three-way merge needs.
 *
 * Kept in IndexedDB beside the projects (it can be as large as one), keyed by
 * project and provider. Without it, a save that meets someone else's newer
 * copy falls back to "save mine as a copy / replace theirs".
 */
import type { Project } from '../../types';
import { STORE_META, idbDelete, idbGet, idbPut, isIndexedDbAvailable } from '../../domain/storage/idb';
import type { CloudProvider } from './cloudLinks';

const keyOf = (projectId: string, provider: CloudProvider) => `cloud-base:${provider}:${projectId}`;

export const saveCloudBase = async (projectId: string, provider: CloudProvider, project: Project): Promise<void> => {
  if (!isIndexedDbAvailable()) return;
  try {
    await idbPut(STORE_META, keyOf(projectId, provider), JSON.parse(JSON.stringify(project)) as Project);
  } catch {
    // Without a base the next conflicting save offers copy / replace instead of a merge.
  }
};

export const readCloudBase = async (projectId: string, provider: CloudProvider): Promise<Project | undefined> => {
  if (!isIndexedDbAvailable()) return undefined;
  try {
    return await idbGet<Project>(STORE_META, keyOf(projectId, provider));
  } catch {
    return undefined;
  }
};

export const clearCloudBase = async (projectId: string, provider: CloudProvider): Promise<void> => {
  if (!isIndexedDbAvailable()) return;
  try {
    await idbDelete(STORE_META, keyOf(projectId, provider));
  } catch {
    // Nothing to clean up.
  }
};
