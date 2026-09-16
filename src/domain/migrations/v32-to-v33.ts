/**
 * v32 -> v33 introduces the callout annotation element (`type: 'annotation'`).
 *
 * The new element type is absent-safe: projects saved before annotations
 * existed simply contain no annotation elements, and every annotation field
 * besides `targetElementId`/`text`/`fontSize`/`color` has a renderer default.
 * This migration therefore only stamps the new version — it must not rewrite
 * any element, so old saved projects and imports keep loading byte-identical
 * apart from the version number.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

export const migrateV32ToV33 = (raw: UnknownRecord): Project => {
  const project = raw as unknown as Project;
  return { ...project, schemaVersion: 33 };
};
