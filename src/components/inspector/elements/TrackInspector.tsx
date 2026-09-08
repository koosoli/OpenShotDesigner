/**
 * The dolly track element inspector.
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
import type { TrackElement } from '../../../types';
import { Gauge, MoveRight } from 'lucide-react';
import { RubricSection } from '../shared/InspectorPrimitives';
import { useFloorPlan } from '../../../context/FloorPlanContext';

interface TrackInspectorProps {
  track: TrackElement;
  isLight: boolean;
}

export const TrackInspector: React.FC<TrackInspectorProps> = ({ track, isLight }) => {
  const fieldId = useId();
  const { updateElement } = useFloorPlan();
  const trackLen = Math.round(
    Math.hypot((track.x2 ?? track.x + 240) - track.x, (track.y2 ?? track.y) - track.y)
  );
  const isCurved = !!track.isCurved;
  const curveOffset = track.curveOffset ?? 60;
  return (
    <div className="space-y-3 pt-1">
      <RubricSection
            persistKey="trackinspector.dolly-track-geometry"
        title="Dolly Track Geometry"
        icon={<MoveRight className="w-3.5 h-3.5 text-slate-400" />}
        badge={
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-500/10 font-bold">
            {(trackLen / 25).toFixed(0)}ft
          </span>
        }
        defaultOpen={true}
        isLight={isLight}
      >
        <div className="flex items-center justify-between text-xs">
          <span className="opacity-60">Track Length:</span>
          <span className="font-mono text-sky-500 font-bold">{(trackLen / 25).toFixed(0)}ft ({trackLen}px)</span>
        </div>

        {/* Straight / Curved toggle */}
        <div>
          <span id={`${fieldId}-track-shape-group`} className="opacity-60 block mb-1">Track Shape</span>
          <div role="group" aria-labelledby={`${fieldId}-track-shape-group`} className="grid grid-cols-2 gap-2">
            <button
              onClick={() => updateElement(track.id, { isCurved: false })}
              className={`py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                !isCurved
                  ? 'bg-sky-600 text-white border-sky-500'
                  : isLight
                    ? 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                    : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <MoveRight className="w-3.5 h-3.5" />
              Straight
            </button>
            <button
              onClick={() => updateElement(track.id, { isCurved: true, curveOffset: curveOffset || 60 })}
              className={`py-1.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                isCurved
                  ? 'bg-amber-500 text-slate-900 border-amber-400'
                  : isLight
                    ? 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                    : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <Gauge className="w-3.5 h-3.5" />
              Curved
            </button>
          </div>
        </div>

        {isCurved && (
          <>
            {/* Curve magnitude slider */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="opacity-60">Curve Magnitude</span>
                <span className="font-mono font-bold text-amber-500">{curveOffset}px</span>
              </div>
              <input
                type="range"
                min={-500}
                max={500}
                step={5}
                value={curveOffset}
                onChange={(e) => updateElement(track.id, { curveOffset: Number(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <div className="flex justify-between text-[9px] font-mono opacity-50 mt-0.5">
                <span>Bends left</span>
                <span>0</span>
                <span>Bends right</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => updateElement(track.id, { curveOffset: -curveOffset })}
                className={`py-1 rounded-lg border text-[10px] font-semibold transition-colors ${
                  isLight ? 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100' : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                }`}
              >
                Flip Curve Direction
              </button>
              <button
                onClick={() => updateElement(track.id, { isCurved: false, curveOffset: 0 })}
                className={`py-1 rounded-lg border text-[10px] font-semibold transition-colors ${
                  isLight ? 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100' : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                }`}
              >
                Make Straight
              </button>
            </div>
          </>
        )}

        <p className="text-[10px] opacity-50 leading-relaxed">
          Tip: select the track and drag the amber curve handle on the canvas to bend it live.
          Hold <kbd className="px-1 py-0.5 rounded bg-slate-800 text-slate-200 font-mono text-[9px]">Shift</kbd> to snap the curve in 10px steps.
        </p>
      </RubricSection>
    </div>
  );
};
