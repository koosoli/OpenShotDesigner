import React from 'react';
import { Boxes, Check, X } from 'lucide-react';
import type { EquipmentCategory, EquipmentItem } from '../../types';
import { EQUIPMENT_CATEGORIES, getBrandsForCategory, getModelsForBrand } from '../../utils/equipmentList';
import { fixtureModeLabel, fixtureSpecsLine, gearProfileUpdates } from '../../domain/fixtures';
import type { FixtureProfile, GearBrandOption, GearModelOption } from '../../domain/fixtures';
import { useDialogFocusTrap } from '../../utils/useDialogFocusTrap';
import { BrandOptions, ModelOptions, usesFixtureDatabase } from './GearOptions';

/** The fields of the add / edit equipment item form. */
export interface EquipmentItemForm {
    category: EquipmentCategory;
    name: string;
    brand: string;
    model: string;
    quantity: number;
    roleOrFunction: string;
    specs: string;
    notes: string;
    targetPackageId?: string; // Optional: target package to attach to
    /** Set when the chosen model came from the fixture database (plan §17). */
    fixtureProfileId?: string;
    fixtureModeId?: string;
}

/**
 * Add or edit one equipment item: category, brand and model from the
 * department catalog or the fixture database, quantity, specs, and the
 * camera package it belongs to. Extracted from `EquipmentPanel`.
 */
export const EquipmentItemModal: React.FC<{
  fieldId: string;
  isLight: boolean;
  /** "Scene 1: Dialogue", shown under the title. */
  sceneLabel: string;
  form: EquipmentItemForm;
  setForm: React.Dispatch<React.SetStateAction<EquipmentItemForm>>;
  editingItem: EquipmentItem | null;
  availableCameraPackages: EquipmentItem[];
  brandOptionsFor: (category: EquipmentCategory) => GearBrandOption[];
  modelOptionsFor: (category: EquipmentCategory, brand: string | undefined) => GearModelOption[];
  profileById: (id: string | undefined) => FixtureProfile | undefined;
  specsIsDerived: (specs: string | undefined, previousProfileId: string | undefined, previousModeId: string | undefined) => boolean;
  onSubmit: (event: React.FormEvent) => void;
  onClose: () => void;
}> = ({ fieldId, isLight, sceneLabel, form, setForm, editingItem, availableCameraPackages, brandOptionsFor, modelOptionsFor, profileById, specsIsDerived, onSubmit, onClose }) => {
  const dialogRef = useDialogFocusTrap(true);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${fieldId}-add-equipment-title`}
        tabIndex={-1}
        className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl outline-hidden ${
          'bg-surface border-line-strong text-ink'
        }`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg bg-accent-soft text-sky-900 dark:text-sky-400`}>
              <Boxes className="w-4 h-4" />
            </div>
            <div>
              <h3 id={`${fieldId}-add-equipment-title`} className="text-sm font-black text-slate-950 dark:text-slate-100">
                {editingItem ? 'Edit Production Equipment' : 'Add Production Equipment'}
              </h3>
              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                {sceneLabel}
              </p>
            </div>
          </div>
          <button
            onClick={() => onClose()}
            title="Close"
            aria-label="Close"
            className="p-1 text-slate-600 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3.5">
          {/* Optional: Target Package Selector */}
          {!editingItem && availableCameraPackages.length > 0 && (
            <div className={`p-2.5 rounded-xl border bg-sky-50 dark:bg-sky-500/10 border-sky-300 dark:border-sky-500/30`}>
              <label htmlFor={`${fieldId}-destination-package-optional`} className="block text-[11px] font-black uppercase tracking-wider text-sky-950 dark:text-sky-400 mb-1">
                📦 Destination Package (Optional)
              </label>
              <select id={`${fieldId}-destination-package-optional`}
                value={form.targetPackageId || ''}
                onChange={(e) => setForm({ ...form, targetPackageId: e.target.value })}
                className={`w-full p-2 text-xs rounded-lg border font-bold ${
                  'bg-raised text-ink border-sky-400 dark:border-sky-700'
                }`}
              >
                <option value="" className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">
                  -- Standalone Item (Not in package) --
                </option>
                {availableCameraPackages.map((pkg) => (
                  <option key={pkg.id} value={pkg.id} className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">
                    Attach directly inside {pkg.name} (Camera Kit)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Category Rubric */}
          <div>
            <label htmlFor={`${fieldId}-department-category-rubric`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
              Department / Category Rubric
            </label>
            <select id={`${fieldId}-department-category-rubric`}
              value={form.category}
              onChange={(e) => {
                const newCat = e.target.value as EquipmentCategory;
                const brands = getBrandsForCategory(newCat);
                const defaultBrand = brands[0] || '';
                const defaultModel = getModelsForBrand(newCat, defaultBrand)[0] || '';
                setForm({
                  ...form,
                  category: newCat,
                  brand: defaultBrand,
                  model: defaultModel,
                  name: defaultModel || form.name,
                  // The old link belonged to a fixture in another department.
                  fixtureProfileId: undefined,
                  fixtureModeId: undefined,
                  specs: specsIsDerived(form.specs, form.fixtureProfileId, form.fixtureModeId)
                    ? ''
                    : form.specs,
                });
              }}
              className={`w-full p-2 text-xs rounded-lg border font-bold ${
                isLight ? 'bg-white text-slate-950 border-slate-300' : 'bg-slate-800 text-slate-100 dark:border-slate-700'
              }`}
            >
              {EQUIPMENT_CATEGORIES.map((cat) => (
                <option key={cat.key} value={cat.key} className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Brand & Model Templates Selector */}
          <div className={`grid grid-cols-2 gap-2 p-2.5 rounded-xl border bg-slate-100 dark:bg-slate-950/60 border-line-strong`}>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-950 dark:text-slate-300">
                  Brand Template
                </span>
                <span className="text-[10px] font-bold opacity-70">Dropdown</span>
              </div>
              <select
                aria-label="Brand Template"
                value={form.brand}
                onChange={(e) => {
                  const newBrand = e.target.value;
                  const options = modelOptionsFor(form.category, newBrand);
                  const first = options[0];
                  const linked = first && first.profile ? gearProfileUpdates(first.profile) : undefined;
                  setForm({
                    ...form,
                    brand: newBrand,
                    model: first ? first.model : '',
                    name: (first && first.model) || form.name,
                    fixtureProfileId: linked?.fixtureProfileId,
                    fixtureModeId: linked?.fixtureModeId,
                    specs: specsIsDerived(form.specs, form.fixtureProfileId, form.fixtureModeId)
                      ? linked?.specs ?? ''
                      : form.specs,
                  });
                }}
                className={`w-full p-1.5 text-xs rounded-lg border font-bold ${
                  'bg-raised text-ink border-line-strong'
                }`}
              >
                <option value="" className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">-- Custom Brand --</option>
                <BrandOptions options={brandOptionsFor(form.category)} />
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-950 dark:text-slate-300">
                  Model Template
                </span>
                <span className="text-[10px] font-bold opacity-70">Dropdown</span>
              </div>
              <select
                aria-label="Model Template"
                value={form.model}
                onChange={(e) => {
                  const newModel = e.target.value;
                  const chosen = modelOptionsFor(form.category, form.brand).find(
                    (option) => option.model === newModel,
                  );
                  const linked = chosen && chosen.profile ? gearProfileUpdates(chosen.profile) : undefined;
                  setForm({
                    ...form,
                    model: newModel,
                    name: newModel || form.name,
                    // Picking the database entry under a brand written as
                    // a pairing ("Aputure / Amaran") also settles the brand.
                    brand: linked?.brand ?? form.brand,
                    fixtureProfileId: linked?.fixtureProfileId,
                    fixtureModeId: linked?.fixtureModeId,
                    specs: specsIsDerived(form.specs, form.fixtureProfileId, form.fixtureModeId)
                      ? linked?.specs ?? ''
                      : form.specs,
                  });
                }}
                className={`w-full p-1.5 text-xs rounded-lg border font-mono text-[11px] font-bold ${
                  'bg-raised text-ink border-line-strong'
                }`}
              >
                <option value="" className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">-- Custom Model --</option>
                <ModelOptions options={modelOptionsFor(form.category, form.brand)} />
              </select>
            </div>
          </div>

          {/* Linked database fixture: DMX personality + technical card */}
          {(() => {
            const profile = profileById(form.fixtureProfileId);
            if (!profile) {
              if (!usesFixtureDatabase(form.category)) return null;
              return (
                <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 -mt-1">
                  Models marked ◆ come from the fixture database and bring DMX modes, wattage and weight with them.
                </p>
              );
            }
            const mode = profile.modes.find((candidate) => candidate.id === form.fixtureModeId) ?? profile.modes[0];
            return (
              <div className={`p-2.5 rounded-xl border bg-violet-50 dark:bg-violet-500/10 border-violet-300 dark:border-violet-500/30`}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[11px] font-black uppercase tracking-wider text-violet-950 dark:text-violet-300">
                    ◆ Fixture database
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        fixtureProfileId: undefined,
                        fixtureModeId: undefined,
                        specs: specsIsDerived(form.specs, form.fixtureProfileId, form.fixtureModeId) ? '' : form.specs,
                      })
                    }
                    className="text-[10px] font-bold underline opacity-70 hover:opacity-100"
                  >
                    Unlink
                  </button>
                </div>
                <p className="text-[11px] font-bold text-slate-950 dark:text-slate-100">
                  {profile.manufacturer} {profile.model}
                </p>
                {profile.modes.length > 0 ? (
                  <>
                    <label htmlFor={`${fieldId}-dmx-personality`} className="block text-[10px] font-black uppercase tracking-wider mt-2 mb-1 text-slate-950 dark:text-slate-300">
                      DMX Personality
                    </label>
                    <select
                      id={`${fieldId}-dmx-personality`}
                      value={mode?.id ?? ''}
                      onChange={(e) => {
                        const updates = gearProfileUpdates(profile, e.target.value);
                        setForm({
                          ...form,
                          fixtureModeId: updates.fixtureModeId,
                          specs: specsIsDerived(form.specs, form.fixtureProfileId, form.fixtureModeId)
                            ? updates.specs
                            : form.specs,
                        });
                      }}
                      className={`w-full p-1.5 text-xs rounded-lg border font-bold ${
                        'bg-raised text-ink border-violet-300 dark:border-violet-700'
                      }`}
                    >
                      {profile.modes.map((candidate) => (
                        <option key={candidate.id} value={candidate.id} className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">
                          {fixtureModeLabel(candidate)}
                        </option>
                      ))}
                    </select>
                    {mode?.channels && mode.channels.length > 0 && (
                      <p className="mt-1.5 text-[10px] font-mono leading-relaxed text-slate-700 dark:text-slate-300 max-h-16 overflow-y-auto custom-scrollbar">
                        {mode.channels.map((channel) => `${channel.offset}. ${channel.name}`).join(' · ')}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-1 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
                    No DMX modes listed for this fixture.
                  </p>
                )}
                <p className="mt-1.5 text-[10px] font-mono text-slate-600 dark:text-slate-400">
                  {fixtureSpecsLine(profile, mode?.id) || 'No measured data'}
                </p>
              </div>
            );
          })()}

          {/* Item Name & Quantity */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label htmlFor={`${fieldId}-item-name`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                Item Name *
              </label>
              <input id={`${fieldId}-item-name`}
                type="text"
                required
                placeholder="e.g. Camera A Package, ARRI SkyPanel S60-C, Sony FX6"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={`w-full p-2 text-xs rounded-lg border font-black focus:ring-2 focus:ring-sky-500 ${
                  'bg-raised border-line-strong text-ink'
                }`}
              />
            </div>
            <div>
              <label htmlFor={`${fieldId}-quantity`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                Quantity
              </label>
              <input id={`${fieldId}-quantity`}
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) =>
                  setForm({ ...form, quantity: Math.max(1, Number(e.target.value)) })
                }
                className={`w-full p-2 text-xs rounded-lg border font-mono font-black text-center focus:ring-2 focus:ring-sky-500 ${
                  'bg-raised border-line-strong text-ink'
                }`}
              />
            </div>
          </div>

          {/* Freehand Brand & Model Customization */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${fieldId}-brand-manufacturer`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                Brand / Manufacturer
              </label>
              <input id={`${fieldId}-brand-manufacturer`}
                type="text"
                placeholder="e.g. ARRI, Aputure, Nanlite"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className={`w-full p-2 text-xs rounded-lg border font-bold focus:ring-2 focus:ring-sky-500 ${
                  'bg-raised border-line-strong text-ink'
                }`}
              />
            </div>
            <div>
              <label htmlFor={`${fieldId}-model-variant`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                Model / Variant
              </label>
              <input id={`${fieldId}-model-variant`}
                type="text"
                placeholder="e.g. SkyPanel S60-C, LS 600d Pro"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className={`w-full p-2 text-xs rounded-lg border font-mono font-bold text-[11px] focus:ring-2 focus:ring-sky-500 ${
                  'bg-raised border-line-strong text-ink'
                }`}
              />
            </div>
          </div>

          {/* Role / Function */}
          <div>
            <label htmlFor={`${fieldId}-production-role-function`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
              Production Role / Function
            </label>
            <input id={`${fieldId}-production-role-function`}
              type="text"
              placeholder="e.g. Key Light, Backlight / Rim, A-Cam Main, Overhead Boom"
              value={form.roleOrFunction}
              onChange={(e) => setForm({ ...form, roleOrFunction: e.target.value })}
              className={`w-full p-2 text-xs rounded-lg border font-bold focus:ring-2 focus:ring-sky-500 ${
                'bg-raised border-line-strong text-ink'
              }`}
            />
          </div>

          {/* Technical Specs & Notes */}
          <div>
            <label htmlFor={`${fieldId}-technical-specs-notes`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
              Technical Specs & Notes
            </label>
            <textarea id={`${fieldId}-technical-specs-notes`}
              rows={2}
              placeholder="e.g. 5600K · 100% · Barn Doors, V-Lock mount, 12G 4K60p rated"
              value={form.specs}
              onChange={(e) => setForm({ ...form, specs: e.target.value })}
              className={`w-full p-2 text-xs rounded-lg border font-medium focus:ring-2 focus:ring-sky-500 custom-scrollbar ${
                'bg-raised border-line-strong text-ink'
              }`}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onClose()}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg border ${
                'border-line-strong hover:bg-surface-hover text-ink'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-black rounded-lg bg-accent hover:bg-accent-hover text-white shadow-md flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{editingItem ? 'Save Changes' : form.targetPackageId ? 'Attach to Package' : 'Add Item'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
