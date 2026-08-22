/**
 * Merging concurrent writes to one scene setup (plan §6).
 *
 * Most mutations in the app follow the same shape: read the setup that was
 * current when the component rendered, build a whole new setup from it, and
 * commit that. When two of those happen in the same render — an element move
 * plus a shot update, a group change plus a beat-count change — the second one
 * was built from a snapshot that predates the first, so committing it whole
 * silently discarded the first write.
 *
 * The fix without rewriting every call site: commit only the keys the caller
 * ACTUALLY changed, measured against the state that caller read, and apply
 * those on top of whatever is current. Writes that touch different parts of the
 * setup then both survive.
 *
 * This does not make same-key writes commutative — two callers that both
 * rebuild `elements` from stale state still resolve last-write-wins, which is
 * why the high-frequency element paths use a true functional updater instead.
 * It removes the whole class of cross-key losses, which is the common case.
 */

import type { SceneSetup } from '../../types';

/**
 * Keys `next` changed relative to `base`, compared by identity.
 *
 * Identity is the right comparison here: every mutation path builds new arrays
 * and objects for what it touched and passes the previous reference through for
 * what it did not, so an unchanged key is reference-equal by construction. A
 * deep comparison would be slower and would also treat a deliberate
 * "rebuild with the same contents" as a no-op.
 */
export const changedSetupKeys = (
  base: SceneSetup,
  next: SceneSetup,
): Array<keyof SceneSetup> => {
  const keys = new Set<keyof SceneSetup>([
    ...(Object.keys(base) as Array<keyof SceneSetup>),
    ...(Object.keys(next) as Array<keyof SceneSetup>),
  ]);
  const changed: Array<keyof SceneSetup> = [];
  for (const key of keys) {
    if (!Object.is(base[key], next[key])) changed.push(key);
  }
  return changed;
};

/**
 * Apply a caller's setup write onto the CURRENT setup.
 *
 * @param current the setup as it is right now (from the latest project state)
 * @param base    the setup the caller read before building its write
 * @param next    the whole setup the caller built
 *
 * Returns `current` unchanged when the caller changed nothing, so callers can
 * skip a state update entirely.
 */
export const mergeSetupWrite = (
  current: SceneSetup,
  base: SceneSetup,
  next: SceneSetup,
): SceneSetup => {
  // The caller read the state that is already current: nothing to reconcile.
  if (current === base) return next;

  const changed = changedSetupKeys(base, next);
  if (changed.length === 0) return current;

  const merged = { ...current } as Record<string, unknown>;
  for (const key of changed) {
    // A key the caller deleted outright is removed rather than set undefined.
    if (!(key in next)) delete merged[key as string];
    else merged[key as string] = next[key];
  }
  return merged as unknown as SceneSetup;
};
