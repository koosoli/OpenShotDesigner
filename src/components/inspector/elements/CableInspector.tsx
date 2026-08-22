/**
 * The cable element inspector.
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
import type { CableElement } from '../../../types';
import { CABLE_TYPES } from '../../../constants/presets';
import { RubricSection } from '../shared/InspectorPrimitives';
import { Cable, Zap } from 'lucide-react';
import { impliedEndpointInfo, impliedSignalTypeForCableType } from '../../../domain/cable/cableTypeSignals';
import { useFloorPlan } from '../../../context/FloorPlanContext';
import { validateConnectionCompatibility } from '../../../domain/cable';

interface CableInspectorProps {
  cable: CableElement;
  isLight: boolean;
}

export const CableInspector: React.FC<CableInspectorProps> = ({ cable, isLight }) => {
  const fieldId = useId();
  const { activeSetup, updateElement } = useFloorPlan();
  const cableInfo = CABLE_TYPES.find((c) => c.type === cable.cableType) || CABLE_TYPES[0];
  const ppu = activeSetup.gridSettings?.pixelsPerUnit || 50;
  const unit = activeSetup.gridSettings?.unit || 'm';
  const lengthVal = Math.round((Math.hypot((cable.x2 ?? cable.x + 150) - cable.x, (cable.y2 ?? cable.y) - cable.y) / ppu) * 10) / 10;
  const strokeWidth = cable.strokeWidth || 3.5;
  const inputClass = `w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`;
  const linkableElements = activeSetup.elements.filter((e) => e.id !== cable.id);
  const fromLinked = cable.fromElementId ? activeSetup.elements.find((e) => e.id === cable.fromElementId) : undefined;
  const toLinked = cable.toElementId ? activeSetup.elements.find((e) => e.id === cable.toElementId) : undefined;
  const impliedSignal = impliedSignalTypeForCableType(cable.cableType);
  const endpointIssues =
    fromLinked && toLinked
      ? validateConnectionCompatibility(
          impliedEndpointInfo(cable.cableType),
          impliedEndpointInfo(cable.cableType),
        )
      : [];
  const linkEndpoint = (side: 'from' | 'to', elementId: string) => {
    const target = elementId ? activeSetup.elements.find((e) => e.id === elementId) : undefined;
    if (side === 'from') {
      updateElement(cable.id, {
        fromElementId: target ? target.id : undefined,
        ...(target ? { fromLabel: target.name } : {}),
      });
    } else {
      updateElement(cable.id, {
        toElementId: target ? target.id : undefined,
        ...(target ? { toLabel: target.name } : {}),
      });
    }
  };
  const endpointChipClass = (linked: boolean) =>
    `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
      linked
        ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300'
        : isLight
        ? 'bg-slate-50 border-slate-300 text-slate-400'
        : 'bg-slate-900/60 border-slate-700 text-slate-500'
    }`;

  return (
    <div className="space-y-3 pt-1">
      <RubricSection
        title="Cable / Patch Run"
        icon={<Cable className="w-3.5 h-3.5 text-cyan-500" />}
        defaultOpen={true}
        isLight={isLight}
      >
        <div>
          <label htmlFor={`${fieldId}-cable-type`} className="opacity-60 block mb-1">Cable Type</label>
          <select id={`${fieldId}-cable-type`}
            value={cable.cableType}
            onChange={(e) => {
              const next = CABLE_TYPES.find((c) => c.type === e.target.value) || CABLE_TYPES[0];
              updateElement(cable.id, { cableType: next.type, color: cable.color || next.color } as any);
            }}
            className={inputClass}
          >
            {CABLE_TYPES.map((ct) => (
              <option key={ct.type} value={ct.type}>
                {ct.name}
              </option>
            ))}
          </select>
        </div>

        {cableInfo.isPower && (
          <div className="flex items-center gap-2 text-[11px] rounded-lg px-2.5 py-2 border bg-rose-950/40 border-rose-800/50 text-rose-300">
            <Zap className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              Power run · {cableInfo.connector}
              {cableInfo.rating ? ` · ${cableInfo.rating}` : ''}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor={`${fieldId}-from-source`} className="opacity-60 block mb-1">From (source)</label>
            <input id={`${fieldId}-from-source`}
              type="text"
              value={cable.fromLabel || ''}
              onChange={(e) => updateElement(cable.id, { fromLabel: e.target.value })}
              placeholder="e.g. CAM A, CCU 1, FOH…"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor={`${fieldId}-to-destination`} className="opacity-60 block mb-1">To (destination)</label>
            <input id={`${fieldId}-to-destination`}
              type="text"
              value={cable.toLabel || ''}
              onChange={(e) => updateElement(cable.id, { toLabel: e.target.value })}
              placeholder="e.g. CCU 1, MON 3…"
              className={inputClass}
            />
          </div>
        </div>

        <div className="space-y-2">
          <span id={`${fieldId}-endpoint-link-group`} className="opacity-60 block text-[11px] font-semibold uppercase tracking-wide">
            Endpoint link
          </span>
          <div role="group" aria-labelledby={`${fieldId}-endpoint-link-group`} className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <select
                value={cable.fromElementId || ''}
                onChange={(e) => linkEndpoint('from', e.target.value)}
                className={inputClass}
              >
                <option value="">— none (label only) —</option>
                {linkableElements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} [{e.type}]
                  </option>
                ))}
              </select>
              <span className={endpointChipClass(!!fromLinked)}>
                {fromLinked ? `linked to ${fromLinked.name}` : 'unlinked'}
              </span>
            </div>
            <div className="space-y-1">
              <select
                value={cable.toElementId || ''}
                onChange={(e) => linkEndpoint('to', e.target.value)}
                className={inputClass}
              >
                <option value="">— none (label only) —</option>
                {linkableElements.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} [{e.type}]
                  </option>
                ))}
              </select>
              <span className={endpointChipClass(!!toLinked)}>
                {toLinked ? `linked to ${toLinked.name}` : 'unlinked'}
              </span>
            </div>
          </div>

          {fromLinked && toLinked && (
            <div className="rounded-lg px-2.5 py-2 border bg-slate-900/40 border-slate-800 space-y-1.5">
              <div className="text-[11px] text-slate-300">
                <span className="font-mono">{cableInfo.shortLabel}</span>
                {' → carries '}
                <span className="font-mono font-bold text-slate-100">
                  {impliedSignal ?? 'unknown signal'}
                </span>
              </div>
              {endpointIssues.map((iss, i) => (
                <div
                  key={`${iss.code}-${i}`}
                  className="flex items-start gap-1.5 text-[11px] rounded px-2 py-1 border bg-amber-950/40 border-amber-700/50 text-amber-300"
                >
                  <Zap className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  <span>{iss.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between rounded-lg px-2.5 py-2 border bg-slate-900/40 border-slate-800">
          <span className="text-[11px] text-slate-400">
            Run length ≈{' '}
            <span className="font-mono font-bold text-slate-100">
              {lengthVal}
              {unit}
            </span>
          </span>
          <span className="text-[10px] font-mono text-slate-500">
            {cableInfo.shortLabel} · {cableInfo.connector}
          </span>
        </div>

        {/* Per-cable label visibility (on top of the global label toggle) */}
        <div
          className={`flex items-center justify-between rounded-lg px-2.5 py-2 border ${
            isLight ? 'bg-white border-slate-300' : 'bg-slate-900/40 border-slate-800'
          }`}
        >
          <span className="text-[11px] opacity-70">Show label on plan</span>
          <button
            type="button"
            aria-label="Show label on plan"
            role="switch"
            aria-checked={cable.showLabel !== false}
            onClick={() => updateElement(cable.id, { showLabel: cable.showLabel === false })}
            className={`w-9 h-5 rounded-full transition-colors relative ${
              cable.showLabel !== false ? 'bg-teal-500' : isLight ? 'bg-slate-300' : 'bg-slate-700'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                cable.showLabel !== false ? 'left-[18px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="opacity-60">Cable Color</span>
            <span className="font-mono font-bold uppercase">{cable.color || cableInfo.color}</span>
          </div>
          <input
            type="color"
            value={cable.color || cableInfo.color}
            onChange={(e) => updateElement(cable.id, { color: e.target.value })}
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
            onChange={(e) => updateElement(cable.id, { strokeWidth: Number(e.target.value) })}
            className="w-full accent-sky-500 cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs opacity-60">Show on floor plan</span>
          <button
            onClick={() => updateElement(cable.id, { showLabel: cable.showLabel !== false ? false : true })}
            className={`px-3 py-1 text-[10px] font-bold rounded border ${
              cable.showLabel !== false
                ? 'bg-sky-600 text-white border-sky-500'
                : isLight
                ? 'bg-slate-50 text-slate-500 border-slate-300'
                : 'bg-slate-950 text-slate-500 border-slate-700'
            }`}
          >
            {cable.showLabel !== false ? 'ON' : 'OFF'}
          </button>
        </div>

        <div>
          <label htmlFor={`${fieldId}-notes`} className="opacity-60 block mb-1">Notes</label>
          <textarea id={`${fieldId}-notes`}
            value={cable.notes || ''}
            onChange={(e) => updateElement(cable.id, { notes: e.target.value })}
            placeholder="e.g. Route under stage, spare 10m, tie to truss…"
            rows={2}
            className={`${inputClass} resize-none`}
          />
        </div>
      </RubricSection>
    </div>
  );
};
