import React, { useMemo, useState } from 'react';
import { printPdfBytes } from '../../utils/printPdf';
import { Printer } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { attachBreakdownItemsToScenes, breakdownCategoryLabel } from '../../domain/script';
import type { BreakdownCategory } from '../../domain/script';
import { deriveOneLiner, formatPageEighths } from '../../domain/reports';
import type { OneLinerDay, OneLinerScene } from '../../domain/reports';
import { STRIP_COLORS } from '../../domain/scheduling/stripboardPrint';
import { bytesToBlob, downloadBlob } from '../../utils/download';
import { PdfExportButton } from '../common/PdfExportButton';
import { EmptyState } from '../common/EmptyState';
import { StripboardIcon } from '../icons/ProductionIcons';
import { readUiPref, writeUiPref } from '../../utils/uiPrefs';


const elementsText = (scene: OneLinerScene) =>
  (scene.elements ?? []).map((group) => `${breakdownCategoryLabel(group.category as BreakdownCategory)}: ${group.items.join(', ')}`).join(' · ');

const dayHeading = (day: OneLinerDay) =>
  [day.dayName, day.date, day.crewCall ? `Call ${day.crewCall}` : undefined].filter(Boolean).join(' · ');

/**
 * The one-liner: the whole shoot, a line per scene, coloured like the board,
 * with page totals at every day break. "With elements" turns it into the
 * shooting schedule.
 */
export const OneLinerView: React.FC<{ isLight: boolean }> = ({ isLight: _isLight }) => {
  const { project } = useFloorPlan();
  const [withElements, setWithElementsState] = useState(() => readUiPref('oneliner_elements', ['on', 'off'], 'off') === 'on');
  const setWithElements = (value: boolean) => {
    setWithElementsState(value);
    writeUiPref('oneliner_elements', value ? 'on' : 'off');
  };

  const days = useMemo(() => deriveOneLiner({
    days: project.productionDays ?? [],
    blocks: project.scheduleBlocks ?? [],
    scenes: attachBreakdownItemsToScenes(project.scriptScenes ?? [], project.scriptLines ?? [], project.breakdownItems ?? []),
    setups: project.setups,
    castAssignments: project.castAssignments,
    breakdownItems: project.breakdownItems,
    withElements,
  }), [project.productionDays, project.scheduleBlocks, project.scriptScenes, project.scriptLines, project.breakdownItems, project.setups, project.castAssignments, withElements]);

  const totalEighths = days.reduce((sum, day) => sum + day.pageEighths, 0);
  const title = withElements ? 'Shooting schedule' : 'One-liner';

  const rowCells = (scene: OneLinerScene) => [
    scene.sceneNumber,
    scene.intExt,
    scene.set + (withElements && scene.synopsis ? ` — ${scene.synopsis}` : ''),
    scene.timeOfDay,
    formatPageEighths(scene.pageEighths),
    scene.castNumbers.join(', '),
    ...(withElements ? [elementsText(scene)] : []),
  ];

  const exportPdf = async (mode: 'download' | 'print' = 'download') => {
    const [{ createTableReportPdf }, { buildPdfFilename }] = await Promise.all([
      import('../../utils/pdf/tableReportPdf'),
      import('../../utils/pdf/filenames'),
    ]);
    const bytes = await createTableReportPdf({
      productionTitle: project.title || 'Production',
      documentTitle: title,
      subtitle: `${days.length} shooting day${days.length === 1 ? '' : 's'} · ${formatPageEighths(totalEighths)} pages`,
      orientation: withElements ? 'landscape' : 'portrait',
      columns: [
        { header: 'Sc', widthFrac: 6, align: 'center' },
        { header: 'I/E', widthFrac: 6, align: 'center' },
        { header: withElements ? 'Set / synopsis' : 'Set', widthFrac: withElements ? 30 : 46 },
        { header: 'D/N', widthFrac: 10, align: 'center' },
        { header: 'Pages', widthFrac: 8, align: 'center' },
        { header: 'Cast', widthFrac: withElements ? 10 : 24 },
        ...(withElements ? [{ header: 'Elements', widthFrac: 30 }] : []),
      ],
      sections: days.map((day) => ({
        heading: `${dayHeading(day)} — ${formatPageEighths(day.pageEighths)} pages`,
        rows: day.entries.map((entry) => (entry.kind === 'scene' ? rowCells(entry) : ['', '', entry.label.toUpperCase(), '', '', '', ...(withElements ? [''] : [])])),
        rowColors: day.entries.map((entry) => ({ fill: STRIP_COLORS[entry.colorKey].fill, ink: STRIP_COLORS[entry.colorKey].ink })),
      })),
      footnote: `Total ${formatPageEighths(totalEighths)} pages. Strips coloured INT/day white, EXT/day yellow, INT/night blue, EXT/night green.`,
    });
    if (mode === 'print') {
      printPdfBytes(bytes);
      return;
    }
    downloadBlob(bytesToBlob(bytes, 'application/pdf'), buildPdfFilename({ production: project.title, document: withElements ? 'shooting-schedule' : 'one-liner' }));
  };


  if (days.length === 0) {
    return (
      <div className="p-4">
        <EmptyState icon={<StripboardIcon className="w-5 h-5" />} title="No shooting days yet">
          The one-liner lists every shooting day with its scenes on one line each. Add days and strips on the Board first.
        </EmptyState>
      </div>
    );
  }

  const muted = 'text-ink-muted';
  return (
    <div className="h-full overflow-auto custom-scrollbar p-3 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="mr-auto">
          <h3 className="text-sm font-bold">{title}</h3>
          <p className={`text-[11px] ${muted}`}>{days.length} days · {formatPageEighths(totalEighths)} pages. Coloured like the board.</p>
        </div>
        <label className="flex items-center gap-1.5 text-xs font-semibold">
          <input type="checkbox" checked={withElements} onChange={(event) => setWithElements(event.target.checked)} />
          With elements (shooting schedule)
        </label>
        <button type="button" onClick={() => { void exportPdf('print'); }} className="px-2.5 py-1 rounded-lg border border-line-strong text-xs font-semibold flex items-center gap-1.5">
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
        <PdfExportButton onClick={() => { void exportPdf(); }} title={`Download the ${title.toLowerCase()} as a PDF`} />
      </div>
      {days.map((day) => (
        <section key={day.dayId} className="rounded-xl border border-line overflow-hidden">
          <header className="px-3 py-1.5 bg-slate-900 text-white text-xs font-bold flex justify-between gap-2">
            <span>{dayHeading(day)}</span>
            <span className="font-mono">{formatPageEighths(day.pageEighths)} pg</span>
          </header>
          <table className="w-full text-xs border-collapse">
            <tbody>
              {day.entries.length === 0 && (
                <tr><td className={`px-3 py-2 ${muted}`}>No strips on this day.</td></tr>
              )}
              {day.entries.map((entry, index) => {
                const color = STRIP_COLORS[entry.colorKey];
                const style = { background: color.fill, color: color.ink, borderColor: color.border };
                if (entry.kind === 'banner') {
                  return (
                    <tr key={`b-${index}`} style={style} className="border-t">
                      <td colSpan={7} className="px-3 py-1 text-[10px] font-black uppercase tracking-wider">{entry.label}</td>
                    </tr>
                  );
                }
                return (
                  <tr key={entry.sceneId} style={style} className="border-t align-top">
                    <td className="px-2 py-1 font-mono font-bold w-10">{entry.sceneNumber}</td>
                    <td className="px-2 py-1 w-10">{entry.intExt}</td>
                    <td className="px-2 py-1">
                      <div className="font-semibold">{entry.set}</div>
                      {withElements && entry.synopsis && <div className="opacity-80">{entry.synopsis}</div>}
                      {withElements && entry.elements && entry.elements.length > 0 && <div className="mt-0.5 opacity-90">{elementsText(entry)}</div>}
                    </td>
                    <td className="px-2 py-1 w-16">{entry.timeOfDay}</td>
                    <td className="px-2 py-1 w-14 font-mono text-right">{formatPageEighths(entry.pageEighths)}</td>
                    <td className="px-2 py-1 w-20 font-mono">{entry.castNumbers.join(', ')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
};
