/**
 * Per-project workspace profile persistence (plan §1.2, §5.7).
 *
 * The chosen workspace preset is a persistent LOCAL preference — it configures
 * module visibility only and never changes what the project data may contain.
 * Deliberately stored outside the project document so presets stay a
 * presentation concern (rule 20 / §3.7 branding-neutrality analogy).
 */

import type { WorkspaceProfile } from './types';

const KEY_PREFIX = 'workspace_profile_';

/**
 * Modules added after a profile was stored would otherwise stay hidden for
 * ever on that device. A profile that shows the crew list predates the budget
 * module (which prices that list), so it gets the budget too.
 */
export const withLaterModules = (profile: WorkspaceProfile): WorkspaceProfile => {
  const modules = Array.isArray(profile.enabledModules) ? profile.enabledModules : [];
  if (modules.includes('budget') || !modules.includes('contacts')) return profile;
  return { ...profile, enabledModules: [...modules, 'budget'] };
};

export const getWorkspaceProfile = (projectId: string): WorkspaceProfile | null => {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${projectId}`);
    return raw ? (JSON.parse(raw) as WorkspaceProfile) : null;
  } catch {
    return null;
  }
};

export const setWorkspaceProfile = (projectId: string, profile: WorkspaceProfile): void => {
  try {
    localStorage.setItem(`${KEY_PREFIX}${projectId}`, JSON.stringify(profile));
  } catch {
    // Preference persistence must never break project work.
  }
};
