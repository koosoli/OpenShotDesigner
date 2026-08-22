/**
 * The arrow element inspector.
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
import type { ArrowElement } from '../../../types';
import { MoveRight } from 'lucide-react';
import { RubricSection } from '../shared/InspectorPrimitives';
import { useFloorPlan } from '../../../context/FloorPlanContext';

interface ArrowInspectorProps {
  arr: ArrowElement;
  isLight: boolean;
}

export const ArrowInspector: React.FC<ArrowInspectorProps> = ({ arr, isLight }) => {
  const fieldId = useId();
  const { updateElement } = useFloorPlan();
  const arrowColor = arr.color || '#f97316';
  const strokeWidth = arr.strokeWidth || 2.5;
  const headStyle = arr.headStyle || 'single';
  const dashStyle = arr.dashStyle || 'solid';
  const optionBtn = (active: boolean) =>
    `py-1.5 text-[10px] font-semibold rounded border capitalize ${
      active
        ? 'bg-sky-600 text-white border-sky-500'
        : isLight
        ? 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
        : 'bg-slate-950 text-slate-400 border-slate-700 hover:bg-slate-800'
    }`;

  return (
    <div className="space-y-3 pt-1">
      <RubricSection
        title="Arrow Direction & Style"
        icon={<MoveRight className="w-3.5 h-3.5 text-orange-500" />}
        defaultOpen={true}
        isLight={isLight}
      >
        <div>
          <label htmlFor={`${fieldId}-label-optional-2`} className="opacity-60 block mb-1">Label (optional)</label>
          <input id={`${fieldId}-label-optional-2`}
            type="text"
            value={arr.label || ''}
            onChange={(e) => updateElement(arr.id, { label: e.target.value })}
            placeholder="e.g. Camera move, Actor blocking…"
            className={`w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="opacity-60">Arrow Color</span>
            <span className="font-mono font-bold uppercase">{arrowColor}</span>
          </div>
          <input
            type="color"
            value={arrowColor}
            onChange={(e) => updateElement(arr.id, { color: e.target.value })}
            className="w-full h-8 cursor-pointer rounded border bg-transparent"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="opacity-60">Line Weight</span>
            <span className="font-mono font-bold">{strokeWidth}px</span>
          </div>
          <input
            type="range"
            min={1}
            max={8}
            step={0.5}
            value={strokeWidth}
            onChange={(e) => updateElement(arr.id, { strokeWidth: Number(e.target.value) })}
            className="w-full accent-sky-500 cursor-pointer"
          />
        </div>

        <div>
          <span id={`${fieldId}-arrowhead-group`} className="opacity-60 block mb-1">Arrowhead</span>
          <div role="group" aria-labelledby={`${fieldId}-arrowhead-group`} className="grid grid-cols-3 gap-1">
            {(['single', 'double', 'open'] as const).map((style) => (
              <button
                key={style}
                onClick={() => updateElement(arr.id, { headStyle: style })}
                className={optionBtn(headStyle === style)}
              >
                {style}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span id={`${fieldId}-line-style-group`} className="opacity-60 block mb-1">Line Style</span>
          <div role="group" aria-labelledby={`${fieldId}-line-style-group`} className="grid grid-cols-3 gap-1">
            {(['solid', 'dashed', 'dotted'] as const).map((dash) => (
              <button
                key={dash}
                onClick={() => updateElement(arr.id, { dashStyle: dash })}
                className={optionBtn(dashStyle === dash)}
              >
                {dash}
              </button>
            ))}
          </div>
        </div>
      </RubricSection>
    </div>
  );
};
