/**
 * Duplicate, copy and paste of floor-plan elements on the active setup.
 * Cameras bring a copy of their shot along (pasted ones are numbered against
 * the committed setup), groups duplicated whole stay groups, and annotations
 * follow a copied target. Extracted from `FloorPlanContext`.
 */
import { useRef } from 'react';
import type { CameraElement, FloorPlanElement, PlanGroup, SceneSetup, Shot } from '../types';
import { createId } from '../domain/ids';
import { remapAnnotationTargets } from '../domain/plan/annotations';
import { translateElement } from '../domain/plan/translate';

export const useElementClipboard = (input: {
  activeSetup: SceneSetup;
  selectedElementIds: string[];
  setSelectedElementIds: (ids: string[]) => void;
  commitSetupUpdate: (updater: (prevSetup: SceneSetup) => SceneSetup | null) => void;
}) => {
  const { activeSetup, selectedElementIds, setSelectedElementIds, commitSetupUpdate } = input;

  const duplicateSelected = () => {
    if (selectedElementIds.length === 0) return;
    const newElements: FloorPlanElement[] = [];
    const newSelectedIds: string[] = [];
    const duplicateIdMap = new Map<string, string>();

    selectedElementIds.forEach((id) => {
      const el = activeSetup.elements.find((e) => e.id === id);
      if (!el) return;

      const newId = createId(`el-${el.type}`);
      duplicateIdMap.set(id, newId);
      // The whole element moves — a wall's far end and a path included.
      const duplicated: FloorPlanElement = {
        ...translateElement(el, 30, 30),
        id: newId,
        name: `${el.name} (Copy)`,
      };

      if (duplicated.type === 'camera') {
        const cam = duplicated as CameraElement;
        const shotId = createId('shot');
        cam.associatedShotId = shotId;
      }

      newElements.push(duplicated);
      newSelectedIds.push(newId);
    });

    // Duplicating a whole group duplicates the group itself, with childIds
    // remapped to the cloned element ids (plan §6.4).
    const duplicatedGroups: PlanGroup[] = (activeSetup.groups || [])
      .filter((g) => g.childIds.length > 0 && g.childIds.every((cid) => duplicateIdMap.has(cid)))
      .map((g) => ({
        id: createId('group'),
        name: g.name,
        childIds: g.childIds.map((cid) => duplicateIdMap.get(cid)!),
      }));

    // An annotation duplicated together with its target points at the copy;
    // one duplicated on its own keeps pointing at the original element.
    const remappedNewElements = remapAnnotationTargets(newElements, duplicateIdMap);

    commitSetupUpdate((prevSetup) => ({
      ...prevSetup,
      elements: [...prevSetup.elements, ...remappedNewElements],
      groups:
        duplicatedGroups.length > 0
          ? [...(prevSetup.groups || []), ...duplicatedGroups]
          : prevSetup.groups,
    }));
    setSelectedElementIds(newSelectedIds);
  };

  // Clipboard for Ctrl+C / Ctrl+V copy & paste of selected assets.
  const clipboardRef = useRef<FloorPlanElement[]>([]);
  const pasteOffsetRef = useRef(30);
  /** The scene the clipboard was copied from: pasting into another lands in place. */
  const clipboardSetupRef = useRef<string | null>(null);

  const copySelectedElements = () => {
    if (selectedElementIds.length === 0) return;
    clipboardRef.current = selectedElementIds
      .map((id) => activeSetup.elements.find((e) => e.id === id))
      .filter((el): el is FloorPlanElement => !!el)
      .map((el) => JSON.parse(JSON.stringify(el)) as FloorPlanElement);
    pasteOffsetRef.current = 30;
    clipboardSetupRef.current = activeSetup.id;
  };

  const pasteElements = () => {
    if (clipboardRef.current.length === 0) return;
    // Into the scene it came from, a paste steps 30 px clear of the original;
    // into another scene it lands exactly where it was — a set's walls line
    // up from scene to scene. Later pastes there step on from that spot.
    if (clipboardSetupRef.current !== activeSetup.id) {
      clipboardSetupRef.current = activeSetup.id;
      pasteOffsetRef.current = 0;
    }
    const newElements: FloorPlanElement[] = [];
    const newSelectedIds: string[] = [];
    // The shots the paste adds, in paste order. Their `order` and shot number
    // depend on how many shots the scene already has, which is only known
    // against the committed setup — so they are numbered inside the updater
    // below rather than here.
    const pastedShots: Shot[] = [];
    const pasteIdMap = new Map<string, string>();

    clipboardRef.current.forEach((el) => {
      // `Date.now()` plus four random characters collides when two elements are
      // pasted inside the same millisecond, which breaks React keys and drag
      // targeting alike (rule 16).
      const newId = createId(`el-${el.type}`);
      pasteIdMap.set(el.id, newId);
      const pasted: FloorPlanElement = {
        ...translateElement(el, pasteOffsetRef.current, pasteOffsetRef.current),
        id: newId,
        name: `${el.name} (Copy)`,
      };

      // Camera copies also carry a copy of their linked shot so the pasted
      // camera isn't orphaned in the shot list.
      if (pasted.type === 'camera') {
        const cam = pasted as CameraElement;
        const linkedShot = activeSetup.shots.find((s) => s.id === (el as CameraElement).associatedShotId);
        const copiedShotId = createId('shot');
        cam.associatedShotId = copiedShotId;
        if (linkedShot) {
          pastedShots.push({
            ...linkedShot,
            id: copiedShotId,
            cameraId: newId,
            cameraLabel: cam.cameraLabel,
            name: `${linkedShot.name} (Copy)`,
            // Placeholders; numbered against the committed setup below.
            shotNumber: linkedShot.shotNumber,
            order: linkedShot.order,
          });
        }
      }

      newElements.push(pasted);
      newSelectedIds.push(newId);
    });

    // A pasted annotation follows its pasted target; one pasted on its own
    // keeps pointing at the original element.
    const remappedPasted = remapAnnotationTargets(newElements, pasteIdMap);

    pasteOffsetRef.current += 30;

    // Built against the committed setup, not the render-time one: the shot
    // list used to be rebuilt from a snapshot taken before the paste, so two
    // pastes in the same render kept only the second one's shots — and the
    // copies were numbered from a shot count that was already out of date.
    commitSetupUpdate((prevSetup) => ({
      ...prevSetup,
      elements: [...prevSetup.elements, ...remappedPasted],
      shots: [
        ...prevSetup.shots,
        ...pastedShots.map((shot, index) => {
          const order = prevSetup.shots.length + index + 1;
          return { ...shot, order, shotNumber: `${prevSetup.sceneNumber || '1'}/${order}` };
        }),
      ],
    }));
    setSelectedElementIds(newSelectedIds);
  };

  return { duplicateSelected, copySelectedElements, pasteElements };
};
