import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarRange, Coins, Download, Plus, Trash2 } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { createId } from '../../domain/ids';
import {
  BUDGET_CATEGORIES,
  RATE_BASIS_LABELS,
  VAT_PRESETS,
  budgetToCsv,
  deriveBudget,
  emptyBudget,
  formatMoney,
} from '../../domain/budget';
import type { BudgetCategory, BudgetEntry, BudgetLine, EquipmentRate, ProjectBudget, RateBasis, RateCard } from '../../domain/budget';
import { RateCardFields, VatSelect } from './RateCardFields';
import { useProductionNeeds } from './useProductionNeeds';
import { DayNeedsView } from './DayNeedsView';

const downloadText = (filename: string, text: string) => {
  // UTF-8 BOM, so Excel reads the € signs as UTF-8 rather than guessing.
  const blob = new Blob([String.fromCharCode(0xfeff) + text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * The production budget, derived from what the project already knows.
 *
 * Crew and cast come priced from their rate cards on the Crew tab and the
 * days the schedule gives them; equipment from the plan, priced by rates
 * entered here against the master-list grouping; everything else is a hand
 * line. Nothing is stored except rates and lines (rule 37), so the numbers
 * follow the schedule as it changes.
 */
export const BudgetPanel: React.FC = () => {
  const { project, updateProjectMeta, theme, setActiveRightTab } = useFloorPlan();
  const isLight = theme === 'light';
  const [view, setView] = useState<'budget' | 'needs'>('budget');
  const budget: ProjectBudget = useMemo(() => project.budget ?? emptyBudget(), [project.budget]);
  const { shootDays, personDays, equipment } = useProductionNeeds();
  const summary = useMemo(
    () => deriveBudget({ budget, people: project.people, shootDays, personDays, equipment }),
    [budget, project.people, shootDays, personDays, equipment],
  );
  const { currency, defaultVatPercent } = summary.settings;

  const inputCls = `min-h-[30px] w-full rounded-md border px-2 py-1 text-xs outline-none ${
    isLight ? 'border-slate-300 bg-white text-slate-800 focus:border-sky-400' : 'border-slate-700 bg-slate-950 text-slate-200 focus:border-sky-500'
  }`;
  const labelCls = `text-[9px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`;
  const cardCls = `rounded-xl border p-3 ${isLight ? 'border-slate-200 bg-white' : 'border-slate-800 bg-slate-900/60'}`;
  const mutedCls = isLight ? 'text-slate-500' : 'text-slate-400';
  const money = (value: number) => formatMoney(value, currency);

  const patchBudget = (updates: Partial<ProjectBudget>) => updateProjectMeta({ budget: { ...budget, ...updates } });
  const patchSettings = (updates: Partial<ProjectBudget['settings']>) =>
    patchBudget({ settings: { ...budget.settings, ...updates } });

  const setEquipmentRate = (key: string, label: string, card: RateCard | undefined) => {
    const others = budget.equipmentRates.filter((rate) => rate.key !== key);
    if (!card) {
      patchBudget({ equipmentRates: others });
      return;
    }
    const existing = budget.equipmentRates.find((rate) => rate.key === key);
    const next: EquipmentRate = { id: existing?.id ?? createId('rate'), key, label, ...card };
    patchBudget({ equipmentRates: [...others, next] });
  };

  const addLine = (category: BudgetCategory = 'other') =>
    patchBudget({ lines: [...budget.lines, { id: createId('budget'), category, label: '', amount: 0, basis: 'flat' }] });
  const patchLine = (id: string, updates: Partial<BudgetLine>) =>
    patchBudget({ lines: budget.lines.map((line) => (line.id === id ? { ...line, ...updates } : line)) });
  const removeLine = (id: string) => patchBudget({ lines: budget.lines.filter((line) => line.id !== id) });

  const exportCsv = () => downloadText(`Budget_${project.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.csv`, budgetToCsv(summary));

  const entryRow = (entry: BudgetEntry) => (
    <tr key={entry.id} className={`border-t ${isLight ? 'border-slate-100' : 'border-slate-800'}`}>
      <td className="py-1.5 pr-2">
        <div className="font-semibold">{entry.label}</div>
        {entry.detail && <div className={`text-[10px] ${mutedCls}`}>{entry.detail}</div>}
        {entry.warning && (
          <div className="text-[10px] text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{entry.warning}</div>
        )}
      </td>
      <td className={`py-1.5 pr-2 text-right font-mono whitespace-nowrap ${mutedCls}`}>
        {money(entry.rate)} {RATE_BASIS_LABELS[entry.basis]}
      </td>
      <td className="py-1.5 pr-2 text-right font-mono">{entry.basis === 'flat' ? '' : `${entry.units} d`}{entry.quantity > 1 ? ` ×${entry.quantity}` : ''}</td>
      <td className="py-1.5 pr-2 text-right font-mono">{money(entry.net)}</td>
      <td className={`py-1.5 pr-2 text-right font-mono ${mutedCls}`}>{entry.vatPercent}%</td>
      <td className="py-1.5 text-right font-mono font-bold">{money(entry.gross)}</td>
    </tr>
  );

  const unpricedPeople = summary.unpriced.filter((item) => item.kind === 'person');
  const unpricedEquipment = equipment.filter((item) => !budget.equipmentRates.some((rate) => rate.key === item.key));

  return (
    <div className={`h-full flex flex-col ${isLight ? 'bg-[#f3f5f7] text-slate-900' : 'bg-slate-950 text-slate-100'}`}>
      <header className={`shrink-0 border-b px-4 h-12 flex items-center justify-between gap-3 ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-md bg-emerald-500 text-slate-950 flex items-center justify-center"><Coins className="w-4 h-4" /></div>
          <div className="min-w-0">
            <h2 className="text-sm font-black tracking-tight">{view === 'budget' ? 'Budget' : 'Day needs'}</h2>
            <p className={`text-[9px] truncate ${mutedCls}`}>
              {shootDays} shooting day{shootDays === 1 ? '' : 's'} · {summary.entries.length} priced line{summary.entries.length === 1 ? '' : 's'} · total {money(summary.total)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex h-8 rounded-md border p-0.5 ${isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
            {([['budget', Coins, 'Budget'], ['needs', CalendarRange, 'Day needs']] as const).map(([key, Icon, label]) => (
              <button key={key} onClick={() => setView(key)} className={`px-2.5 rounded text-[9px] font-black flex items-center gap-1.5 ${view === key ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm' : mutedCls}`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>
          {view === 'budget' && (
            <button onClick={exportCsv} className={`h-8 px-2.5 rounded-md border text-[9px] font-black flex items-center gap-1.5 ${isLight ? 'bg-white border-slate-300 hover:border-emerald-500' : 'bg-slate-950 border-slate-800 hover:border-emerald-500'}`}>
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          )}
        </div>
      </header>

      {view === 'needs' ? (
        <DayNeedsView isLight={isLight} />
      ) : (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
          {/* Settings: currency, the VAT that applies unless a rate says otherwise, the paid week. */}
          <section className={cardCls}>
            <h3 className={`text-[10px] font-black uppercase tracking-wider mb-2 ${mutedCls}`}>Settings</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <label className="block space-y-1">
                <span className={labelCls}>Currency</span>
                <input value={budget.settings.currency} onChange={(e) => patchSettings({ currency: e.target.value.toUpperCase().slice(0, 3) || 'EUR' })} className={`${inputCls} font-mono uppercase`} maxLength={3} />
              </label>
              <div className="block space-y-1">
                <label htmlFor="budget-default-vat" className={`block ${labelCls}`}>Default VAT</label>
                <VatSelect
                  id="budget-default-vat"
                  value={budget.settings.defaultVatPercent}
                  defaultPercent={VAT_PRESETS[0].rates[0].percent}
                  onChange={(percent) => patchSettings({ defaultVatPercent: percent ?? VAT_PRESETS[0].rates[0].percent })}
                  className={inputCls}
                  ariaLabel="Default VAT rate"
                />
              </div>
              <label className="block space-y-1">
                <span className={labelCls}>Days per paid week</span>
                <input type="number" min={1} max={7} value={budget.settings.weekDays} onChange={(e) => patchSettings({ weekDays: Math.max(1, Math.min(7, Math.round(Number(e.target.value)) || 5)) })} className={inputCls} />
              </label>
              <label className="block space-y-1">
                <span className={labelCls}>Contingency %</span>
                <input type="number" min={0} step={0.5} value={budget.settings.contingencyPercent ?? ''} placeholder="0" onChange={(e) => patchSettings({ contingencyPercent: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })} className={inputCls} />
              </label>
            </div>
            <p className={`mt-2 text-[10px] ${mutedCls}`}>
              Rates are net; VAT is added per line at the rate's own percentage, or this default. Weekly rates are pro-rated by the day over the paid week — a production that pays full weeks regardless should enter a flat fee.
              {shootDays === 0 && ' No shooting days are scheduled yet, so day and week rates price at zero until the schedule has days.'}
            </p>
          </section>

          {/* Totals first: the figure the reader came for. */}
          <section className={cardCls}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[['Net', summary.net], ['VAT', summary.vat], ['Gross', summary.gross], ['Total incl. contingency', summary.total]].map(([label, value]) => (
                <div key={label as string}>
                  <div className={labelCls}>{label as string}</div>
                  <div className="text-lg font-black font-mono">{money(value as number)}</div>
                </div>
              ))}
            </div>
            {summary.vatByRate.length > 1 && (
              <div className={`mt-2 text-[10px] ${mutedCls}`}>
                VAT by rate: {summary.vatByRate.map((bucket) => `${bucket.percent}% on ${money(bucket.net)} = ${money(bucket.vat)}`).join(' · ')}
              </div>
            )}
          </section>

          {summary.categories.map((category) => (
            <section key={category.category} className={cardCls}>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <h3 className={`text-[10px] font-black uppercase tracking-wider ${mutedCls}`}>{category.label}</h3>
                <div className="text-xs font-mono"><span className={mutedCls}>net {money(category.net)} · </span><b>{money(category.gross)}</b></div>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className={`text-[9px] uppercase ${mutedCls}`}>
                    <th className="text-left font-bold py-1">Item</th>
                    <th className="text-right font-bold py-1">Rate</th>
                    <th className="text-right font-bold py-1">Days</th>
                    <th className="text-right font-bold py-1">Net</th>
                    <th className="text-right font-bold py-1">VAT</th>
                    <th className="text-right font-bold py-1">Gross</th>
                  </tr>
                </thead>
                <tbody>{category.entries.map(entryRow)}</tbody>
              </table>
            </section>
          ))}

          {/* Equipment rates: every item on any plan, priced or not. */}
          <section className={cardCls}>
            <h3 className={`text-[10px] font-black uppercase tracking-wider mb-1 ${mutedCls}`}>Equipment rates</h3>
            <p className={`text-[10px] mb-2 ${mutedCls}`}>
              Gear comes from the plans; a rate here prices every day a setup using it is scheduled, at the most any single setup needs at once.
              {equipment.length === 0 && ' No equipment is on any plan yet.'}
            </p>
            <div className="space-y-1.5">
              {equipment.map((item) => {
                const rate = budget.equipmentRates.find((candidate) => candidate.key === item.key);
                return (
                  <div key={item.key} className={`grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2 items-start rounded-lg border p-2 ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{item.label}</div>
                      <div className={`text-[10px] ${mutedCls}`}>{item.category} · ×{item.quantity} · {item.days} day{item.days === 1 ? '' : 's'} on set · {item.setupNames.join(', ')}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <RateCardFields
                        value={rate ? { amount: rate.amount, basis: rate.basis, ...(rate.vatPercent !== undefined ? { vatPercent: rate.vatPercent } : {}) } : undefined}
                        onChange={(card) => setEquipmentRate(item.key, item.label, card)}
                        currency={currency}
                        defaultVatPercent={defaultVatPercent}
                        inputCls={inputCls}
                        labelCls={labelCls}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Hand lines: everything with no other home. */}
          <section className={cardCls}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className={`text-[10px] font-black uppercase tracking-wider ${mutedCls}`}>Other costs</h3>
              <button onClick={() => addLine()} className="h-7 px-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold flex items-center gap-1"><Plus className="w-3 h-3" /> Add line</button>
            </div>
            {budget.lines.length === 0 && <p className={`text-[10px] ${mutedCls}`}>Location fees, catering, travel, insurance, post — anything the crew list and the plans do not already carry.</p>}
            <div className="space-y-2">
              {budget.lines.map((line) => (
                <div key={line.id} className={`rounded-lg border p-2 grid grid-cols-2 sm:grid-cols-[minmax(0,1.4fr)_auto_auto_auto_auto] gap-2 items-end ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
                  <label className="block space-y-1 col-span-2 sm:col-span-1">
                    <span className={labelCls}>Item</span>
                    <input value={line.label} onChange={(e) => patchLine(line.id, { label: e.target.value })} placeholder="Warehouse hire, lunch, insurance…" className={inputCls} />
                  </label>
                  <label className="block space-y-1">
                    <span className={labelCls}>Category</span>
                    <select value={line.category} onChange={(e) => patchLine(line.id, { category: e.target.value as BudgetCategory })} className={`${inputCls} !w-auto`}>
                      {BUDGET_CATEGORIES.map((category) => <option key={category.key} value={category.key}>{category.label}</option>)}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className={labelCls}>Amount ({currency})</span>
                    <div className="flex gap-1">
                      <input type="number" min={0} value={line.amount} onChange={(e) => patchLine(line.id, { amount: Math.max(0, Number(e.target.value) || 0) })} className={`${inputCls} !w-24`} />
                      <select value={line.basis} aria-label="Basis" onChange={(e) => patchLine(line.id, { basis: e.target.value as RateBasis })} className={`${inputCls} !w-auto`}>
                        {(Object.keys(RATE_BASIS_LABELS) as RateBasis[]).map((key) => <option key={key} value={key}>{RATE_BASIS_LABELS[key]}</option>)}
                      </select>
                    </div>
                  </label>
                  <label className="block space-y-1">
                    <span className={labelCls}>{line.basis === 'flat' ? 'Qty' : 'Days × qty'}</span>
                    <div className="flex gap-1">
                      {line.basis !== 'flat' && (
                        <input type="number" min={0} value={line.units ?? ''} placeholder={String(shootDays)} title="Blank = every shooting day" onChange={(e) => patchLine(line.id, { units: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value)) })} className={`${inputCls} !w-16`} />
                      )}
                      <input type="number" min={1} value={line.quantity ?? 1} onChange={(e) => patchLine(line.id, { quantity: Math.max(1, Number(e.target.value) || 1) })} className={`${inputCls} !w-14`} />
                    </div>
                  </label>
                  <div className="flex items-end gap-1">
                    <div className="block space-y-1">
                      <label htmlFor={`vat-${line.id}`} className={`block ${labelCls}`}>VAT</label>
                      <VatSelect id={`vat-${line.id}`} value={line.vatPercent} defaultPercent={defaultVatPercent} onChange={(percent) => patchLine(line.id, { vatPercent: percent })} className={`${inputCls} !w-auto`} />
                    </div>
                    <button onClick={() => removeLine(line.id)} title="Remove line" aria-label={`Remove ${line.label || 'line'}`} className="h-[30px] w-8 rounded-md text-slate-400 hover:text-rose-500 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {(unpricedPeople.length > 0 || unpricedEquipment.length > 0) && (
            <section className={`rounded-xl border p-3 ${isLight ? 'border-amber-200 bg-amber-50' : 'border-amber-900/60 bg-amber-950/20'}`}>
              <h3 className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Not yet priced</h3>
              {unpricedPeople.length > 0 && (
                <p className="text-[11px] mt-1">
                  {unpricedPeople.length} crew or cast without a rate: {unpricedPeople.map((item) => item.label).join(', ')}.{' '}
                  <button onClick={() => setActiveRightTab('contacts')} className="underline font-semibold">Add rates on the Crew tab</button>.
                </p>
              )}
              {unpricedEquipment.length > 0 && (
                <p className="text-[11px] mt-1">{unpricedEquipment.length} equipment item{unpricedEquipment.length === 1 ? '' : 's'} without a rate, listed above.</p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
};
