import type { Project } from '../../types';
import { resolveWallOpenings } from '../plan/wallOpenings';

/** Record only unambiguous hosts while preserving legacy opening poses. */
export function migrateV38ToV39(raw: Record<string, unknown>): Project {
  const project = raw as unknown as Project;
  return {
    ...project,
    schemaVersion: 39,
    setups: project.setups.map((setup) => {
      if (!Array.isArray(setup.elements)) return setup;
      const walls = setup.elements.filter((element) => element.type === 'wall');
      const openings = setup.elements.filter((element) => element.type === 'door' || element.type === 'window');
      const hosts = new Map<string, string>();
      for (const [wallId, cuts] of resolveWallOpenings(walls, openings, true)) {
        for (const cut of cuts) hosts.set(cut.elementId, wallId);
      }
      return {
        ...setup,
        elements: setup.elements.map((element) => {
          const hostWallId = hosts.get(element.id);
          return hostWallId ? { ...element, hostWallId } : element;
        }),
      };
    }),
  };
}
