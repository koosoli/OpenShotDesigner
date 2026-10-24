/**
 * Keeps floor-plan scenes in step with the screenplay wherever the user is
 * working (domain/script/setupLink): a plan follows its scene when the script
 * is renumbered, takes its heading, and a scene drawn on the canvas first is
 * linked to the scene of its number once that is written.
 *
 * Not recorded as an undo step of its own — it is a consequence of the edit
 * that caused it, and undoing that edit brings the plans back in step again.
 */
import { useEffect } from 'react';
import { setupsOutOfStep, syncSetupsWithScriptCommand } from '../domain/commands';
import { useFloorPlan } from './FloorPlanContext';

export const useScriptSetupSync = (): void => {
  const { project, runCommand } = useFloorPlan();
  useEffect(() => {
    if (!setupsOutOfStep(project)) return;
    runCommand(syncSetupsWithScriptCommand, {}, { domain: 'script', record: false });
    // Only the script's scenes and the plans decide; runCommand is stable in effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.scriptScenes, project.setups]);
};
