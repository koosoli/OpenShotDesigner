import React, { useMemo, useState } from 'react';
import { printPdfBytes } from '../../utils/printPdf';
import { csvCell } from '../../utils/reportOutput';
import { Download, Printer } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { BREAKDOWN_CATEGORIES, breakdownCategoryTint, scenesForBreakdownItem } from '../../domain/script';
import type { BreakdownCategory, Character, ScriptScene } from '../../domain/script';
import { deriveElementReport, formatPageEighths } from '../../domain/reports';
import type { ScriptLine } from '../../types';
import { bytesToBlob, downloadBlob, downloadCsv, safeFileName } from '../../utils/download';
import { PdfExportButton } from '../common/PdfExportButton';

interface PropsReportProps {
  lines: ScriptLine[];
  scenes: ScriptScene[];
  characters: Character[];
  isLight: boolean;
}



/**
 * The prop report (or any department's): each element with the scenes it is
 * in, the shooting days it is needed on and the characters who handle it.
 */
export const PropsReport: React.FC<PropsReportProps> = ({ lines, scenes, characters, isLight: _isLight }) => {
  const { project } = useFloorPlan();
  const [category, setCategory] = useState<BreakdownCategory>('prop');

  const rows = useMemo(
    () => deriveElementReport({
      items: project.breakdownItems ?? [],
      scenesForItem: (item) => scenesForBreakdownItem(item, lines, scenes),
      characters,
      days: project.productionDays ?? [],
      blocks: project.scheduleBlocks ?? [],
      category,
      setups: project.setups,
      scriptScenes: scenes,
    }),
    [project.breakdownItems, project.productionDays, project.scheduleBlocks, project.setups, lines, scenes, characters, category],
  );

  const label = BREAKDOWN_CATEGORIES.find((entry) => entry.value === category)?.label ?? category;
  const dayLabel = (day: { dayName: string; date?: string }) => (day.date ? `${day.dayName} (${day.date.slice(5)})` : day.dayName);

  const table = rows.map((row) => [
    row.item.name,
    row.scenes.map((scene) => scene.sceneNumber).join(', '),
    formatPageEighths(row.pageEighths),
    row.days.map(dayLabel).join(', '),
    row.characterNames.join(', '),
    row.item.notes ?? '',
  ]);
  const headers = [label.replace(/s$/, ''), 'Scenes', 'Pages', 'Shoot days', 'Characters', 'Notes'];

  const exportCsv = () => {
    const text = [headers, ...table].map((row) => row.map(csvCell).join(',')).join('\n');
    downloadCsv(text, `${safeFileName(project.title, 'project')}-${category}-report.csv`, { excelBom: true });
  };

  const exportPdf = async (mode: 'download' | 'print' = 'download') => {
    const [{ createTableReportPdf }, { buildPdfFilename }] = await Promise.all([
      import('../../utils/pdf/tableReportPdf'),
      import('../../utils/pdf/filenames'),
    ]);
    const bytes = await createTableReportPdf({
      productionTitle: project.title || 'Production',
      documentTitle: `${label} Report`,
      subtitle: `${rows.length} item${rows.length === 1 ? '' : 's'}`,
      columns: [
        { header: headers[0], widthFrac: 18 },
        { header: 'Scenes', widthFrac: 12 },
        { header: 'Pages', widthFrac: 7, align: 'center' },
        { header: 'Shoot days', widthFrac: 23 },
        { header: 'Characters', widthFrac: 18 },
        { header: 'Notes', widthFrac: 22 },
      ],
      sections: [{ rows: table }],
    });
    if (mode === 'print') {
      printPdfBytes(bytes);
      return;
    }
    downloadBlob(bytesToBlob(bytes, 'application/pdf'), buildPdfFilename({ production: project.title, document: `${category}-report` }));
  };


  const muted = 'text-ink-muted';
  const border = 'border-line';
  const tint = breakdownCategoryTint(category);

  return (
    <div className={`rounded-2xl border p-4 border-line bg-surface shadow-sm`}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="text-sm font-bold">{label} report</h3>
          <p className={`text-[11px] ${muted}`}>
            Tag elements on the script page to fill this. Shoot days come from the strips in the schedule.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as BreakdownCategory)}
            aria-label="Department"
            className={`rounded-md border px-1.5 py-1 text-xs border-line-strong bg-field text-ink`}
          >
            {BREAKDOWN_CATEGORIES.map((entry) => (
              <option key={entry.value} value={entry.value}>{entry.label}</option>
            ))}
          </select>
          <button type="button" onClick={exportCsv} disabled={rows.length === 0} className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 border-line-strong`}>
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <button type="button" onClick={() => { void exportPdf('print'); }} disabled={rows.length === 0} className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 border-line-strong`}>
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
          <PdfExportButton onClick={() => { void exportPdf(); }} disabled={rows.length === 0} title={`Download the ${label.toLowerCase()} report as a PDF`} />
        </div>
      </div>
      {rows.length === 0 ? (
        <p className={`text-xs ${muted}`}>No {label.toLowerCase()} tagged yet. Select words on the script page and tag them, or add them under Elements.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className={`text-left text-[10px] uppercase tracking-wider ${muted}`}>
                {headers.map((header) => <th key={header} className="px-2 py-1.5">{header}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.item.id} className={`border-t ${border}`}>
                  <td className="px-2 py-1.5 font-semibold">
                    <span className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle" style={{ backgroundColor: tint }} />
                    {row.item.name}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{row.scenes.map((scene) => scene.sceneNumber).join(', ') || '—'}</td>
                  <td className="px-2 py-1.5 font-mono">{formatPageEighths(row.pageEighths)}</td>
                  <td className="px-2 py-1.5">{row.days.map(dayLabel).join(', ') || <span className={muted}>not scheduled</span>}</td>
                  <td className={`px-2 py-1.5 ${muted}`}>{row.characterNames.join(', ') || '—'}</td>
                  <td className={`px-2 py-1.5 ${muted}`}>{row.item.notes ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
