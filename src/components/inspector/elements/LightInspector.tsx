/**
 * The light inspector: role, fixture and model, colour and intensity, beam
 * throw, badge/label colour, fixture data and DMX, plus movement waypoints.
 *
 * Lifted out of InspectorPanel.tsx, which held all thirteen element inspectors
 * in one 6,000-line switch. It reads the context directly rather than taking a
 * dozen props, because the prop list would otherwise just be a copy of the
 * context.
 */
import React, { useId, useState } from 'react';
import { Compass, Database, Maximize, Sun, Tags, Zap } from 'lucide-react';
import type { LightElement } from '../../../types';
import { useFloorPlan } from '../../../context/FloorPlanContext';
import {
  DEFAULT_FLAG_SIZE,
  FLAG_SIZE_PRESETS,
  LIGHTING_BRANDS,
  LIGHT_FIXTURES,
  LIGHT_ROLES,
} from '../../../constants/presets';
import {
  ensureHexColor,
  hexToHsv,
  hexToRgbParts,
  hsvToHex,
  kelvinToHex,
  kelvinToRgb,
  rgbToHex,
} from '../../../utils/geometry';
import {
  findProfileForModel,
  fixtureProfileLinkUpdates,
  fixtureProfileSummary,
  listBrandOptions,
  profilesForBrand,
} from '../../../domain/fixtures/brandCatalog';
import { useFixtureCatalog } from '../useFixtureCatalog';
import { createId } from '../../../domain/ids';
import { createIdbAssetStore } from '../../../domain/storage/idbAssetStore';
import { validateGdtfArchive } from '../../../domain/technical/mvrExport';
import { useDialogs } from '../../dialog/DialogProvider';
import { parseOption, parseOptionFrom } from '../../../domain/optionValue';
import { FresnelLightIcon } from '../../icons/ProductionIcons';
import { flagLabel, isFlagFixture } from '../../canvas/FlagFixtureIcon';
import { DmxUniverseView } from '../../equipment/DmxUniverseView';
import { FixtureProfilePicker } from '../FixtureProfilePicker';
import { PillToggle, RubricSection, WaypointListEditor } from '../shared/InspectorPrimitives';
import { LightModifiersSection } from './LightModifiersSection';

interface LightInspectorProps {
  light: LightElement;
  isLight: boolean;
}

const gdtfAssetStore = createIdbAssetStore();

export const LightInspector: React.FC<LightInspectorProps> = ({ light, isLight }) => {
  // Prefix for pairing each caption with its control (`htmlFor`/`id`). From
  // `useId` so two instances of this panel on screen cannot collide — the
  // captions used to be plain siblings with no `htmlFor`, which meant screen
  // readers announced every one of these inputs unlabelled.
  const fieldId = useId();
  const { activeSetup, displaySettings, updateDisplaySettings, updateElement, updateSetupMeta } =
    useFloorPlan();
  const { notice } = useDialogs();
  const fixtureProfiles = useFixtureCatalog().profiles;
  const brandOptions = React.useMemo(
    () => listBrandOptions(LIGHTING_BRANDS, fixtureProfiles),
    [fixtureProfiles],
  );
  const [dmxUniverseFixtureId, setDmxUniverseFixtureId] = useState<string | null>(null);

  const isFlag = isFlagFixture(light.fixtureType);
  const isRgbMode = !!light.rgbColor;
  const colorHex = light.rgbColor ? ensureHexColor(light.rgbColor) : kelvinToHex(light.colorTemp || 5600);
  const rgbParts = hexToRgbParts(colorHex);
  const hsvParts = hexToHsv(colorHex);

  return (
    <div className="space-y-3 pt-1">
      {/* Rubric 1: Role, Fixture & Model */}
      <RubricSection
            persistKey="lightinspector.role-fixture-model"
        title="Role, Fixture & Model"
        icon={<FresnelLightIcon className="w-3.5 h-3.5 text-amber-500" />}
        badge={
          light.lightRole && light.lightRole !== 'unassigned' ? (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold uppercase truncate max-w-[100px]">
              {LIGHT_ROLES.find((r) => r.value === light.lightRole)?.label || light.lightRole}
            </span>
          ) : undefined
        }
        defaultOpen={true}
        isLight={isLight}
      >
        {/* Light Function / Role */}
        <div>
          <label htmlFor={`${fieldId}-light-function-role`} className="opacity-60 block mb-1 font-semibold">Light Function / Role</label>
          <select id={`${fieldId}-light-function-role`}
            value={light.lightRole || 'unassigned'}
            onChange={(e) =>
              updateElement(light.id, {
                lightRole: parseOptionFrom(
                  LIGHT_ROLES,
                  e.target.value,
                  light.lightRole || 'unassigned',
                ),
              })
            }
            className={`w-full border rounded-lg p-2 font-medium ${
              isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
            }`}
          >
            {LIGHT_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label} ({r.description})
              </option>
            ))}
          </select>

          {/* Role Tag Color Customizer */}
          {light.lightRole && light.lightRole !== 'unassigned' && (() => {
            const beamHex = isFlag
              ? '#ffffff'
              : (light.rgbColor ? ensureHexColor(light.rgbColor) : kelvinToHex(light.colorTemp || 5600));
            const isAuto = !light.roleColor;
            const activeRoleColor = light.roleColor ? ensureHexColor(light.roleColor) : beamHex;

            return (
              <div className={`mt-2 p-2 rounded-xl border space-y-1.5 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider opacity-50">
                    Role Tag Color
                  </span>
                  <button
                    type="button"
                    onClick={() => updateElement(light.id, { roleColor: undefined })}
                    className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border transition-all ${
                      isAuto
                        ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                        : isLight
                        ? 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                        : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    Auto (Beam Color)
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/20 shadow-sm flex-shrink-0"
                      style={{ backgroundColor: activeRoleColor }}
                    />
                    <span className="text-xs font-mono font-bold truncate">
                      {isAuto ? 'Auto' : light.roleColor}
                    </span>
                    {isAuto && (
                      <span className="text-[10px] opacity-60 truncate">
                        (Matches {isFlag ? 'white' : (light.colorTemp > 0 ? `${light.colorTemp}K` : 'RGB')})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <label
                      className={`relative w-6 h-6 rounded-md border cursor-pointer overflow-hidden ${
                        isLight ? 'border-slate-300' : 'border-slate-700'
                      }`}
                      title="Pick custom color for this role tag"
                    >
                      <input
                        aria-label="Pick custom color for this role tag"
                        type="color"
                        value={ensureHexColor(activeRoleColor, '#f59e0b')}
                        onChange={(e) => updateElement(light.id, { roleColor: e.target.value })}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <span
                        className="absolute inset-0.5 rounded border border-black/10"
                        style={{ backgroundColor: activeRoleColor }}
                      />
                    </label>
                  </div>
                </div>

                {/* Quick Swatches */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-800/60">
                  <span className="text-[9px] opacity-50">Custom:</span>
                  {[
                    { color: '#ffffff', label: 'White' },
                    { color: '#f59e0b', label: 'Amber' },
                    { color: '#38bdf8', label: 'Sky' },
                    { color: '#10b981', label: 'Emerald' },
                    { color: '#a855f7', label: 'Purple' },
                    { color: '#ec4899', label: 'Pink' },
                    { color: '#94a3b8', label: 'Slate' },
                  ].map((s) => (
                    <button
                      key={s.color}
                      type="button"
                      title={s.label}
                      aria-label={s.label}
                      onClick={() => updateElement(light.id, { roleColor: s.color })}
                      aria-pressed={light.roleColor?.toLowerCase() === s.color.toLowerCase()}
                      className={`w-4 h-4 rounded-full border transition-transform hover:scale-110 ${
                        light.roleColor?.toLowerCase() === s.color.toLowerCase()
                          ? 'ring-2 ring-sky-500 scale-110'
                          : 'border-white/20'
                      }`}
                      style={{ backgroundColor: s.color }}
                    />
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {/* Fixture Type */}
        <div>
          <label htmlFor={`${fieldId}-fixture-model-type`} className="opacity-60 block mb-1 font-semibold">Fixture Model / Type</label>
          <select id={`${fieldId}-fixture-model-type`}
            value={light.fixtureType}
            onChange={(e) => {
              const fix = LIGHT_FIXTURES.find((f) => f.type === e.target.value);
              const flag = !!fix?.isFlag;
              const defaultName = !light.brand && !light.fixtureModel ? (fix?.name || 'Light') : light.name;
              updateElement(light.id, {
                fixtureType: parseOption(
                  LIGHT_FIXTURES.map((f) => f.type),
                  e.target.value,
                  light.fixtureType,
                ),
                name: defaultName,
                beamAngle: flag ? 0 : fix?.defaultBeam ?? light.beamAngle,
                colorTemp: flag ? 0 : fix?.defaultTemp ?? (light.colorTemp || 5600),
                rgbColor: undefined,
                ...(flag
                  ? { flagSize: light.flagSize || DEFAULT_FLAG_SIZE }
                  : {}),
              });
            }}
            className={`w-full border rounded-lg p-2 ${
              isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
            }`}
          >
            {LIGHT_FIXTURES.map((f) => (
              <option key={f.type} value={f.type}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        {/* Brand & Model Designation */}
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${fieldId}-brand`} className="opacity-60 block mb-1 font-semibold">Brand</label>
              <select id={`${fieldId}-brand`}
                value={light.brand || ''}
                onChange={(e) => {
                  const brand = e.target.value;
                  const fix = LIGHT_FIXTURES.find((f) => f.type === light.fixtureType);
                  if (!brand) {
                    updateElement(light.id, {
                      brand: undefined,
                      fixtureModel: undefined,
                      name: fix?.name || 'Light',
                    });
                    return;
                  }
                  const newName = `${brand} ${fix?.name || 'Light'}`.trim();
                  updateElement(light.id, { brand, fixtureModel: undefined, name: newName });
                }}
                className={`w-full border rounded-lg p-2 ${
                  isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                }`}
              >
                <option value="">(No Brand / Generic)</option>
                <optgroup label="Presets">
                  {brandOptions.filter((b) => b.preset).map((b) => (
                    <option key={b.brand} value={b.brand}>
                      {b.brand}{b.profileCount > 0 ? ` · ${b.profileCount} in database` : ''}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Fixture database (OFL)">
                  {brandOptions.filter((b) => !b.preset).map((b) => (
                    <option key={b.brand} value={b.brand}>
                      {b.brand} · {b.profileCount}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div>
              <span className="opacity-60 block mb-1 font-semibold">Model</span>
              {(() => {
                const brandObj = LIGHTING_BRANDS.find((b) => b.brand === light.brand);
                const models = brandObj?.models || [];
                const dbProfiles = profilesForBrand(fixtureProfiles, light.brand);
                const linked = dbProfiles.find((p) => p.id === light.fixtureProfileId);
                const isCustom = !linked && !!light.fixtureModel && !models.includes(light.fixtureModel);
                const value = linked ? `profile:${linked.id}` : isCustom ? '__custom__' : (light.fixtureModel || '');
                const clearLink = {
                  fixtureProfileId: undefined,
                  fixtureModeId: undefined,
                  dmxModeName: undefined,
                  dmxChannelCount: undefined,
                };

                return (
                  <select
                    value={value}
                    onChange={(e) => {
                      const val = e.target.value;
                      const fix = LIGHT_FIXTURES.find((f) => f.type === light.fixtureType);
                      if (val.startsWith('profile:')) {
                        const profile = dbProfiles.find((p) => `profile:${p.id}` === val);
                        if (!profile) return;
                        const link = fixtureProfileLinkUpdates(profile);
                        updateElement(light.id, { ...link, name: `${link.brand} ${link.fixtureModel}`.trim() });
                      } else if (val === '__custom__') {
                        updateElement(light.id, { ...clearLink, fixtureModel: light.fixtureModel || 'Custom Model' });
                      } else if (!val) {
                        const newName = light.brand ? `${light.brand} ${fix?.name || 'Light'}` : (fix?.name || 'Light');
                        updateElement(light.id, { ...clearLink, fixtureModel: undefined, name: newName });
                      } else {
                        // Preset name: link the database profile when one clearly matches,
                        // so watts / weight / DMX come from measured data, never guessed.
                        const match = findProfileForModel(fixtureProfiles, light.brand, val);
                        const newName = light.brand ? `${light.brand} ${val}`.trim() : val;
                        updateElement(light.id, {
                          ...(match ? fixtureProfileLinkUpdates(match) : clearLink),
                          fixtureModel: val,
                          name: newName,
                        });
                      }
                    }}
                    className={`w-full border rounded-lg p-2 ${
                      isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                    }`}
                  >
                    <option value="">(Select a Model...)</option>
                    {models.length > 0 && (
                      <optgroup label="Presets">
                        {models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {dbProfiles.length > 0 && (
                      <optgroup label="Fixture database — real watts / weight / DMX">
                        {dbProfiles.map((p) => {
                          const summary = fixtureProfileSummary(p);
                          return (
                            <option key={p.id} value={`profile:${p.id}`}>
                              {p.model}{summary ? ` (${summary})` : ''}
                            </option>
                          );
                        })}
                      </optgroup>
                    )}
                    <option value="__custom__">✏️ Custom Model Name…</option>
                  </select>
                );
              })()}
            </div>
          </div>
          {light.fixtureProfileId && (
            <p className="text-[10px]" style={{ color: isLight ? '#0369a1' : '#7dd3fc' }}>
              Linked to fixture database — power, weight, size and DMX modes below come from measured data.
            </p>
          )}

          {/* Custom Model Name Input Field */}
          {(() => {
            const brandObj = LIGHTING_BRANDS.find((b) => b.brand === light.brand);
            const models = brandObj?.models || [];
            const isCustom = !models.includes(light.fixtureModel || '');
            if ((!isCustom && !light.brand) || light.fixtureProfileId) return null;

            return (
              <div>
                <label htmlFor={`${fieldId}-custom-model-unit-name`} className="opacity-60 block mb-1 text-[11px]">Custom Model / Unit Name</label>                        <input id={`${fieldId}-custom-model-unit-name`}
                  type="text"
                  value={light.fixtureModel || ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    const fix = LIGHT_FIXTURES.find((f) => f.type === light.fixtureType);
                    const newName = val
                      ? (light.brand ? `${light.brand} ${val}`.trim() : val)
                      : (light.brand ? `${light.brand} ${fix?.name || 'Light'}` : (fix?.name || 'Light'));
                    updateElement(light.id, { fixtureModel: val || undefined, name: newName });
                  }}
                  placeholder="e.g. LS 600d Pro / Custom Unit"
                  className={`w-full border rounded-lg p-2 text-xs ${
                    isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'
                  }`}
                />
              </div>
            );
          })()}

          {/* Quick Model Presets pills */}
          {light.brand && (() => {
            const models = LIGHTING_BRANDS.find((b) => b.brand === light.brand)?.models || [];
            if (models.length === 0) return null;
            return (
              <div>
                <span className="text-[10px] opacity-60 block mb-1 font-medium">Quick Presets:</span>
                <div className="flex flex-wrap gap-1">
                  {models.slice(0, 8).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        const newName = `${light.brand} ${m}`.trim();
                        const match = findProfileForModel(fixtureProfiles, light.brand, m);
                        updateElement(light.id, {
                          ...(match
                            ? fixtureProfileLinkUpdates(match)
                            : { fixtureProfileId: undefined, fixtureModeId: undefined, dmxModeName: undefined, dmxChannelCount: undefined }),
                          fixtureModel: m,
                          name: newName,
                        });
                      }}
                      className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                        light.fixtureModel === m
                          ? 'bg-sky-600 text-white border-sky-500 font-semibold'
                          : isLight
                          ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                          : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        {isFlag && (
          /* ---------- C-STAND FLAG CONTROLS ---------- */
          <div className="space-y-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
            <div>
              <span id={`${fieldId}-flag-fabric-size-group`} className="opacity-60 block mb-1">Flag Fabric Size</span>
              <div role="group" aria-labelledby={`${fieldId}-flag-fabric-size-group`} className="grid grid-cols-4 gap-1">
                {FLAG_SIZE_PRESETS.map((s) => (
                  <button
                    key={s.value}
                    onClick={() =>
                      updateElement(light.id, {
                        flagSize: s.value as LightElement['flagSize'],
                      })
                    }
                    title={s.label}
                    className={`py-1.5 text-[10px] font-mono rounded border transition-colors ${
                      (light.flagSize || DEFAULT_FLAG_SIZE) === s.value
                        ? 'bg-slate-950 text-white border-slate-500'
                        : isLight
                        ? 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
                        : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {light.fixtureType === 'flag_net' && (
              <div>
                <span id={`${fieldId}-net-density-light-cut-group`} className="opacity-60 block mb-1">Net Density (Light Cut)</span>
                <div role="group" aria-labelledby={`${fieldId}-net-density-light-cut-group`} className="grid grid-cols-2 gap-1">
                  <button
                    onClick={() => updateElement(light.id, { netValue: 'single' })}
                    className={`py-1.5 text-[10px] font-semibold rounded border transition-colors ${
                      (light.netValue || 'single') === 'single'
                        ? 'bg-sky-600 text-white border-sky-500'
                        : isLight
                        ? 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
                        : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    Single Net (≈½ stop)
                  </button>
                  <button
                    onClick={() => updateElement(light.id, { netValue: 'double' })}
                    className={`py-1.5 text-[10px] font-semibold rounded border transition-colors ${
                      light.netValue === 'double'
                        ? 'bg-sky-600 text-white border-sky-500'
                        : isLight
                        ? 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100'
                        : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    Double Net (≈1 stop)
                  </button>
                </div>
              </div>
            )}

            {light.fixtureType === 'flag_shutter' && (
              <div>
                <label className="opacity-60 block mb-1">
                  Shutter Cut — {Math.round(light.shutterCutDeg ?? 35)}°
                </label>
                <input
                  type="range"
                  min={0}
                  max={85}
                  step={1}
                  value={Math.round(light.shutterCutDeg ?? 35)}
                  onChange={(e) =>
                    updateElement(light.id, { shutterCutDeg: Number(e.target.value) })
                  }
                  className="w-full accent-sky-500"
                />
                <p className="opacity-50 text-[9px] mt-0.5">
                  0° = doors folded flat against the face, 85° = wide open.
                </p>
              </div>
            )}

            <div className={`text-[10px] rounded-lg border p-2.5 leading-relaxed ${
              isLight ? 'bg-slate-50 text-slate-500 border-slate-200' : 'bg-slate-900 text-slate-400 border-slate-800'
            }`}>
              <strong className={isLight ? 'text-slate-700' : 'text-slate-200'}>
                {flagLabel(light)}
              </strong>
              {light.fixtureType === 'flag_solid' || light.fixtureType === 'c_stand_flag'
                ? ' — blocks / removes light (negative fill).'
                : light.fixtureType === 'flag_silk'
                ? ' — softens & diffuses the light passing through it.'
                : light.fixtureType === 'flag_net'
                ? ' — reduces intensity in a wash without changing color or softness.'
                : light.fixtureType === 'flag_cucoloris'
                ? ' — throws a dappled, broken-up shadow pattern through cut-outs.'
                : light.fixtureType === 'flag_branchaloris'
                ? ' — a branch on a grip arm; breaks the light into foliage shadows.'
                : light.fixtureType === 'flag_shutter'
                ? ' — barn doors / framing shutters that cut spill at the fixture face.'
                : ' — shapes light with a long blade (kicks, forehead shadows).'}
              {' '}Flags do not emit light, so they have no beam, color temp, or intensity.
            </div>
          </div>
        )}
      </RubricSection>

      {!isFlag && (
        <>
          {/* Rubric 2: Color Temperature & Intensity */}
          <RubricSection
            persistKey="lightinspector.color-intensity"
            title="Color & Intensity"
            icon={<Sun className="w-3.5 h-3.5 text-amber-500" />}
            badge={
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-bold">
                {isRgbMode ? colorHex : `${light.colorTemp || 5600}K`} · {light.intensity}%
              </span>
            }
            defaultOpen={false}
            isLight={isLight}
          >
            {/* Color Mode Selector */}
            <div>
              <span id={`${fieldId}-color-mode-group`} className="opacity-60 block mb-1 font-semibold">Color Mode</span>
              <div role="group" aria-labelledby={`${fieldId}-color-mode-group`} className="grid grid-cols-2 gap-1.5 mb-2">
                <button
                  type="button"
                  onClick={() => updateElement(light.id, { rgbColor: undefined, colorTemp: light.colorTemp || 5600 })}
                  style={
                    !isRgbMode
                      ? {
                          backgroundColor: kelvinToRgb(light.colorTemp || 5600),
                          color: '#0f172a',
                          borderColor: '#f59e0b',
                        }
                      : undefined
                  }
                  className={`py-1.5 text-xs font-bold rounded-lg border transition-all shadow-sm ${
                    !isRgbMode
                      ? 'ring-2 ring-amber-400/40'
                      : isLight
                      ? 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  Kelvin CCT (White)
                </button>
                <button
                  type="button"
                  onClick={() => updateElement(light.id, { rgbColor: light.rgbColor || colorHex, colorTemp: 0 })}
                  style={
                    isRgbMode
                      ? {
                          backgroundColor: colorHex,
                          color: '#ffffff',
                          borderColor: colorHex,
                          textShadow: '0 1px 3px rgba(0,0,0,0.9)',
                        }
                      : undefined
                  }
                  className={`py-1.5 text-xs font-bold rounded-lg border transition-all shadow-sm ${
                    isRgbMode
                      ? 'ring-2 ring-white/40'
                      : isLight
                      ? 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  RGB / HSV Color
                </button>
              </div>
            </div>

            {!isRgbMode ? (
              /* ---------- KELVIN CCT MODE (DEFAULT) ---------- */
              <div className="space-y-2">
                <div className="flex justify-between text-xs mb-1">
                  <span className="opacity-60">Color Temp (Kelvin)</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full border border-black/20 inline-block shadow-sm"
                      style={{ backgroundColor: kelvinToRgb(light.colorTemp || 5600) }}
                    />
                    <span className="font-mono text-amber-500 font-bold">
                      {light.colorTemp || 5600}K
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1 mb-2">
                  {[2700, 3200, 4500, 5600].map((k) => {
                    const kColor = kelvinToRgb(k);
                    const isSelected = light.colorTemp === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => updateElement(light.id, { colorTemp: k, rgbColor: undefined })}
                        style={isSelected ? { backgroundColor: kColor, color: '#0f172a', borderColor: '#f59e0b' } : undefined}
                        className={`py-1 text-[10px] font-mono rounded border flex items-center justify-center gap-1 transition-all ${
                          isSelected
                            ? 'font-bold shadow-sm ring-1 ring-amber-400'
                            : isLight
                            ? 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
                            : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900'
                        }`}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full border border-black/20"
                          style={{ backgroundColor: kColor }}
                        />
                        <span>{k}K</span>
                      </button>
                    );
                  })}
                </div>
                <input
                  type="range"
                  min={2000}
                  max={7000}
                  step={100}
                  value={light.colorTemp || 5600}
                  onChange={(e) => updateElement(light.id, { colorTemp: Number(e.target.value), rgbColor: undefined })}
                  style={{
                    accentColor: kelvinToRgb(light.colorTemp || 5600),
                  }}
                  className="w-full cursor-pointer h-2 rounded-lg"
                />
              </div>
            ) : (
              /* ---------- RGB / HSV FULL COLOR MODE ---------- */
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="opacity-60 font-semibold">RGB / HSV Color</span>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-3 h-3 rounded-full border border-white/20 shadow-sm"
                      style={{ backgroundColor: colorHex }}
                    />
                    <span className="font-mono font-bold uppercase" style={{ color: colorHex }}>
                      {colorHex}
                    </span>
                  </div>
                </div>
                <input
                  type="color"
                  value={ensureHexColor(colorHex, '#ff0055')}
                  onChange={(e) =>
                    updateElement(light.id, { rgbColor: e.target.value, colorTemp: 0 })
                  }
                  className="w-full h-8 cursor-pointer rounded border bg-transparent"
                />
                {/* RGB values with color-coded sliders */}
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['R', rgbParts.r, 255, '#ef4444', 'text-red-500'],
                      ['G', rgbParts.g, 255, '#22c55e', 'text-green-500'],
                      ['B', rgbParts.b, 255, '#3b82f6', 'text-blue-500'],
                    ] as const
                  ).map(([label, val, max, accent, textClass]) => (
                    <label key={label} className="block">
                      <span className={`block text-[9px] font-bold opacity-80 mb-0.5 ${textClass}`}>
                        {label} {val}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={max}
                        value={val}
                        style={{ accentColor: accent }}
                        onChange={(e) =>
                          updateElement(light.id, {
                            rgbColor: rgbToHex(
                              label === 'R' ? Number(e.target.value) : rgbParts.r,
                              label === 'G' ? Number(e.target.value) : rgbParts.g,
                              label === 'B' ? Number(e.target.value) : rgbParts.b
                            ),
                            colorTemp: 0,
                          })
                        }
                        className="w-full cursor-pointer h-2 rounded-lg"
                      />
                    </label>
                  ))}
                </div>
                {/* HSV values with color-coded sliders */}
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['H', hsvParts.h, 360, hsvToHex(hsvParts.h, 100, 100), 'text-fuchsia-400'],
                      ['S', hsvParts.s, 100, colorHex, 'text-cyan-400'],
                      ['V', hsvParts.v, 100, colorHex, 'text-amber-400'],
                    ] as const
                  ).map(([label, val, max, accent, textClass]) => (
                    <label key={label} className="block">
                      <span className={`block text-[9px] font-bold opacity-80 mb-0.5 ${textClass}`}>
                        {label} {val}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={max}
                        value={val}
                        style={{ accentColor: accent }}
                        onChange={(e) =>
                          updateElement(light.id, {
                            rgbColor: hsvToHex(
                              label === 'H' ? Number(e.target.value) : hsvParts.h,
                              label === 'S' ? Number(e.target.value) : hsvParts.s,
                              label === 'V' ? Number(e.target.value) : hsvParts.v
                            ),
                            colorTemp: 0,
                          })
                        }
                        className="w-full cursor-pointer h-2 rounded-lg"
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => updateElement(light.id, { rgbColor: undefined, colorTemp: 5600 })}
                  className={`w-full py-1 text-xs rounded border text-slate-400 hover:text-white transition-colors ${
                    isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  ✕ Remove RGB Color (Reset to Kelvin White)
                </button>
              </div>
            )}

            {/* Light Intensity */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="opacity-60">Intensity (Dimmer)</span>
                <span className="font-mono font-bold">{light.intensity}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={light.intensity}
                onChange={(e) => updateElement(light.id, { intensity: Number(e.target.value) })}
                style={{ accentColor: isRgbMode ? colorHex : kelvinToRgb(light.colorTemp || 5600) }}
                className="w-full cursor-pointer h-2 rounded-lg"
              />
            </div>

            {/* Per-light beam visibility */}
            <div>
              <div className="grid grid-cols-1 gap-2">
                <PillToggle
                  on={light.beamVisible !== false}
                  onClick={() => updateElement(light.id, { beamVisible: light.beamVisible === false })}
                  label="Light beam"
                  isLight={isLight}
                />
              </div>
            </div>
          </RubricSection>

          <LightModifiersSection light={light} isLight={isLight} />

          {/* Rubric 3: Beam Geometry & Throw */}
          <RubricSection
            persistKey="lightinspector.beam-throw-angle"
            title="Beam Throw & Angle"
            icon={<Maximize className="w-3.5 h-3.5 text-sky-500" />}
            badge={
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-500 font-bold">
                {light.beamAngle}° · {light.throwDistance}px
              </span>
            }
            defaultOpen={false}
            isLight={isLight}
          >
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="opacity-60">Beam Angle</span>
                  <span className="font-mono text-amber-500 font-bold">{light.beamAngle}°</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={160}
                  value={light.beamAngle}
                  onChange={(e) => updateElement(light.id, { beamAngle: Number(e.target.value) })}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="opacity-60">Throw Distance</span>
                  <span className="font-mono text-amber-500 font-bold">{light.throwDistance} px</span>
                </div>
                <input
                  type="range"
                  min={60}
                  max={400}
                  value={light.throwDistance}
                  onChange={(e) => updateElement(light.id, { throwDistance: Number(e.target.value) })}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>
            </div>
          </RubricSection>
        </>
      )}

      {/* Rubric 4: Floorplan Badge & Custom Label Color */}
      <RubricSection
            persistKey="lightinspector.badge-info-label-color"
        title="Badge Info & Label Color"
        icon={<Tags className="w-3.5 h-3.5 text-purple-500" />}
        defaultOpen={false}
        isLight={isLight}
      >
        {/* Floor Plan Label Toggles */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 block mb-1">
            Floorplan Badge Info
          </span>
          <div className="grid grid-cols-2 gap-1">
            <PillToggle
              on={displaySettings.showLightRoleLabels !== false}
              onClick={() => updateDisplaySettings({ showLightRoleLabels: !(displaySettings.showLightRoleLabels !== false) })}
              label="Role (Key/Fill)"
              isLight={isLight}
            />
            <PillToggle
              on={displaySettings.showLightNameLabels !== false}
              onClick={() => updateDisplaySettings({ showLightNameLabels: !(displaySettings.showLightNameLabels !== false) })}
              label="Name / Model"
              isLight={isLight}
            />
            <PillToggle
              on={displaySettings.showLightKelvinLabels === true}
              onClick={() => updateDisplaySettings({ showLightKelvinLabels: !(displaySettings.showLightKelvinLabels === true) })}
              label="Color Temp (K)"
              isLight={isLight}
            />
            <PillToggle
              on={displaySettings.showLightIntensityLabels === true}
              onClick={() => updateDisplaySettings({ showLightIntensityLabels: !(displaySettings.showLightIntensityLabels === true) })}
              label="Dim Level (%)"
              isLight={isLight}
            />
          </div>
        </div>

        {/* Per-fixture Label Color */}
        {(() => {
          const beamHex = isFlag
            ? '#ffffff'
            : (light.rgbColor ? ensureHexColor(light.rgbColor) : kelvinToHex(light.colorTemp || 5600));
          const isAuto = !light.labelColor;

          return (
            <div className={`mt-2 p-2 rounded-xl border space-y-2 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider opacity-50">
                  Fixture Label Color
                </span>
                <button
                  type="button"
                  onClick={() => updateElement(light.id, { labelColor: undefined })}
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border transition-all ${
                    isAuto
                      ? 'bg-sky-600 text-white border-sky-500 shadow-sm'
                      : isLight
                      ? 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:bg-slate-800'
                  }`}
                >
                  Auto (Beam Color)
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-black/20 shadow-sm flex-shrink-0"
                    style={{ backgroundColor: light.labelColor ? ensureHexColor(light.labelColor) : beamHex }}
                  />
                  <span className="text-xs font-mono font-bold truncate">
                    {isAuto ? 'Auto' : light.labelColor}
                  </span>
                  {isAuto && (
                    <span className="text-[10px] opacity-60 truncate">
                      (Matches {isFlag ? 'white' : (light.colorTemp > 0 ? `${light.colorTemp}K` : 'RGB')})
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <label
                    className={`relative w-6 h-6 rounded-md border cursor-pointer overflow-hidden ${
                      isLight ? 'border-slate-300' : 'border-slate-700'
                    }`}
                    title="Pick custom label color"
                  >
                    <input
                      aria-label="Pick custom label color"
                      type="color"
                      value={ensureHexColor(light.labelColor || beamHex, '#ffffff')}
                      onChange={(e) => updateElement(light.id, { labelColor: e.target.value })}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <span
                      className="absolute inset-0.5 rounded border border-black/10"
                      style={{ backgroundColor: light.labelColor ? ensureHexColor(light.labelColor) : beamHex }}
                    />
                  </label>
                </div>
              </div>

              {/* Quick Swatches */}
              <div className="flex items-center gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-800/60">
                <span className="text-[9px] opacity-50">Custom:</span>
                {[
                  { color: '#ffffff', label: 'White' },
                  { color: '#f59e0b', label: 'Amber' },
                  { color: '#38bdf8', label: 'Sky' },
                  { color: '#10b981', label: 'Emerald' },
                  { color: '#ec4899', label: 'Pink' },
                  { color: '#94a3b8', label: 'Slate' },
                ].map((s) => (
                  <button
                    key={s.color}
                    type="button"
                    title={s.label}
                    aria-label={s.label}
                    onClick={() => updateElement(light.id, { labelColor: s.color })}
                    aria-pressed={light.labelColor?.toLowerCase() === s.color.toLowerCase()}
                    className={`w-4 h-4 rounded-full border transition-transform hover:scale-110 ${
                      light.labelColor?.toLowerCase() === s.color.toLowerCase()
                        ? 'ring-2 ring-sky-500 scale-110'
                        : 'border-white/20'
                    }`}
                    style={{ backgroundColor: s.color }}
                  />
                ))}
              </div>
            </div>
          );
        })()}
      </RubricSection>

      {/* Real fixture data (OFL snapshot + custom profiles) */}
      <RubricSection
            persistKey="lightinspector.fixture-data-dmx-modes"
        title="Fixture Data & DMX Modes"
        icon={<Database className="w-3.5 h-3.5 text-violet-500" />}
        defaultOpen={false}
        isLight={isLight}
      >
        <FixtureProfilePicker
          light={light}
          isLight={isLight}
          onChange={(updates) => updateElement(light.id, updates)}
        />
        <div className={`mt-3 rounded-lg border p-2.5 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-950/50'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wide">MVR / GDTF resource</div>
              <div className="text-[10px] opacity-60 truncate">
                {light.gdtfFileName || 'No real .gdtf archive attached'}
              </div>
            </div>
            {light.gdtfAssetId && (
              <button
                type="button"
                onClick={() => updateElement(light.id, { gdtfAssetId: undefined, gdtfFileName: undefined })}
                className="text-[10px] font-bold text-rose-500 hover:text-rose-400"
              >
                Remove
              </button>
            )}
          </div>
          <label className="mt-2 min-h-[32px] px-2.5 rounded border border-violet-500/50 bg-violet-500/10 text-violet-500 text-[10px] font-bold flex items-center justify-center cursor-pointer hover:bg-violet-500/20">
            {light.gdtfAssetId ? 'Replace GDTF file' : 'Attach GDTF file'}
            <input
              type="file"
              accept=".gdtf,application/zip"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                if (!file.name.toLowerCase().endsWith('.gdtf')) {
                  void notice({ title: 'Invalid GDTF file', message: 'Please choose a real .gdtf archive.' });
                  return;
                }
                void validateGdtfArchive(file)
                  .then(() => gdtfAssetStore.put(file, { source: `GDTF: ${file.name}` }, `gdtf:${light.id}`))
                  .then((ref) => updateElement(light.id, { gdtfAssetId: ref.id, gdtfFileName: file.name }))
                  .catch((error: unknown) => {
                    void notice({ title: 'GDTF could not be stored', message: error instanceof Error ? error.message : 'The GDTF file could not be stored.' });
                  });
              }}
            />
          </label>
          <p className="text-[9px] opacity-50 mt-1.5 leading-snug">
            MVR embeds this exact archive. Set the fixture mode above to the matching GDTF DMX mode name.
          </p>
        </div>
      </RubricSection>

      {/* DMX-512 Control Patch */}
      <RubricSection
            persistKey="lightinspector.dmx-512-control"
        title="DMX-512 Control"
        icon={<Zap className="w-3.5 h-3.5 text-yellow-500" />}
        defaultOpen={light.dmxUniverse || light.dmxAddress ? true : false}
        isLight={isLight}
      >
        {!isFlagFixture(light.fixtureType) ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor={`${fieldId}-universe`} className="opacity-60 block mb-1">Universe</label>
                <input id={`${fieldId}-universe`}
                  type="number"
                  min={1}
                  value={light.dmxUniverse ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') updateElement(light.id, { dmxUniverse: undefined });
                    else updateElement(light.id, { dmxUniverse: Math.max(1, Math.floor(Number(v))) });
                  }}
                  placeholder="1"
                  className={`w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
                />
              </div>
              <div>
                <label htmlFor={`${fieldId}-start-address-1-512`} className="opacity-60 block mb-1">Start Address (1–512)</label>
                <input id={`${fieldId}-start-address-1-512`}
                  type="number"
                  min={1}
                  max={512}
                  value={light.dmxAddress ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') updateElement(light.id, { dmxAddress: undefined });
                    else updateElement(light.id, { dmxAddress: Math.max(1, Math.min(512, Number(v))) });
                  }}
                  placeholder="001"
                  className={`w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor={`${fieldId}-fixture-mode`} className="opacity-60 block mb-1">Fixture mode</label>
                <input id={`${fieldId}-fixture-mode`}
                  type="text"
                  value={light.dmxModeName ?? ''}
                  onChange={(e) => updateElement(light.id, { dmxModeName: e.target.value || undefined })}
                  placeholder="e.g. RGBW 16-bit"
                  className={`w-full border rounded p-1.5 text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
                />
              </div>
              <div>
                <label htmlFor={`${fieldId}-mode-footprint-channels`} className="opacity-60 block mb-1">Mode footprint (channels)</label>
                <input id={`${fieldId}-mode-footprint-channels`}
                  type="number"
                  min={1}
                  max={512}
                  value={light.dmxChannelCount ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    updateElement(light.id, { dmxChannelCount: value === '' ? undefined : Math.max(1, Math.min(512, Number(value))) });
                  }}
                  placeholder="Required"
                  className={`w-full border rounded p-1.5 font-mono text-xs ${isLight ? 'bg-white text-slate-800 border-slate-300' : 'bg-slate-950 text-slate-200 border-slate-700'}`}
                />
              </div>
            </div>

            {light.dmxUniverse && light.dmxAddress && light.dmxChannelCount ? (
              <div className="text-[11px] rounded-lg px-2.5 py-2 border bg-yellow-950/40 border-yellow-800/50 text-yellow-300 font-mono flex items-center justify-between">
                <span>
                  U{light.dmxUniverse}:{String(light.dmxAddress).padStart(3, '0')}
                  <span className="opacity-60">
                    {' '}· {light.dmxChannelCount}ch (range{' '}
                    {light.dmxAddress}–{light.dmxAddress + light.dmxChannelCount - 1})
                  </span>
                </span>
                <span className="opacity-70">PATCHED</span>
              </div>
            ) : (
              <p className="text-[10px] opacity-60 leading-snug">
                Set the real fixture mode footprint plus universe and address. Unknown mode data is never
                guessed, because different modes of the same fixture can consume very different ranges.
              </p>
            )}
            <button
              type="button"
              onClick={() => setDmxUniverseFixtureId(light.id)}
              className="w-full min-h-[36px] rounded-lg border border-amber-500/60 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-[11px] font-black flex items-center justify-center gap-1.5 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              Open DMX Patch Bay
            </button>
            {dmxUniverseFixtureId === light.id && (
              <DmxUniverseView
                focusFixtureId={light.id}
                onClose={() => setDmxUniverseFixtureId(null)}
              />
            )}
          </>
        ) : (
          <p className="text-[10px] opacity-60 leading-snug">
            {isFlagFixture(light.fixtureType) ? 'Flags & grip modifiers are not DMX-controlled.' : ''}
          </p>
        )}
      </RubricSection>

      {/* Waypoints & Movement: followspots, practicals on a dolly, and
          event rigs that reposition between numbers. Same beats and
          editor as actors, cameras and props. */}
      {(() => {
        const nextBeat = Math.max(2, ...(light.path || []).map((wp) => wp.beat + 1));
        const handleAddLightWp = () => {
          const existingPath = light.path || [];
          const lastPoint = existingPath.length > 0
            ? existingPath[existingPath.length - 1]
            : { x: light.x, y: light.y, rotation: light.rotation || 0 };
          const angleRad = ((lastPoint.rotation || 0) * Math.PI) / 180;
          const offsetDist = 60;
          updateElement(light.id, {
            path: [
              ...existingPath,
              {
                id: createId('wp'),
                x: Math.round(lastPoint.x + Math.cos(angleRad) * offsetDist),
                y: Math.round(lastPoint.y + Math.sin(angleRad) * offsetDist),
                rotation: lastPoint.rotation || 0,
                beat: nextBeat,
              },
            ],
          } as Partial<LightElement>);
          if (nextBeat > (activeSetup.totalBeats || 1)) {
            updateSetupMeta({ totalBeats: nextBeat });
          }
        };

        return (
          <RubricSection
            persistKey="lightinspector.waypoints-trajectory"
            title="Waypoints & Trajectory"
            icon={<Compass className="w-3.5 h-3.5 text-amber-500" />}
            defaultOpen={(light.path || []).length > 0}
            isLight={isLight}
            headerRight={
              <button
                type="button"
                title={`Add movement waypoint (Beat ${nextBeat})`}
                onClick={handleAddLightWp}
                className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-600 hover:bg-amber-700 active:scale-95 text-white transition-all cursor-pointer select-none"
              >
                + Waypoint
              </button>
            }
          >
            <button
              type="button"
              onClick={handleAddLightWp}
              className={`w-full py-2 border rounded-lg text-xs font-semibold cursor-pointer select-none active:scale-[0.98] transition-transform ${
                isLight ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100' : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700'
              }`}
            >
              + Add Light Waypoint (Beat {nextBeat})
            </button>

            <WaypointListEditor
              elementId={light.id}
              path={light.path || []}
              baseRotation={light.rotation}
              accentClass="text-amber-500"
              isLight={isLight}
            />
          </RubricSection>
        );
      })()}
    </div>
  );
};
