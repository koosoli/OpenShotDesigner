import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  BarChart3,
  Clapperboard,
  ClipboardPaste,
  Code2,
  Download,
  FileText,
  ImagePlus,
  Layers,
  Lock,
  LockOpen,
  Minus,
  PenTool,
  Plus,
  Printer,
  Scissors,
  Trash2,
  Tv,
  Upload,
  Video,
  Waves,
  X,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { AVScriptRow, ScriptElementType, ScriptFormatMode, ScriptLine, Shot, ShotSize } from '../../types';
import { loadStoryboardImageFile } from '../../utils/image';
import {
  formatParenthetical,
  parseAVScriptText,
  parseScreenplay,
  parseScreenplayTitlePage,
  serializeToFountain,
} from './screenplayParser';
import { LinedScriptPage, LANE_WIDTH, PAGE_COLUMNS } from './LinedScriptPage';
import {
  buildCharacterCatalog,
  mergeCharacterCatalogs,
  parseSceneHeading,
  replaceSceneHeadingLocation,
  sceneHeadingLocationQuery,
  suggestCharacters,
  suggestLocations,
} from '../../domain/script/logic';
import {
  avCoverage,
  avRowNumber,
  omittedSceneLabel,
  reconcileScriptLineIds,
  removeLineOrOmit,
  restoreScene,
  rowsForMissingShots,
  breakdownCategoryLabel,
  breakdownCategoryTint,
  breakdownItemsForLines,
  untagScriptLine,
} from '../../domain/script';
import type { BreakdownSourceRange } from '../../domain/script';
import { ScriptReportsPanel } from './ScriptReportsPanel';
import { TitlePageEditor } from './TitlePageEditor';
import { SetLocationLink } from '../locations/SetLocationLink';
import { createId } from '../../domain/ids';
import { BreakdownTagControl } from './BreakdownTagControl';
import { ProjectImage } from '../common/ProjectImage';
import { keyFrameImage } from '../../utils/storyboardFrames';
import { downloadCsv, downloadText, safeFileName } from '../../utils/download';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';

type ScriptWorkspaceView = ScriptFormatMode | 'reports' | 'title_page';

/**
 * Board art for one AV row: its own uploaded frame when present, otherwise the
 * linked floor-plan shot's storyboard (so syncing a camera and boarding it in
 * the viewfinder shows up here automatically).
 */
const AVStoryboardCell: React.FC<{
  row: AVScriptRow;
  linkedShot?: Shot;
  isLight: boolean;
  onChange: (updates: Partial<AVScriptRow>) => void;
}> = ({ row, linkedShot, isLight, onChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const inherited = !row.storyboardImage && linkedShot ? keyFrameImage(linkedShot) : undefined;
  const image = row.storyboardImage ?? inherited;
  const fit = row.storyboardFit ?? linkedShot?.storyboardFit ?? 'cover';

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          loadStoryboardImageFile(file)
            .then((dataUrl) => onChange({ storyboardImage: dataUrl, storyboardFit: 'cover' }))
            .catch(() => alert('That image could not be read.'));
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        title={image ? 'Replace this row’s board frame' : 'Attach a board frame to this AV row'}
        className={`relative w-24 aspect-video rounded-md border overflow-hidden flex items-center justify-center transition-colors ${
          isLight ? 'border-slate-300 bg-slate-100 hover:border-violet-400' : 'border-slate-700 bg-slate-950 hover:border-violet-500'
        }`}
      >
        {image ? (
          <>
            <ProjectImage imageRef={image} alt={`Board for shot ${row.shotNumber}`} className="absolute inset-0 w-full h-full" style={{ objectFit: fit }} />
            {inherited && (
              <span className="absolute bottom-0 inset-x-0 bg-black/65 text-[7px] font-bold uppercase tracking-wider text-sky-300 py-px">
                From shot
              </span>
            )}
          </>
        ) : (
          <ImagePlus className="w-4 h-4 opacity-40" />
        )}
      </button>
      {row.storyboardImage && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onChange({ storyboardFit: fit === 'cover' ? 'contain' : 'cover' })}
            className="text-[8px] px-1 rounded border border-slate-600 text-slate-400 hover:text-slate-200"
            title="Toggle crop / fit"
          >
            {fit}
          </button>
          <button
            onClick={() => onChange({ storyboardImage: undefined, storyboardFit: undefined })}
            className="text-[8px] px-1 rounded border border-rose-500/40 text-rose-400"
            title="Remove this row's board frame"
          >
            clear
          </button>
        </div>
      )}
    </div>
  );
};

const SHOT_SIZES: ShotSize[] = ['WS', 'FS', 'MWS', 'MS', 'MCU', 'CU', 'ECU', 'OTS', 'POV', 'Insert'];

const ELEMENT_STYLES: Record<ScriptElementType, { label: string; shortcut: string; color: string; indentClass: string }> = {
  scene: { label: 'Scene Heading', shortcut: 'INT/EXT', color: 'text-amber-400 border-amber-500/40 bg-amber-950/20', indentClass: 'font-bold uppercase tracking-wider text-slate-100 pl-0' },
  action: { label: 'Action', shortcut: 'Act', color: 'text-slate-300 border-slate-600/40 bg-slate-800/20', indentClass: 'text-slate-200 pl-0 max-w-2xl' },
  character: { label: 'Character', shortcut: 'Char', color: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/20', indentClass: 'font-bold uppercase tracking-wide text-emerald-300 pl-[36%] max-w-xl' },
  parenthetical: { label: 'Parenthetical (Tab)', shortcut: '(Tab)', color: 'text-sky-400 border-sky-500/40 bg-sky-950/20', indentClass: 'italic text-sky-300 pl-[28%] max-w-md' },
  dialogue: { label: 'Dialogue', shortcut: 'Dia', color: 'text-violet-300 border-violet-500/40 bg-violet-950/20', indentClass: 'text-slate-100 pl-[20%] max-w-lg' },
  transition: { label: 'Transition', shortcut: 'Trans', color: 'text-rose-400 border-rose-500/40 bg-rose-950/20', indentClass: 'font-bold uppercase text-rose-300 text-right pr-4' },
  shot: { label: 'Shot Angle', shortcut: 'Shot', color: 'text-yellow-400 border-yellow-500/40 bg-yellow-950/20', indentClass: 'font-bold uppercase text-yellow-200 pl-0' },
  note: { label: 'Note', shortcut: '[[ ]]', color: 'text-slate-400 border-slate-700/40 bg-slate-900/40', indentClass: 'italic text-slate-400 pl-0' },
  'page-break': { label: 'Page Break', shortcut: '===', color: 'text-slate-500 border-slate-700/40', indentClass: 'text-center opacity-40 text-xs py-2' },
};

/**
 * The suggestion dropdown's contents, tagged by which catalogue produced them.
 * Item types are derived from the suggestion functions so they cannot drift
 * from the catalogues they come out of.
 */
type SuggestionList =
  | { kind: 'character'; items: ReturnType<typeof suggestCharacters> }
  | { kind: 'location'; items: ReturnType<typeof suggestLocations> }
  | { kind: 'none'; items: [] };

export const ScriptPanel: React.FC = () => {
  const { activeSetup, scriptLines, scriptTitle, allScriptMarks, allShots, setupIdForMark, setActiveSetupId, selectedShotId, selectShot, createShotFromScriptRange, linkShotToScriptRange, scriptLinkShotId, cancelScriptLinking, updateScriptMark, setLiningDescription, deleteScriptMark, setScriptLines, setSceneNumbersLocked, avScriptRows, setAVScriptRows, updateAVScriptRow, addAVScriptRow, deleteAVScriptRow, scriptFormatMode, setScriptFormatMode, syncAVRowToShot, displaySettings, project, updateProjectMeta } = useFloorPlan();
  const { openExportModal, theme } = useWorkspaceUI();

  /**
   * Every write to the script goes through here so breakdown elements cannot
   * outlive the lines they were tagged from.
   *
   * Wrapping the context action rather than pruning at each of the dozen call
   * sites (delete a line, omit a scene, re-import, paste over the lot) is what
   * makes this hold for the next one somebody adds. Lines parked inside an
   * omitted scene's `omittedBody` count as alive: the scene can be restored,
   * and losing its props on the way out and back would be a silent edit.
   */

  const isLight = theme === 'light';
  const lines = scriptLines;
  const sceneNumbersLocked = project.sceneNumbersLocked === true;
  const marks = allScriptMarks;

  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<string, HTMLElement>>(new Map());
  const anchorRef = useRef<string | null>(null);
  const focusRef = useRef<string | null>(null);

  const [activeTab, setActiveTab] = useState<ScriptWorkspaceView>(scriptFormatMode || 'lined_coverage');
  const [fountainViewMode, setFountainViewMode] = useState<'page' | 'raw'>('page');
  const [rawFountainText, setRawFountainText] = useState('');
  const [activeEditingLineId, setActiveEditingLineId] = useState<string | null>(null);

  const [zoom, setZoom] = useState(1);
  const [autoFontSize, setAutoFontSize] = useState(12);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [description, setDescription] = useState('');
  const [shotSize, setShotSize] = useState<ShotSize>('MS');
  const [textSelection, setTextSelection] = useState<{
    startLineId: string;
    startOffset: number;
    endLineId: string;
    endOffset: number;
    text: string;
  } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const fontSize = autoFontSize * zoom;
  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    lines.forEach((line, index) => map.set(line.id, index));
    return map;
  }, [lines]);

  const selectedMark = useMemo(
    () => marks.find((mark) => mark.shotId === selectedShotId) || null,
    [marks, selectedShotId]
  );
  const selectedShot = useMemo(
    () => allShots.find((shot) => shot.id === selectedShotId) || null,
    [allShots, selectedShotId]
  );

  // Script intelligence: character/location autocomplete (plan §12)
  const characterCatalog = useMemo(
    () => mergeCharacterCatalogs(
      project.characters || [],
      buildCharacterCatalog(lines.map((l) => ({ text: l.text || '', type: l.type }))),
    ),
    [lines, project.characters]
  );
  const locationCatalog = useMemo(() => {
    const seen = new Map<string, { name: string; aliases?: string[] }>();
    (project.locations || []).forEach((location) => {
      seen.set(location.name.toLowerCase(), { name: location.name, aliases: location.aliases });
    });
    lines.forEach((line) => {
      if (line.type !== 'scene') return;
      const parsed = parseSceneHeading(line.text || '');
      if (!parsed.location) return;
      const key = parsed.location.toLowerCase();
      if (!seen.has(key)) seen.set(key, { name: parsed.location });
    });
    return Array.from(seen.values());
  }, [lines, project.locations]);
  const [suggest, setSuggest] = useState<{ lineId: string; kind: 'character' | 'location' } | null>(null);
  // Tagged by kind rather than returned as a bare array. The two suggestion
  // lists hold different shapes — a character has a canonical name and
  // aliases, a location has a name — and a plain union leaves every render
  // site asserting which one it got. The tag makes the narrowing real.
  const activeSuggestions = useMemo((): SuggestionList => {
    // The list belongs to the line being edited. Without this it kept pointing
    // at the line it was opened on: pressing Enter to start an action line left
    // the location suggestions hanging under the scene heading above, with no
    // way to dismiss them short of Escape on a field no longer focused.
    if (!suggest || suggest.lineId !== activeEditingLineId) return { kind: 'none', items: [] };
    const line = lines.find((l) => l.id === suggest.lineId);
    if (!line) return { kind: 'none', items: [] };
    if (suggest.kind === 'character') {
      return {
        kind: 'character',
        items: suggestCharacters(characterCatalog, line.text || '').filter(
          (c) => c.canonicalName !== (line.text || '').trim().toUpperCase(),
        ),
      };
    }
    const query = sceneHeadingLocationQuery(line.text || '');
    return {
      kind: 'location',
      items: suggestLocations(locationCatalog, query).filter(
        (l) => l.name.toLowerCase() !== query.trim().toLowerCase()
      ),
    };
  }, [suggest, activeEditingLineId, lines, characterCatalog, locationCatalog]);

  useEffect(() => {
    if (activeTab !== 'reports' && activeTab !== 'title_page' && scriptFormatMode && scriptFormatMode !== activeTab) {
      setActiveTab(scriptFormatMode);
    }
    // Deliberately keyed on scriptFormatMode alone. This is a one-way sync:
    // changing the stored format switches the tab. Depending on activeTab too
    // would re-run whenever the user picked a different tab and yank them back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptFormatMode]);

  const handleTabSwitch = (mode: ScriptFormatMode) => {
    setActiveTab(mode);
    setScriptFormatMode(mode);
  };

  useEffect(() => {
    if (lines.length > 0 && fountainViewMode === 'raw') {
      setRawFountainText(serializeToFountain(lines, scriptTitle, project.titlePage));
    }
    // Snapshot the script as Fountain at the MOMENT the raw view opens.
    // Depending on `lines` would re-serialise on every edit and discard
    // whatever the user has typed into the raw textarea.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fountainViewMode]);

  const importRaw = (raw: string, name: string) => {
    // Re-importing a revised draft keeps linings and scheduled scenes attached
    // to the lines that survived (ids are reconciled, not minted afresh).
    const parsed = reconcileScriptLineIds(parseScreenplay(raw, name), lines);
    // A script that arrives with a cover keeps it — title, credit, author and
    // draft used to be stripped at the door and thrown away.
    const cover = parseScreenplayTitlePage(raw);
    setScriptLines(parsed, {
      scriptTitle: cover?.title?.trim() || name,
      scriptText: raw,
      ...(cover ? { titlePage: cover } : {}),
    });
    clearSelection();
  };

  const loadScript = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => importRaw(String(reader.result || ''), file.name);
    reader.readAsText(file);
  };

  const exportFountainFile = () => {
    const content = serializeToFountain(lines, scriptTitle || 'Untitled Screenplay', project.titlePage);
    // Was a detached anchor (nothing downloads in Firefox) with a sanitiser
    // that replaced whitespace and nothing else, so a title with a colon or a
    // slash in it produced a filename the filesystem refuses.
    downloadText(content, `${safeFileName(scriptTitle, 'screenplay').toLowerCase()}.fountain`, {
      type: 'text/plain;charset=utf-8',
    });
  };

  const exportAVScriptCSV = () => {
    const rows = avScriptRows || [];
    let csv = 'Shot Number,Shot Name,Shot Size,Video / Visuals,Audio / VO / Dialogue,Est. Seconds\n';
    rows.forEach((r) => {
      const v = `"${(r.video || '').replace(/"/g, '""')}"`;
      const a = `"${(r.audio || '').replace(/"/g, '""')}"`;
      csv += `${avRowNumber(r, allShots)},"${r.shotName || ''}",${r.shotSize || ''},${v},${a},${r.durationSec || ''}\n`;
    });
    // Named after the production rather than a timestamp: three exports in a
    // row used to produce three files nobody could tell apart.
    downloadCsv(csv, `${safeFileName(project.title, 'production')}_AV_Script.csv`, {
      excelBom: true,
    });
  };

  const handleClearScreenplay = () => {
    if (!window.confirm('Are you sure you want to clear this entire screenplay? This will remove all script lines.')) {
      return;
    }
    setScriptLines([], { scriptTitle: '', scriptText: '' });
    clearSelection();
    setRawFountainText('');
    setActiveEditingLineId(null);
  };

  const handleClearAVScript = () => {
    if (!window.confirm('Are you sure you want to clear all rows from the AV script?')) {
      return;
    }
    setAVScriptRows([]);
  };

  const handleStartBlankScreenplay = () => {
    const blankId = createId('sl');
    const initialLine: ScriptLine = {
      id: blankId,
      lineNumber: 1,
      text: 'INT. LOCATION - DAY',
      type: 'scene',
      isSceneHeading: true,
      sceneNumber: '1',
    };
    setScriptLines([initialLine], { scriptTitle: 'Untitled Screenplay', scriptText: 'INT. LOCATION - DAY\n' });
    setActiveEditingLineId(blankId);
    handleTabSwitch('screenplay');
    clearSelection();
  };

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => {
      const available = element.clientWidth - 48;
      if (available <= 0) return;
      const laneMargin = Math.max((marks.length ? 3 : 1), 2) * LANE_WIDTH + 40;
      const targetTextWidth = Math.max(180, available - laneMargin);
      const calculated = targetTextWidth / (PAGE_COLUMNS * 0.60);
      setAutoFontSize(Math.max(11, Math.min(24, Math.round(calculated * 10) / 10)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [marks.length, activeTab]);

  const selection = useMemo(() => {
    if (!anchorId || !focusId) return null;
    const a = indexById.get(anchorId);
    const b = indexById.get(focusId);
    if (a === undefined || b === undefined) return null;
    return { from: Math.min(a, b), to: Math.max(a, b) };
  }, [anchorId, focusId, indexById]);

  const effectiveRange = useMemo(() => {
    if (textSelection) {
      const a = indexById.get(textSelection.startLineId);
      const b = indexById.get(textSelection.endLineId);
      if (a === undefined || b === undefined) return null;
      const flipped = a > b;
      return {
        from: Math.min(a, b),
        to: Math.max(a, b),
        startOffset: flipped ? textSelection.endOffset : textSelection.startOffset,
        endOffset: flipped ? textSelection.startOffset : textSelection.endOffset,
        text: textSelection.text,
        partial: true,
      };
    }
    if (!selection) return null;
    return { ...selection, startOffset: undefined, endOffset: undefined, text: undefined, partial: false };
  }, [textSelection, selection, indexById]);

  /** Every script line the selection touches — what a tagged element points at. */
  const selectedLineIds = useMemo(() => {
    if (!effectiveRange) return [];
    return lines.slice(effectiveRange.from, effectiveRange.to + 1).map((line) => line.id);
  }, [effectiveRange, lines]);

  /**
   * The selection as one range per line, which is what a breakdown tag stores.
   *
   * Only the first and last line of a multi-line selection are partial; the
   * ones between are covered end to end, so they carry no offsets and read as
   * "the whole line". A whole-line selection (dragging down the gutter rather
   * than through the text) yields no offsets at all, which is honest — the
   * user picked lines, not words.
   */
  const selectedRanges = useMemo<BreakdownSourceRange[]>(() => {
    if (!effectiveRange) return [];
    return lines.slice(effectiveRange.from, effectiveRange.to + 1).map((line, offsetIndex) => {
      const index = effectiveRange.from + offsetIndex;
      if (!effectiveRange.partial) return { lineId: line.id };
      const start = index === effectiveRange.from ? effectiveRange.startOffset ?? 0 : 0;
      const end = index === effectiveRange.to ? effectiveRange.endOffset ?? line.text.length : line.text.length;
      return start <= 0 && end >= line.text.length
        ? { lineId: line.id }
        : { lineId: line.id, startOffset: start, endOffset: end };
    });
  }, [effectiveRange, lines]);

  const breakdownItems = useMemo(() => project.breakdownItems ?? [], [project.breakdownItems]);

  /** Elements already tagged anywhere in the selection — the untag list. */
  const taggedInSelection = useMemo(
    () => breakdownItemsForLines(breakdownItems, selectedLineIds),
    [breakdownItems, selectedLineIds],
  );

  const [highlightedBreakdownItemId, setHighlightedBreakdownItemId] = useState<string | null>(null);

  /**
   * Untag every line of the selection at once. Untagging one line of a phrase
   * that spans two would leave half a mark on the page, which reads as a bug
   * rather than a partial edit.
   */
  const untagFromSelection = (itemId: string) => {
    updateProjectMeta((prev) => {
      let next = prev.breakdownItems ?? [];
      for (const lineId of selectedLineIds) next = untagScriptLine(next, itemId, lineId);
      return { breakdownItems: next };
    });
  };

  const selectedSceneNumber = useMemo(() => {
    if (!effectiveRange) return undefined;
    for (let i = effectiveRange.from; i >= 0; i -= 1) {
      if (lines[i]?.sceneNumber) return lines[i].sceneNumber;
    }
    return undefined;
  }, [effectiveRange, lines]);

  const clearSelection = () => {
    setTextSelection(null);
    window.getSelection()?.removeAllRanges();
    anchorRef.current = null;
    focusRef.current = null;
    setAnchorId(null);
    setFocusId(null);
    setDescription('');
  };

  const handleLinePointerDown = (event: React.PointerEvent, lineId: string) => {
    if (activeTab === 'screenplay') {
      setActiveEditingLineId(lineId);
      return;
    }
    const anchor = anchorRef.current;
    const extend = event.shiftKey || (event.pointerType !== 'mouse' && !!anchor);
    if (extend && anchor) {
      focusRef.current = lineId;
      setFocusId(lineId);
      setTextSelection(null);
      return;
    }
    if (anchor === lineId && focusRef.current === lineId && !textSelection) {
      clearSelection();
      return;
    }
    anchorRef.current = lineId;
    focusRef.current = lineId;
    setAnchorId(lineId);
    setFocusId(lineId);
    setTextSelection(null);
    if (event.pointerType === 'mouse') setIsDragging(true);
  };

  // Drag-to-select across multiple script lines
  useEffect(() => {
    if (!isDragging) return;
    const onPointerMove = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const lineEl = el?.closest('[data-line-id]') as HTMLElement | null;
      const hoveredId = lineEl?.getAttribute('data-line-id');
      if (hoveredId && hoveredId !== focusRef.current) {
        focusRef.current = hoveredId;
        setFocusId(hoveredId);
      }
    };
    const onPointerUp = () => {
      setIsDragging(false);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [isDragging]);

  // Capture native text selection persistently into React state
  useEffect(() => {
    const handleMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);
      const container = scrollRef.current;
      if (!container || !container.contains(range.commonAncestorContainer)) return;

      const startNode = range.startContainer;
      const endNode = range.endContainer;
      const startEl = (startNode.nodeType === Node.ELEMENT_NODE ? (startNode as HTMLElement) : startNode.parentElement)?.closest('[data-line-id]');
      const endEl = (endNode.nodeType === Node.ELEMENT_NODE ? (endNode as HTMLElement) : endNode.parentElement)?.closest('[data-line-id]');

      const startLineId = startEl?.getAttribute('data-line-id');
      const endLineId = endEl?.getAttribute('data-line-id');

      if (startLineId && endLineId) {
        const selectedText = sel.toString();
        if (selectedText.trim()) {
          setTextSelection({
            startLineId,
            startOffset: range.startOffset,
            endLineId,
            endOffset: range.endOffset,
            text: selectedText,
          });
          anchorRef.current = startLineId;
          focusRef.current = endLineId;
          setAnchorId(startLineId);
          setFocusId(endLineId);
        }
      }
    };

    // Listen on the document, not on `scrollRef.current`. The ref is bound to
    // two different conditionally-rendered containers, so a tab switch
    // remounts the node and a listener attached to the old one goes with it —
    // lining a speech silently stopped working until the panel was reopened.
    // `handleMouseUp` reads `scrollRef.current` at event time and ignores
    // selections outside it, so document-level is safe. `pointerup` also
    // covers touch and pen, which `mouseup` did not; the frame of delay lets
    // the browser settle the selection first (touch selection handles land
    // after the pointer is up).
    let frame = 0;
    const handlePointerUp = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(handleMouseUp);
    };
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('keyup', handlePointerUp);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('keyup', handlePointerUp);
    };
  }, []);

  const stripParentheses = (text: string): string => {
    return text.replace(/^\s*\(+/, '').replace(/\)+\s*$/, '').trim();
  };

  const updateLine = (id: string, newText: string, newType?: ScriptElementType) => {
    const updated = lines.map((l) => {
      if (l.id !== id) return l;
      const targetType = newType ?? l.type ?? 'action';
      let text = newText;
      if (targetType === 'parenthetical') {
        text = formatParenthetical(text);
      } else {
        if (l.type === 'parenthetical' || newType !== undefined) {
          text = stripParentheses(text);
        }
        if (targetType === 'scene' || targetType === 'character' || targetType === 'transition') {
          text = text.toUpperCase();
        }
      }
      return {
        ...l,
        text,
        type: targetType,
        isSceneHeading: targetType === 'scene',
      };
    });
    setScriptLines(updated);
  };

  const changeLineType = (id: string, type: ScriptElementType) => {
    const target = lines.find((l) => l.id === id);
    if (!target) return;
    let text = target.text;
    if (type === 'parenthetical') {
      text = formatParenthetical(text);
    } else {
      text = stripParentheses(text);
      if (type === 'character' || type === 'scene' || type === 'transition') {
        text = text.toUpperCase();
      }
    }
    updateLine(id, text, type);
  };

  const toggleParentheticalOnLine = (id: string) => {
    const target = lines.find((l) => l.id === id);
    if (!target) return;
    if (target.type === 'parenthetical') {
      const inner = stripParentheses(target.text);
      updateLine(id, inner, 'dialogue');
    } else {
      updateLine(id, target.text || 'delivery instructions', 'parenthetical');
    }
  };

  const handleLineKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>, line: ScriptLine, index: number) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const order: ScriptElementType[] = ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition'];
      const currType = line.type || 'action';
      const currIdx = order.indexOf(currType);
      const validIdx = currIdx === -1 ? 1 : currIdx;
      const step = e.shiftKey ? -1 : 1;
      const nextType = order[(validIdx + step + order.length) % order.length];
      changeLineType(line.id, nextType);
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      
      // Default Hollywood Progression:
      // Scene Heading -> Action -> Character -> Parenthetical -> Dialogue -> Action
      let nextType: ScriptElementType = 'action';
      if (line.type === 'scene') {
        nextType = 'action';
      } else if (line.type === 'action') {
        nextType = 'character';
      } else if (line.type === 'character') {
        nextType = 'parenthetical';
      } else if (line.type === 'parenthetical') {
        nextType = 'dialogue';
      } else if (line.type === 'dialogue') {
        nextType = 'action';
      } else if (line.type === 'transition') {
        nextType = 'scene';
      }

      // If the user presses Enter on an empty line, allow natural shortcut conversions:
      const trimmed = line.text.trim();
      if (!trimmed || trimmed === '()' || trimmed === '(delivery instructions)') {
        if (line.type === 'parenthetical') {
          changeLineType(line.id, 'dialogue');
          return;
        } else if (line.type === 'character') {
          changeLineType(line.id, 'action');
          return;
        } else if (line.type === 'action') {
          changeLineType(line.id, 'scene');
          return;
        }
      }

      const newLineId = createId('sl');
      const newLine: ScriptLine = {
        id: newLineId,
        lineNumber: index + 2,
        text: '',
        type: nextType,
        // A new heading arrives unnumbered: the numbering regime gives it 3A
        // when locked, or its position when not (domain/script/numbering.ts).
        sceneNumber: nextType === 'scene' ? undefined : line.sceneNumber,
        isSceneHeading: nextType === 'scene',
      };

      const newLines = [...lines.slice(0, index + 1), newLine, ...lines.slice(index + 1)];
      setScriptLines(newLines);
      setActiveEditingLineId(newLineId);
      return;
    }

    if (e.key === 'Backspace' && !line.text) {
      if (lines.length <= 1) return;
      e.preventDefault();
      const prevLine = lines[index - 1];
      const filtered = removeLineOrOmit(lines, line.id);
      setScriptLines(filtered);
      if (prevLine) setActiveEditingLineId(prevLine.id);
      return;
    }
  };

  /**
   * Insert a new line directly after `afterLineId`.
   *
   * Enter inside a line's input does this for every editable line, but an
   * OMITTED scene heading has no input — it is a struck-through label with a
   * Restore button — so there was no way to start a scene directly after one.
   * With the omitted scene last in the script, "Add Scene" at the foot was the
   * only route; with one mid-script there was none at all.
   */
  const insertLineAfter = (afterLineId: string, type: ScriptElementType = 'scene') => {
    const index = lines.findIndex((line) => line.id === afterLineId);
    if (index === -1) return;
    const newLineId = createId('sl');
    const newLine: ScriptLine = {
      id: newLineId,
      lineNumber: index + 2,
      text: type === 'scene' ? 'INT. LOCATION - DAY' : '',
      type,
      // Headings arrive unnumbered so the regime numbers them; other lines
      // inherit the scene they now sit in.
      sceneNumber: type === 'scene' ? undefined : lines[index]?.sceneNumber,
      isSceneHeading: type === 'scene',
    };
    setScriptLines([...lines.slice(0, index + 1), newLine, ...lines.slice(index + 1)]);
    setActiveEditingLineId(newLineId);
  };

  /**
   * Where the AV script and the shot list disagree. Every shot should be
   * scripted; a row that is titles, graphics or stock is not a shot and says
   * so, so it is never counted as a gap (domain/script/avScript.ts).
   */
  const avCoverageReport = useMemo(
    () => avCoverage(avScriptRows || [], allShots),
    [avScriptRows, allShots],
  );

  /** The missing direction: a row for every shot that has none. */
  const addRowsForMissingShots = () => {
    const additions = rowsForMissingShots(
      avCoverageReport.missingShots,
      () => createId('av'),
      (shot) => {
        const full = allShots.find((candidate) => candidate.id === shot.id);
        return full?.framingDescription || [full?.shotSize, full?.movement].filter(Boolean).join(' · ');
      },
    );
    if (additions.length === 0) return;
    setAVScriptRows([...(avScriptRows || []), ...additions]);
  };

  const addBlankLineAtBottom = (type: ScriptElementType = 'scene') => {
    const newLineId = createId('sl');
    const last = lines[lines.length - 1];
    const defaultText = type === 'scene' ? 'INT. LOCATION - DAY' : type === 'character' ? 'CHARACTER' : '';
    const newLine: ScriptLine = {
      id: newLineId,
      lineNumber: lines.length + 1,
      text: defaultText,
      type,
      sceneNumber: type === 'scene' ? undefined : last?.sceneNumber,
      isSceneHeading: type === 'scene',
    };
    setScriptLines([...lines, newLine]);
    setActiveEditingLineId(newLineId);
  };

  const pendingLinkShot = useMemo(
    () => allShots.find((shot) => shot.id === scriptLinkShotId) || null,
    [allShots, scriptLinkShotId]
  );

  const unlinedShots = useMemo(() => {
    const lined = new Set(marks.map((mark) => mark.shotId));
    return allShots.filter((shot) => !lined.has(shot.id));
  }, [allShots, marks]);

  const linkExistingShot = (shotId: string) => {
    if (!effectiveRange || !shotId) return;
    linkShotToScriptRange(shotId, {
      startLineId: lines[effectiveRange.from].id,
      endLineId: lines[effectiveRange.to].id,
      startOffset: effectiveRange.startOffset,
      endOffset: effectiveRange.endOffset,
    });
    clearSelection();
  };

  const createShotFromSelection = () => {
    if (!effectiveRange) return;
    createShotFromScriptRange({
      startLineId: lines[effectiveRange.from].id,
      endLineId: lines[effectiveRange.to].id,
      startOffset: effectiveRange.startOffset,
      endOffset: effectiveRange.endOffset,
      sceneNumber: selectedSceneNumber,
      description: description.trim() || undefined,
      shotSize,
      text: effectiveRange.text,
    });
    clearSelection();
  };

  const setSquiggleFromSelection = () => {
    if (!selectedMark || !effectiveRange) return;
    updateScriptMark(selectedMark.id, {
      wavyStartLineId: lines[effectiveRange.from].id,
      wavyEndLineId: lines[effectiveRange.to].id,
      wavyStartOffset: effectiveRange.startOffset,
      wavyEndOffset: effectiveRange.endOffset,
    });
    clearSelection();
  };

  const extendSelectedMarkToSelection = () => {
    if (!selectedMark || !effectiveRange) return;
    const currentStart = indexById.get(selectedMark.startLineId) ?? 0;
    const currentEnd = indexById.get(selectedMark.endLineId) ?? lines.length - 1;
    const from = Math.min(currentStart, effectiveRange.from);
    const to = Math.max(currentEnd, effectiveRange.to);
    updateScriptMark(selectedMark.id, {
      startLineId: lines[from].id,
      endLineId: lines[to].id,
    });
    clearSelection();
  };

  const handleExtendMark = (markId: string, edge: 'start' | 'end', lineId: string) => {
    if (edge === 'start') {
      updateScriptMark(markId, { startLineId: lineId, startOffset: undefined });
    } else {
      updateScriptMark(markId, { endLineId: lineId, endOffset: undefined });
    }
  };

  const headerButton = `px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-colors ${
    isLight ? 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700' : 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200'
  }`;

  const barButton = `px-2 py-1 rounded border text-[10px] font-semibold flex items-center gap-1 transition-colors ${
    isLight ? 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700' : 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200'
  }`;

  return (
    <div className={`h-full flex flex-col ${isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}`}>
      <div className={`p-2 sm:p-2.5 border-b flex flex-col gap-2 ${isLight ? 'border-slate-200 bg-slate-50/80' : 'border-slate-800 bg-slate-950/60'}`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className={`flex items-center p-0.5 rounded-lg border ${isLight ? 'bg-slate-200/70 border-slate-300' : 'bg-slate-900 border-slate-700'}`}>
            <button
              onClick={() => handleTabSwitch('lined_coverage')}
              aria-pressed={activeTab === 'lined_coverage'}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'lined_coverage'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Lined Coverage</span>
            </button>
            <button
              onClick={() => handleTabSwitch('screenplay')}
              aria-pressed={activeTab === 'screenplay'}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'screenplay'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Write, format, and edit scenes (Hollywood Standard Courier)"
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>Screenplay Editor</span>
            </button>
            <button
              onClick={() => handleTabSwitch('av_script')}
              aria-pressed={activeTab === 'av_script'}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'av_script'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>AV Script (2-Column)</span>
            </button>
            <button
              onClick={() => setActiveTab('title_page')}
              aria-pressed={activeTab === 'title_page'}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'title_page'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="The screenplay's cover: title, credit, author, draft and contact"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Title Page</span>
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              aria-pressed={activeTab === 'reports'}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                activeTab === 'reports'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Live character and location breakdowns"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Reports</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <input
              ref={fileRef}
              className="hidden"
              type="file"
              accept=".txt,.fountain,.fdx,.spmd,text/plain,text/xml,application/xml"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) loadScript(file);
                event.target.value = '';
              }}
            />

            {activeTab === 'screenplay' && (
              <div className={`flex items-center rounded-lg border mr-1 ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>
                <button
                  onClick={() => setFountainViewMode('page')}
                  aria-pressed={fountainViewMode === 'page'}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-l-md ${
                    fountainViewMode === 'page' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Hollywood Standard 12pt Courier Page View"
                >
                  Page View
                </button>
                <button
                  onClick={() => setFountainViewMode('raw')}
                  aria-pressed={fountainViewMode === 'raw'}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-r-md flex items-center gap-1 ${
                    fountainViewMode === 'raw' ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                  title="Raw Fountain Syntax Markdown Code"
                >
                  <Code2 className="w-3 h-3" /> Fountain Code
                </button>
              </div>
            )}

            <button
              onClick={() => fileRef.current?.click()}
              className="px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-semibold flex items-center gap-1 shadow-sm"
              title="Import .fountain, .fdx or .txt screenplay"
            >
              <Upload className="w-3.5 h-3.5" /> Import
            </button>

            {activeTab === 'screenplay' && (
              <button onClick={exportFountainFile} className={headerButton} title="Download .fountain file">
                <Download className="w-3.5 h-3.5" /> Fountain
              </button>
            )}

            {activeTab === 'av_script' && (
              <button onClick={exportAVScriptCSV} className={headerButton} title="Export AV script to CSV">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            )}

            {activeTab === 'lined_coverage' && lines.length > 0 && (
              <button
                onClick={() => handleTabSwitch('screenplay')}
                className={headerButton}
                title="Switch to Screenplay Editor to write and edit scenes"
              >
                <PenTool className="w-3.5 h-3.5 text-violet-400" /> Edit Screenplay
              </button>
            )}

            {activeTab === 'screenplay' && lines.length > 0 && (
              <button
                onClick={() => handleTabSwitch('lined_coverage')}
                className={headerButton}
                title="Switch to Lined Coverage to draw camera coverage marks"
              >
                <Layers className="w-3.5 h-3.5 text-violet-400" /> Line Coverage
              </button>
            )}

            <button onClick={() => setPasteOpen((open) => !open)} className={headerButton} title="Paste screenplay or AV script text" aria-expanded={pasteOpen}>
              <ClipboardPaste className="w-3.5 h-3.5" /> Paste
            </button>

            {activeTab === 'reports' && lines.length > 0 && (
              <button
                onClick={() => openExportModal('scriptreports')}
                className={headerButton}
                title="Print the scene list, character report, location report and day-out-of-days"
              >
                <Printer className="w-3.5 h-3.5" /> Print reports
              </button>
            )}

            {activeTab !== 'reports' && activeTab !== 'title_page' && lines.length > 0 && (
              <button
                onClick={() => openExportModal(activeTab === 'av_script' ? 'avscript' : 'linedscript')}
                className={headerButton}
                title={activeTab === 'av_script' ? 'Print the AV script on its own' : 'Export / print formatted script'}
              >
                <Printer className="w-3.5 h-3.5" /> Print PDF
              </button>
            )}

            {activeTab === 'screenplay' && lines.length > 0 && (
              <button
                onClick={() => openExportModal('sides')}
                className={headerButton}
                title="Generate script sides: pick scenes (or a shooting day) and optionally one character"
              >
                <Scissors className="w-3.5 h-3.5" /> Sides
              </button>
            )}

            {activeTab !== 'reports' && activeTab !== 'title_page' && ((activeTab === 'av_script' ? (avScriptRows || []).length > 0 : lines.length > 0)) && (
              <button
                onClick={activeTab === 'av_script' ? handleClearAVScript : handleClearScreenplay}
                className="px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition-colors border-rose-800/40 bg-rose-950/20 hover:bg-rose-900/40 text-rose-400 hover:text-rose-300"
                title={activeTab === 'av_script' ? 'Clear AV script' : 'Clear screenplay'}
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </button>
            )}

            {/* The numbering regime (domain/script/numbering.ts). Locking is the
                moment a script's numbers become the ones every department
                refers to; unlocking renumbers, so it asks first. */}
            {activeTab === 'screenplay' && lines.length > 0 && (
              <button
                onClick={() => {
                  if (
                    sceneNumbersLocked &&
                    !window.confirm('Unlock scene numbers? Every scene is renumbered by position (1, 2, 3 …), so any breakdown, strip or call sheet that quotes a number may no longer match.')
                  ) return;
                  setSceneNumbersLocked(!sceneNumbersLocked);
                }}
                title={sceneNumbersLocked
                  ? 'Scene numbers are LOCKED production numbers: a scene added between 3 and 4 becomes 3A, an omitted scene keeps its number, a removed one leaves a gap. Click to unlock and renumber by position.'
                  : 'Scene numbers follow position and shift when scenes are added or removed. Lock them before breakdown and scheduling so every department refers to the same numbers.'}
                className={`h-7 px-2 rounded-lg border text-[10px] font-semibold flex items-center gap-1 ${
                  sceneNumbersLocked
                    ? isLight ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-amber-600/60 bg-amber-950/40 text-amber-300'
                    : isLight ? 'border-slate-300 bg-white text-slate-600' : 'border-slate-700 bg-slate-900 text-slate-300'
                }`}
              >
                {sceneNumbersLocked ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
                {sceneNumbersLocked ? 'Numbers locked' : 'Lock scene numbers'}
              </button>
            )}

            {activeTab !== 'reports' && activeTab !== 'title_page' && <div className={`flex items-center rounded-lg border ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>
              <button onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))} className="px-1.5 py-1.5" title="Smaller font" aria-label="Smaller font">
                <Minus className="w-3 h-3" />
              </button>
              <button
                onClick={() => setZoom(1)}
                title="Click to reset zoom to Fit Window (100%)"
                className="text-[10px] font-mono px-1 text-center hover:text-violet-400 opacity-80"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button onClick={() => setZoom((z) => Math.min(2.0, +(z + 0.1).toFixed(2)))} className="px-1.5 py-1.5" title="Larger font" aria-label="Larger font">
                <Plus className="w-3 h-3" />
              </button>
            </div>}
          </div>
        </div>

        {activeTab === 'screenplay' && fountainViewMode === 'page' && (
          <div className="flex items-center gap-1 overflow-x-auto py-1 border-t border-slate-700/30 text-[11px]">
            <span className="text-[10px] font-mono opacity-50 uppercase mr-1 flex-shrink-0">Format (Tab):</span>
            {(['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition'] as ScriptElementType[]).map((type) => {
              const info = ELEMENT_STYLES[type];
              const isCurrent = activeEditingLineId && lines.find((l) => l.id === activeEditingLineId)?.type === type;
              return (
                <button
                  key={type}
                  onClick={() => {
                    if (activeEditingLineId) {
                      changeLineType(activeEditingLineId, type);
                    } else {
                      addBlankLineAtBottom(type);
                    }
                  }}
                  className={`px-2 py-0.8 rounded border text-[10px] font-semibold whitespace-nowrap transition-all flex items-center gap-1 ${
                    isCurrent
                      ? 'bg-violet-600 text-white border-violet-400 shadow-sm'
                      : info.color
                  }`}
                >
                  <span>{info.label}</span>
                  {type === 'parenthetical' && <span className="opacity-70 text-[9px]">[Tab]</span>}
                </button>
              );
            })}
            <button
              onClick={() => addBlankLineAtBottom('scene')}
              className="ml-auto px-2 py-0.8 rounded bg-emerald-600/80 hover:bg-emerald-500 text-white font-semibold text-[10px] flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add Scene
            </button>
          </div>
        )}

        {pasteOpen && (
          <div className="mt-1 space-y-1.5">
            <textarea
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              rows={5}
              placeholder={
                activeTab === 'av_script'
                  ? 'SHOT 1\tEXT. SUNRISE - DRONE SHOT\tMUSIC: Upbeat electronic intro.\nSHOT 2\tMS - Marcus walks into lobby.\tMARCUS (V.O.): We are ready.'
                  : 'INT. LOFT - NIGHT\n\nJenna steps closer to the window.\n\nJENNA\n(whispering)\nStop it, Reggie!\n\nREGGIE\nI can\'t.'
              }
              className={`w-full rounded-lg border p-2 text-[11px] font-mono ${
                isLight ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'
              }`}
            />
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  if (!pasteText.trim()) return;
                  if (activeTab === 'av_script') {
                    const parsedAV = parseAVScriptText(pasteText);
                    setAVScriptRows(parsedAV);
                  } else {
                    importRaw(pasteText, 'Pasted Screenplay');
                  }
                  setPasteText('');
                  setPasteOpen(false);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-semibold"
              >
                Apply Script
              </button>
              <button onClick={() => setPasteOpen(false)} className={headerButton}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {activeTab === 'reports' && <ScriptReportsPanel lines={lines} isLight={isLight} />}
      {activeTab === 'title_page' && (
        <div className={`flex-1 overflow-auto custom-scrollbar ${isLight ? 'bg-slate-100' : 'bg-slate-950'}`}>
          <TitlePageEditor isLight={isLight} />
        </div>
      )}

      {activeTab === 'screenplay' && (
        <div ref={scrollRef} className={`flex-1 overflow-auto custom-scrollbar p-3 sm:p-6 ${isLight ? 'bg-slate-100' : 'bg-slate-950'}`}>
          {fountainViewMode === 'raw' ? (
            <div className="max-w-3xl mx-auto space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono text-[11px]">Fountain Syntax Editor (Plain text markdown)</span>
                <span className="text-[10px]">Auto-formats scene headings (INT/EXT), character cues, parentheticals `(beat)`</span>
              </div>
              <textarea
                value={rawFountainText}
                onChange={(e) => {
                  const val = e.target.value;
                  setRawFountainText(val);
                  const parsed = reconcileScriptLineIds(parseScreenplay(val, scriptTitle || 'Screenplay'), lines);
                  setScriptLines(parsed, { scriptText: val });
                }}
                rows={24}
                className={`w-full rounded-xl border p-4 text-xs font-mono leading-relaxed outline-none shadow-sm ${
                  isLight ? 'bg-white border-slate-300 text-slate-900 focus:border-violet-500' : 'bg-slate-900 border-slate-700 text-slate-100 focus:border-violet-500'
                }`}
                placeholder="INT. COFFEE SHOP - DAY..."
              />
            </div>
          ) : (
            <div className="max-w-3xl mx-auto shadow-2xl rounded-xl border border-slate-700/40 p-6 sm:p-12 min-h-[850px] bg-slate-900 text-slate-100 font-mono">
              <div className="border-b border-slate-800 pb-4 mb-6 flex items-center justify-between text-xs opacity-60">
                <span className="uppercase tracking-wider font-bold">{scriptTitle || 'UNTITLED SCREENPLAY'}</span>
                <span>HOLLYWOOD STANDARD COURIER 12PT</span>
              </div>

              {lines.length === 0 ? (
                <div className="text-center py-16 space-y-4">
                  <Clapperboard className="w-10 h-10 mx-auto text-slate-500" />
                  <div>
                    <p className="text-sm font-bold text-slate-200">Screenplay is Empty</p>
                    <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                      Write your scenes with standard Hollywood 12pt Courier formatting or import an existing file.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 flex-wrap pt-2">
                    <button
                      onClick={handleStartBlankScreenplay}
                      className="px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold shadow-sm"
                    >
                      + Write First Scene Heading
                    </button>
                    <button
                      onClick={() => fileRef.current?.click()}
                      className={headerButton}
                    >
                      <Upload className="w-3.5 h-3.5" /> Import File
                    </button>
                    <button
                      onClick={() => setPasteOpen(true)}
                      className={headerButton}
                    >
                      <ClipboardPaste className="w-3.5 h-3.5" /> Paste Text
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  {lines.map((line, idx) => {
                    const style = ELEMENT_STYLES[line.type || 'action'];
                    const isSelected = activeEditingLineId === line.id;
                    return (
                      <div
                        key={line.id}
                        onClick={() => setActiveEditingLineId(line.id)}
                        className={`group relative flex items-center gap-2 rounded px-2 py-0.5 transition-colors ${
                          isSelected ? 'bg-violet-950/40 ring-1 ring-violet-500/40' : 'hover:bg-slate-800/30'
                        }`}
                      >
                        <div className="w-16 flex-shrink-0 opacity-0 group-hover:opacity-80 transition-opacity">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleParentheticalOnLine(line.id);
                            }}
                            title="Click or press Tab to toggle parenthetical delivery"
                            className="text-[9px] px-1 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-sky-300"
                          >
                            {line.type === 'parenthetical' ? '(Delivery)' : style.shortcut}
                          </button>
                        </div>

                        <div className={`flex-1 ${style.indentClass}`}>
                          {line.type === 'scene' && line.omitted ? (
                            <div className="flex items-center justify-between gap-2 font-bold text-slate-500">
                              <span className="uppercase tracking-widest line-through decoration-rose-500/70 decoration-2">
                                {omittedSceneLabel(line.sceneNumber)}
                              </span>
                              <span className="text-[10px] font-normal normal-case tracking-normal text-slate-500 truncate" title={line.text}>
                                was: {line.text}{line.omittedBody?.length ? ` · ${line.omittedBody.length} lines parked` : ''}
                              </span>
                              <span className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setScriptLines(restoreScene(lines, line.id));
                                  }}
                                  className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-600/50 text-emerald-300 hover:bg-emerald-900/40 normal-case tracking-normal"
                                  title={`Restore this scene with its ${line.omittedBody?.length ?? 0} parked line(s)`}
                                >
                                  Restore
                                </button>
                                {/* An omitted heading has no input to press Enter
                                    in, so it carries its own way to start the
                                    next scene. */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    insertLineAfter(line.id, 'scene');
                                  }}
                                  className="text-[10px] px-1.5 py-0.5 rounded border border-amber-600/50 text-amber-300 hover:bg-amber-900/40 normal-case tracking-normal"
                                  title="Add a new scene directly after this omitted one"
                                >
                                  + Scene
                                </button>
                              </span>
                            </div>
                          ) : line.type === 'scene' ? (
                            <div className="flex items-center justify-between font-bold text-amber-300">
                              {/* Both margins, like a production draft. The left
                                  one mirrors the right, which is the one you
                                  edit when the numbers are locked. */}
                              {line.sceneNumber && (
                                <span aria-hidden className="mr-2 shrink-0 font-mono text-[10px] text-amber-500 opacity-70">
                                  {line.sceneNumber}
                                </span>
                              )}
                              <div className="relative flex-1">
                                <input
                                  autoFocus={isSelected}
                                  value={line.text}
                                  onChange={(e) => {
                                    updateLine(line.id, e.target.value);
                                    setSuggest({ lineId: line.id, kind: 'location' });
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Escape') setSuggest(null);
                                    handleLineKeyDown(e, line, idx);
                                  }}
                                  // The suggestion buttons keep focus with
                                  // preventDefault on mousedown, so closing on
                                  // blur never eats the click that picks one.
                                  onBlur={() => setSuggest(null)}
                                  className="w-full bg-transparent outline-none uppercase font-bold text-amber-300 focus:bg-amber-950/20 px-1 rounded"
                                  placeholder="INT. LOCATION - TIME"
                                />
                                {suggest?.lineId === line.id && activeSuggestions.kind === 'location' && activeSuggestions.items.length > 0 && (
                                  <ul className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-amber-700/50 bg-slate-900 shadow-xl overflow-hidden text-[11px]">
                                    {activeSuggestions.items.map((loc) => (
                                      <li key={loc.name}>
                                        <button
                                          type="button"
                                          onMouseDown={(e) => e.preventDefault()}
                                          onClick={() => {
                                            updateLine(line.id, replaceSceneHeadingLocation(line.text || '', loc.name));
                                            setSuggest(null);
                                          }}
                                          className="w-full text-left px-2 py-1 uppercase font-bold text-amber-300 hover:bg-amber-950/60"
                                        >
                                          {loc.name}
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              {/* The set this heading names, linked to the project
                                  location that holds its address — the link the call
                                  sheet needs, offered where the set is written. */}
                              {parseSceneHeading(line.text || '').location && (
                                <span className="ml-2 shrink-0 font-normal normal-case tracking-normal">
                                  <SetLocationLink setName={parseSceneHeading(line.text || '').location as string} isLight={isLight} compact />
                                </span>
                              )}
                              {sceneNumbersLocked ? (
                                <input
                                  value={line.sceneNumber ?? ''}
                                  onChange={(e) => setScriptLines(lines.map((l) => (l.id === line.id ? { ...l, sceneNumber: e.target.value.toUpperCase() } : l)))}
                                  aria-label="Production scene number"
                                  title="Production scene number — locked, so it never shifts; edit it by hand here"
                                  className={`w-12 ml-2 text-[10px] text-center font-mono rounded border outline-none ${isLight ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-amber-700/60 bg-amber-950/40 text-amber-300'}`}
                                />
                              ) : line.sceneNumber ? (
                                <span className="text-[10px] text-amber-500 font-mono ml-2 opacity-70" title="Numbered by position; lock the numbers before scheduling">
                                  #{line.sceneNumber}#
                                </span>
                              ) : null}
                            </div>
                          ) : line.type === 'parenthetical' ? (
                            <div className="text-sky-300 italic flex items-center">
                              <input
                                autoFocus={isSelected}
                                value={line.text}
                                onChange={(e) => updateLine(line.id, e.target.value)}
                                onKeyDown={(e) => handleLineKeyDown(e, line, idx)}
                                className="w-full bg-transparent outline-none italic text-sky-300 focus:bg-sky-950/20 px-1 rounded"
                                placeholder="(whispering / beat / delivery)"
                              />
                            </div>
                          ) : line.type === 'character' ? (
                            <div className="relative">
                              <input
                                autoFocus={isSelected}
                                value={line.text}
                                onChange={(e) => {
                                  updateLine(line.id, e.target.value);
                                  setSuggest({ lineId: line.id, kind: 'character' });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') setSuggest(null);
                                  handleLineKeyDown(e, line, idx);
                                }}
                                onBlur={() => setSuggest(null)}
                                className="w-full bg-transparent outline-none uppercase font-bold text-emerald-300 focus:bg-emerald-950/20 px-1 rounded"
                                placeholder="CHARACTER NAME"
                              />
                              {suggest?.lineId === line.id && activeSuggestions.kind === 'character' && activeSuggestions.items.length > 0 && (
                                <ul className="absolute z-20 left-0 right-0 mt-1 rounded-lg border border-emerald-700/50 bg-slate-900 shadow-xl overflow-hidden text-[11px]">
                                  {activeSuggestions.items.map((c) => (
                                    <li key={c.id}>
                                      <button
                                        type="button"
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => {
                                          updateLine(line.id, c.canonicalName);
                                          setSuggest(null);
                                        }}
                                        className="w-full text-left px-2 py-1 uppercase font-bold text-emerald-300 hover:bg-emerald-950/60"
                                      >
                                        {c.canonicalName}
                                        {(c.aliases?.length ?? 0) > 0 && (
                                          <span className="ml-2 opacity-50 font-normal normal-case">aka {c.aliases?.[0]}</span>
                                        )}
                                      </button>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ) : (
                            <input
                              autoFocus={isSelected}
                              value={line.text}
                              onChange={(e) => updateLine(line.id, e.target.value)}
                              onKeyDown={(e) => handleLineKeyDown(e, line, idx)}
                              className={`w-full bg-transparent outline-none focus:bg-slate-800/40 px-1 rounded ${
                                line.type === 'dialogue' ? 'text-slate-100' : 'text-slate-300'
                              }`}
                              placeholder={line.type === 'dialogue' ? 'Spoken dialogue...' : 'Action description...'}
                            />
                          )}
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setScriptLines(removeLineOrOmit(lines, line.id));
                          }}
                          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 p-1 text-slate-500 hover:text-rose-400"
                          title={
                            line.type === 'scene'
                              ? line.omitted
                                ? 'Delete the omitted scene permanently'
                                : 'Omit scene (keeps the number as OMITTED; delete again to remove)'
                              : 'Delete line'
                          }
                          aria-label={
                            line.type === 'scene'
                              ? line.omitted
                                ? 'Delete the omitted scene permanently'
                                : 'Omit scene (keeps the number as OMITTED; delete again to remove)'
                              : 'Delete line'
                          }
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'av_script' && (
        <div className={`flex-1 overflow-auto custom-scrollbar p-3 sm:p-4 ${isLight ? 'bg-slate-100' : 'bg-slate-950'}`}>
          <div className="max-w-6xl mx-auto space-y-3">
            <div className={`p-3 rounded-xl border flex items-center justify-between flex-wrap gap-2 ${
              isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'
            }`}>
              <div className="flex items-center gap-2.5">
                <Tv className="w-5 h-5 text-violet-400 flex-shrink-0" />
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider">Audio-Visual (AV) 2-Column Script</h3>
                  <p className="text-[11px] text-slate-400">
                    Discrete shot-by-shot script for commercials, corporate videos, and multi-cam shoots. Every row syncs directly with floor plan cameras.
                  </p>
                </div>
              </div>
              <button
                onClick={() => addAVScriptRow()}
                className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Add AV Shot
              </button>
            </div>

            <div className={`rounded-xl border shadow-sm overflow-hidden ${
              isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-800'
            }`}>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={`border-b text-[10px] font-bold uppercase tracking-wider ${
                    isLight ? 'bg-slate-100 text-slate-600 border-slate-300' : 'bg-slate-950/80 text-slate-400 border-slate-800'
                  }`}>
                    <th className="py-2.5 px-3 w-14 text-center">#</th>
                    <th className="py-2.5 px-2 w-28 text-center">Board</th>
                    <th className="py-2.5 px-3 w-48">Shot Name / Size</th>
                    <th className="py-2.5 px-3 w-1/2">VIDEO (Visuals, Camera & Lighting)</th>
                    <th className="py-2.5 px-3 w-1/2">AUDIO (VO, Dialogue & SFX)</th>
                    <th className="py-2.5 px-2 w-16 text-center">Time</th>
                    <th className="py-2.5 px-3 w-32 text-center">Shot Sync</th>
                    <th className="py-2.5 px-2 w-12 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50 text-xs">
                  {avScriptRows.map((row) => (
                    <tr
                      key={row.id}
                      className={`group transition-colors ${
                        row.linkedShotId === selectedShotId
                          ? 'bg-violet-950/40 ring-1 ring-violet-500/30'
                          : 'hover:bg-slate-800/30'
                      }`}
                    >
                      <td className="py-2 px-2 text-center font-mono font-bold text-slate-400">
                        {/* A linked row shows its SHOT's number and cannot drift
                            from it. Editing numbers belongs to the shot list,
                            which is also what renumbers them; a stored copy here
                            is how "shot 2" came to mean nothing to "shot 1/2". */}
                        {row.linkedShotId ? (
                          <span
                            className="block w-full text-center text-emerald-300"
                            title="From the linked shot — renumber in the shot list"
                          >
                            {avRowNumber(row, allShots)}
                          </span>
                        ) : (
                          <input
                            value={row.shotNumber}
                            onChange={(e) => updateAVScriptRow(row.id, { shotNumber: e.target.value })}
                            aria-label="Row number"
                            className="w-10 text-center bg-transparent border border-transparent hover:border-slate-700 focus:border-violet-500 rounded outline-none"
                          />
                        )}
                      </td>

                      <td className="py-2 px-2">
                        <AVStoryboardCell
                          row={row}
                          linkedShot={row.linkedShotId ? allShots.find((shot) => shot.id === row.linkedShotId) : undefined}
                          isLight={isLight}
                          onChange={(updates) => updateAVScriptRow(row.id, updates)}
                        />
                      </td>

                      <td className="py-2 px-3 space-y-1">
                        <input
                          value={row.shotName || ''}
                          onChange={(e) => updateAVScriptRow(row.id, { shotName: e.target.value })}
                          placeholder="e.g. Master Wide"
                          className="w-full bg-transparent font-semibold text-slate-100 border border-transparent hover:border-slate-700 focus:border-violet-500 rounded px-1 py-0.5 outline-none"
                        />
                        <select
                          value={row.shotSize || 'MS'}
                          onChange={(e) => updateAVScriptRow(row.id, { shotSize: e.target.value as ShotSize })}
                          className="text-[10px] rounded border border-slate-700 bg-slate-950 text-amber-400 px-1 py-0.5 outline-none"
                        >
                          {SHOT_SIZES.map((size) => (
                            <option key={size} value={size}>
                              {size}
                            </option>
                          ))}
                        </select>
                      </td>

                      <td className="py-2 px-3">
                        <textarea
                          value={row.video}
                          onChange={(e) => updateAVScriptRow(row.id, { video: e.target.value })}
                          rows={3}
                          placeholder="Describe visual action, camera move, framing..."
                          className="w-full rounded border border-slate-800/80 bg-slate-950/60 focus:bg-slate-950 focus:border-violet-500 p-1.5 text-xs text-slate-200 outline-none leading-relaxed custom-scrollbar resize-y"
                        />
                      </td>

                      <td className="py-2 px-3">
                        <textarea
                          value={row.audio}
                          onChange={(e) => updateAVScriptRow(row.id, { audio: e.target.value })}
                          rows={3}
                          placeholder="VOICE, Dialogue, (delivery), SFX, Music BGM..."
                          className="w-full rounded border border-slate-800/80 bg-slate-950/60 focus:bg-slate-950 focus:border-violet-500 p-1.5 text-xs text-sky-200 outline-none leading-relaxed custom-scrollbar resize-y font-mono"
                        />
                      </td>

                      <td className="py-2 px-2 text-center">
                        <div className="flex items-center justify-center gap-0.5 font-mono text-xs">
                          <input
                            type="number"
                            min={1}
                            max={600}
                            value={row.durationSec || ''}
                            onChange={(e) => updateAVScriptRow(row.id, { durationSec: parseInt(e.target.value) || undefined })}
                            placeholder="5"
                            className="w-10 text-center bg-transparent border border-slate-700 rounded px-0.5 py-0.5 outline-none"
                          />
                          <span className="text-[10px] text-slate-500">s</span>
                        </div>
                      </td>

                      <td className="py-2 px-3 text-center">
                        {row.linkedShotId ? (
                          <div className="flex items-center justify-center gap-1">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                              Linked
                            </span>
                            <button
                              onClick={() => selectShot(row.linkedShotId!)}
                              className="text-[10px] text-violet-400 hover:underline"
                              title="Select linked camera on floor plan"
                            >
                              View
                            </button>
                          </div>
                        ) : row.noShot ? (
                          <button
                            onClick={() => updateAVScriptRow(row.id, { noShot: undefined })}
                            className="px-2 py-0.5 rounded-full border border-slate-600 text-slate-400 text-[10px] font-bold mx-auto block"
                            title="Marked as needing no camera — titles, graphics, stock. Click to treat it as a shot again."
                          >
                            No camera
                          </button>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <button
                              onClick={() => syncAVRowToShot(row.id)}
                              className="px-2.5 py-1 rounded bg-sky-600/80 hover:bg-sky-500 text-white text-[10px] font-semibold flex items-center gap-1 shadow-sm"
                              title="Create camera element on floor plan and link to this AV shot"
                            >
                              <Video className="w-3 h-3" /> Sync Cam
                            </button>
                            {/* Titles, graphics and stock are real AV rows that
                                will never be a camera; saying so once stops the
                                coverage line asking for ever. */}
                            <button
                              onClick={() => updateAVScriptRow(row.id, { noShot: true })}
                              className="text-[9px] text-slate-500 hover:text-slate-300 underline"
                              title="Titles, graphics, stock footage — this row needs no camera"
                            >
                              needs no camera
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="py-2 px-2 text-center">
                        <button
                          onClick={() => deleteAVScriptRow(row.id)}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 opacity-60 hover:opacity-100"
                          title="Delete AV row"
                          aria-label="Delete AV row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className={`p-2.5 border-t flex items-center justify-between ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-800'
              }`}>
                <button
                  onClick={() => addAVScriptRow()}
                  className="px-3 py-1 rounded-lg bg-violet-600/80 hover:bg-violet-600 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Next Shot
                </button>
                <span className="text-[11px] text-slate-500 font-mono">
                  {avScriptRows.length} total shots · {avScriptRows.reduce((acc, r) => acc + (r.durationSec || 0), 0)}s est. runtime
                  {/* The AV script and the shot list describe the same shoot;
                      this says where they disagree, and fills the gap in one
                      press. Rows marked "needs no camera" are never counted. */}
                  {avCoverageReport.missingShots.length > 0 && (
                    <>
                      {' · '}
                      <button
                        onClick={addRowsForMissingShots}
                        className="text-amber-400 hover:text-amber-300 underline font-semibold"
                        title={avCoverageReport.missingShots.map((shot) => `${shot.shotNumber} ${shot.name ?? ''}`.trim()).join(', ')}
                      >
                        {avCoverageReport.missingShots.length} shot{avCoverageReport.missingShots.length === 1 ? '' : 's'} not in the AV script — add {avCoverageReport.missingShots.length === 1 ? 'it' : 'them'}
                      </button>
                    </>
                  )}
                  {avCoverageReport.danglingRows.length > 0 && (
                    <span className="text-slate-500">
                      {' · '}{avCoverageReport.danglingRows.length} row{avCoverageReport.danglingRows.length === 1 ? '' : 's'} whose shot was deleted
                    </span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'lined_coverage' && (
        <>
          {pendingLinkShot && (
            <div
              className={`px-2.5 py-2 border-b flex items-center justify-between gap-2 ${
                isLight ? 'bg-violet-50 border-violet-200 text-violet-900' : 'bg-violet-950/60 border-violet-800 text-violet-100'
              }`}
            >
              <p className="text-[11px] leading-snug">
                <span className="font-bold">Shot {pendingLinkShot.shotNumber}</span> — highlight the part of the screenplay
                it covers{effectiveRange ? ', then press Line here.' : '.'}
              </p>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {effectiveRange && (
                  <button
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => linkExistingShot(pendingLinkShot.id)}
                    className="px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-semibold"
                  >
                    Line here
                  </button>
                )}
                <button
                  onClick={cancelScriptLinking}
                  title="Cancel"
                  aria-label="Cancel"
                  className="p-1 rounded opacity-70 hover:opacity-100"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          <div ref={scrollRef} className={`flex-1 overflow-auto custom-scrollbar ${isLight ? 'bg-slate-100' : 'bg-slate-950'}`}>
            {lines.length === 0 ? (
              <div className={`m-4 p-8 text-center border border-dashed rounded-xl ${isLight ? 'border-slate-300 bg-white' : 'border-slate-800 bg-slate-900/60'}`}>
                <FileText className="w-10 h-10 mx-auto mb-3 text-slate-500" />
                <p className="text-sm font-bold text-slate-200">No Screenplay Loaded</p>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-4">
                  Import an existing screenplay (.fountain, .fdx, .txt) or write scenes directly. It will be rendered in Hollywood format for visual coverage lining.
                </p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <button
                    onClick={handleStartBlankScreenplay}
                    className="px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                  >
                    <PenTool className="w-3.5 h-3.5" />
                    <span>Write Blank Screenplay</span>
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className={headerButton}
                  >
                    <Upload className="w-3.5 h-3.5" /> Import File
                  </button>
                  <button
                    onClick={() => setPasteOpen(true)}
                    className={headerButton}
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" /> Paste Text
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3 sm:p-5 flex justify-center w-full min-h-full">
                <div className="w-full max-w-5xl">
                  <LinedScriptPage
                  lines={lines}
                  marks={marks}
                  shots={allShots}
                  fontSize={fontSize}
                  isLight={isLight}
                  showShotSize={displaySettings.showShotSizeInScript !== false}
                  selection={effectiveRange}
                  selectedShotId={selectedShotId}
                  breakdownItems={breakdownItems}
                  highlightedBreakdownItemId={highlightedBreakdownItemId}
                  onSelectBreakdownItem={setHighlightedBreakdownItemId}
                  onLinePointerDown={handleLinePointerDown}
                  onSelectMark={(mark) => {
                    const owner = setupIdForMark(mark.id);
                    if (owner && owner !== activeSetup.id) setActiveSetupId(owner);
                    selectShot(mark.shotId);
                  }}
                  onExtendMark={handleExtendMark}
                  onDeleteMark={(markId) => deleteScriptMark(markId, { deleteShot: true })}
                  registerLineRefs={(refs) => {
                    lineRefs.current = refs;
                  }}
                />
                </div>
              </div>
            )}
          </div>

          {selectedMark && (
            <div className={`border-t p-2 space-y-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/70'}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="px-1.5 py-0.5 rounded-full border text-[10px] font-bold"
                  style={{ borderColor: selectedMark.color, color: selectedMark.color }}
                >
                  {selectedShot?.shotNumber || selectedMark.label}
                </span>
                <input
                  value={selectedShot?.framingDescription ?? selectedMark.description ?? ''}
                  onChange={(event) => setLiningDescription(selectedMark.id, event.target.value)}
                  placeholder="Description shown on the lining (e.g. CU Jenna)"
                  className={`flex-1 min-w-[10rem] rounded-lg border px-2 py-1.5 text-[11px] ${
                    isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                  }`}
                />
                <button
                  onClick={() => deleteScriptMark(selectedMark.id, { deleteShot: false })}
                  title="Remove the lining but keep the shot"
                  className={barButton}
                >
                  <Trash2 className="w-3 h-3" /> Unline
                </button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => updateScriptMark(selectedMark.id, { continuesNext: !selectedMark.continuesNext })}
                  title="Arrowhead: the shot carries on past the bottom of the page"
                  className={`${barButton} ${selectedMark.continuesNext ? 'bg-sky-600 text-white border-sky-500' : ''}`}
                >
                  <ArrowDown className="w-3 h-3" /> Continues next page
                </button>
                <button
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={setSquiggleFromSelection}
                  disabled={!effectiveRange}
                  title="Draw the highlighted stretch as a squiggle (subject out of frame)"
                  className={`${barButton} ${effectiveRange ? '' : 'opacity-40 cursor-not-allowed'}`}
                >
                  <Waves className="w-3 h-3" /> Squiggle selection
                </button>
                {(selectedMark.wavyStartLineId || selectedMark.wavyEndLineId) && (
                  <button
                    onClick={() =>
                      updateScriptMark(selectedMark.id, {
                        wavyStartLineId: undefined,
                        wavyEndLineId: undefined,
                        wavyStartOffset: undefined,
                        wavyEndOffset: undefined,
                      })
                    }
                    className={barButton}
                    title="Remove the squiggle"
                  >
                    <X className="w-3 h-3" /> Clear squiggle
                  </button>
                )}
                <button
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={extendSelectedMarkToSelection}
                  disabled={!effectiveRange}
                  title="Extend this lining so it also covers the highlighted text"
                  className={`${barButton} ${effectiveRange ? '' : 'opacity-40 cursor-not-allowed'}`}
                >
                  <Scissors className="w-3 h-3" /> Extend to selection
                </button>
                <span className="text-[9px] opacity-55">or drag the round handles on the line</span>
              </div>
            </div>
          )}

          {effectiveRange && (
            <div className={`border-t p-2 space-y-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-slate-950/70'}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold flex items-center gap-1.5 min-w-0">
                  <Scissors className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                  <span className="truncate">
                    {effectiveRange.text
                      ? `“${effectiveRange.text.replace(/\s+/g, ' ').trim().slice(0, 42)}${
                          effectiveRange.text.trim().length > 42 ? '…' : ''
                        }”`
                      : `${effectiveRange.to - effectiveRange.from + 1} line${
                          effectiveRange.to === effectiveRange.from ? '' : 's'
                        } selected`}
                  </span>
                  {selectedSceneNumber && (
                    <span className="px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-500 text-[10px] font-mono">
                      Scene {selectedSceneNumber}
                    </span>
                  )}
                </p>
                <button onClick={clearSelection} className="p-1 rounded opacity-60 hover:opacity-100" title="Clear selection" aria-label="Clear selection">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Description (e.g. CU Jenna)"
                  className={`flex-1 min-w-[9rem] rounded-lg border px-2 py-1.5 text-[11px] ${
                    isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                  }`}
                />
                <select
                  value={shotSize}
                  onChange={(event) => setShotSize(event.target.value as ShotSize)}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] ${
                    isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
                  }`}
                >
                  {SHOT_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                <button
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={createShotFromSelection}
                  title="Create a new shot (with its own camera) covering the highlighted text"
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-semibold flex items-center gap-1"
                >
                  <Video className="w-3.5 h-3.5" /> Make Shot
                </button>
                {unlinedShots.length > 0 && (
                  <select
                    value=""
                    onMouseDown={(event) => event.stopPropagation()}
                    onChange={(event) => linkExistingShot(event.target.value)}
                    title="Line a shot that already exists in the shot list over the highlighted text"
                    className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${
                      isLight ? 'bg-white border-slate-300 text-slate-700' : 'bg-slate-900 border-slate-700 text-slate-200'
                    }`}
                  >
                    <option value="">Line existing shot…</option>
                    {unlinedShots.map((shot) => (
                      <option key={shot.id} value={shot.id}>
                        {shot.shotNumber} — {(shot.name || '').slice(0, 40)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <BreakdownTagControl
                  lineIds={selectedLineIds}
                  ranges={selectedRanges}
                  selectedText={effectiveRange.text}
                  isLight={isLight}
                />
              </div>

              {/* What is already tagged here, and the way back out. Without
                  this the only place to see a tag was the elements list, which
                  does not say which words carry it. */}
              {taggedInSelection.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className={`text-[10px] uppercase tracking-wider font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Tagged here
                  </span>
                  {taggedInSelection.map((item) => (
                    <span
                      key={item.id}
                      title={`${breakdownCategoryLabel(item.category)} — click the cross to untag these lines`}
                      onMouseEnter={() => setHighlightedBreakdownItemId(item.id)}
                      onMouseLeave={() => setHighlightedBreakdownItemId(null)}
                      className={`inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-full border text-[10px] font-semibold ${
                        isLight ? 'bg-white' : 'bg-slate-900'
                      }`}
                      style={{ borderColor: breakdownCategoryTint(item.category), color: breakdownCategoryTint(item.category) }}
                    >
                      {item.name}
                      <button
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => untagFromSelection(item.id)}
                        title={`Untag “${item.name}” from the highlighted lines (the element itself stays)`}
                        aria-label={`Untag ${item.name}`}
                        className="p-0.5 rounded-full opacity-70 hover:opacity-100 hover:bg-rose-500/20"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {lines.length > 0 && (
            <div className={`px-2.5 py-1.5 border-t flex items-center justify-between text-[10px] ${
              isLight ? 'border-slate-200 text-slate-600' : 'border-slate-800 text-slate-400'
            }`}>
              <span>
                {lines.length} lines · {marks.length} lined shot{marks.length === 1 ? '' : 's'}
              </span>
              {marks.length > 0 && (
                <button
                  onClick={() => {
                    const last = marks[marks.length - 1];
                    selectShot(last.shotId);
                    lineRefs.current.get(last.startLineId)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
                  }}
                  className="hover:underline"
                >
                  Jump to last lining
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
