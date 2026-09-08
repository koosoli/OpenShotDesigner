/**
 * The wall element inspector.
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
import type { WallElement } from '../../../types';
import { DoorClosed, AppWindow, Square } from 'lucide-react';
import { RubricSection } from '../shared/InspectorPrimitives';
import { useFloorPlan } from '../../../context/FloorPlanContext';

interface WallInspectorProps {
  wall: WallElement;
  isLight: boolean;
}

export const WallInspector: React.FC<WallInspectorProps> = ({ wall, isLight }) => {
  const fieldId = useId();
  const { updateElement, insertDoorInWall, insertWindowInWall } = useFloorPlan();
  const wallLen = Math.round(
    Math.sqrt(Math.pow((wall.x2 ?? wall.x + 200) - wall.x, 2) + Math.pow((wall.y2 ?? wall.y) - wall.y, 2))
  );
  return (
    <div className="space-y-3 pt-1">
      <RubricSection
            persistKey="wallinspector.wall-dimensions-inserts"
        title="Wall Dimensions & Inserts"
        icon={<Square className="w-3.5 h-3.5 text-slate-400" />}
        badge={
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-500/10 font-bold">
            {(wallLen / 50).toFixed(2)}m
          </span>
        }
        defaultOpen={true}
        isLight={isLight}
      >
        <div className="flex items-center justify-between text-xs">
          <span className="opacity-60">Wall Length:</span>
          <span className="font-mono text-sky-500 font-bold">{(wallLen / 50).toFixed(2)}m ({wallLen}px)</span>
        </div>

        <div>
          <label htmlFor={`${fieldId}-thickness-px`} className="opacity-60 block mb-1">Thickness (px)</label>
          <input id={`${fieldId}-thickness-px`}
            type="number"
            min={4}
            max={40}
            value={wall.thickness || 12}
            onChange={(e) => updateElement(wall.id, { thickness: Number(e.target.value) })}
            className={`w-full border rounded p-1.5 font-mono text-xs ${
              isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
            }`}
          />
        </div>

        {/* Quick Snap Insert Door / Window Buttons */}
        <div className="pt-2 space-y-2 border-t border-slate-200/60 dark:border-slate-700/50">
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-60 block">
            Quick Wall Insertions
          </span>
          <button
            onClick={() => insertDoorInWall(wall.id)}
            className="w-full flex items-center justify-center gap-2 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 border border-amber-500/40 rounded-lg text-xs font-semibold transition-colors"
          >
            <DoorClosed className="w-4 h-4 text-amber-500" />
            <span>+ Snap Door onto this Wall</span>
          </button>
          <button
            onClick={() => insertWindowInWall(wall.id)}
            className="w-full flex items-center justify-center gap-2 py-2 bg-sky-500/15 hover:bg-sky-500/25 text-sky-600 border border-sky-500/40 rounded-lg text-xs font-semibold transition-colors"
          >
            <AppWindow className="w-4 h-4 text-sky-500" />
            <span>+ Snap Window onto this Wall</span>
          </button>
        </div>
      </RubricSection>
    </div>
  );
};
