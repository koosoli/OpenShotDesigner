import React, { useMemo, useState } from 'react';
import { ClipboardCheck, Printer } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  dailyProgressReport,
  formatPageEighths,
  formatSpan,
  productionReportCast,
  productionReportNotesFor,
  productionReportToDate,
} from '../../domain/reports';
import type { DailyProgressReport, ProductionReportCastRow, ProductionReportNotes, ProductionReportToDate } from '../../domain/reports';
import type { ProductionDay } from '../../domain/scheduling';
import { updateProductionReportNotesCommand } from '../../domain/commands';
import { bytesToBlob, downloadBlob } from '../../utils/download';
import { printPdfBytes } from '../../utils/printPdf';
import { PdfExportButton } from '../common/PdfExportButton';
import { EmptyState } from '../common/EmptyState';

const NOTE_FIELDS: Array<{ key: keyof Omit<ProductionReportNotes, 'dayId'>; label: string; placeholder: string; rows: number }> = [
  { key: 'delays', label: 'Delays', placeholder: 'Lost time and why — "Rain 10:40–11:25, moved to cover set"', rows: 2 },
  { key: 'accidents', label: 'Accidents / injuries', placeholder: 'None', rows: 1 },
  { key: 'notes', label: 'Remarks', placeholder: 'Anything the production office should know', rows: 2 },
];

const pages = (eighths: number | null) => (eighths === null ? '—' : formatPageEighths(eighths));

/** "Scheduled · Shot today · To date" rows, shared by the screen and the PDF. */
export const productionReportSummaryRows = (report: DailyProgressReport, toDate: ProductionReportToDate | null): string[][] => [
  ['Scenes', String(report.scenesScheduled), String(report.scenesCompleted), toDate ? `${toDate.scenesCompleted} of ${toDate.scenesTotal}` : '—'],
  ['Pages', pages(report.pagesScheduledEighths), pages(report.pagesCoveredEighths), toDate ? `${pages(toDate.pagesCompletedEighths)} of ${pages(toDate.pagesTotalEighths)}` : '—'],
  ['Setups', String(report.setupsScheduled), String(report.setupsCompleted), '—'],
  ['Shots', String(report.shotsScheduled), String(report.shotsCovered), toDate ? String(toDate.shotsCovered) : '—'],
  ['Takes (good / NG)', '—', `${report.takesLogged} (${report.takesGood} / ${report.takesNg})`, toDate ? String(toDate.takesLogged) : '—'],
];

const castRow = (row: ProductionReportCastRow): string[] => [
  row.castNumber === undefined ? '' : String(row.castNumber),
  [row.name, row.role ? `(${row.role})` : ''].filter(Boolean).join(' '),
  row.status ?? '',
  row.reportMakeup ?? '',
  row.reportOnSet ?? '',
  row.meal1 ?? '',
  row.meal2 ?? '',
  row.dismissOnSet ?? '',
  row.worked,
  row.mealPenalties ? String(row.mealPenalties) : '',
];

const CAST_HEADERS = ['#', 'Performer', 'Status', 'Make-up', 'On set', '1st meal', '2nd meal', 'Wrap', 'Worked', 'MP'];

/**
 * The daily production report for one shooting day: progress from the take
 * log, running totals, cast times from the Exhibit G sheet, and the delays,
 * accidents and remarks the 2nd AD writes at wrap.
 */
export const ProductionReportView: React.FC<{ days: ProductionDay[] }> = ({ days }) => {
  const { project, runCommand } = useFloorPlan();
  const [dayId, setDayId] = useState<string | null>(() => project.continuityDayFilterId ?? days[0]?.id ?? null);
  const day = days.find((candidate) => candidate.id === dayId) ?? days[0];

  const report = useMemo(
    () => (day ? dailyProgressReport(day, project.scheduleBlocks ?? [], { setups: project.setups, scriptScenes: project.scriptScenes }, project.takes ?? []) : null),
    [day, project.scheduleBlocks, project.setups, project.scriptScenes, project.takes],
  );
  const toDate = useMemo(() => (day ? productionReportToDate(project, day.id) : null), [day, project]);
  const cast = useMemo(() => (day ? productionReportCast(project, day.id) : []), [day, project]);
  const notes = day ? productionReportNotesFor(project, day.id) : null;

  if (!day || !report) {
    return (
      <div className="p-4">
        <EmptyState icon={<ClipboardCheck className="w-5 h-5" />} title="No shooting days yet">
          The production report is written per shooting day from the schedule and the continuity log. Add days on the Board first.
        </EmptyState>
      </div>
    );
  }

  const setNote = (key: keyof Omit<ProductionReportNotes, 'dayId'>, value: string) =>
    runCommand(updateProductionReportNotesCommand, { dayId: day.id, patch: { [key]: value } }, { domain: 'schedule' });

  const exportPdf = async (mode: 'download' | 'print' = 'download') => {
    const [{ createTableReportPdf }, { buildPdfFilename }] = await Promise.all([
      import('../../utils/pdf/tableReportPdf'),
      import('../../utils/pdf/filenames'),
    ]);
    const two = (label: string, value: string): string[] => [label, value];
    const bytes = await createTableReportPdf({
      productionTitle: project.title || 'Production',
      documentTitle: 'Daily Production Report',
      subtitle: [day.name, day.date, toDate ? `Day ${toDate.dayNumber} of ${toDate.daysTotal}` : undefined].filter(Boolean).join(' · '),
      orientation: 'portrait',
      columns: [
        { header: '', widthFrac: 30 },
        { header: 'Scheduled', widthFrac: 20, align: 'center' },
        { header: 'Shot today', widthFrac: 25, align: 'center' },
        { header: 'To date', widthFrac: 25, align: 'center' },
      ],
      sections: [
        {
          heading: 'Times',
          columns: [{ header: '', widthFrac: 40 }, { header: '', widthFrac: 60 }],
          rows: [
            two('Crew call / planned wrap', `${day.crewCall ?? '—'} / ${day.plannedWrap ?? '—'}`),
            two('First take / last take logged', `${report.firstTakeAt ?? '—'} / ${report.lastTakeAt ?? '—'}`),
            two('Shooting span', formatSpan(report.shootingSpanMinutes)),
            two('Against the schedule', report.scheduleVarianceLabel ?? 'not measurable'),
          ],
        },
        { heading: 'Progress', rows: productionReportSummaryRows(report, toDate) },
        {
          heading: 'Scenes',
          columns: [
            { header: 'Scene', widthFrac: 20, align: 'center' },
            { header: 'Pages', widthFrac: 20, align: 'center' },
            { header: 'Shots covered', widthFrac: 30, align: 'center' },
            { header: 'Status', widthFrac: 30, align: 'center' },
          ],
          rows: report.scenes.map((scene) => [
            scene.sceneNumber,
            formatPageEighths(scene.pageEighths),
            `${scene.coveredShots} / ${scene.plannedShots}`,
            scene.complete ? 'Complete' : scene.coveredShots > 0 ? 'Part' : 'Not shot',
          ]),
          emptyText: 'No scenes scheduled.',
        },
        {
          heading: 'Not shot',
          columns: [{ header: 'Shot', widthFrac: 20 }, { header: 'Name', widthFrac: 80 }],
          rows: report.shotsNotShot.map((shot) => [shot.shotNumber ?? '', shot.name ?? '']),
          emptyText: 'Every planned shot has takes.',
        },
        {
          heading: 'Cast (from the Exhibit G sheet)',
          columns: CAST_HEADERS.map((header, index) => ({ header, widthFrac: [4, 22, 7, 9, 9, 13, 13, 8, 9, 6][index], align: index === 1 ? 'left' as const : 'center' as const })),
          rows: cast.map(castRow),
          emptyText: 'No time report for this day.',
        },
        {
          heading: 'Notes',
          columns: [{ header: '', widthFrac: 25 }, { header: '', widthFrac: 75 }],
          rows: [
            two('Delays', notes?.delays ?? '—'),
            two('Accidents / injuries', notes?.accidents ?? 'None reported'),
            two('Remarks', notes?.notes ?? '—'),
            two('Prepared by', notes?.preparedBy ?? ''),
          ],
        },
      ],
      footnote: 'Progress comes from the continuity log: a scene is complete when every planned shot has a good take. First and last are the first and last takes logged, not call and wrap.',
    });
    if (mode === 'print') {
      printPdfBytes(bytes);
      return;
    }
    downloadBlob(bytesToBlob(bytes, 'application/pdf'), buildPdfFilename({ production: project.title, document: 'production-report', qualifier: day.name, ...(day.date ? { date: day.date } : {}) }));
  };

  const muted = 'text-ink-muted';
  const cell = 'px-2 py-1 border-t border-line';
  const input = 'w-full rounded-md border px-2 py-1 text-xs bg-field border-line-strong text-ink';
  return (
    <div className="h-full overflow-auto custom-scrollbar p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="mr-auto">
          <h3 className="text-sm font-bold">Daily production report</h3>
          <p className={`text-[11px] ${muted}`}>From the schedule and the continuity log; cast times from the Exhibit G sheet.</p>
        </div>
        <select value={day.id} onChange={(event) => setDayId(event.target.value)} aria-label="Shooting day" className="rounded-md border px-2 py-1 text-xs bg-field border-line-strong text-ink">
          {days.map((candidate) => <option key={candidate.id} value={candidate.id}>{[candidate.name, candidate.date].filter(Boolean).join(' · ')}</option>)}
        </select>
        <button type="button" onClick={() => { void exportPdf('print'); }} className="px-2.5 py-1 rounded-lg border border-line-strong text-xs font-semibold flex items-center gap-1.5 hover:bg-surface-hover">
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
        <PdfExportButton onClick={() => { void exportPdf(); }} title="Download this day's production report as a PDF" />
      </div>

      <div className="grid gap-2 sm:grid-cols-4 text-xs">
        {[
          ['Day', toDate ? `${toDate.dayNumber} of ${toDate.daysTotal}` : '—'],
          ['First / last take', `${report.firstTakeAt ?? '—'} / ${report.lastTakeAt ?? '—'}`],
          ['Shooting span', formatSpan(report.shootingSpanMinutes)],
          ['Against schedule', report.scheduleVarianceLabel ?? 'not measurable'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line bg-surface px-2.5 py-2">
            <div className={`text-[10px] font-bold uppercase tracking-wide ${muted}`}>{label}</div>
            <div className="font-mono font-semibold mt-0.5">{value}</div>
          </div>
        ))}
      </div>

      <table className="w-full text-xs border border-line rounded-lg overflow-hidden">
        <thead className="bg-surface-sunken text-[10px] uppercase tracking-wide">
          <tr><th className="px-2 py-1 text-left">Progress</th><th className="px-2 py-1">Scheduled</th><th className="px-2 py-1">Shot today</th><th className="px-2 py-1">To date</th></tr>
        </thead>
        <tbody>
          {productionReportSummaryRows(report, toDate).map((row) => (
            <tr key={row[0]}>{row.map((value, index) => <td key={index} className={`${cell} ${index === 0 ? 'font-semibold' : 'text-center font-mono'}`}>{value}</td>)}</tr>
          ))}
        </tbody>
      </table>

      <section>
        <h4 className="text-xs font-bold mb-1">Scenes</h4>
        {report.scenes.length === 0 ? <p className={`text-xs ${muted}`}>No scenes scheduled.</p> : (
          <div className="flex flex-wrap gap-1.5">
            {report.scenes.map((scene) => (
              <span key={scene.sceneNumber} className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${scene.complete ? 'bg-ok-soft text-ok border-emerald-500/40' : scene.coveredShots > 0 ? 'bg-warn-soft text-warn border-amber-500/40' : 'border-line text-ink-muted'}`}>
                Sc {scene.sceneNumber} · {formatPageEighths(scene.pageEighths)} · {scene.coveredShots}/{scene.plannedShots}
              </span>
            ))}
          </div>
        )}
        {report.shotsNotShot.length > 0 && (
          <p className={`text-[11px] mt-1.5 ${muted}`}>Not shot: {report.shotsNotShot.map((shot) => shot.shotNumber).join(', ')}</p>
        )}
      </section>

      <section>
        <h4 className="text-xs font-bold mb-1">Cast</h4>
        {cast.length === 0 ? <p className={`text-xs ${muted}`}>No time report for this day — fill it in Schedule → Time report.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-ink-muted"><tr>{CAST_HEADERS.map((header) => <th key={header} className="px-2 py-1 text-left">{header}</th>)}</tr></thead>
              <tbody>{cast.map((row, index) => <tr key={index}>{castRow(row).map((value, column) => <td key={column} className={`${cell} ${column > 1 ? 'font-mono' : ''}`}>{value}</td>)}</tr>)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h4 className="text-xs font-bold">Notes</h4>
        {NOTE_FIELDS.map((noteField) => (
          <label key={noteField.key} className="block text-[11px] font-semibold">
            {noteField.label}
            <textarea
              rows={noteField.rows}
              value={notes?.[noteField.key] ?? ''}
              onChange={(event) => setNote(noteField.key, event.target.value)}
              placeholder={noteField.placeholder}
              className={`${input} mt-0.5 resize-y`}
            />
          </label>
        ))}
        <label className="block text-[11px] font-semibold max-w-xs">
          Prepared by
          <input value={notes?.preparedBy ?? ''} onChange={(event) => setNote('preparedBy', event.target.value)} className={`${input} mt-0.5`} />
        </label>
      </section>
    </div>
  );
};
