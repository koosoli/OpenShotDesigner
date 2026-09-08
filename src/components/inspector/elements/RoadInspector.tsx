/**
 * The road element inspector.
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
import type { RoadElement } from '../../../types';
import { RubricSection } from '../shared/InspectorPrimitives';
import { Square } from 'lucide-react';
import { useFloorPlan } from '../../../context/FloorPlanContext';

interface RoadInspectorProps {
  road: RoadElement;
  isLight: boolean;
}

export const RoadInspector: React.FC<RoadInspectorProps> = ({ road, isLight }) => {
  const fieldId = useId();
  const { updateElement } = useFloorPlan();
  const length = Math.round(
    Math.hypot((road.x2 ?? road.x + 320) - road.x, (road.y2 ?? road.y) - road.y),
  );
  const curveOffset = road.curveOffset ?? 60;
  const btn = (active: boolean) =>
    `py-1.5 px-2 rounded-lg border text-[10px] font-semibold transition-colors ${
      active
        ? 'bg-sky-600 text-white border-sky-500'
        : isLight
        ? 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
        : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
    }`;
  return (
    <div className="space-y-3 pt-1">
      <RubricSection
            persistKey="roadinspector.street-surface-markings"
        title="Street Surface & Markings"
        icon={<Square className="w-3.5 h-3.5 text-zinc-400" />}
        badge={
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-zinc-500/10 font-bold">
            {(length / 50).toFixed(2)}m
          </span>
        }
        defaultOpen={true}
        isLight={isLight}
      >
        <div className="flex items-center justify-between text-xs">
          <span className="opacity-60">Run length:</span>
          <span className="font-mono text-sky-500 font-bold">{(length / 50).toFixed(2)}m ({length}px)</span>
        </div>

        <div>
          <label className="opacity-60 block mb-1">
            Carriageway width &mdash; {((road.width || 120) / 50).toFixed(2)}m
          </label>
          <input
            type="range"
            min={20}
            max={400}
            step={5}
            value={road.width || 120}
            onChange={(e) => updateElement(road.id, { width: Number(e.target.value) })}
            className="w-full accent-sky-500 cursor-pointer"
          />
        </div>

        <div>
          <span id={`${fieldId}-surface-group`} className="opacity-60 block mb-1">Surface</span>
          <div role="group" aria-labelledby={`${fieldId}-surface-group`} className="grid grid-cols-3 gap-1">
            {([
              ['asphalt', 'Asphalt'],
              ['concrete', 'Concrete'],
              ['cobble', 'Cobble'],
              ['gravel', 'Gravel'],
              ['dirt', 'Dirt track'],
              ['rail', 'Rail / tram'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => updateElement(road.id, { surface: value })}
                className={btn((road.surface ?? 'asphalt') === value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span id={`${fieldId}-centre-marking-group`} className="opacity-60 block mb-1">Centre marking</span>
          <div role="group" aria-labelledby={`${fieldId}-centre-marking-group`} className="grid grid-cols-3 gap-1">
            {([
              ['none', 'None'],
              ['dashed', 'Dashed'],
              ['solid', 'Solid'],
              ['double', 'Double'],
              ['crosswalk', 'Crossing'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => updateElement(road.id, { marking: value })}
                className={btn((road.marking ?? 'dashed') === value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={`${fieldId}-lanes`} className="opacity-60 block mb-1">Lanes</label>
            <input id={`${fieldId}-lanes`}
              type="number"
              min={1}
              max={8}
              value={road.lanes ?? 2}
              onChange={(e) =>
                updateElement(road.id, { lanes: Math.max(1, Math.min(8, Number(e.target.value) || 1)) })
              }
              className={`w-full border rounded p-1.5 font-mono text-xs ${
                isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
              }`}
            />
          </div>
          <div>
            <span className="opacity-60 block mb-1">Pavements</span>
            <button
              aria-label="Pavements"
              aria-pressed={!!road.sidewalks}
              onClick={() => updateElement(road.id, { sidewalks: !road.sidewalks })}
              className={`w-full ${btn(!!road.sidewalks)}`}
            >
              {road.sidewalks ? 'On' : 'Off'}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor={`${fieldId}-street-name`} className="opacity-60 block mb-1">Street name</label>
          <input id={`${fieldId}-street-name`}
            type="text"
            value={road.label ?? ''}
            onChange={(e) => updateElement(road.id, { label: e.target.value || undefined })}
            placeholder="e.g. Riverside Promenade"
            className={`w-full border rounded p-1.5 text-xs ${
              isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
            }`}
          />
        </div>

        <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/50 space-y-2">
          <button
            onClick={() =>
              updateElement(road.id, {
                isCurved: !road.isCurved,
                curveOffset: road.isCurved ? 0 : 60,
              })
            }
            className={`w-full ${btn(!!road.isCurved)}`}
          >
            {road.isCurved ? 'Curved run' : 'Straight run'}
          </button>
          {road.isCurved && (
            <div>
              <label className="opacity-60 block mb-1">Bend &mdash; {curveOffset}px</label>
              <input
                type="range"
                min={-500}
                max={500}
                step={5}
                value={curveOffset}
                onChange={(e) => updateElement(road.id, { curveOffset: Number(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
            </div>
          )}
          <p className="text-[10px] opacity-50 leading-relaxed">
            Drag either endpoint to lay the run, and the amber handle to bend it &mdash; the same
            controls as a dolly track. Widths convert at the plan scale, so a 6&nbsp;m street is
            300px at the default 50px/m.
          </p>
        </div>
      </RubricSection>
    </div>
  );
};
