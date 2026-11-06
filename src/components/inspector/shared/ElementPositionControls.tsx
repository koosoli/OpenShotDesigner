import { useId } from 'react';
import type { FloorPlanElement } from '../../../types';
import { useFloorPlan } from '../../../context/FloorPlanContext';
import { elementElevationMm } from '../../../domain/plan/elevation';
import { convertLength } from '../../../domain/units';

export function ElementPositionControls({ element }: { element: FloorPlanElement }) {
  const id = useId();
  const { activeSetup, updateElement } = useFloorPlan();
  const unit = activeSetup.gridSettings.unit;
  const elevation = Number(convertLength(elementElevationMm(element), 'mm', unit).toFixed(4));
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        {(['x', 'y'] as const).map((axis) => (
          <label key={axis} className="text-[10px] text-ink-muted">
            POS {axis.toUpperCase()} (px)
            <input type="number" value={Math.round(element[axis])} onChange={(event) => updateElement(element.id, { [axis]: event.currentTarget.valueAsNumber })}
              className="w-full border rounded px-2 py-1 font-mono text-xs bg-field text-ink border-line-strong" />
          </label>
        ))}
      </div>
      <label htmlFor={`${id}-elevation`} className="block text-xs font-semibold text-ink">Height above ground ({unit})</label>
      <input type="range" aria-label={`Height above ground slider (${unit})`}
        min={Math.min(0, elevation)} max={Math.max(convertLength(10000, 'mm', unit), elevation)}
        step={unit === 'ft' ? .1 : .01} value={elevation}
        onChange={(event) => updateElement(element.id, { elevationMm: convertLength(event.currentTarget.valueAsNumber, unit, 'mm') })}
        className="w-full accent-sky-500 cursor-pointer" />
      <input id={`${id}-elevation`} key={`${element.id}-${elevation}-${unit}`} type="number" step="any" defaultValue={elevation}
        onBlur={(event) => {
          const input = event.currentTarget;
          if (!Number.isFinite(input.valueAsNumber)) { input.value = String(elevation); return; }
          if (input.valueAsNumber !== elevation) updateElement(element.id, { elevationMm: convertLength(input.valueAsNumber, unit, 'mm') });
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== 'Escape') return;
          event.stopPropagation();
          if (event.key === 'Escape') event.currentTarget.value = String(elevation);
          event.currentTarget.blur();
        }}
        className="w-full border rounded px-2 py-1 font-mono text-xs bg-field text-ink border-line-strong" />
      <p className="text-[10px] text-ink-muted">Enter 3 m to raise a fabric sheet 3 m above the floor. This offsets the object's normal placement.</p>
    </div>
  );
}
