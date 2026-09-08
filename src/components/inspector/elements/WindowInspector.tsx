/**
 * The window element inspector.
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
import type { WindowElement } from '../../../types';
import { PillToggle, RubricSection } from '../shared/InspectorPrimitives';
import { RotateCw, AppWindow } from 'lucide-react';
import { useFloorPlan } from '../../../context/FloorPlanContext';

interface WindowInspectorProps {
  win: WindowElement;
  isLight: boolean;
}

export const WindowInspector: React.FC<WindowInspectorProps> = ({ win, isLight }) => {
  const fieldId = useId();
  const { updateElement } = useFloorPlan();
  return (
    <div className="space-y-3 pt-1">
      <RubricSection
            persistKey="windowinspector.window-dimensions-sunlight"
        title="Window Dimensions & Sunlight"
        icon={<AppWindow className="w-3.5 h-3.5 text-sky-500" />}
        defaultOpen={true}
        isLight={isLight}
      >
        <div>
          <label htmlFor={`${fieldId}-window-width-px`} className="opacity-60 block mb-1">Window Width (px)</label>
          <input id={`${fieldId}-window-width-px`}
            type="number"
            min={30}
            max={250}
            value={win.width || 80}
            onChange={(e) => updateElement(win.id, { width: Number(e.target.value) })}
            className={`w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
          />
        </div>

        <div>
          <label htmlFor={`${fieldId}-depth-frame-px`} className="opacity-60 block mb-1">Depth / Frame (px)</label>
          <input id={`${fieldId}-depth-frame-px`}
            type="number"
            min={6}
            max={30}
            value={win.depth || 12}
            onChange={(e) => updateElement(win.id, { depth: Number(e.target.value) })}
            className={`w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
          />
        </div>

        <div className="p-2.5 bg-sky-500/10 border border-sky-500/30 rounded-lg text-[11px] text-sky-600">
          <span className="font-semibold block mb-0.5">Natural Sunlight Simulation</span>
          Acts as an ambient daylight portal on the floor plan and camera coverage preview.
        </div>

        <PillToggle
          on={win.beamVisible === true}
          onClick={() =>
            updateElement(win.id, {
              beamVisible: !win.beamVisible,
            })
          }
          label="Sunlight cone"
          isLight={isLight}
        />

        {/* Window Orientation & Direction */}
        <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex justify-between items-center mb-1">
            <span className="opacity-60 text-xs">Window Facing Angle</span>
            <span className="font-mono text-xs font-bold text-sky-500">
              {Math.round(((win.rotation || 0) % 360 + 360) % 360)}°
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={359}
            value={Math.round(((win.rotation || 0) % 360 + 360) % 360)}
            onChange={(e) => updateElement(win.id, { rotation: Number(e.target.value) })}
            className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-sky-500"
          />
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              type="button"
              onClick={() =>
                updateElement(win.id, {
                  rotation: Math.round(((win.rotation || 0) + 180) % 360),
                })
              }
              className={`py-1.5 px-2 border rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
              }`}
            >
              <RotateCw className="w-3 h-3" />
              Flip 180°
            </button>
            <button
              type="button"
              onClick={() =>
                updateElement(win.id, {
                  rotation: Math.round(((win.rotation || 0) + 90) % 360),
                })
              }
              className={`py-1.5 px-2 border rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-200 border-slate-700'
              }`}
            >
              <RotateCw className="w-3 h-3" />
              Rotate +90°
            </button>
          </div>
        </div>
      </RubricSection>
    </div>
  );
};
