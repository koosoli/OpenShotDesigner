import React from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { Eye, EyeOff, Lock, Unlock } from 'lucide-react';
import type { PlanLayer } from '../../types';

/**
 * Compact layer stack editor (plan §6.1). Lists the active setup's layers in
 * `order` with visibility / lock toggles and an optional opacity slider.
 * Updates go through the same setup-level path as gridSettings
 * (`updateSetupMeta`), so layers persist, autosave and undo like any other
 * setup data. Elements without a `layerId` are unlayered and always render.
 */
export const LayersPanel: React.FC = () => {
  const { activeSetup, theme, updateSetupMeta } = useFloorPlan();
  const isLight = theme === 'light';

  const layers = [...(activeSetup.layers || [])].sort((a, b) => a.order - b.order);

  const updateLayer = (id: string, updates: Partial<PlanLayer>) => {
    updateSetupMeta({
      layers: (activeSetup.layers || []).map((layer) =>
        layer.id === id ? { ...layer, ...updates } : layer
      ),
    });
  };

  if (layers.length === 0) {
    return (
      <p className={`text-[11px] italic ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
        This scene has no layers yet — every element is unlayered and always visible.
      </p>
    );
  }

  const iconBtnClass = (active: boolean) =>
    `flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 transition-colors ${
      active
        ? 'bg-sky-600/15 text-sky-500'
        : isLight
          ? 'text-slate-400 hover:bg-slate-200/70'
          : 'text-slate-500 hover:bg-slate-800'
    }`;

  return (
    <div className="space-y-1">
      {layers.map((layer) => (
        <div
          key={layer.id}
          className={`rounded-lg px-1.5 py-1 ${isLight ? 'hover:bg-slate-100/70' : 'hover:bg-slate-800/40'}`}
        >
          <div className="flex items-center gap-1">
            <button
              onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
              title={layer.visible ? 'Hide layer' : 'Show layer'}
              className={iconBtnClass(layer.visible)}
            >
              {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
            <button
              onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
              title={layer.locked ? 'Unlock layer' : 'Lock layer'}
              className={iconBtnClass(layer.locked)}
            >
              {layer.locked ? (
                <Lock className="w-4 h-4 text-amber-500" />
              ) : (
                <Unlock className="w-4 h-4" />
              )}
            </button>
            <span
              className={`flex-1 min-w-0 truncate text-[11px] font-medium ${
                layer.visible ? '' : 'opacity-50'
              }`}
            >
              {layer.name}
            </span>
            {layer.opacity !== undefined && (
              <span className="text-[9px] font-mono text-sky-500 flex-shrink-0 select-none">
                {Math.round(layer.opacity * 100)}%
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 pl-9 pr-1">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round((layer.opacity ?? 1) * 100)}
              onChange={(e) => updateLayer(layer.id, { opacity: Number(e.target.value) / 100 })}
              title="Layer opacity"
              className="w-full h-1.5 accent-sky-500 cursor-pointer"
            />
          </div>
        </div>
      ))}
      <p className={`text-[10px] italic pt-1 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
        Hidden layers are not rendered or exported to screen; locked layers cannot be selected or
        dragged. Unlayered elements always show.
      </p>
    </div>
  );
};
