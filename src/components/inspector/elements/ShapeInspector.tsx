/**
 * The shape element inspector.
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
import { inspectorSelectClass } from '../shared/InspectorPrimitives';
import type { ShapeElement } from '../../../types';
import { Circle } from 'lucide-react';
import { RubricSection } from '../shared/InspectorPrimitives';
import { ShapeType } from '../../../types';
import { useFloorPlan } from '../../../context/FloorPlanContext';

const SHAPE_TYPES: ShapeType[] = [
  'line',
  'rectangle',
  'circle',
  'ellipse',
  'triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'star',
];

interface ShapeInspectorProps {
  shape: ShapeElement;
  isLight: boolean;
}

export const ShapeInspector: React.FC<ShapeInspectorProps> = ({ shape, isLight }) => {
  const fieldId = useId();
  const selectClass = inspectorSelectClass(isLight);
  const { updateElement } = useFloorPlan();
  const fill = shape.color || '#38bdf8';
  const strokeColor = shape.strokeColor || fill;
  const fillOpacity = shape.opacity ?? 0.3;
  const strokeWidth = shape.strokeWidth ?? 2;
  const strokeOpacity = shape.strokeOpacity ?? 1;
  const dashStyle = shape.dashStyle || 'solid';
  const filled = shape.filled !== false;
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
            persistKey="shapeinspector.shape-geometry-styling"
        title="Shape Geometry & Styling"
        icon={<Circle className="w-3.5 h-3.5 text-cyan-500" />}
        badge={
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-500 font-bold capitalize">
            {shape.shapeType}
          </span>
        }
        defaultOpen={true}
        isLight={isLight}
      >
        <div>
          <label htmlFor={`${fieldId}-type`} className="opacity-60 block mb-1">Type</label>
          <select id={`${fieldId}-type`}
            value={shape.shapeType}
            onChange={(e) => updateElement(shape.id, { shapeType: e.target.value as ShapeType })}
            className={selectClass}
          >
            {SHAPE_TYPES.map((value) => (
              <option key={value} value={value}>
                {value.charAt(0).toUpperCase() + value.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs opacity-60">Show on floor plan</span>
          <button
            onClick={() => updateElement(shape.id, { visible: shape.visible === false ? true : false })}
            title={shape.visible === false ? 'Hidden shapes stay on the canvas as a faint dashed ghost' : 'Hide this shape (it becomes a faint ghost you can click to re-show)'}
            className={`px-3 py-1 text-[10px] font-bold rounded border ${
              shape.visible !== false
                ? 'bg-sky-600 text-white border-sky-500'
                : isLight
                ? 'bg-slate-50 text-slate-500 border-slate-300'
                : 'bg-slate-950 text-slate-500 border-slate-700'
            }`}
          >
            {shape.visible !== false ? 'Visible' : 'Hidden'}
          </button>
        </div>

        <div>
          <label htmlFor={`${fieldId}-label-optional`} className="opacity-60 block mb-1">Label (optional)</label>
          <input id={`${fieldId}-label-optional`}
            type="text"
            value={shape.label || ''}
            onChange={(e) => updateElement(shape.id, { label: e.target.value })}
            placeholder="e.g. Hot zone, carpet, shadow…"
            className={`w-full border rounded p-1.5 text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
          />
        </div>

        {shape.shapeType === 'line' ? (
          /* Tailored controls for Line Shape */
          <div className="space-y-3 pt-1">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-slate-300">Line Length (px)</span>
                <span className="font-mono font-bold text-sky-400">{Math.round(shape.width)} px</span>
              </div>
              <input
                type="range"
                min={20}
                max={1200}
                value={shape.width}
                onChange={(e) => updateElement(shape.id, { width: Number(e.target.value) })}
                className="w-full accent-sky-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-slate-300">Line Thickness / Stroke (px)</span>
                <span className="font-mono font-bold text-sky-400">{shape.strokeWidth ?? 4} px</span>
              </div>
              <input
                type="range"
                min={1}
                max={40}
                step={1}
                value={shape.strokeWidth ?? 4}
                onChange={(e) => updateElement(shape.id, { strokeWidth: Number(e.target.value) })}
                className="w-full accent-sky-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-slate-300">Line Color</span>
                <span className="font-mono font-bold uppercase text-sky-400">{strokeColor}</span>
              </div>
              <input
                type="color"
                value={strokeColor}
                onChange={(e) => updateElement(shape.id, { strokeColor: e.target.value, color: e.target.value })}
                className="w-full h-8 cursor-pointer rounded border bg-transparent"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-semibold text-slate-300">Line Opacity</span>
                <span className="font-mono font-bold text-sky-400">{Math.round(strokeOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={strokeOpacity}
                onChange={(e) => updateElement(shape.id, { strokeOpacity: Number(e.target.value) })}
                className="w-full accent-sky-500 cursor-pointer"
              />
            </div>
          </div>
        ) : (
          /* Controls for 2D Polygons, Rectangles & Circles */
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="opacity-60">Width</span>
                  <span className="font-mono font-bold">{Math.round(shape.width)}</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={900}
                  value={shape.width}
                  onChange={(e) => updateElement(shape.id, { width: Number(e.target.value) })}
                  className="w-full accent-sky-500 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="opacity-60">Height</span>
                  <span className="font-mono font-bold">{Math.round(shape.height)}</span>
                </div>
                <input
                  type="range"
                  min={20}
                  max={900}
                  value={shape.height}
                  onChange={(e) => updateElement(shape.id, { height: Number(e.target.value) })}
                  className="w-full accent-sky-500 cursor-pointer"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="opacity-60">Fill</span>
                <button
                  onClick={() => updateElement(shape.id, { filled: !filled })}
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                    filled
                      ? 'bg-sky-600 text-white border-sky-500'
                      : isLight
                      ? 'bg-slate-100 text-slate-500 border-slate-300'
                      : 'bg-slate-950 text-slate-400 border-slate-700'
                  }`}
                >
                  {filled ? 'Filled' : 'Outline only'}
                </button>
              </div>
              <input
                type="color"
                value={fill}
                onChange={(e) => updateElement(shape.id, { color: e.target.value })}
                className="w-full h-8 cursor-pointer rounded border bg-transparent"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="opacity-60">Fill Opacity</span>
                <span className="font-mono font-bold">{Math.round(fillOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={fillOpacity}
                onChange={(e) => updateElement(shape.id, { opacity: Number(e.target.value) })}
                className="w-full accent-sky-500 cursor-pointer"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="opacity-60">Outline Color</span>
                <span className="font-mono font-bold uppercase">{strokeColor}</span>
              </div>
              <input
                type="color"
                value={strokeColor}
                onChange={(e) => updateElement(shape.id, { strokeColor: e.target.value })}
                className="w-full h-8 cursor-pointer rounded border bg-transparent"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="opacity-60">Outline</span>
                  <span className="font-mono font-bold">{strokeWidth}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={strokeWidth}
                  onChange={(e) => updateElement(shape.id, { strokeWidth: Number(e.target.value) })}
                  className="w-full accent-sky-500 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="opacity-60">Outline Opacity</span>
                  <span className="font-mono font-bold">{Math.round(strokeOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={strokeOpacity}
                  onChange={(e) => updateElement(shape.id, { strokeOpacity: Number(e.target.value) })}
                  className="w-full accent-sky-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        <div>
          <span id={`${fieldId}-outline-style-group`} className="opacity-60 block mb-1">Outline Style</span>
          <div role="group" aria-labelledby={`${fieldId}-outline-style-group`} className="grid grid-cols-3 gap-1">
            {(['solid', 'dashed', 'dotted'] as const).map((style) => (
              <button
                key={style}
                onClick={() => updateElement(shape.id, { dashStyle: style })}
                className={optionBtn(dashStyle === style)}
              >
                {style}
              </button>
            ))}
          </div>
        </div>

        {shape.shapeType === 'rectangle' && (
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="opacity-60">Corner Radius</span>
              <span className="font-mono font-bold">{shape.cornerRadius ?? 0}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={80}
              value={shape.cornerRadius ?? 0}
              onChange={(e) => updateElement(shape.id, { cornerRadius: Number(e.target.value) })}
              className="w-full accent-sky-500 cursor-pointer"
            />
          </div>
        )}
      </RubricSection>
    </div>
  );
};
