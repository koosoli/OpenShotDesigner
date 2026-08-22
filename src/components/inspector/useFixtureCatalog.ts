import { useSyncExternalStore } from 'react';
import { getFixtureCatalog, subscribeFixtureCatalog } from '../../domain/fixtures';
import type { FixtureCatalogState } from '../../domain/fixtures';

/** The active fixture catalog (bundled/online OFL + curated + custom), live-updating. */
export const useFixtureCatalog = (): FixtureCatalogState =>
  useSyncExternalStore(subscribeFixtureCatalog, getFixtureCatalog, getFixtureCatalog);
