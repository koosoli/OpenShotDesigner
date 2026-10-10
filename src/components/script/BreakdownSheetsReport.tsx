import React, { useMemo, useState } from 'react';
import { printPdfBytes } from '../../utils/printPdf';
import { Printer } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { attachBreakdownItemsToScenes, breakdownCategoryLabel, breakdownCategoryTint } from '../../domain/script';
import type { Character, ScriptScene } from '../../domain/script';
import { deriveBreakdownSheets, formatPageEighths } from '../../domain/reports';
import type { BreakdownSheet } from '../../domain/reports';
import { STRIP_COLORS } from '../../domain/scheduling/stripboardPrint';
import type { ScriptLine } from '../../types';
import { downloadBlob } from '../../utils/download';
import { PdfExportButton } from '../common/PdfExportButton';

interface BreakdownSheetsReportProps {
  lines: ScriptLine[];
  scenes: ScriptScene[];
  characters: Character[];
  isLight: boolean;
}


const titleOf = (sheet: BreakdownSheet) => [sheet.intExt, sheet.set, sheet.timeOfDay].filter(Boolean).join(' · ');
const factsOf = (sheet: BreakdownSheet) => [
  `Pages ${formatPageEighths(sheet.pageEighths)}`,
  sheet.scriptDay ? `Story day ${sheet.scriptDay}` : undefined,
  sheet.shootDays.length ? `Shoot ${sheet.shootDays.join(', ')}` : 'Not scheduled',
].filter(Boolean).join(' · ');
const castLine = (sheet: BreakdownSheet) =>
  sheet.cast.map((entry) => `${entry.castNumber !== undefined ? `${entry.castNumber}. ` : ''}${entry.character}${entry.performer ? ` (${entry.performer})` : ''}`).join(', ');

/**
 * Breakdown sheets — one per scene, header coloured like its strip — for the
 * whole script or one scene, on screen, printed or as a PDF.
 */
export const BreakdownSheetsReport: React.FC<BreakdownSheetsReportProps> = ({ lines, scenes, characters, isLight: _isLight }) => {
  const { project } = useFloorPlan();
  const [only, setOnly] = useState<string>('all');

  const sheets = useMemo(() => deriveBreakdownSheets({
    scenes: attachBreakdownItemsToScenes(scenes, lines, project.breakdownItems ?? []),
    characters,
    breakdownItems: project.breakdownItems ?? [],
    castAssignments: project.castAssignments,
    people: project.people,
    days: project.productionDays,
    blocks: project.scheduleBlocks,
    setups: project.setups,
  }), [scenes, lines, characters, project.breakdownItems, project.castAssignments, project.people, project.productionDays, project.scheduleBlocks, project.setups]);

  const shown = only === 'all' ? sheets : sheets.filter((sheet) => sheet.sceneId === only);

  const exportPdf = async (mode: 'download' | 'print' = 'download') => {
    const [{ createBreakdownSheetsPdf }, { buildPdfFilename }] = await Promise.all([
      import('../../utils/pdf/breakdownSheetPdf'),
      import('../../utils/pdf/filenames'),
    ]);
    const bytes = await createBreakdownSheetsPdf({
      productionTitle: project.title || 'Production',
      sheets: shown.map((sheet) => ({
        sceneNumber: sheet.sceneNumber,
        title: titleOf(sheet),
        facts: factsOf(sheet),
        ...(sheet.synopsis ? { synopsis: sheet.synopsis } : {}),
        omitted: sheet.omitted,
        ...STRIP_COLORS[sheet.colorKey],
        rows: [
          ...(sheet.cast.length ? [['Cast', castLine(sheet)] as [string, string]] : []),
          ...sheet.elements.map((group) => [breakdownCategoryLabel(group.category), group.items.join(', ')] as [string, string]),
        ],
      })),
    });
    if (mode === 'print') {
      printPdfBytes(bytes);
      return;
    }
    downloadBlob(new Blob([bytes], { type: 'application/pdf' }), buildPdfFilename({
      production: project.title,
      document: 'breakdown-sheets',
      ...(only !== 'all' && shown[0] ? { qualifier: `scene-${shown[0].sceneNumber}` } : {}),
    }));
  };


  const muted = 'text-ink-muted';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="mr-auto">
          <h3 className="text-sm font-bold">Breakdown sheets</h3>
          <p className={`text-[11px] ${muted}`}>One sheet per scene, coloured like its strip. Tag elements on the script page to fill them.</p>
        </div>
        <select
          value={only}
          onChange={(event) => setOnly(event.target.value)}
          aria-label="Scenes to show"
          className="rounded-md border border-line-strong bg-field text-ink px-1.5 py-1 text-xs"
        >
          <option value="all">All scenes ({sheets.length})</option>
          {sheets.map((sheet) => <option key={sheet.sceneId} value={sheet.sceneId}>Scene {sheet.sceneNumber}</option>)}
        </select>
        <button type="button" onClick={() => { void exportPdf('print'); }} disabled={shown.length === 0} className="px-2.5 py-1 rounded-lg border border-line-strong text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40">
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
        <PdfExportButton onClick={() => { void exportPdf(); }} disabled={shown.length === 0} title="Download these breakdown sheets as a PDF" />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {shown.map((sheet) => {
          const color = STRIP_COLORS[sheet.colorKey];
          return (
            <article key={sheet.sceneId} className={`rounded-2xl border border-line bg-surface overflow-hidden ${sheet.omitted ? 'opacity-60' : ''}`}>
              <header className="px-4 py-3 border-b" style={{ background: color.fill, color: color.ink, borderColor: color.border }}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-lg font-black font-mono">SC {sheet.sceneNumber}</span>
                  <span className="text-sm font-bold">{titleOf(sheet)}</span>
                  {sheet.omitted && <span className="text-[10px] font-bold uppercase">Omitted</span>}
                </div>
                <div className="text-[11px] mt-0.5 opacity-90">{factsOf(sheet)}</div>
              </header>
              <div className="p-4 space-y-2">
                {sheet.synopsis && <p className="text-xs text-ink-soft">{sheet.synopsis}</p>}
                {sheet.cast.length > 0 && (
                  <div>
                    <div className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>Cast</div>
                    <div className="text-xs">{castLine(sheet)}</div>
                  </div>
                )}
                <div className="grid sm:grid-cols-2 gap-2">
                  {sheet.elements.map((group) => (
                    <div key={group.category} className="rounded-lg border border-line p-2" style={{ borderLeft: `3px solid ${breakdownCategoryTint(group.category)}` }}>
                      <div className={`text-[10px] font-bold uppercase tracking-wider ${muted}`}>{breakdownCategoryLabel(group.category)}</div>
                      <div className="text-xs">{group.items.join(', ')}</div>
                    </div>
                  ))}
                </div>
                {sheet.cast.length === 0 && sheet.elements.length === 0 && (
                  <p className={`text-xs ${muted}`}>Nothing tagged in this scene yet.</p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
