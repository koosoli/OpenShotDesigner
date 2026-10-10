import React, { useMemo, useState } from 'react';
import { printPdfBytes } from '../../utils/printPdf';
import { EmptyState } from '../common/EmptyState';
import { TimeSheetIcon } from '../icons/ProductionIcons';
import { AlertTriangle, Plus, Printer, Trash2, UserPlus } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  DOOD_STATUS_META,
  deriveDood,
  exhibitGTotals,
  exhibitGWarnings,
  formatMinutes,
  resolveExhibitGLimits,
  seedExhibitGEntries,
} from '../../domain/reports';
import type { ExhibitGLimits, ExhibitGStatus, PerformerTimeEntry, PerformerTimeReport } from '../../domain/reports';
import type { ProductionDay } from '../../domain/scheduling';
import { createId } from '../../domain/ids';
import { updatePerformerTimeReportCommand } from '../../domain/commands';
import { bytesToBlob, downloadBlob } from '../../utils/download';
import { PdfExportButton } from '../common/PdfExportButton';

interface PerformerTimeReportViewProps {
  days: ProductionDay[];
  isLight: boolean;
}

/** Editable rule limits, shown in hours. */
const LIMIT_FIELDS: Array<{ key: keyof ExhibitGLimits; label: string }> = [
  { key: 'mealDueAfterMinutes', label: 'Meal due after' },
  { key: 'minMealMinutes', label: 'Shortest meal' },
  { key: 'restMinutes', label: 'Rest between days' },
  { key: 'straightTimeMinutes', label: 'Day performer straight time' },
  { key: 'weeklyStraightTimeMinutes', label: 'Weekly performer straight time' },
  { key: 'minorMaxWorkMinutes', label: 'Minor maximum day' },
];

const STATUSES: ExhibitGStatus[] = ['W', 'SW', 'WF', 'SWF', 'WD', 'PW', 'H', 'T', 'R', 'F'];

/** The time columns, in the order they are printed on the union form. */
const TIME_COLUMNS: Array<{ key: keyof PerformerTimeEntry & string; label: string; group: string }> = [
  { key: 'reportMakeup', label: 'Make-up / ward.', group: 'Report' },
  { key: 'reportOnSet', label: 'On set', group: 'Report' },
  { key: 'meal1Out', label: 'Out', group: '1st meal' },
  { key: 'meal1In', label: 'In', group: '1st meal' },
  { key: 'meal2Out', label: 'Out', group: '2nd meal' },
  { key: 'meal2In', label: 'In', group: '2nd meal' },
  { key: 'dismissOnSet', label: 'On set', group: 'Dismiss' },
  { key: 'dismissMakeup', label: 'Make-up / ward.', group: 'Dismiss' },
  { key: 'travelOutLeave', label: 'Leave', group: 'Travel to' },
  { key: 'travelOutArrive', label: 'Arrive', group: 'Travel to' },
  { key: 'travelBackLeave', label: 'Leave', group: 'Travel back' },
  { key: 'travelBackArrive', label: 'Arrive', group: 'Travel back' },
];


const isoDayNumber = (date?: string): number | undefined =>
  date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Math.round(Date.parse(`${date}T00:00:00Z`) / 86400000) : undefined;

/**
 * SAG-AFTRA Exhibit G — the performers production time report — for one
 * shooting day. Rows are seeded from the day-out-of-days and the call sheet's
 * individual calls; everything after that is what the 2nd AD records on set.
 */
export const PerformerTimeReportView: React.FC<PerformerTimeReportViewProps> = ({ days, isLight }) => {
  const { project, runCommand } = useFloorPlan();
  const [dayId, setDayId] = useState<string | null>(days[0]?.id ?? null);
  const day = days.find((candidate) => candidate.id === dayId) ?? days[0];
  const reports = useMemo(() => project.performerTimeReports ?? [], [project.performerTimeReports]);
  const report: PerformerTimeReport | undefined = day ? reports.find((entry) => entry.dayId === day.id) : undefined;

  // Who works today, from the DOOD (status code + cast number + performer).
  const working = useMemo(() => {
    if (!day) return [];
    const scenes = project.scriptScenes ?? [];
    const dood = deriveDood({
      days,
      blocks: project.scheduleBlocks ?? [],
      characters: project.characters ?? [],
      castAssignments: project.castAssignments,
      people: project.people,
      castSources: { scriptScenes: scenes, setups: project.setups, castAssignments: project.castAssignments },
      overrides: project.doodOverrides,
      dropAfterDays: project.doodDropAfterDays,
    });
    const calls = new Map((day.callSheet?.personCalls ?? []).map((call) => [call.personId, call.time] as const));
    return dood.rows.flatMap((row) => {
      const cell = row.cells.find((candidate) => candidate.dayId === day.id);
      if (!cell || cell.status === 'off') return [];
      const assignment = project.castAssignments?.find((candidate) => candidate.characterId === row.characterId);
      return [{
        personId: assignment?.personId,
        characterId: row.characterId,
        name: row.displayName,
        role: row.roleName,
        castNumber: row.castNumber,
        status: DOOD_STATUS_META[cell.status].code as ExhibitGStatus,
        callTime: (assignment && calls.get(assignment.personId)) || day.crewCall,
      }];
    });
  }, [day, days, project.scriptScenes, project.setups, project.scheduleBlocks, project.characters, project.castAssignments, project.people, project.doodOverrides, project.doodDropAfterDays]);

  // The performer's previous sheet, for the rest-period check.
  const previous = useMemo(() => {
    if (!day) return undefined;
    const index = days.findIndex((candidate) => candidate.id === day.id);
    for (let i = index - 1; i >= 0; i -= 1) {
      const sheet = reports.find((entry) => entry.dayId === days[i].id);
      if (!sheet) continue;
      const a = isoDayNumber(days[i].date);
      const b = isoDayNumber(day.date);
      return { report: sheet, daysBetween: a !== undefined && b !== undefined ? b - a : index - i };
    }
    return undefined;
  }, [day, days, reports]);

  const warnings = useMemo(() => (report ? exhibitGWarnings(report, previous) : []), [report, previous]);

  const writeReport = (update: (current: PerformerTimeReport) => PerformerTimeReport, description?: string) => {
    if (!day) return;
    runCommand(updatePerformerTimeReportCommand, { dayId: day.id, update, description }, { domain: 'schedule' });
  };

  const patchEntry = (entryId: string, updates: Partial<PerformerTimeEntry>) =>
    writeReport((current) => ({
      ...current,
      entries: current.entries.map((entry) => (entry.id === entryId ? { ...entry, ...updates } : entry)),
    }));

  const seed = () => writeReport((current) => ({ ...current, entries: seedExhibitGEntries({ performers: working, existing: current.entries }) }), `Add scheduled performers to the ${day?.name ?? 'day'} time report`);
  const addRow = () => writeReport((current) => ({ ...current, entries: [...current.entries, { id: createId('exg'), name: '' }] }));
  const removeRow = (entryId: string) => writeReport((current) => ({ ...current, entries: current.entries.filter((entry) => entry.id !== entryId) }));

  const exportPdf = async (mode: 'download' | 'print' = 'download') => {
    if (!day || !report) return;
    const [{ createTableReportPdf }, { buildPdfFilename }] = await Promise.all([
      import('../../utils/pdf/tableReportPdf'),
      import('../../utils/pdf/filenames'),
    ]);
    const short: Record<string, string> = {
      reportMakeup: 'Rpt MU', reportOnSet: 'Rpt set', meal1Out: 'M1 out', meal1In: 'M1 in', meal2Out: 'M2 out', meal2In: 'M2 in',
      dismissOnSet: 'Dis set', dismissMakeup: 'Dis MU', travelOutLeave: 'Tr lv', travelOutArrive: 'Tr arr', travelBackLeave: 'Ret lv', travelBackArrive: 'Ret arr',
    };
    const bytes = await createTableReportPdf({
      productionTitle: project.title || 'Production',
      documentTitle: 'Performers Production Time Report',
      subtitle: [day.name, day.date, report.preparedBy ? `Prepared by ${report.preparedBy}` : undefined].filter(Boolean).join(' · '),
      fontSize: 7,
      columns: [
        { header: '#', widthFrac: 3, align: 'center' },
        { header: 'Performer', widthFrac: 13 },
        { header: 'Status', widthFrac: 4, align: 'center' },
        ...TIME_COLUMNS.map((column) => ({ header: short[column.key] ?? column.label, widthFrac: 5, align: 'center' as const })),
        { header: 'Worked', widthFrac: 5, align: 'center' },
        { header: 'MP', widthFrac: 3, align: 'center' },
        { header: 'Outfits', widthFrac: 4, align: 'center' },
        { header: 'Adj.', widthFrac: 6 },
        { header: 'Initials', widthFrac: 5, align: 'center' },
      ],
      sections: [{
        rows: report.entries.map((entry) => {
          const totals = exhibitGTotals(entry, report.limits);
          return [
            entry.castNumber === undefined ? '' : String(entry.castNumber),
            [entry.name, entry.role ? `(${entry.role})` : '', entry.minor ? 'minor' : '', entry.stunt ? 'stunt' : ''].filter(Boolean).join(' '),
            entry.status ?? '',
            ...TIME_COLUMNS.map((column) => (entry[column.key] as string | undefined) ?? ''),
            formatMinutes(totals.workedMinutes),
            totals.mealPenalties ? String(totals.mealPenalties) : '',
            entry.outfits === undefined ? '' : String(entry.outfits),
            entry.adjustment ?? '',
            entry.initials ?? '',
          ];
        }),
      }],
      footnote: `${report.notes ? `${report.notes}. ` : ''}MP = meal penalty periods (computed with simplified day-performer rules). Production representative signature: ______________________   Date: __________. Working copy for payroll; submit the signed union form where your agreement requires it.`,
    });
    if (mode === 'print') {
      printPdfBytes(bytes);
      return;
    }
    downloadBlob(bytesToBlob(bytes, 'application/pdf'), buildPdfFilename({ production: project.title, document: 'exhibit-g', qualifier: day.name, ...(day.date ? { date: day.date } : {}) }));
  };


  const muted = 'text-ink-muted';
  const border = 'border-line';
  const input = `rounded border px-1 py-0.5 text-[11px] bg-field border-line-strong text-ink`;
  const button = `px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 border-line-strong hover:bg-surface-hover`;
  const warningsByEntry = new Map<string, string[]>();
  for (const warning of warnings) warningsByEntry.set(warning.entryId, [...(warningsByEntry.get(warning.entryId) ?? []), warning.message]);

  if (days.length === 0) {
    return (
      <div className="p-4">
        <EmptyState icon={<TimeSheetIcon className="w-5 h-5" />} title="No shooting days yet">
          The performers production time report (SAG-AFTRA Exhibit G) is kept per shooting day. Add days on the Board first.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto custom-scrollbar p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-bold">Performers production time report</h3>
          <p className={`text-[11px] ${muted}`}>SAG-AFTRA Exhibit G. Times are 24-hour (06:30, 19:45); a time before the first call counts as after midnight.</p>
        </div>
        <select
          value={day?.id ?? ''}
          onChange={(event) => setDayId(event.target.value)}
          aria-label="Shooting day"
          className={`${input} !text-xs !py-1 ml-auto`}
        >
          {days.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{candidate.name}{candidate.date ? ` · ${candidate.date}` : ''}</option>
          ))}
        </select>
        <button type="button" onClick={seed} disabled={working.length === 0} className={button} title="Add every performer the schedule has working today, with their call time">
          <UserPlus className="w-3.5 h-3.5" /> From schedule ({working.length})
        </button>
        <button type="button" onClick={addRow} className={button}>
          <Plus className="w-3.5 h-3.5" /> Row
        </button>
        <button type="button" onClick={() => { void exportPdf('print'); }} disabled={!report?.entries.length} className={button}>
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
        <PdfExportButton onClick={() => { void exportPdf(); }} disabled={!report?.entries.length} title="Download this time report as a PDF" />
      </div>

      {!report || report.entries.length === 0 ? (
        <EmptyState
          icon={<TimeSheetIcon className="w-5 h-5" />}
          title="No performers on this sheet yet"
          action={working.length ? { label: `Add the ${working.length} performer${working.length === 1 ? '' : 's'} working today`, onClick: seed, icon: <UserPlus className="w-3.5 h-3.5" /> } : undefined}
        >
          Record make-up and set calls, meals, dismissals and travel for every performer on {day?.name ?? 'this day'}. Meal penalties, overtime and forced calls are worked out as you type.
        </EmptyState>
      ) : (
        <div className={`overflow-x-auto rounded-xl border ${border}`}>
          <table className="text-[11px] border-collapse min-w-full">
            <thead className="bg-surface-sunken">
              <tr className={`text-[10px] uppercase tracking-wider ${muted}`}>
                <th className="px-1.5 py-1 text-left" rowSpan={2}>#</th>
                <th className="px-1.5 py-1 text-left" rowSpan={2}>Performer</th>
                <th className="px-1.5 py-1" rowSpan={2}>Status</th>
                {[...new Set(TIME_COLUMNS.map((column) => column.group))].map((group) => (
                  <th key={group} className={`px-1.5 py-1 border-l ${border}`} colSpan={TIME_COLUMNS.filter((column) => column.group === group).length}>{group}</th>
                ))}
                <th className={`px-1.5 py-1 border-l ${border}`} rowSpan={2} title="Worked time: first call to last dismissal, minus meals">Worked</th>
                <th className="px-1.5 py-1" rowSpan={2} title="Meal penalty periods">MP</th>
                <th className="px-1.5 py-1" rowSpan={2}>Outfits</th>
                <th className="px-1.5 py-1" rowSpan={2}>Adj.</th>
                <th className="px-1.5 py-1" rowSpan={2}>Initials</th>
                <th rowSpan={2} />
              </tr>
              <tr className={`text-[10px] ${muted}`}>
                {TIME_COLUMNS.map((column, index) => (
                  <th key={column.key} className={`px-1 py-0.5 font-medium ${index === 0 || TIME_COLUMNS[index - 1].group !== column.group ? `border-l ${border}` : ''}`}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.entries.map((entry) => {
                const totals = exhibitGTotals(entry, report.limits);
                const rowWarnings = warningsByEntry.get(entry.id);
                return (
                  <tr key={entry.id} className={`border-t ${border}`}>
                    <td className="px-1 py-1">
                      <input value={entry.castNumber ?? ''} onChange={(e) => patchEntry(entry.id, { castNumber: e.target.value ? Number(e.target.value) || undefined : undefined })} aria-label="Cast number" className={`${input} w-9 text-center font-mono`} />
                    </td>
                    <td className="px-1 py-1 whitespace-nowrap">
                      <input value={entry.name} onChange={(e) => patchEntry(entry.id, { name: e.target.value })} placeholder="Name" aria-label="Performer" className={`${input} w-32 font-semibold`} />
                      <div className={`flex items-center gap-2 mt-0.5 ${muted}`}>
                        {entry.role && <span className="truncate max-w-[8rem]">{entry.role}</span>}
                        <label className="flex items-center gap-0.5"><input type="checkbox" checked={!!entry.minor} onChange={(e) => patchEntry(entry.id, { minor: e.target.checked || undefined })} />minor</label>
                        <label className="flex items-center gap-0.5"><input type="checkbox" checked={!!entry.stunt} onChange={(e) => patchEntry(entry.id, { stunt: e.target.checked || undefined })} />stunt</label>
                        <select
                          value={entry.contract ?? 'day'}
                          onChange={(e) => patchEntry(entry.id, { contract: e.target.value === 'weekly' ? 'weekly' : undefined })}
                          aria-label="Contract"
                          title="Day or weekly performer: weekly overtime starts later"
                          className="bg-transparent text-[10px]"
                        >
                          <option value="day">day</option>
                          <option value="weekly">weekly</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-1 py-1">
                      <select value={entry.status ?? ''} onChange={(e) => patchEntry(entry.id, { status: (e.target.value || undefined) as ExhibitGStatus | undefined })} aria-label="Work status" className={`${input} font-mono`}>
                        <option value="">—</option>
                        {STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                      </select>
                    </td>
                    {TIME_COLUMNS.map((column, index) => (
                      <td key={column.key} className={`px-0.5 py-1 ${index === 0 || TIME_COLUMNS[index - 1].group !== column.group ? `border-l ${border}` : ''}`}>
                        <input
                          value={(entry[column.key] as string | undefined) ?? ''}
                          onChange={(e) => patchEntry(entry.id, { [column.key]: e.target.value.trim() || undefined })}
                          placeholder="--:--"
                          inputMode="numeric"
                          aria-label={`${column.group} ${column.label}`}
                          className={`${input} w-[3.6rem] text-center font-mono`}
                        />
                      </td>
                    ))}
                    <td className={`px-1.5 py-1 font-mono text-right border-l ${border}`}>
                      {formatMinutes(totals.workedMinutes)}
                      {totals.overtimeMinutes ? <div className="text-warn">+{formatMinutes(totals.overtimeMinutes)} OT</div> : null}
                    </td>
                    <td className={`px-1.5 py-1 font-mono text-center ${totals.mealPenalties ? 'text-rose-500 font-bold' : ''}`}>{totals.mealPenalties || ''}</td>
                    <td className="px-1 py-1">
                      <input value={entry.outfits ?? ''} onChange={(e) => patchEntry(entry.id, { outfits: e.target.value ? Number(e.target.value) || undefined : undefined })} aria-label="Outfits" className={`${input} w-10 text-center`} />
                    </td>
                    <td className="px-1 py-1">
                      <input value={entry.adjustment ?? ''} onChange={(e) => patchEntry(entry.id, { adjustment: e.target.value || undefined })} aria-label="Adjustment" className={`${input} w-20`} />
                    </td>
                    <td className="px-1 py-1">
                      <input value={entry.initials ?? ''} onChange={(e) => patchEntry(entry.id, { initials: e.target.value || undefined })} aria-label="Initials" className={`${input} w-12 text-center`} />
                    </td>
                    <td className="px-1 py-1 whitespace-nowrap">
                      {rowWarnings && (
                        <span title={rowWarnings.join('\n')} className="inline-flex text-warn mr-1" aria-label={rowWarnings.join('. ')}>
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </span>
                      )}
                      <button type="button" onClick={() => removeRow(entry.id)} aria-label={`Remove ${entry.name || 'row'}`} title="Remove row" className="text-slate-400 hover:text-rose-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {warnings.length > 0 && (
        <ul className={`rounded-xl border p-3 space-y-1 text-[11px] ${isLight ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-amber-800/60 bg-amber-950/30 text-amber-200'}`}>
          {warnings.map((warning, index) => (
            <li key={`${warning.entryId}-${index}`} className="flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {warning.message}
            </li>
          ))}
        </ul>
      )}

      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className={`text-[11px] font-medium ${muted}`}>Prepared by</span>
            <input value={report.preparedBy ?? ''} onChange={(e) => writeReport((current) => ({ ...current, preparedBy: e.target.value || undefined }))} className={`${input} !text-xs !py-1.5`} placeholder="2nd AD" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={`text-[11px] font-medium ${muted}`}>Notes</span>
            <input value={report.notes ?? ''} onChange={(e) => writeReport((current) => ({ ...current, notes: e.target.value || undefined }))} className={`${input} !text-xs !py-1.5`} placeholder="Waivers, injuries, NDB…" />
          </label>
        </div>
      )}
      {report && (
        <details className="rounded-xl border border-line p-3">
          <summary className="text-[11px] font-semibold cursor-pointer">Rule limits for this sheet</summary>
          <p className={`text-[10px] mt-1 ${muted}`}>Set these to match your agreement. Hours, e.g. 6 or 5.5.</p>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {LIMIT_FIELDS.map((field) => (
              <label key={field.key} className="flex flex-col gap-1">
                <span className={`text-[10px] ${muted}`}>{field.label}</span>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={(resolveExhibitGLimits(report.limits)[field.key] / 60).toString()}
                  onChange={(e) => {
                    const hours = Number(e.target.value);
                    if (!Number.isFinite(hours) || hours <= 0) return;
                    writeReport((current) => ({ ...current, limits: { ...(current.limits ?? {}), [field.key]: Math.round(hours * 60) } }), `Set ${field.label.toLowerCase()} to ${hours} h`);
                  }}
                  className={`${input} !text-xs !py-1.5`}
                />
              </label>
            ))}
          </div>
        </details>
      )}
      <p className={`text-[10px] ${muted}`}>
        Meal penalties, overtime, minors' hours and forced calls are checked against the rule limits above and are warnings, not payroll.
      </p>
    </div>
  );
};
