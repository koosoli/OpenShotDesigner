/**
 * The door element inspector.
 *
 * Lifted out of `InspectorPanel`, which held twelve of these in one switch and
 * had reached 4,600 lines because every new field was one more branch in a file
 * nobody could read end to end (AGENTS.md: one file per variant).
 *
 * Follows `LightInspector`: it reads what it needs from context directly rather
 * than taking a long prop list, since a twenty-prop list is only a copy of the
 * context with extra steps.
 */

import React, { useId } from 'react';
import type { DoorElement } from '../../../types';
import { DoorClosed, FlipHorizontal, SquareSplitHorizontal } from 'lucide-react';
import { RubricSection } from '../shared/InspectorPrimitives';
import { useFloorPlan } from '../../../context/FloorPlanContext';

interface DoorInspectorProps {
  door: DoorElement;
  isLight: boolean;
}

export const DoorInspector: React.FC<DoorInspectorProps> = ({ door, isLight }) => {
  const fieldId = useId();
  const { updateElement } = useFloorPlan();
  return (
    <div className="space-y-3 pt-1">
      <RubricSection
            persistKey="doorinspector.door-dimensions-swing"
        title="Door Dimensions & Swing"
        icon={<DoorClosed className="w-3.5 h-3.5 text-warn" />}
        defaultOpen={true}
        isLight={isLight}
      >
        <div>
          <label htmlFor={`${fieldId}-door-width-px`} className="opacity-60 block mb-1">Door Width (px)</label>
          <input id={`${fieldId}-door-width-px`}
            type="number"
            min={30}
            max={150}
            value={door.width || 60}
            onChange={(e) => updateElement(door.id, { width: Number(e.target.value) })}
            className={`w-full border rounded p-1.5 font-mono text-xs ${
              'bg-field text-ink border-line-strong'
            }`}
          />
        </div>

        <div>
          <span id={`${fieldId}-door-swing-angle-group`} className="opacity-60 block mb-1">Door Swing Angle</span>
          <div role="group" aria-labelledby={`${fieldId}-door-swing-angle-group`} className="grid grid-cols-3 gap-1.5">
            {[45, 90, 180].map((deg) => (
              <button
                key={deg}
                onClick={() => updateElement(door.id, { swingAngle: deg })}
                className={`py-1.5 text-xs font-mono rounded border ${
                  (door.swingAngle || 90) === deg
                    ? 'bg-amber-600 text-white border-amber-500 font-bold'
                    : 'bg-surface-sunken text-slate-700 dark:text-slate-400 border-line-strong'
                }`}
              >
                {deg}°
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={() => updateElement(door.id, { swingDirection: door.swingDirection === 'left' ? 'right' : 'left' })}
            className={`py-1.5 px-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1 transition-colors ${
              'bg-surface-muted hover:bg-surface-hover text-ink-soft border-line-strong'
            }`}
          >
            <FlipHorizontal className="w-3.5 h-3.5 text-warn" />
            <span>{door.swingDirection === 'left' ? 'Left Hinge' : 'Right Hinge'}</span>
          </button>
          <button
            onClick={() => updateElement(door.id, { isOpen: !door.isOpen })}
            className={`py-1.5 px-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-1 transition-colors ${
              'bg-surface-muted hover:bg-surface-hover text-ink-soft border-line-strong'
            }`}
          >
            <SquareSplitHorizontal className="w-3.5 h-3.5 text-warn" />
            <span>{door.isOpen ? 'Door Open' : 'Door Closed'}</span>
          </button>
        </div>
      </RubricSection>
    </div>
  );
};
