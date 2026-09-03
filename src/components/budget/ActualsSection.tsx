import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { createId } from '../../domain/ids';
import { actualsByCategory, BUDGET_CATEGORIES,
  actualsVariance,
  formatMoney,
  roundMoney,
  setEntryActual,
  sumActuals,
  varianceByEntry,
  type BudgetActual,
  type BudgetCategory,
  type BudgetEntry,
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
  /**
   * The estimate's own lines, so a spend can be attached to the line it
   * belongs to — "Alex wants more money" becomes a variance on his row.
   */
  entries?: BudgetEntry[];
  /** Every row the Budget tab knows, including equipment/people without rates. */
  availableEntries?: ActualsEstimateLine[];
  /** Cast and crew by name, attachable even before anyone priced them. */
  people?: Array<{ id: string; displayName: string }>;
  /** The estimate rolled up per category — the cost report's left column. */
  categoryTotals?: Array<{ category: import('../../domain/budget').BudgetCategory; label: string; net: number }>;
  isLight: boolean;
}

export interface ActualsEstimateLine {
  id: string;
  category: BudgetCategory;
  label: string;
  detail?: string;
  /** Unknown until the Budget tab has a usable rate; never silently zero. */
  plannedNet?: number;
}

export const ActualsSection: React.FC<ActualsSectionProps> = ({
  budget,
  onPatch,
  currency,
  estimatedNet,
  entries,
  availableEntries,
  people,
  categoryTotals,
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
      { id: createId('actual'), category: draftCategory, label: draftLabel.trim(), amount: roundMoney(amount) },
    ]);
    setDraftLabel('');
    setDraftAmount('');
    setDraftCategory('other');
  };

  const variance = actualsVariance(actuals, estimatedNet);
  const total = sumActuals(actuals);
  const lineVariances = entries ? varianceByEntry(actuals, entries) : [];
  const exactActualLines: ActualsEstimateLine[] = availableEntries ?? (entries ?? []).map((entry) => ({
    id: entry.id,
    category: entry.category,
    label: entry.label,
    detail: entry.detail,
    plannedNet: entry.net,
  }));

  // The cost report's top sheet: one row per category the production has an
  // estimate or a receipt for — Estimate | Actual | Difference, the three
  // columns every film budgeting tool prints (Movie Magic calls it the
  // comparison; the numbers here are net like everything else on this panel).
  const spentByCategory = new Map(actualsByCategory(actuals).map((row) => [row.category, row.total] as const));
  const categorySheet = (() => {
    if (actuals.length === 0) return [];
    const labels = new Map((categoryTotals ?? []).map((row) => [row.category, row.label] as const));
    const order: import('../../domain/budget').BudgetCategory[] = [];
    for (const row of categoryTotals ?? []) order.push(row.category);
    for (const row of actualsByCategory(actuals)) if (!order.includes(row.category)) order.push(row.category);
    return order.map((category) => {
      const estimate = (categoryTotals ?? []).find((row) => row.category === category)?.net ?? null;
      const spent = spentByCategory.get(category) ?? 0;
      return {
        category,
        label: labels.get(category) ?? category,
        estimate,
        spent,
        over: estimate === null ? null : Math.round((spent - estimate) * 100) / 100,
      };
    });
  })();

  /** Options for "attach to": every person BY NAME (priced or not — the
      whole point is correcting Alex's number before a rate exists), then the
      estimate's other lines. Person options write `person:<id>` directly, so
      the variance table finds them whether or not deriveBudget prices them
      yet; an unpriced target simply shows an unknown estimate. */
  const personOptions = (people ?? []).slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
  const entryOptions = (entries ?? [])
    .slice()
    .reverse()
    .filter((entry) => !entry.id.startsWith('person:'));
  const attachLabel = (entryId: string | undefined): string => {
    if (!entryId) return 'Not attached';
    const person = personOptions.find((candidate) => `person:${candidate.id}` === entryId);
    if (person) return person.displayName;
    const found = (entries ?? []).find((entry) => entry.id === entryId);
    return found ? found.label : entryId;
  };
  return (
    <section className={cardCls}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className={`text-[10px] font-black uppercase tracking-wider ${labelCls}`}>Actuals</h3>
        <span className={`text-[10px] ${labelCls}`}>What was really spent</span>
      </div>

      {exactActualLines.length > 0 && (
        <div className={`mb-3 rounded-lg border overflow-hidden ${isLight ? 'border-slate-200 bg-white' : 'border-slate-700 bg-slate-950/40'}`}>
          <div className={`px-3 py-2 border-b ${isLight ? 'border-slate-200 bg-white' : 'border-slate-700'}`}>
            <div className="text-[11px] font-black">Set the exact actual cost</div>
            <p className={`text-[10px] ${labelCls}`}>
              Find the existing budget line below and type its final total. The difference updates immediately—no name or category re-entry.
            </p>
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className={labelCls}>
                <th className="text-left px-3 py-1.5">Existing line</th>
                <th className="text-right px-2 py-1.5">Planned</th>
                <th className="text-right px-2 py-1.5">Exact actual</th>
                <th className="text-right px-3 py-1.5">Difference</th>
              </tr>
            </thead>
            <tbody>
              {exactActualLines.map((estimate) => {
                const attached = actuals.filter((actual) => actual.entryId === estimate.id);
                const spent = attached.reduce((sum, actual) => sum + actual.amount, 0);
                const hasActual = attached.length > 0;
                const difference = hasActual && estimate.plannedNet !== undefined
                  ? Math.round((spent - estimate.plannedNet) * 100) / 100
                  : undefined;
                return (
                  <tr key={estimate.id} className={`border-t ${isLight ? 'border-slate-100' : 'border-slate-800'}`}>
                    <td className="px-3 py-1.5 min-w-0">
                      <div className="font-semibold truncate">{estimate.label}</div>
                      <div className={`text-[9px] truncate ${labelCls}`}>{estimate.detail ?? estimate.category}</div>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{estimate.plannedNet === undefined ? 'Not priced' : formatMoney(estimate.plannedNet, currency)}</td>
                    <td className="px-2 py-1.5">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={hasActual ? spent : ''}
                        aria-label={`Exact actual for ${estimate.label}`}
                        placeholder="Enter total"
                        onChange={(event) => {
                          const amount = event.target.value === '' ? undefined : Number(event.target.value);
                          const next = setEntryActual(actuals, estimate.id, amount, {
                            category: estimate.category,
                            label: estimate.label,
                          });
                          if (next !== undefined) patchActuals(next);
                        }}
                        className={`${inputCls} !w-28 ml-auto text-right font-mono`}
                      />
                    </td>
                    <td className={`px-3 py-1.5 text-right font-mono font-bold ${
                      difference === undefined ? labelCls : difference > 0 ? 'text-amber-500' : difference < 0 ? 'text-emerald-500' : ''
                    }`}>
                      {difference === undefined
                        ? '—'
                        : `${difference > 0 ? '+' : difference < 0 ? '−' : ''}${formatMoney(Math.abs(difference), currency)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <details className={`rounded-lg border p-2 ${isLight ? 'border-slate-200 bg-white/70' : 'border-slate-700 bg-slate-950/30'}`}>
        <summary className="cursor-pointer text-[10px] font-black uppercase tracking-wider">
          Additional receipts, unplanned costs &amp; reports
        </summary>
        <div className="pt-2">

      {actuals.length === 0 && (
        <p className={`text-[10px] mb-2 ${labelCls}`}>
          Log spend as it happens — the wrap report compares it with the estimate above. Nothing
          logged yet says nothing, not “on budget”.
        </p>
      )}

      <div className="space-y-1.5">
        {actuals.map((entry) => (
          <div key={entry.id} className="space-y-1">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_1fr_auto] gap-1.5 items-center">
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
                      ? { ...existing, amount: roundMoney(Math.max(0, Number(e.target.value) || 0)) }
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
          {/* Which estimated line this spend belongs to — the field that
              turns "Alex wants more" into a number on Alex's row. */}
          <select
            value={entry.entryId ?? ''}
            aria-label={`Attach ${entry.label} to an estimated line`}
            onChange={(e) =>
              patchActuals(
                actuals.map((existing) =>
                  existing.id === entry.id
                    ? { ...existing, entryId: e.target.value || undefined }
                    : existing,
                ),
              )
            }
            className={`${inputCls} !w-auto max-w-full`}
          >
            <option value="">Not attached</option>
            {personOptions.length > 0 && (
              <optgroup label="Cast & crew">
                {personOptions.map((person) => (
                  <option key={person.id} value={`person:${person.id}`}>
                    {person.displayName}
                  </option>
                ))}
              </optgroup>
            )}
            {entryOptions.length > 0 && (
              <optgroup label="Other estimate lines">
                {entryOptions.map((estimate) => (
                  <option key={estimate.id} value={estimate.id}>
                    {estimate.label}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      ))}
      </div>

      {actuals.length > 0 && (
        <div className={`mt-2 pt-2 border-t space-y-1 ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <div className={`text-[10px] font-black uppercase tracking-wider ${labelCls}`}>
            Cost report — estimate vs actual, per category
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className={labelCls}>
                <th className="text-left font-bold">Category</th>
                <th className="text-right font-bold">Estimate</th>
                <th className="text-right font-bold">Actual</th>
                <th className="text-right font-bold">Diff</th>
              </tr>
            </thead>
            <tbody>
              {categorySheet.map((row) => (
                <tr key={row.category}>
                  <td className="truncate">{row.label}</td>
                  <td className="text-right font-mono">{row.estimate === null ? '—' : formatMoney(row.estimate, currency)}</td>
                  <td className="text-right font-mono">{formatMoney(row.spent, currency)}</td>
                  <td className={`text-right font-mono font-semibold ${
                    row.over === null ? '' : row.over > 0 ? 'text-amber-500' : row.over < 0 ? 'text-emerald-500' : ''
                  }`}>
                    {row.estimate === null
                      ? '—'
                      : `${row.over! > 0 ? '+' : row.over! < 0 ? '−' : ''}${formatMoney(Math.abs(row.over!), currency)}`}
                  </td>
                </tr>
              ))}
              {estimatedNet !== undefined && (
                <tr className={`border-t ${isLight ? 'border-slate-200' : 'border-slate-800'} font-bold`}>
                  <td>Total</td>
                  <td className="text-right font-mono">{formatMoney(estimatedNet, currency)}</td>
                  <td className="text-right font-mono">{formatMoney(total, currency)}</td>
                  {variance && (
                    <td className={`text-right font-mono ${variance.over > 0 ? 'text-amber-500' : 'text-emerald-500'}`}>
                      {variance.over > 0 ? '+' : variance.over < 0 ? '−' : ''}
                      {formatMoney(Math.abs(variance.over), currency)}
                    </td>
                  )}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Line detail: only lines with an attachment can speak here.
          "Alex wants more money" is a number on Alex's row, not a mood. */}
      {lineVariances.length > 0 && (
        <div className={`mt-2 pt-2 border-t space-y-0.5 ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
          <div className={`text-[10px] font-black uppercase tracking-wider ${labelCls}`}>By line</div>
          {lineVariances.map((row) => (
            <div key={row.entryId} className="flex items-center justify-between gap-3 text-[11px]">
              <span className="truncate">{attachLabel(row.entryId)}</span>
              <span className={`font-mono font-semibold flex-shrink-0 ${
                row.over > 0 ? 'text-amber-500' : row.over < 0 ? 'text-emerald-500' : ''
              }`}>
                {formatMoney(row.spent, currency)}
                {' / '}
                {row.estimate === null ? '—' : formatMoney(row.estimate, currency)}
                {row.estimate !== null && row.over !== 0 && (
                  <> ({row.over > 0 ? '+' : ''}{formatMoney(row.over, currency)})</>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

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
        </div>
      </details>
    </section>
  );
};
