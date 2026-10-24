/**
 * Copy floor-plan elements from one scene into another — what dragging an
 * object across split-screen panes does (FloorPlanCanvas / ScenePreviewPane).
 *
 * The copies get fresh ids and are moved as a whole (`translateElement`: a
 * wall keeps both ends, a path keeps its beats). A camera brings a copy of its
 * shot, numbered in the scene it lands in; an annotation copied with its
 * target points at the copy. Removing the originals, when the drag was a move,
 * is the canvas's normal delete, so the original scene's shot list, linings
 * and schedule are cleaned up the usual way.
 */
import type { CameraElement, FloorPlanElement, Project, Shot } from '../../types';
import { createId } from '../ids';
import { remapAnnotationTargets } from '../plan/annotations';
import { translateElement } from '../plan/translate';
import { commandTimestamp } from './types';
import type { CommandResult } from './types';

export interface CopyElementsToSetupInput {
  fromSetupId: string;
  toSetupId: string;
  elementIds: readonly string[];
  /** Offset applied to every copy, in plan units. */
  dx: number;
  dy: number;
  /**
   * The elements as they were before the gesture, when the canvas has been
   * moving them live (a drag that leaves the canvas). Looked up in the source
   * scene by id otherwise.
   */
  elements?: readonly FloorPlanElement[];
}

export interface CopyElementsToSetupResult extends CommandResult {
  /** Ids of the copies, in the order of `elementIds`. */
  newIds: string[];
}

export const copyElementsToSetupCommand = (project: Project, input: CopyElementsToSetupInput): CopyElementsToSetupResult => {
  const from = project.setups.find((setup) => setup.id === input.fromSetupId);
  const to = project.setups.find((setup) => setup.id === input.toSetupId);
  if (!from || !to) throw new Error('copyElementsToSetup: unknown scene.');

  const idMap = new Map<string, string>();
  const copies: FloorPlanElement[] = [];
  const copiedShots: Shot[] = [];
  for (const id of input.elementIds) {
    const element = (input.elements ?? from.elements).find((candidate) => candidate.id === id);
    if (!element) continue;
    const newId = createId(`el-${element.type}`);
    idMap.set(element.id, newId);
    const copy = { ...translateElement(element, input.dx, input.dy), id: newId } as FloorPlanElement;
    if (copy.type === 'camera') {
      const camera = copy as CameraElement;
      const shot = from.shots.find((candidate) => candidate.id === (element as CameraElement).associatedShotId);
      const shotId = createId('shot');
      camera.associatedShotId = shotId;
      if (shot) copiedShots.push({ ...shot, id: shotId, cameraId: newId, cameraLabel: camera.cameraLabel, sceneNumber: to.sceneNumber || shot.sceneNumber });
    }
    copies.push(copy);
  }
  if (copies.length === 0) throw new Error('copyElementsToSetup: nothing to copy.');

  const numberedShots = copiedShots.map((shot, index) => {
    const order = to.shots.length + index + 1;
    return { ...shot, order, shotNumber: `${to.sceneNumber || '1'}/${order}` };
  });

  return {
    project: {
      ...project,
      setups: project.setups.map((setup) =>
        setup.id === to.id
          ? { ...setup, elements: [...setup.elements, ...remapAnnotationTargets(copies, idMap)], shots: [...setup.shots, ...numberedShots] }
          : setup,
      ),
    },
    meta: {
      type: 'copyElementsToSetup',
      timestamp: commandTimestamp(),
      description: `${copies.length === 1 ? copies[0].name : `${copies.length} objects`} to ${to.name}`,
    },
    newIds: input.elementIds.flatMap((id) => (idMap.has(id) ? [idMap.get(id)!] : [])),
  };
};

export interface SetSetupViewInput {
  setupId: string;
  scale: number;
  offset: { x: number; y: number };
}

/**
 * Pan and zoom of a scene that is not the one being edited — a split-screen
 * pane. The editable canvas stores its view on its own scene the same way, so
 * a pane that becomes editable shows exactly what it showed before.
 */
export const setSetupViewCommand = (project: Project, input: SetSetupViewInput): CommandResult => ({
  project: {
    ...project,
    setups: project.setups.map((setup) =>
      setup.id === input.setupId
        ? { ...setup, canvasScale: Math.max(0.15, Math.min(4, input.scale)), canvasOffset: input.offset }
        : setup,
    ),
  },
  meta: { type: 'setSetupView', timestamp: commandTimestamp(), description: 'Pan / zoom' },
});
