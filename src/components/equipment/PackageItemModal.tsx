import React from 'react';
import { Check, Package, X } from 'lucide-react';
import type { EquipmentCategory } from '../../types';
import { CAMERA_PACKAGE_PRESETS, EQUIPMENT_CATEGORIES } from '../../utils/equipmentList';
import { useDialogFocusTrap } from '../../utils/useDialogFocusTrap';

/** The fields of one accessory added to a camera package. */
export interface PackageItemForm {
  category: EquipmentCategory;
  name: string;
  brand: string;
  model: string;
  quantity: number;
  roleOrFunction: string;
  specs: string;
}

/**
 * Add an accessory (batteries, media, monitor, transmitter…) to a camera
 * package, from a preset or by hand. Extracted from `EquipmentPanel`.
 */
export const PackageItemModal: React.FC<{
  fieldId: string;
  isLight: boolean;
  form: PackageItemForm;
  setForm: React.Dispatch<React.SetStateAction<PackageItemForm>>;
  onSubmit: (event: React.FormEvent) => void;
  onClose: () => void;
}> = ({ fieldId, isLight, form, setForm, onSubmit, onClose }) => {
  const dialogRef = useDialogFocusTrap(true);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${fieldId}-add-package-item-title`}
        tabIndex={-1}
        className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl outline-hidden ${
          'bg-surface border-line-strong text-ink'
        }`}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 text-emerald-900 dark:text-emerald-400`}>
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 id={`${fieldId}-add-package-item-title`} className="text-sm font-black text-slate-950 dark:text-slate-100">
                Add Gear to Camera Package
              </h3>
              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                Attach batteries, media cards, monitor, transmitter, or accessories
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

        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          {/* Preset Quick Loader */}
          <div>
            <label htmlFor={`${fieldId}-choose-preset-or-type-custom-below`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-emerald-700 dark:text-emerald-400">
              ⚡ Choose Preset (Or type custom below)
            </label>
            <select id={`${fieldId}-choose-preset-or-type-custom-below`}
              onChange={(e) => {
                const preset = CAMERA_PACKAGE_PRESETS.find((p) => p.name === e.target.value);
                if (preset) {
                  setForm({
                    category: preset.category,
                    name: preset.name,
                    brand: preset.brand,
                    model: preset.model,
                    quantity: preset.quantity,
                    roleOrFunction: preset.roleOrFunction,
                    specs: preset.specs,
                  });
                }
              }}
              className={`w-full p-2 text-xs rounded-lg border font-bold ${
                isLight ? 'bg-white text-slate-950 border-slate-300' : 'bg-slate-800 text-slate-100 dark:border-slate-700'
              }`}
            >
              <option value="" className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">
                -- Select Camera Accessory Preset --
              </option>
              {CAMERA_PACKAGE_PRESETS.map((p, idx) => (
                <option key={idx} value={p.name} className="bg-white text-slate-950 dark:bg-slate-800 dark:text-slate-100 font-bold">
                  {p.name} (x{p.quantity}) - {p.brand}
                </option>
              ))}
            </select>
          </div>

          {/* Category */}
          <div>
            <label htmlFor={`${fieldId}-category-rubric`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
              Category Rubric
            </label>
            <select id={`${fieldId}-category-rubric`}
              value={form.category}
              onChange={(e) =>
                setForm({ ...form, category: e.target.value as EquipmentCategory })
              }
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

          {/* Item Name & Quantity */}
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label htmlFor={`${fieldId}-accessory-name`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                Accessory Name *
              </label>
              <input id={`${fieldId}-accessory-name`}
                type="text"
                required
                placeholder="e.g. V-Mount Batteries, CFexpress Type B"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={`w-full p-2 text-xs rounded-lg border font-black ${
                  'bg-raised border-line-strong text-ink'
                }`}
              />
            </div>
            <div>
              <label htmlFor={`${fieldId}-quantity-2`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                Quantity
              </label>
              <input id={`${fieldId}-quantity-2`}
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) =>
                  setForm({ ...form, quantity: Math.max(1, Number(e.target.value)) })
                }
                className={`w-full p-2 text-xs rounded-lg border font-mono font-black text-center ${
                  'bg-raised border-line-strong text-ink'
                }`}
              />
            </div>
          </div>

          {/* Brand & Model */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={`${fieldId}-brand`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                Brand
              </label>
              <input id={`${fieldId}-brand`}
                type="text"
                placeholder="e.g. Anton Bauer, SanDisk, SmallHD"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className={`w-full p-2 text-xs rounded-lg border font-bold ${
                  'bg-raised border-line-strong text-ink'
                }`}
              />
            </div>
            <div>
              <label htmlFor={`${fieldId}-model-variant-2`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
                Model / Variant
              </label>
              <input id={`${fieldId}-model-variant-2`}
                type="text"
                placeholder="e.g. Titon 150, Cine 7"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className={`w-full p-2 text-xs rounded-lg border font-mono font-bold text-[11px] ${
                  'bg-raised border-line-strong text-ink'
                }`}
              />
            </div>
          </div>

          {/* Role & Specs */}
          <div>
            <label htmlFor={`${fieldId}-role-function`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
              Role / Function
            </label>
            <input id={`${fieldId}-role-function`}
              type="text"
              placeholder="e.g. Camera Power, Recording Media, Focus Peaking"
              value={form.roleOrFunction}
              onChange={(e) => setForm({ ...form, roleOrFunction: e.target.value })}
              className={`w-full p-2 text-xs rounded-lg border font-bold ${
                'bg-raised border-line-strong text-ink'
              }`}
            />
          </div>

          <div>
            <label htmlFor={`${fieldId}-technical-specs`} className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-950 dark:text-slate-300">
              Technical Specs
            </label>
            <input id={`${fieldId}-technical-specs`}
              type="text"
              placeholder="e.g. 14.4V High-Draw · 150Wh · USB-C"
              value={form.specs}
              onChange={(e) => setForm({ ...form, specs: e.target.value })}
              className={`w-full p-2 text-xs rounded-lg border font-medium ${
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
              className="px-4 py-1.5 text-xs font-black rounded-lg bg-emerald-700 hover:bg-emerald-700 text-white shadow-md flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Attach to Package</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
