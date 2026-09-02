import React, { useState } from 'react';
import { Gauge, Plus, Trash2, WandSparkles } from 'lucide-react';
import type { LightElement } from '../../../types';
import { useFloorPlan } from '../../../context/FloorPlanContext';
import { createId, IdPrefixes } from '../../../domain/ids';
import {
  LIGHT_MODIFIER_DEFINITIONS,
  calculateIlluminance,
  footCandlesToLux,
  getLightModifierDefinition,
  luxToFootCandles,
  type LightModifier,
  type LightModifierKind,
  type LightPhotometricReference,
} from '../../../domain/lighting';
import { convertLength } from '../../../domain/units';
import { RubricSection } from '../shared/InspectorPrimitives';

interface LightModifiersSectionProps {
  light: LightElement;
  isLight: boolean;
}

const positiveOrUndefined = (value: string): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

export const LightModifiersSection: React.FC<LightModifiersSectionProps> = ({ light, isLight }) => {
  const { activeSetup, displaySettings, updateElement } = useFloorPlan();
  const [newKind, setNewKind] = useState<LightModifierKind>('softbox');
  const [referenceUnit, setReferenceUnit] = useState<'lux' | 'fc'>('lux');
  const [targetDistance, setTargetDistance] = useState(1);
  const modifiers = light.modifiers ?? [];
  const reference = light.photometricReference;
  const planUnit = activeSetup.gridSettings.unit;
  const fieldClass = `w-full border rounded-lg p-1.5 text-xs ${
    isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
  }`;

  const patchModifier = (id: string, patch: Partial<LightModifier>) => {
    updateElement(light.id, { modifiers: modifiers.map((modifier) => modifier.id === id ? { ...modifier, ...patch } : modifier) });
  };
  const patchReference = (patch: Partial<LightPhotometricReference>) => {
    const base: LightPhotometricReference = reference ?? {
      illuminanceLux: 1000,
      distanceMm: 1000,
      referenceIntensityPercent: 100,
      modifierBasis: 'current_modifier_stack',
      sourceKind: 'manual',
    };
    updateElement(light.id, { photometricReference: { ...base, ...patch } });
  };
  const calculation = calculateIlluminance(
    reference,
    convertLength(targetDistance, planUnit, 'mm'),
    light.intensity,
    modifiers,
  );

  return (
    <>
      <RubricSection
        title="Modifiers & Accessories"
        icon={<WandSparkles className="w-3.5 h-3.5 text-violet-500" />}
        badge={modifiers.filter((modifier) => modifier.enabled).length > 0 ? (
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500 font-bold">
            {modifiers.filter((modifier) => modifier.enabled).length} active
          </span>
        ) : undefined}
        defaultOpen={false}
        isLight={isLight}
      >
        <div className="flex gap-1.5">
          <select value={newKind} onChange={(event) => setNewKind(event.target.value as LightModifierKind)} className={fieldClass}>
            {LIGHT_MODIFIER_DEFINITIONS.map((definition) => (
              <option key={definition.kind} value={definition.kind}>{definition.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const definition = getLightModifierDefinition(newKind);
              if (!definition) return;
              updateElement(light.id, {
                modifiers: [...modifiers, {
                  id: createId(IdPrefixes.lightModifier),
                  kind: newKind,
                  symbolId: definition.symbolId,
                  enabled: true,
                }],
              });
            }}
            className="min-w-[72px] rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-bold flex items-center justify-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>

        {modifiers.length === 0 ? (
          <p className="text-[10px] opacity-60 leading-relaxed">Add the real accessory stack. Each enabled item adds an Asset Library badge to the fixture symbol.</p>
        ) : modifiers.map((modifier) => {
          const definition = getLightModifierDefinition(modifier.kind);
          const label = definition?.label ?? modifier.label ?? `Unknown modifier (${modifier.kind})`;
          return (
            <div key={modifier.id} className={`rounded-lg border p-2 space-y-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/60'}`}>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={modifier.enabled}
                  onChange={(event) => patchModifier(modifier.id, { enabled: event.target.checked })}
                  aria-label={`Enable ${label}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold">{label}</div>
                  <div className="text-[9px] opacity-55">
                    {definition?.description ?? 'Kept without inferred optical properties.'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateElement(light.id, { modifiers: modifiers.filter((candidate) => candidate.id !== modifier.id) })}
                  aria-label={`Remove ${label}`}
                  className="p-1 rounded text-rose-500 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-[9px] opacity-70">
                  Effective beam angle (°)
                  <input
                    type="number" min={1} max={360} placeholder="Unknown"
                    value={modifier.beamAngleDeg ?? ''}
                    onChange={(event) => patchModifier(modifier.id, { beamAngleDeg: positiveOrUndefined(event.target.value) })}
                    className={fieldClass}
                  />
                </label>
                <label className="text-[9px] opacity-70">
                  Transmission (%)
                  <input
                    type="number" min={0.1} max={100} placeholder="Unknown"
                    value={modifier.transmissionPercent ?? ''}
                    onChange={(event) => patchModifier(modifier.id, { transmissionPercent: positiveOrUndefined(event.target.value) })}
                    className={fieldClass}
                  />
                </label>
              </div>
              {modifier.kind === 'gel' && (
                <label className="text-[9px] opacity-70 flex items-center justify-between gap-2">
                  Gel colour
                  <input type="color" value={modifier.colorHex ?? '#ff8a00'} onChange={(event) => patchModifier(modifier.id, { colorHex: event.target.value })} />
                </label>
              )}
            </div>
          );
        })}
        <p className="text-[9px] opacity-55 leading-relaxed">Beam angle and transmission stay unknown until you enter sourced values. The app does not guess them from the modifier name.</p>
      </RubricSection>

      <RubricSection
        title="Photometric Calculator"
        icon={<Gauge className="w-3.5 h-3.5 text-cyan-500" />}
        badge={reference ? <span className="text-[9px] font-mono text-cyan-500 font-bold">SOURCE SET</span> : undefined}
        defaultOpen={false}
        isLight={isLight}
      >
        <div className="grid grid-cols-[1fr_auto] gap-1.5">
          <label className="text-[9px] opacity-70">
            Reference illuminance
            <input
              type="number" min={0} placeholder="Required"
              value={reference ? (referenceUnit === 'lux' ? reference.illuminanceLux : Number(luxToFootCandles(reference.illuminanceLux).toFixed(2))) : ''}
              onChange={(event) => {
                const value = positiveOrUndefined(event.target.value);
                if (value !== undefined) patchReference({ illuminanceLux: referenceUnit === 'lux' ? value : footCandlesToLux(value) });
              }}
              className={fieldClass}
            />
          </label>
          <label className="text-[9px] opacity-70">
            Unit
            <select value={referenceUnit} onChange={(event) => setReferenceUnit(event.target.value as 'lux' | 'fc')} className={fieldClass}>
              <option value="lux">lux</option><option value="fc">fc</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[9px] opacity-70">
            Reference distance ({planUnit})
            <input
              type="number" min={0} step="0.1" placeholder="Required"
              value={reference ? Number(convertLength(reference.distanceMm, 'mm', planUnit).toFixed(2)) : ''}
              onChange={(event) => {
                const value = positiveOrUndefined(event.target.value);
                if (value !== undefined) patchReference({ distanceMm: convertLength(value, planUnit, 'mm') });
              }}
              className={fieldClass}
            />
          </label>
          <label className="text-[9px] opacity-70">
            Reference dimmer (%)
            <input
              type="number" min={1} max={100}
              value={reference?.referenceIntensityPercent ?? 100}
              onChange={(event) => patchReference({ referenceIntensityPercent: positiveOrUndefined(event.target.value) ?? 100 })}
              className={fieldClass}
            />
          </label>
        </div>
        <label className="text-[9px] opacity-70 block">
          Reference includes
          <select value={reference?.modifierBasis ?? 'current_modifier_stack'} onChange={(event) => patchReference({ modifierBasis: event.target.value as LightPhotometricReference['modifierBasis'] })} className={fieldClass}>
            <option value="current_modifier_stack">Current modifier stack</option>
            <option value="bare_fixture">Bare fixture (apply entered transmission)</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[9px] opacity-70">
            Source type
            <select value={reference?.sourceKind ?? 'manual'} onChange={(event) => patchReference({ sourceKind: event.target.value as LightPhotometricReference['sourceKind'] })} className={fieldClass}>
              <option value="manual">Manual</option><option value="manufacturer">Manufacturer</option><option value="measured">Measured</option>
            </select>
          </label>
          <label className="text-[9px] opacity-70">
            Source / test label
            <input value={reference?.sourceLabel ?? ''} placeholder="Optional" onChange={(event) => patchReference({ sourceLabel: event.target.value || undefined })} className={fieldClass} />
          </label>
        </div>
        <label className="text-[9px] opacity-70 block">
          Source URL
          <input type="url" value={reference?.sourceUrl ?? ''} placeholder="Optional" onChange={(event) => patchReference({ sourceUrl: event.target.value || undefined })} className={fieldClass} />
        </label>

        <div className={`rounded-lg border p-2.5 space-y-1 ${isLight ? 'border-cyan-200 bg-cyan-50' : 'border-cyan-900 bg-cyan-950/30'}`}>
          <div className="flex items-end gap-2">
            <label className="text-[9px] opacity-70 flex-1">
              Calculate at ({planUnit})
              <input type="number" min={0.1} step="0.1" value={targetDistance} onChange={(event) => setTargetDistance(positiveOrUndefined(event.target.value) ?? 1)} className={fieldClass} />
            </label>
            <div className="text-right pb-1">
              <div className="text-sm font-black text-cyan-600">{calculation.lux === null ? 'Unknown' : `${Math.round(calculation.lux)} lux`}</div>
              {calculation.footCandles !== null && <div className="text-[10px] font-mono opacity-65">{calculation.footCandles.toFixed(1)} fc</div>}
            </div>
          </div>
          {calculation.warnings.map((warning) => <p key={warning} className="text-[9px] opacity-60">{warning}</p>)}
        </div>

        <button
          type="button"
          disabled={!reference}
          onClick={() => updateElement(light.id, { photometricOverlayVisible: light.photometricOverlayVisible !== true })}
          className={`w-full py-2 rounded-lg border text-[10px] font-bold ${
            !reference ? 'opacity-40 cursor-not-allowed' : light.photometricOverlayVisible ? 'bg-cyan-600 text-white border-cyan-500' : isLight ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'
          }`}
        >
          {light.photometricOverlayVisible ? 'Hide cone photometric labels' : 'Show photometric labels in light cone'}
        </button>
        {light.photometricOverlayVisible && (!displaySettings.showLightBeams || light.beamVisible === false) && (
          <p className="text-[9px] text-amber-500">Turn on Light beams (and this fixture’s beam) to see the labels.</p>
        )}
        <p className="text-[9px] opacity-55 leading-relaxed">Planning estimate only. Inverse-square calculations and linear dimmer scaling do not replace manufacturer data or an on-set light meter.</p>
      </RubricSection>
    </>
  );
};
