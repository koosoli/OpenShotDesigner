import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createId } from '../../domain/ids';
import {
  BUDGET_CATEGORIES,
  actualsVariance,
  formatMoney,
  sumActuals,
  type BudgetActual,
  type BudgetCategory,
  type ProjectBudget,
} from '../../domain/budget';

/**
 * Actuals — money that actually left the account, logged as it is paid.
 *
 * The rest of this panel derives; this section records. The two meet in one
 * line at the bottom: spent against the derived net, spoken only once at
 * least one receipt exists (an empty ledger is not "on budget", it is
 * "nobody has typed anything yet").
 */
export interface ActualsSectionProps {
  budget: ProjectBudget;
  onPatch: (updates: Partial<ProjectBudget>) => void;
  currency: string;
  /** The derived net total, when the budget has enough to produce one. */
  estimatedNet?: number;
  isLight: boolean;
}

export const ActualsSection: React.FC<ActualsSectionProps> = ({
  budget,
  onPatch,
  currency,
  estimatedNet,
  isLight,
}) => {
  const actuals = budget.actuals ?? [];
  const [draftLabel, setDraftLabel] = useState('');
  const [draftAmount, setDraftAmount] = useState('');
  const [draftCategory, setDraftCategory] = useState<BudgetCategory>('other');

  const inputCls = `w-full text-xs rounded-md border px-2 py-1.5 ${
    isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-950'
  }`;
  const labelCls = `text-[10px] font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`;
  const cardCls = `rounded-xl border p-3 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800/60 bg-slate-900/40'}`;

  const patchActuals = (next: BudgetActual[]) =>
    onPatch({ actuals: next.length > 0 ? next : undefined });

  const addEntry = () => {
    const amount = Number(draftAmount);
    if (!draftLabel.trim() || !Number.isFinite(amount) || amount <= 0) return;
    patchActuals([
      ...actuals,
      { id: createId('actual'), category: draftCategory, label: draftLabel.trim(), amount },
    ]);
    setDraftLabel('');
    setDraftAmount('');
    setDraftCategory('other');
  };

  const variance = actualsVariance(actuals, estimatedNet);
  const total = sumActuals(actuals);

  return (
    <section className={cardCls}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className={`text-[10px] font-black uppercase tracking-wider ${labelCls}`}>Actuals</h3>
        <span className={`text-[10px] ${labelCls}`}>What was really spent</span>
      </div>

      {actuals.length === 0 && (
        <p className={`text-[10px] mb-2 ${labelCls}`}>
          Log spend as it happens — the wrap report compares it with the estimate above. Nothing
          logged yet says nothing, not “on budget”.
        </p>
      )}

      <div className="space-y-1.5">
        {actuals.map((entry) => (
          <div
            key={entry.id}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto_1fr_auto] gap-1.5 items-center"
          >
            <select
              value={entry.category}
              aria-label={`Category for ${entry.label}`}
              onChange={(e) =>
                patchActuals(
                  actuals.map((existing) =>
                    existing.id === entry.id
                      ? { ...existing, category: e.target.value as BudgetCategory }
                      : existing,
                  ),
                )
              }
              className={`${inputCls} !w-auto`}
            >
              {BUDGET_CATEGORIES.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </select>
            <input
              value={entry.label}
              aria-label={`Label for actual ${entry.label}`}
              onChange={(e) =>
                patchActuals(
                  actuals.map((existing) =>
                    existing.id === entry.id ? { ...existing, label: e.target.value } : existing,
                  ),
                )
              }
              placeholder="What it was"
              className={inputCls}
            />
            <input
              type="number"
              min={0}
              step="0.01"
              value={entry.amount}
              aria-label={`Amount for ${entry.label}`}
              onChange={(e) =>
                patchActuals(
                  actuals.map((existing) =>
                    existing.id === entry.id
                      ? { ...existing, amount: Math.max(0, Number(e.target.value) || 0) }
                      : existing,
                  ),
                )
              }
              className={`${inputCls} !w-24`}
            />
            <input
              type="date"
              value={entry.date ?? ''}
              aria-label={`Date paid for ${entry.label}`}
              onChange={(e) =>
                patchActuals(
                  actuals.map((existing) =>
                    existing.id === entry.id
                      ? { ...existing, date: e.target.value || undefined }
                      : existing,
                  ),
                )
              }
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => patchActuals(actuals.filter((existing) => existing.id !== entry.id))}
              title="Remove entry"
              aria-label={`Remove ${entry.label}`}
              className="p-1.5 rounded-md text-slate-400 hover:text-rose-500"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Add row — committed only when it has a label and an amount, so an
          abandoned half-row never becomes junk in saved projects. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] gap-1.5 mt-2">
        <select
          value={draftCategory}
          aria-label="New entry category"
          onChange={(e) => setDraftCategory(e.target.value as BudgetCategory)}
          className={`${inputCls} !w-auto`}
        >
          {BUDGET_CATEGORIES.map((category) => (
            <option key={category.key} value={category.key}>
              {category.label}
            </option>
          ))}
        </select>
        <input
          value={draftLabel}
          onChange={(e) => setDraftLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addEntry()}
          placeholder="What was paid for…"
          aria-label="New entry label"
          className={inputCls}
        />
        <input
          type="number"
          min={0}
          step="0.01"
          value={draftAmount}
          onChange={(e) => setDraftAmount(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addEntry()}
          placeholder={`${currency}`}
          aria-label="New entry amount"
          className={`${inputCls} !w-24`}
        />
        <button
          type="button"
          onClick={addEntry}
          title="Log spend"
          className="h-[30px] px-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1"
        >
          <Plus className="w-3 h-3" /> Log
        </button>
      </div>

      {actuals.length > 0 && (
        <div className={`flex items-center justify-between gap-3 mt-2 pt-2 border-t text-xs font-bold ${
          isLight ? 'border-slate-200' : 'border-slate-800'
        }`}>
          <span className={labelCls}>
            Spent <span className="font-mono">{formatMoney(total, currency)}</span>
          </span>
          {variance && estimatedNet !== undefined && (
            <span className={variance.over > 0 ? 'text-amber-500' : 'text-emerald-500'}>
              {formatMoney(Math.abs(variance.over), currency)}{' '}
              {variance.over > 0 ? 'over' : 'under'} the{' '}
              {formatMoney(estimatedNet, currency)} estimate
            </span>
          )}
        </div>
      )}
    </section>
  );
};
