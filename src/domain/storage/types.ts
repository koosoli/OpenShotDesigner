/**
 * Storage abstractions (plan §5.1, §5.2).
 *
 * All persistence goes through these interfaces — components never touch
 * localStorage or IndexedDB directly.
 */

import type { Project } from '../../types';

export interface ProjectSummary {
  id: string;
  title: string;
  director?: string;
  date?: string;
  /** ISO timestamp of the last save. */
  updatedAt: string;
  setupCount: number;
  shotCount: number;
  hasScript: boolean;
}

export interface ProjectStore {
  init(): Promise<void>;
  listSummaries(): Promise<ProjectSummary[]>;
  load(id: string): Promise<Project | null>;
  save(project: Project): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface AssetMetadata {
  mimeType: string;
  byteSize: number;
  contentHash?: string;
  width?: number;
  height?: number;
  createdAt: string;
  source?: string;
  /**
   * Who still needs these bytes, as opaque caller-chosen keys (a mood board
   * card id, a storyboard frame key, a headshot's person id).
   *
   * Assets are content-addressed, so the same image used by a headshot and a
   * mood board card is ONE record. Without this list, releasing it on behalf
   * of one owner deletes the bytes for every other owner and the project is
   * left holding a reference that resolves to nothing — silent data loss, and
   * the sort that only shows up in an export weeks later.
   *
   * Absent on records written before ownership was tracked, which is why
   * `release` treats an empty list as "no claims recorded" and keeps the bytes
   * rather than guessing.
   */
  owners?: string[];
  /**
   * Set once these bytes have been stored at least once by a caller that
   * named no owner, or were found already stored with no owners recorded at
   * all — a record written before ownership tracking existed.
   *
   * Somebody is using the asset and the owner list does not know who. Later
   * puts do add their own owners, and without this marker the record would
   * come to look fully accounted for: releasing that one new owner would
   * delete the image the untracked user still displays. So the flag is
   * sticky, and `release` never auto-deletes a record carrying it.
   *
   * Absent on every record written before the flag existed, which reads as
   * "no untracked user" — correct for those, because a record from that era
   * either carries owners (and so was only ever stored by owner-bearing puts)
   * or carries none, in which case the empty-list rule protects it anyway.
   */
  untrackedUser?: true;
}

export interface AssetRef {
  id: string;
  metadata: AssetMetadata;
}

/**
 * Binary asset store (plan §5.2). Assets are referenced by id from project
 * state; large media never lives inside the project JSON.
 */
export interface AssetStore {
  /**
   * Store bytes and return their content-addressed id. `owner` records a claim
   * on the asset so it survives another owner releasing it; metadata from an
   * earlier put is merged rather than replaced, since a second put of the same
   * bytes may know less about them than the first did.
   */
  put(blob: Blob, metadata?: Partial<AssetMetadata>, owner?: string): Promise<AssetRef>;
  get(id: string): Promise<Blob | null>;
  getMetadata(id: string): Promise<AssetMetadata | null>;
  /**
   * Drop one owner's claim. The bytes go only when that was the last claim
   * and every user of the asset is accounted for — a record that was ever
   * stored without an owner keeps its bytes whatever the list says. Returns
   * whether the asset was actually deleted, so a caller can tell "released"
   * from "still in use elsewhere".
   */
  release(id: string, owner: string): Promise<boolean>;
  /**
   * Delete the bytes regardless of who else holds a claim. For wiping a
   * project's storage, not for removing one card from a board — use `release`
   * for that.
   */
  delete(id: string): Promise<void>;
}
