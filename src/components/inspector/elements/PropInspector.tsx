/**
 * The prop element inspector.
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
import type { PropElement } from '../../../types';
import { Compass, Tv } from 'lucide-react';
import { PROP_CATALOG } from '../../../constants/presets';
import { RubricSection, WaypointListEditor } from '../shared/InspectorPrimitives';
import { createId } from '../../../domain/ids';
import { parseOption } from '../../../domain/optionValue';
import { useFloorPlan } from '../../../context/FloorPlanContext';

interface PropInspectorProps {
  prop: PropElement;
  isLight: boolean;
}

export const PropInspector: React.FC<PropInspectorProps> = ({ prop, isLight }) => {
  const fieldId = useId();
  const { activeSetup, updateElement, updateSetupMeta } = useFloorPlan();
  return (
    <div className="space-y-3 pt-1">
      <RubricSection
            persistKey="propinspector.prop-dimensions-type"
        title="Prop Dimensions & Type"
        icon={<Tv className="w-3.5 h-3.5 text-purple-500" />}
        defaultOpen={true}
        isLight={isLight}
      >
        <div>
          <label htmlFor={`${fieldId}-prop-type-preset`} className="opacity-60 block mb-1">Prop Type Preset</label>
          <select id={`${fieldId}-prop-type-preset`}
            value={prop.propType}
            onChange={(e) => {
              const info = PROP_CATALOG.find((p) => p.type === e.target.value);
              updateElement(prop.id, {
                propType: parseOption(
                  PROP_CATALOG.map((p) => p.type),
                  e.target.value,
                  prop.propType,
                ),
                width: info?.defaultWidth ?? prop.width,
                height: info?.defaultHeight ?? prop.height,
                color: info?.defaultColor ?? prop.color,
              });
            }}
            className={`w-full border rounded-lg p-2 ${
              isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
            }`}
          >
            {PROP_CATALOG.map((p) => (
              <option key={p.type} value={p.type}>
                {p.name} ({p.category})
              </option>
            ))}
          </select>
        </div>

        {/* Quick Scale Presets */}
        <div>
          <div className="flex justify-between items-center text-[10px] font-bold uppercase opacity-60 mb-1">
            <span>Quick Scale Factor</span>
            <span className="font-mono text-sky-500">
              {Math.round((prop.width / (PROP_CATALOG.find((p) => p.type === prop.propType)?.defaultWidth || 100)) * 100)}%
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1 text-[10px] font-mono">
            {[
              { label: '25%', factor: 0.25 },
              { label: '50%', factor: 0.5 },
              { label: '75%', factor: 0.75 },
              { label: '100%', factor: 1.0 },
              { label: '150%', factor: 1.5 },
            ].map(({ label, factor }) => {
              const base = PROP_CATALOG.find((p) => p.type === prop.propType) || { defaultWidth: 100, defaultHeight: 100 };
              const targetW = Math.round(base.defaultWidth * factor);
              const targetH = Math.round(base.defaultHeight * factor);
              const isCurrent = Math.abs(prop.width - targetW) < 4;

              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => updateElement(prop.id, { width: targetW, height: targetH })}
                  className={`py-1 rounded border font-bold transition-colors ${
                    isCurrent
                      ? 'bg-sky-500 text-white border-sky-600 shadow-xs'
                      : isLight
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={`${fieldId}-width-px`} className="opacity-60 block mb-1">Width (px)</label>
            <input id={`${fieldId}-width-px`}
              type="number"
              min={5}
              max={3000}
              value={prop.width}
              onChange={(e) => updateElement(prop.id, { width: Math.max(5, Number(e.target.value)) })}
              className={`w-full border rounded p-1 font-mono ${
                isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
              }`}
            />
          </div>
          <div>
            <label htmlFor={`${fieldId}-height-px`} className="opacity-60 block mb-1">Height (px)</label>
            <input id={`${fieldId}-height-px`}
              type="number"
              min={5}
              max={3000}
              value={prop.height}
              onChange={(e) => updateElement(prop.id, { height: Math.max(5, Number(e.target.value)) })}
              className={`w-full border rounded p-1 font-mono ${
                isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
              }`}
            />
          </div>
        </div>

        {/* Prop Opacity Slider */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="opacity-60">Opacity</span>
            <span className="font-mono text-purple-400 font-bold">
              {Math.round((prop.opacity ?? 1) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={Math.round((prop.opacity ?? 1) * 100)}
            onChange={(e) => updateElement(prop.id, { opacity: Number(e.target.value) / 100 })}
            className="w-full accent-purple-500 cursor-pointer h-1.5"
          />
        </div>

        {/* Color / Material Tint */}
        <div>
          <span id={`${fieldId}-color-material-tint-group`} className="opacity-60 block mb-1">Color / Material Tint</span>
          <div role="group" aria-labelledby={`${fieldId}-color-material-tint-group`} className="flex items-center gap-2">
            <input
              type="color"
              value={prop.color || '#475569'}
              onChange={(e) => updateElement(prop.id, { color: e.target.value })}
              className="w-8 h-8 rounded border cursor-pointer flex-shrink-0"
            />
            <input
              type="text"
              value={prop.color || '#475569'}
              onChange={(e) => updateElement(prop.id, { color: e.target.value })}
              className={`flex-1 border rounded p-1 font-mono text-xs ${
                isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
              }`}
            />
          </div>
        </div>
      </RubricSection>

      {/* Waypoints & Movement (cars / props that move during a shot) */}
      {(() => {
        const nextBeat = Math.max(2, ...(prop.path || []).map((wp) => wp.beat + 1));
        const handleAddPropWp = () => {
          const existingPath = prop.path || [];
          const lastPoint = existingPath.length > 0
            ? existingPath[existingPath.length - 1]
            : { x: prop.x, y: prop.y, rotation: prop.rotation || 0 };
          const angleRad = ((lastPoint.rotation || 0) * Math.PI) / 180;
          const offsetDist = 70;
          const newWp = {
            id: createId('wp'),
            x: Math.round(lastPoint.x + Math.cos(angleRad) * offsetDist),
            y: Math.round(lastPoint.y + Math.sin(angleRad) * offsetDist),
            rotation: lastPoint.rotation || 0,
            beat: nextBeat,
            dialogueCue: '',
          };
          updateElement(prop.id, { path: [...existingPath, newWp] });
          if (nextBeat > (activeSetup.totalBeats || 1)) {
            updateSetupMeta({ totalBeats: nextBeat });
          }
        };

        return (
          <RubricSection
            persistKey="propinspector.waypoints-trajectory"
            title="Waypoints & Trajectory"
            icon={<Compass className="w-3.5 h-3.5 text-purple-500" />}
            defaultOpen={true}
            isLight={isLight}
            headerRight={
              <button
                type="button"
                title={`Add movement waypoint (Beat ${nextBeat})`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  handleAddPropWp();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                }}
                className="px-2 py-0.5 text-[10px] font-bold rounded bg-purple-600 hover:bg-purple-700 active:scale-95 text-white transition-all cursor-pointer select-none"
              >
                + Waypoint
              </button>
            }
          >
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                handleAddPropWp();
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
              className={`w-full py-2 border rounded-lg text-xs font-semibold cursor-pointer select-none active:scale-[0.98] transition-transform ${
                isLight ? 'bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100' : 'bg-slate-800 hover:bg-slate-700 text-purple-300 border-slate-700'
              }`}
            >
              + Add Prop Waypoint (Beat {nextBeat})
            </button>

            <WaypointListEditor
              elementId={prop.id}
              path={prop.path || []}
              baseRotation={prop.rotation}
              accentClass="text-purple-500"
              isLight={isLight}
            />
          </RubricSection>
        );
      })()}
    </div>
  );
};
