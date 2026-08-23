import { imageFieldsOf, inlineImagesIn, isInlineImage } from '../domain/media';
import type { Project } from '../types';
import { storeImageAsset } from './assetImages';

/**
 * Move a project's inline images into the asset store (rule 26).
 *
 * This cannot be a schema migration. Schema migrations are pure functions over
 * JSON — that is what makes them testable against fixtures and replayable in
 * any order — and moving bytes into IndexedDB is asynchronous and touches a
 * store outside the project. So it is a separate pass that runs once after a
 * project loads, and the schema version is not involved.
 *
 * It is deliberately forgiving. A project full of storyboards is someone's
 * work; an image that fails to decode keeps its inline value rather than being
 * dropped, and the pass reports what it could not move instead of failing the
 * load. A half-migrated project is fine — every reader accepts both forms, so
 * the only consequence is that the next load tries again (rule 30).
 */

export interface MediaMigrationResult {
  /** Images moved into the asset store on this pass. */
  moved: number;
  /** Images that could not be decoded and kept their inline value. */
  failed: number;
  /** Characters removed from project state. */
  bytesFreed: number;
  /** True when anything moved and the replacements are worth applying. */
  changed: boolean;
  /**
   * Inline value → asset id, rather than a rebuilt project.
   *
   * The pass is asynchronous and the user keeps working while it runs, so
   * handing back a whole cloned project would mean writing back a snapshot
   * taken before their last few edits. Replacements can be applied to whatever
   * the project looks like when they land, and applying them twice is a no-op.
   */
  replacements: Record<string, string>;
}

/**
 * Swap any inline image whose exact bytes were migrated for its asset id.
 *
 * Pure and idempotent: a field already holding an id matches no key.
 */
export const applyMediaReplacements = (
  project: Project,
  replacements: Record<string, string>,
): { project: Project; applied: number } => {
  if (Object.keys(replacements).length === 0) return { project, applied: 0 };

  const working = JSON.parse(JSON.stringify(project)) as Project;
  let applied = 0;
  for (const field of imageFieldsOf(working)) {
    const replacement = replacements[field.value];
    if (replacement) {
      field.set(replacement);
      applied += 1;
    }
  }
  return applied > 0 ? { project: working, applied } : { project, applied: 0 };
};

/**
 * Convert a data URL to a Blob without a network round trip.
 *
 * `fetch(dataUrl)` is the tidy way and is unavailable under some CSPs and in
 * some test environments, so this decodes by hand.
 */
export const dataUrlToBlob = (dataUrl: string): Blob | null => {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl);
  if (!match) return null;
  const [, mime = 'application/octet-stream', base64, payload] = match;
  try {
    if (!base64) {
      return new Blob([decodeURIComponent(payload)], { type: mime });
    }
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    return null;
  }
};

/** What this project still carries inline, without changing anything. */
export const projectInlineImages = (project: Project) => inlineImagesIn(project);

/**
 * Run the pass. Returns the same project object when there was nothing to do,
 * so a caller can skip the write.
 */
export const migrateProjectMedia = async (project: Project): Promise<MediaMigrationResult> => {
  const before = inlineImagesIn(project);
  if (before.count === 0) {
    return { moved: 0, failed: 0, bytesFreed: 0, changed: false, replacements: {} };
  }

  const fields = imageFieldsOf(project).filter((field) => isInlineImage(field.value));
  const replacements: Record<string, string> = {};

  let moved = 0;
  let failed = 0;
  let bytesFreed = 0;

  for (const field of fields) {
    // The same picture can sit in several fields; store it once.
    if (replacements[field.value]) {
      moved += 1;
      continue;
    }
    const blob = dataUrlToBlob(field.value);
    if (!blob) {
      failed += 1;
      continue;
    }
    try {
      const { assetId } = await storeImageAsset(blob, {
        maxSize: field.policy.maxSize,
        quality: field.policy.quality,
        keepAlpha: field.policy.keepAlpha,
        source: `migrated:${field.path}`,
      });
      bytesFreed += field.value.length - assetId.length;
      replacements[field.value] = assetId;
      moved += 1;
    } catch {
      // Keep the inline value: a storyboard nobody can recover is worse than a
      // project that is still too big.
      failed += 1;
    }
  }

  return { moved, failed, bytesFreed, changed: moved > 0, replacements };
};
