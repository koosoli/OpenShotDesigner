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
  put(blob: Blob, metadata?: Partial<AssetMetadata>): Promise<AssetRef>;
  get(id: string): Promise<Blob | null>;
  getMetadata(id: string): Promise<AssetMetadata | null>;
  delete(id: string): Promise<void>;
}
