/**
 * The floor plan of a screenplay scene, from its heading: open it when the
 * scene has one, and otherwise make an empty one or link a plan drawn on the
 * canvas before the scene was written (domain/script/setupLink).
 */
import React from 'react';
import { LayoutGrid } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { linkSetupToSceneCommand, syncSetupsWithScriptCommand } from '../../domain/commands';
import { sceneOfSetup } from '../../domain/script/setupLink';
import { setupForScriptScene } from '../../utils/setupFromScene';

const NEW_PLAN = '__new';

export const ScenePlanLink: React.FC<{ sceneId: string }> = ({ sceneId }) => {
  const { project, runCommand, setActiveSetupId } = useFloorPlan();
  const scenes = project.scriptScenes ?? [];
  const scene = scenes.find((candidate) => candidate.id === sceneId);
  if (!scene || scene.omitted) return null;

  const plans = project.setups.filter((setup) => sceneOfSetup(setup, scenes)?.id === sceneId);
  if (plans.length > 0) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setActiveSetupId(plans[0].id);
        }}
        title={`Floor plan${plans.length > 1 ? 's' : ''}: ${plans.map((plan) => plan.name).join(', ')} — open on the canvas`}
        aria-label={`Open the floor plan of scene ${scene.sceneNumber}`}
        className="ml-2 inline-flex shrink-0 items-center gap-1 rounded border border-line px-1 text-[10px] font-normal normal-case tracking-normal text-ink-muted hover:text-accent-ink hover:border-accent"
      >
        <LayoutGrid className="h-3 w-3" />
        {plans.length > 1 ? `${plans.length} plans` : 'Plan'}
      </button>
    );
  }

  const unlinked = project.setups.filter((setup) => !setup.masterPlanForLocationId && !sceneOfSetup(setup, scenes));
  return (
    <select
      value=""
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        const value = event.target.value;
        if (value === NEW_PLAN) {
          runCommand(syncSetupsWithScriptCommand, { createFor: [sceneId], makeSetup: (target) => setupForScriptScene(target) }, { domain: 'script' });
        } else if (value) {
          runCommand(linkSetupToSceneCommand, { setupId: value, sceneId }, { domain: 'script' });
        }
      }}
      aria-label={`Floor plan for scene ${scene.sceneNumber}`}
      title="This scene has no floor plan yet: make one, or link a plan already on the canvas"
      className="ml-2 shrink-0 cursor-pointer rounded border border-dashed border-line bg-transparent px-0.5 text-[10px] font-normal normal-case tracking-normal text-ink-muted outline-none hover:border-accent"
    >
      <option value="">+ Plan</option>
      <option value={NEW_PLAN}>New empty plan</option>
      {unlinked.length > 0 && (
        <optgroup label="Link a plan on the canvas">
          {unlinked.map((setup) => (
            <option key={setup.id} value={setup.id}>
              {setup.sceneNumber ? `${setup.sceneNumber} · ` : ''}
              {setup.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
};
