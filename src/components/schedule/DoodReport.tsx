import React, { useCallback, useMemo, useRef, useState } from 'react';
import { cachedScriptBreakdown } from '../../domain/script/breakdownCache';
import { csvCell } from '../../utils/reportOutput';
import { useDismiss } from '../common/useDismiss';
import { EmptyState } from '../common/EmptyState';
import { DoodIcon } from '../icons/ProductionIcons';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';
import { Download, X } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  DOOD_MANUAL_STATUSES,
  DOOD_STATUS_META,
  deriveDood,
  deriveElementDood,
} from '../../domain/reports';
import { setDoodCellCommand, setDoodDropAfterDaysCommand } from '../../domain/commands';
import type { DoodColumn, DoodElementSource, DoodManualStatus, DoodRow, DoodWorkStatus } from '../../domain/reports';
import {
  BREAKDOWN_CATEGORIES,
  scenesForBreakdownItem,
} from '../../domain/script';
import type { BreakdownCategory, Character, ScriptScene } from '../../domain/script';
import type { ScriptLocationBreakdown } from '../../domain/script/logic';
import type { ScriptLine } from '../../types';
import { bytesToBlob, downloadBlob, downloadCsv, safeFileName } from '../../utils/download';
import { PdfExportButton } from '../common/PdfExportButton';

/** Cell colours, shared by screen and legend. */
const CELL_CLASS: Record<DoodWorkStatus, string> = {
  start: 'bg-emerald-500 text-white',
  work: 'bg-emerald-500/70 text-white',
  finish: 'bg-emerald-700 text-white',
  start_finish: 'bg-emerald-700 text-white',
  drop: 'bg-accent text-white',
  pickup: 'bg-sky-500 text-white',
  hold: 'bg-amber-400/80 text-black',
  travel: 'bg-violet-500 text-white',
  rehearsal: 'bg-teal-500 text-white',
  fitting: 'bg-pink-500 text-white',
  holiday: 'bg-slate-400 text-black',
  off: '',
};

type DoodMode = 'cast' | 'locations' | BreakdownCategory;

interface DoodReportProps {
  lines: ScriptLine[];
  scenes: ScriptScene[];
  characters: Character[];
  locations: ScriptLocationBreakdown[];
  isLight: boolean;
  /** Switch the Schedule to its board (empty state's next step). */
  onOpenBoard?: () => void;
}


/**
 * Day out of days, the way a production office reads one: cast numbers down
 * the side, shooting days across, the industry codes in the cells and paid-day
 * totals on the right. Click a cell to mark travel, a fitting or a holiday —
 * the things a schedule cannot know.
 */
export const DoodReport: React.FC<DoodReportProps> = ({ lines, scenes, characters, locations, isLight: _isLight, onOpenBoard }) => {
  const { project, runCommand } = useFloorPlan();
  const { setActiveRightTab } = useWorkspaceUI();
  const [mode, setMode] = useState<DoodMode>('cast');
  const [editing, setEditing] = useState<{ rowId: string; dayId: string } | null>(null);
  const cellMenuRef = useRef<HTMLTableCellElement>(null);
  useDismiss(editing !== null, useCallback(() => setEditing(null), []), cellMenuRef);

  const days = useMemo(() => project.productionDays ?? [], [project.productionDays]);
  const blocks = useMemo(() => project.scheduleBlocks ?? [], [project.scheduleBlocks]);
  const overrides = project.doodOverrides;
  const dropAfterDays = project.doodDropAfterDays;

  const itemElements = (category: BreakdownCategory): DoodElementSource[] =>
    (project.breakdownItems ?? [])
      .filter((item) => item.category === category)
      .map((item) => ({
        rowId: `item:${item.id}`,
        name: item.name,
        sceneIds: new Set(scenesForBreakdownItem(item, lines, scenes).map((scene) => scene.id)),
      }));
  const sceneSources = { scriptScenes: scenes, setups: project.setups };

  // Sections, as a DOOD is laid out: principal cast, then stunts, then
  // background. Other views are one section.
  const groups = useMemo((): Array<{ label?: string; rows: DoodRow[]; columns: DoodColumn[] }> => {
    if (mode === 'cast') {
      const cast = deriveDood({
        days,
        blocks,
        characters,
        castAssignments: project.castAssignments,
        people: project.people,
        castSources: { scriptScenes: scenes, setups: project.setups, castAssignments: project.castAssignments },
        overrides,
        dropAfterDays,
      });
      const stunts = deriveElementDood({ days, blocks, elements: itemElements('stunt'), overrides, sceneSources });
      const background = deriveElementDood({ days, blocks, elements: itemElements('extras'), overrides, sceneSources });
      return [
        { label: 'Cast', ...cast },
        { label: 'Stunts', ...stunts },
        { label: 'Background', ...background },
      ].filter((group, index) => index === 0 || group.rows.length > 0);
    }
    let elements: DoodElementSource[];
    if (mode === 'locations') {
      elements = locations.map((location) => ({
        rowId: `location:${location.key}`,
        name: location.name,
        sceneIds: new Set(location.scenes.map((scene) => scene.id)),
      }));
    } else {
      elements = itemElements(mode);
    }
    return [deriveElementDood({ days, blocks, elements, overrides, sceneSources })];
    // itemElements/sceneSources are rebuilt from the deps listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, scenes, characters, locations, lines, days, blocks, project.setups, project.castAssignments, project.people, project.breakdownItems, overrides, dropAfterDays]);

  const dood = {
    columns: groups[0]?.columns ?? days.map((day) => ({ dayId: day.id, dayName: day.name, date: day.date })),
    rows: groups.flatMap((group) => group.rows),
  };
  const showSections = groups.length > 1;
  const sectionOf = new Map(groups.flatMap((group) => group.rows.map((row) => [row.characterId, group.label ?? ''] as const)));

  const muted = 'text-ink-muted';
  const stickyBg = 'bg-surface';
  const border = 'border-line';

  const setCell = (rowId: string, dayId: string, status: DoodManualStatus | null, label: string) => {
    runCommand(setDoodCellCommand, { rowId, dayId, status, label }, { domain: 'schedule' });
    setEditing(null);
  };

  const exportCsv = () => {
    const header = ['Section', '#', 'Name', 'Role', ...dood.columns.map((c) => `${c.dayName}${c.date ? ` ${c.date}` : ''}`), 'Work', 'Hold', 'Travel', 'Holiday', 'Total', 'Start', 'Finish'];
    const rows = dood.rows.map((row) => [
      sectionOf.get(row.characterId),
      row.castNumber,
      row.displayName,
      row.roleName,
      ...row.cells.map((cell) => DOOD_STATUS_META[cell.status].code),
      row.totals.work,
      row.totals.hold,
      row.totals.travel,
      row.totals.holiday,
      row.totals.total,
      row.totals.start,
      row.totals.finish,
    ]);
    const text = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
    downloadCsv(text, `${safeFileName(project.title, 'project')}-dood-${mode}.csv`, { excelBom: true });
  };

  const exportPdf = async () => {
    const [{ createTableReportPdf }, { buildPdfFilename }] = await Promise.all([
      import('../../utils/pdf/tableReportPdf'),
      import('../../utils/pdf/filenames'),
    ]);
    const dayFrac = dood.columns.length ? 52 / dood.columns.length : 0;
    const view = mode === 'cast' ? 'Cast' : mode === 'locations' ? 'Locations' : BREAKDOWN_CATEGORIES.find((entry) => entry.value === mode)?.label ?? mode;
    const bytes = await createTableReportPdf({
      productionTitle: project.title || 'Production',
      documentTitle: 'Day Out of Days',
      subtitle: `${view} · ${dood.columns.length} shooting day${dood.columns.length === 1 ? '' : 's'}`,
      columns: [
        { header: '#', widthFrac: 3, align: 'center' },
        { header: mode === 'cast' ? 'Performer / role' : 'Element', widthFrac: 20 },
        ...dood.columns.map((column) => ({ header: column.date ? `${column.dayName}\n${column.date.slice(5)}` : column.dayName, widthFrac: dayFrac, align: 'center' as const })),
        { header: 'W', widthFrac: 4, align: 'center' },
        { header: 'H', widthFrac: 4, align: 'center' },
        { header: 'T', widthFrac: 4, align: 'center' },
        { header: 'HO', widthFrac: 4, align: 'center' },
        { header: 'Total', widthFrac: 5, align: 'center' },
      ],
      sections: groups.map((group) => ({
        ...(showSections ? { heading: group.label } : {}),
        rows: group.rows.map((row) => [
          row.castNumber === undefined ? '' : String(row.castNumber),
          row.roleName ? `${row.displayName} (${row.roleName})` : row.displayName,
          ...row.cells.map((cell) => DOOD_STATUS_META[cell.status].code),
          String(row.totals.work),
          String(row.totals.hold),
          String(row.totals.travel),
          String(row.totals.holiday),
          String(row.totals.total),
        ]),
      })),
      footnote: 'SW start work - W work - WF work finish - SWF start/work/finish - H hold - WD work, drop - PW pick-up work - T travel - R rehearsal - F fitting - HO holiday. Derived from the schedule; T, R, F and HO can be entered by hand.',
    });
    downloadBlob(bytesToBlob(bytes, 'application/pdf'), buildPdfFilename({ production: project.title, document: 'day-out-of-days', qualifier: mode }));
  };

  const usedCategories = new Set((project.breakdownItems ?? []).map((item) => item.category));

  return (
    <div className={`rounded-2xl border p-4 border-line bg-surface shadow-sm`}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <h3 className="text-sm font-bold">Day out of days</h3>
          <p className={`text-[11px] ${muted}`}>
            Derived from the scene strips on each shooting day. Click a cell to mark travel, a fitting, a rehearsal or a holiday.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className={`text-[11px] flex items-center gap-1.5 ${muted}`}>
            Show
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as DoodMode)}
              className={`rounded-md border px-1.5 py-1 text-xs border-line-strong bg-field text-ink`}
            >
              <option value="cast">Cast</option>
              <option value="locations">Locations</option>
              {BREAKDOWN_CATEGORIES.filter((category) => usedCategories.has(category.value)).map((category) => (
                <option key={category.value} value={category.value}>{category.label}</option>
              ))}
            </select>
          </label>
          {mode === 'cast' && (
            <label className={`text-[11px] flex items-center gap-1.5 ${muted}`} title="A gap between work days at least this many calendar days long is dropped and picked up (WD / PW) instead of held. SAG-AFTRA allows one drop per performer. 0 turns drops off.">
              Drop after
              <input
                type="number"
                min={0}
                max={60}
                value={dropAfterDays ?? 10}
                onChange={(event) => {
                  const value = event.target.value === '' ? undefined : Number(event.target.value);
                  runCommand(setDoodDropAfterDaysCommand, { days: value }, { domain: 'schedule' });
                }}
                className={`w-14 rounded-md border px-1.5 py-1 text-xs border-line-strong bg-field text-ink`}
              />
              days
            </label>
          )}
          <button
            type="button"
            onClick={exportCsv}
            disabled={dood.rows.length === 0}
            className={`px-2.5 py-1 rounded-lg border text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40 border-line-strong`}
            title="Download this matrix as a spreadsheet"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
          <PdfExportButton onClick={() => { void exportPdf(); }} disabled={dood.rows.length === 0} title="Download this day out of days as a PDF" />
        </div>
      </div>

      {dood.columns.length === 0 ? (
        <EmptyState
          icon={<DoodIcon className="w-5 h-5" />}
          title="No shooting days yet"
          action={{ label: onOpenBoard ? 'Open the board' : 'Open the schedule', onClick: onOpenBoard ?? (() => setActiveRightTab('schedule')) }}
        >
          The day out of days is worked out from the strips on each shooting day. Add days and strips on the schedule board.
        </EmptyState>
      ) : dood.rows.length === 0 ? (
        <p className={`text-xs ${muted}`}>Nothing in this category is scheduled yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-[11px] border-collapse">
            <thead>
              <tr>
                {mode === 'cast' && <th className={`px-1.5 py-1 text-center sticky left-0 ${stickyBg}`}>#</th>}
                <th className={`text-left px-2 py-1 sticky ${mode === 'cast' ? 'left-7' : 'left-0'} ${stickyBg}`}>
                  {mode === 'cast' ? 'Performer / role' : 'Element'}
                </th>
                {dood.columns.map((column) => (
                  <th key={column.dayId} className="px-1 py-1 text-center font-mono font-bold whitespace-nowrap" title={`${column.dayName} · ${column.date ?? 'undated'}`}>
                    <div className="w-24 mx-auto whitespace-normal leading-tight line-clamp-2">{column.dayName}</div>
                    <div className={`font-normal ${muted}`}>{column.date ? column.date.slice(5) : '—'}</div>
                  </th>
                ))}
                <th className="px-1.5 py-1 text-right" title="Work days">W</th>
                <th className="px-1.5 py-1 text-right" title="Hold days">H</th>
                <th className="px-1.5 py-1 text-right" title="Travel days">T</th>
                <th className="px-1.5 py-1 text-right" title="Holiday">HO</th>
                <th className="px-1.5 py-1 text-right" title="Paid days: work + hold + travel + holiday">Total</th>
                <th className="px-2 py-1 text-left whitespace-nowrap">Start → finish</th>
              </tr>
            </thead>
            <tbody>
              {groups.flatMap((group) => [
                ...(showSections && group.rows.length > 0
                  ? [(
                      <tr key={`section-${group.label}`} className="bg-surface-sunken">
                        <td colSpan={dood.columns.length + 8} className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider sticky left-0 ${muted}`}>
                          {group.label}
                        </td>
                      </tr>
                    )]
                  : []),
                ...group.rows.map((row) => (
                <tr key={row.characterId} className={`border-t ${border}`}>
                  {mode === 'cast' && (
                    <td className={`px-1.5 py-1 text-center font-mono sticky left-0 w-7 ${stickyBg}`}>{row.castNumber ?? ''}</td>
                  )}
                  <td className={`px-2 py-1 whitespace-nowrap sticky ${mode === 'cast' ? 'left-7' : 'left-0'} ${stickyBg}`}>
                    <span className="font-semibold">{row.displayName}</span>
                    {row.roleName && <span className={`ml-1 ${muted}`}>{row.roleName}</span>}
                  </td>
                  {row.cells.map((cell) => {
                    const meta = DOOD_STATUS_META[cell.status];
                    const isEditing = editing?.rowId === row.characterId && editing.dayId === cell.dayId;
                    return (
                      <td key={cell.dayId} ref={isEditing ? cellMenuRef : undefined} className="px-0.5 py-0.5 text-center relative">
                        <button
                          type="button"
                          onClick={() => setEditing(isEditing ? null : { rowId: row.characterId, dayId: cell.dayId })}
                          title={`${meta.title}${cell.manual ? ' (set by hand)' : ''} — click to change`}
                          aria-label={`${row.displayName}, ${meta.title}`}
                          className={`inline-flex items-center justify-center min-w-[30px] h-6 px-1 rounded font-mono font-bold ${CELL_CLASS[cell.status] || ('hover:bg-surface-hover')} ${cell.manual ? 'ring-1 ring-offset-1 ring-violet-400' : ''}`}
                        >
                          {meta.code}
                        </button>
                        {isEditing && (
                          <div
                            role="menu"
                            aria-label={`Mark ${row.displayName}`}
                            className={`absolute z-30 top-full left-1/2 -translate-x-1/2 mt-1 w-36 rounded-lg border shadow-xl p-1 text-left bg-surface border-line`}
                          >
                            {DOOD_MANUAL_STATUSES.map((status) => (
                              <button
                                key={status}
                                type="button"
                                role="menuitem"
                                onClick={() => setCell(row.characterId, cell.dayId, status, row.displayName)}
                                className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs hover:bg-surface-hover`}
                              >
                                <span className={`inline-block w-7 text-center rounded font-mono font-bold ${CELL_CLASS[status] || 'border border-current'}`}>
                                  {DOOD_STATUS_META[status].code || '–'}
                                </span>
                                {DOOD_STATUS_META[status].title}
                              </button>
                            ))}
                            <button
                              type="button"
                              role="menuitem"
                              disabled={!cell.manual}
                              onClick={() => setCell(row.characterId, cell.dayId, null, row.displayName)}
                              className={`w-full flex items-center gap-2 px-2 py-1 rounded text-xs disabled:opacity-40 hover:bg-surface-hover`}
                            >
                              <X className="w-3.5 h-3.5" /> Back to schedule
                            </button>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-1.5 py-1 text-right font-mono">{row.totals.work}</td>
                  <td className="px-1.5 py-1 text-right font-mono">{row.totals.hold}</td>
                  <td className="px-1.5 py-1 text-right font-mono">{row.totals.travel}</td>
                  <td className="px-1.5 py-1 text-right font-mono">{row.totals.holiday}</td>
                  <td className="px-1.5 py-1 text-right font-mono font-bold">{row.totals.total}</td>
                  <td className={`px-2 py-1 font-mono whitespace-nowrap ${muted}`}>
                    {row.totals.start ? `${row.totals.start} → ${row.totals.finish}` : '—'}
                  </td>
                </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      )}

      <div className={`mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] ${muted}`}>
        {(Object.keys(DOOD_STATUS_META) as DoodWorkStatus[])
          .filter((status) => status !== 'off')
          .map((status) => (
            <span key={status} className="flex items-center gap-1">
              <span className={`inline-block min-w-[26px] text-center rounded font-mono font-bold ${CELL_CLASS[status]}`}>{DOOD_STATUS_META[status].code}</span>
              {DOOD_STATUS_META[status].title}
            </span>
          ))}
      </div>
    </div>
  );
};

const NO_LINES: ScriptLine[] = [];

/**
 * The DOOD as the Schedule shows it: the script breakdown is read from the
 * project (shared, cached) rather than handed in by the script panel.
 */
export const ScheduleDood: React.FC<{ isLight: boolean; onOpenBoard?: () => void }> = ({ isLight, onOpenBoard }) => {
  const { project } = useFloorPlan();
  const lines = project.scriptLines ?? NO_LINES;
  const breakdown = cachedScriptBreakdown(lines, project.characters, project.locations);
  return (
    <DoodReport
      lines={lines}
      scenes={breakdown.scenes}
      characters={breakdown.characters}
      locations={breakdown.locations}
      isLight={isLight}
      onOpenBoard={onOpenBoard}
    />
  );
};
