import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CalendarRange, ClipboardCheck, Coins, Download, Plus, Printer, Trash2 } from 'lucide-react';
import { BudgetPrintView } from '../reports/BudgetPrintView';
import { waitForImages } from '../../utils/image';
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
  isAboveTheLine,
} from '../../domain/budget';
import type { Person } from '../../domain/people';
import type { BudgetCategory, BudgetEntry, BudgetLine, EquipmentRate, ProjectBudget, RateBasis, RateCard } from '../../domain/budget';
import { RateCardFields, VatSelect } from './RateCardFields';
import { ActualsSection } from './ActualsSection';
import type { ActualsEstimateLine } from './ActualsSection';
import { useProductionNeeds } from './useProductionNeeds';
import { DayNeedsView } from './DayNeedsView';
import { downloadCsv, safeFileName } from '../../utils/download';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';

/** The budget CSV keeps its BOM: Excel guesses wrong on the euro signs without one. */
const downloadText = (filename: string, text: string) =>
  downloadCsv(text, filename, { excelBom: true });

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
  const { project, updateProjectMeta } = useFloorPlan();
  const { theme, setActiveRightTab } = useWorkspaceUI();
  const isLight = theme === 'light';
  const [view, setView] = useState<'budget' | 'actuals' | 'needs'>('budget');
  const [printing, setPrinting] = useState(false);

  // Mount the print document, let images decode, print, unmount — the same
  // dance the schedule does, so the logo is never missing from the printout.
  useEffect(() => {
    if (!printing) return;
    const unmount = () => setPrinting(false);
    window.addEventListener('afterprint', unmount);
    let cancelled = false;
    const printTimer = window.setTimeout(() => {
      void waitForImages(document.querySelector('.budget-print-host') ?? document.body).then(() => {
        if (!cancelled) window.print();
      });
    }, 50);
    const fallbackTimer = window.setTimeout(unmount, 15000);
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', unmount);
      window.clearTimeout(printTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, [printing]);
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

  const mutateBudget = (fn: (current: ProjectBudget) => ProjectBudget) =>
    updateProjectMeta((prev) => ({ budget: fn(prev.budget ?? emptyBudget()) }));
  const patchBudget = (updates: Partial<ProjectBudget>) =>
    mutateBudget((current) => ({ ...current, ...updates }));
  const patchSettings = (updates: Partial<ProjectBudget['settings']>) =>
    mutateBudget((current) => ({
      ...current,
      settings: { ...current.settings, ...updates },
    }));

  const setEquipmentRate = (key: string, label: string, card: RateCard | undefined) => {
    mutateBudget((current) => {
      const others = current.equipmentRates.filter((rate) => rate.key !== key);
      if (!card) return { ...current, equipmentRates: others };
      const existing = current.equipmentRates.find((rate) => rate.key === key);
      const next: EquipmentRate = { id: existing?.id ?? createId('rate'), key, label, ...card };
      return { ...current, equipmentRates: [...others, next] };
    });
  };

  const addLine = (category: BudgetCategory = 'other') =>
    mutateBudget((current) => ({
      ...current,
      lines: [...current.lines, { id: createId('budget'), category, label: '', amount: 0, basis: 'flat' }],
    }));
  const patchLine = (id: string, updates: Partial<BudgetLine>) =>
    mutateBudget((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === id ? { ...line, ...updates } : line)),
    }));
  const removeLine = (id: string) =>
    mutateBudget((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.id !== id),
    }));

  const exportCsv = () =>
    downloadText(`Budget_${safeFileName(project.title, 'Production')}.csv`, budgetToCsv(summary));

  // A quantity of nought is a decision, not a missing number, so the row says
  // so: struck through and priced at nothing, the way a producer would put a
  // pencil through a line they are not buying this time round.
  const entryRow = (entry: BudgetEntry) => (
    <tr key={entry.id} className={`border-t ${isLight ? 'border-slate-100' : 'border-slate-800'} ${entry.quantity === 0 ? 'opacity-60' : ''}`}>
      <td className="py-1.5 pr-2">
        <div className={`font-semibold ${entry.quantity === 0 ? 'line-through' : ''}`}>{entry.label}</div>
        {entry.quantity === 0 && <div className={`text-[10px] ${mutedCls}`}>Struck — quantity 0, not counted in the totals</div>}
        {entry.detail && <div className={`text-[10px] ${mutedCls}`}>{entry.detail}</div>}
        {entry.warning && (
          <div className="text-[10px] text-amber-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{entry.warning}</div>
        )}
      </td>
      <td className={`py-1.5 pr-2 text-right font-mono whitespace-nowrap ${mutedCls}`}>
        {money(entry.rate)} {RATE_BASIS_LABELS[entry.basis]}
      </td>
      <td className="py-1.5 pr-2 text-right font-mono">{entry.basis === 'flat' ? '' : `${entry.units} d`}{entry.quantity === 1 ? '' : ` ×${entry.quantity}`}</td>
      <td className="py-1.5 pr-2 text-right font-mono">{money(entry.net)}</td>
      <td className={`py-1.5 pr-2 text-right font-mono ${mutedCls}`}>{entry.vatPercent}%</td>
      <td className="py-1.5 text-right font-mono font-bold">{money(entry.gross)}</td>
    </tr>
  );

  const people = useMemo(() => (project.people ?? []).filter((p) => p.kind === 'crew' || p.kind === 'cast' || p.kind === 'talent'), [project.people]);
  const patchPerson = (id: string, updates: Partial<Person>) =>
    updateProjectMeta((prev) => ({
      people: (prev.people ?? []).map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
  const entryById = new Map(summary.entries.map((entry) => [entry.id, entry] as const));
  const aboveLine = people.filter((p) => isAboveTheLine(p));
  const belowLine = people.filter((p) => !isAboveTheLine(p));

  /** One person: rate fields inline, the days the schedule gives them, what that costs. */
  const personRow = (person: Person) => {
    const entry = entryById.get(`person:${person.id}`);
    const days = personDays.get(person.id) ?? 0;
    const above = isAboveTheLine(person);
    return (
      <div key={person.id} className={`grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] gap-2 items-start rounded-lg border p-2 ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
        <div className="min-w-0">
          <div className="text-xs font-semibold truncate">{person.displayName}</div>
          <div className={`text-[10px] ${mutedCls}`}>{[person.role, person.department, person.kind === 'crew' ? undefined : person.kind].filter(Boolean).join(' · ') || '—'} · {days} day{days === 1 ? '' : 's'}</div>
          <label className={`mt-1 inline-flex items-center gap-1 text-[10px] ${mutedCls}`}>
            <input type="checkbox" checked={above} onChange={(e) => patchPerson(person.id, { aboveTheLine: e.target.checked })} className="accent-emerald-600" />
            Above the line
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <RateCardFields value={person.rateCard} onChange={(rateCard) => patchPerson(person.id, { rateCard })} currency={currency} defaultVatPercent={defaultVatPercent} inputCls={inputCls} labelCls={labelCls} />
        </div>
        <div className="text-right font-mono text-xs min-w-[110px]">
          {entry ? (
            <>
              <div className={mutedCls}>net {money(entry.net)}</div>
              <div className="font-bold">{money(entry.gross)}</div>
              {entry.warning && <div className="text-[10px] text-amber-600 font-sans">{entry.warning}</div>}
            </>
          ) : (
            <div className="text-[10px] text-amber-600 font-sans">No rate yet</div>
          )}
        </div>
      </div>
    );
  };

  const unpricedPeople = summary.unpriced.filter((item) => item.kind === 'person');
  const unpricedEquipment = equipment.filter((item) => !budget.equipmentRates.some((rate) => rate.key === item.key));
  const actualsLines = useMemo<ActualsEstimateLine[]>(() => {
    const lines = new Map<string, ActualsEstimateLine>();
    for (const entry of summary.entries) {
      lines.set(entry.id, {
        id: entry.id,
        category: entry.category,
        label: entry.label,
        detail: entry.detail,
        plannedNet: entry.net,
      });
    }
    for (const person of people) {
      const id = `person:${person.id}`;
      if (lines.has(id)) continue;
      const category: BudgetCategory = isAboveTheLine(person)
        ? 'above_the_line'
        : person.kind === 'crew' ? 'crew' : 'cast';
      lines.set(id, {
        id,
        category,
        label: person.displayName,
        detail: [person.role, person.department, 'No planned rate'].filter(Boolean).join(' · '),
      });
    }
    for (const item of equipment) {
      const id = `equipment:${item.key}`;
      if (lines.has(id)) continue;
      lines.set(id, {
        id,
        category: 'equipment',
        label: item.label,
        detail: `${item.category}${item.quantity > 1 ? ` · ×${item.quantity}` : ''} · No planned rate`,
      });
    }
    return [...lines.values()];
  }, [equipment, people, summary.entries]);

  return (
    <div className={`h-full flex flex-col ${isLight ? 'bg-[#f3f5f7] text-slate-900' : 'bg-slate-950 text-slate-100'}`}>
      <header className={`shrink-0 border-b px-4 h-12 flex items-center justify-between gap-3 ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-md bg-emerald-500 text-slate-950 flex items-center justify-center"><Coins className="w-4 h-4" /></div>
          <div className="min-w-0">
            <h2 className="text-sm font-black tracking-tight">{view === 'budget' ? 'Budget' : view === 'actuals' ? 'Actuals' : 'Day needs'}</h2>
            <p className={`text-[9px] truncate ${mutedCls}`}>
              {shootDays} shooting day{shootDays === 1 ? '' : 's'} · {view === 'actuals' ? `${actualsLines.length} budget line${actualsLines.length === 1 ? '' : 's'}` : `${summary.entries.length} priced line${summary.entries.length === 1 ? '' : 's'}`} · total {money(summary.total)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex h-8 rounded-md border p-0.5 ${isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
            {([['budget', Coins, 'Budget'], ['actuals', ClipboardCheck, 'Actuals'], ['needs', CalendarRange, 'Day needs']] as const).map(([key, Icon, label]) => (
              <button key={key} onClick={() => setView(key)} className={`px-2.5 rounded text-[9px] font-black flex items-center gap-1.5 ${view === key ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm' : mutedCls}`}>
                <Icon className="w-3.5 h-3.5" />{label}
              </button>
            ))}
          </div>
          {view === 'budget' && (
            <button onClick={() => setPrinting(true)} className={`h-8 px-2.5 rounded-md border text-[9px] font-black flex items-center gap-1.5 ${isLight ? 'bg-white border-slate-300 hover:border-emerald-500' : 'bg-slate-950 border-slate-800 hover:border-emerald-500'}`}>
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </button>
          )}
          {view === 'budget' && (
            <button onClick={exportCsv} className={`h-8 px-2.5 rounded-md border text-[9px] font-black flex items-center gap-1.5 ${isLight ? 'bg-white border-slate-300 hover:border-emerald-500' : 'bg-slate-950 border-slate-800 hover:border-emerald-500'}`}>
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          )}
        </div>
      </header>

      {printing && createPortal(
        <div className="budget-print-host">
          <BudgetPrintView productionTitle={project.title} company={project.productionCompany} logo={project.logo} summary={summary} />
        </div>,
        document.body,
      )}

      {view === 'actuals' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          <ActualsSection
            budget={budget}
            onPatch={patchBudget}
            currency={currency}
            estimatedNet={summary.net}
            entries={summary.entries}
            availableEntries={actualsLines}
            people={(project.people ?? []).map((person) => ({ id: person.id, displayName: person.displayName }))}
            categoryTotals={summary.categories}
            isLight={isLight}
          />
        </div>
      )}

      {view === 'needs' && <DayNeedsView isLight={isLight} />}
      {view === 'budget' && (
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
            <div className={`mt-2 text-[10px] ${mutedCls}`}>
              Above the line {money(summary.aboveTheLine.gross)} · below the line {money(summary.belowTheLine.gross)} (gross)
            </div>
            {summary.vatByRate.length > 1 && (
              <div className={`mt-2 text-[10px] ${mutedCls}`}>
                VAT by rate: {summary.vatByRate.map((bucket) => `${bucket.percent}% on ${money(bucket.net)} = ${money(bucket.vat)}`).join(' · ')}
              </div>
            )}
          </section>

          {/* Every crew and cast member, priced or not, with the rate right
              here: a budget that only lists the people who already have one
              reads as "no cast and crew" to anyone opening it fresh. */}
          {[['Above the line', aboveLine, 'Producers, director, writers and principal cast. Untick to move someone below the line.'], ['Below the line — crew & cast', belowLine, 'Everyone else on the unit. Cast and crew without a rate are listed but not counted.']].map(([title, list, hint]) => (
            <section key={title as string} className={cardCls}>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <h3 className={`text-[10px] font-black uppercase tracking-wider ${mutedCls}`}>{title as string}</h3>
                <div className="text-xs font-mono"><b>{money((title === 'Above the line' ? summary.aboveTheLine : summary.categories.filter((c) => c.category === 'crew' || c.category === 'cast').reduce((acc, c) => ({ gross: acc.gross + c.gross }), { gross: 0 })).gross)}</b></div>
              </div>
              <p className={`text-[10px] mb-2 ${mutedCls}`}>{hint as string}</p>
              {(list as Person[]).length === 0 && <p className={`text-[10px] ${mutedCls}`}>Nobody here yet — add people on the Crew tab.</p>}
              <div className="space-y-1.5">{(list as Person[]).map(personRow)}</div>
            </section>
          ))}

          {summary.categories.filter((category) => !['above_the_line', 'crew', 'cast'].includes(category.category)).map((category) => (
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
                      {/* Zero is allowed, and means it: a line struck for this
                          version of the budget prices as nothing rather than
                          being silently put back at one. Negatives are not a
                          quantity, and a cleared field is "unspecified", which
                          the domain reads as one. */}
                      <input type="number" min={0} value={line.quantity ?? 1} title="Quantity — 0 strikes the line from the totals" onChange={(e) => patchLine(line.id, { quantity: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })} className={`${inputCls} !w-14`} />
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
