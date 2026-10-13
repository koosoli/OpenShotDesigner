import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ViewSwitcher } from '../common/ViewSwitcher';
import { serializeToFdx } from '../../domain/script/fdxExport';
import { cachedScriptBreakdown } from '../../domain/script/breakdownCache';
import {
  ArrowDown,
  BarChart3,
  Clapperboard,
  ClipboardPaste,
  Code2,
  Download,
  FileText,
  GitCompareArrows,
  Layers,
  Lock,
  LockOpen,
  Minus,
  PenTool,
  Plus,
  Scissors,
  Trash2,
  Tv,
  Upload,
  Video,
  Waves,
  X,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { SceneSetup, ScriptElementType, ScriptFormatMode, ScriptLine, ShotSize } from '../../types';
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
  sceneHeadingLocationQuery,
  suggestCharacters,
  suggestLocations,
} from '../../domain/script/logic';
import {
  avRowNumber,
  breakdownCategoryLabel,
  breakdownCategoryTint,
  breakdownItemsForLines,
  compareScriptRevisions,
  deriveLineHighlights,
  fdxTagLineIds,
  omittedSceneLabel,
  parseFdxTags,
  reconcileScriptLineIds,
  removeLineOrOmit,
  restoreScene,
  tagBreakdownItem,
  untagScriptLine,
} from '../../domain/script';
import type { BreakdownSourceRange, HighlightMode, ScriptRevisionComparison } from '../../domain/script';
import { ScriptHighlightBar } from './ScriptHighlightBar';
import {
  addScriptRevisionCommand,
  addSetupsCommand,
  setCharacterColorCommand,
  setScriptPageLockCommand,
  setScriptRevisionColorCommand,
  updateBreakdownItemsCommand,
} from '../../domain/commands';
import { lockPages, pageLabels } from '../../domain/script/pageLock';
import { REVISION_COLORS, currentRevisionColor, markRevisedLines, revisionColorAt } from '../../domain/script/revisionColors';
import { readUiPref, writeUiPref } from '../../utils/uiPrefs';
import { setupForScriptScene } from '../../utils/setupFromScene';
import { SceneHeadingInput } from './SceneHeadingInput';
import { SuggestionList, suggestionKeyAction, type Suggestion } from './SuggestionList';
import {
  CUE_EXTENSIONS,
  PARENTHETICALS,
  SHOT_CALLS,
  TRANSITIONS,
  completeCueExtension,
  cueExtensionQuery,
  customTimesIn,
  matchingPresets,
  splitCue,
  toggleCueExtension,
  withHeadingLocation,
} from '../../domain/script/sceneHeadingParts';
import { AVScriptView, SHOT_SIZES } from './AVScriptView';
import { ScriptReportsPanel } from './ScriptReportsPanel';
import { TitlePageEditor } from './TitlePageEditor';
import { SetLocationLink } from '../locations/SetLocationLink';
import { createId } from '../../domain/ids';
import { BreakdownTagControl } from './BreakdownTagControl';
import { downloadCsv, downloadText, safeFileName } from '../../utils/download';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';
import { PdfExportButton } from '../common/PdfExportButton';
import { useDialogs } from '../dialog/DialogProvider';

type ScriptWorkspaceView = ScriptFormatMode | 'reports' | 'title_page';


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
/** What a line's suggestion list offers: each item knows the text it would leave on the line. */
interface LineSuggestions {
  lineId: string;
  label: string;
  tone: 'amber' | 'emerald' | 'sky' | 'slate';
  uppercase: boolean;
  items: Array<Suggestion & { apply: string }>;
}

/** Preset lists offered on transition, shot and parenthetical lines. */
const LINE_PRESETS: Partial<Record<ScriptElementType, { presets: readonly string[]; label: string; tone: LineSuggestions['tone'] }>> = {
  transition: { presets: TRANSITIONS, label: 'Transitions', tone: 'slate' },
  shot: { presets: SHOT_CALLS, label: 'Shot calls', tone: 'slate' },
  parenthetical: { presets: PARENTHETICALS, label: 'Parentheticals', tone: 'sky' },
};

export const ScriptPanel: React.FC = () => {
  const { activeSetup, scriptLines, scriptTitle, allScriptMarks, allShots, setupIdForMark, setActiveSetupId, selectedShotId, selectShot, createShotFromScriptRange, linkShotToScriptRange, scriptLinkShotId, cancelScriptLinking, updateScriptMark, setLiningDescription, deleteScriptMark, setScriptLines, setSceneNumbersLocked, avScriptRows, setAVScriptRows, scriptFormatMode, setScriptFormatMode, displaySettings, project, runCommand } = useFloorPlan();
  const { openExportModal, theme } = useWorkspaceUI();
  const { confirm } = useDialogs();

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
  const [pendingRevision, setPendingRevision] = useState<{
    raw: string;
    name: string;
    comparison: ScriptRevisionComparison;
  } | null>(null);

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
  /** Times of day this screenplay already uses beyond the presets ("LATE AFTERNOON"). */
  const scriptTimesOfDay = useMemo(
    () => customTimesIn(lines.filter((line) => line.type === 'scene').map((line) => line.text || '')),
    [lines],
  );
  const [suggest, setSuggest] = useState<{ lineId: string; kind: 'character' | 'location' | 'preset' } | null>(null);
  const [suggestIndex, setSuggestIndex] = useState(0);
  /** Open (or refresh) the suggestions for a line after a typed change. */
  const openSuggest = (lineId: string, kind: 'character' | 'location' | 'preset') => {
    setSuggest({ lineId, kind });
    setSuggestIndex(0);
  };
  // The list belongs to the line being edited. Without this it kept pointing
  // at the line it was opened on: pressing Enter to start an action line left
  // the location suggestions hanging under the scene heading above, with no
  // way to dismiss them short of Escape on a field no longer focused.
  const lineSuggestions = useMemo((): LineSuggestions | null => {
    if (!suggest || suggest.lineId !== activeEditingLineId) return null;
    const line = lines.find((l) => l.id === suggest.lineId);
    if (!line) return null;
    const text = line.text || '';
    let list: LineSuggestions;
    if (suggest.kind === 'character') {
      const extensionQuery = cueExtensionQuery(text);
      list = extensionQuery !== null
        ? {
            lineId: line.id, label: 'Cue extensions', tone: 'emerald', uppercase: true,
            items: matchingPresets(CUE_EXTENSIONS, extensionQuery).map((extension) => ({
              key: extension, label: `(${extension})`, apply: completeCueExtension(text, extension),
            })),
          }
        : {
            lineId: line.id, label: 'Characters', tone: 'emerald', uppercase: true,
            items: suggestCharacters(characterCatalog, text)
              .filter((c) => c.canonicalName !== text.trim().toUpperCase())
              .map((c) => ({
                key: c.id, label: c.canonicalName, apply: c.canonicalName,
                ...((c.aliases?.length ?? 0) > 0 ? { hint: `aka ${c.aliases?.[0]}` } : {}),
              })),
          };
    } else if (suggest.kind === 'location') {
      const query = sceneHeadingLocationQuery(text);
      list = {
        lineId: line.id, label: 'Locations', tone: 'amber', uppercase: true,
        items: suggestLocations(locationCatalog, query)
          .filter((l) => l.name.toLowerCase() !== query.trim().toLowerCase())
          .map((l) => ({ key: l.name, label: l.name, apply: withHeadingLocation(text, l.name) })),
      };
    } else {
      const presets = LINE_PRESETS[line.type || 'action'];
      if (!presets) return null;
      list = {
        lineId: line.id, label: presets.label, tone: presets.tone, uppercase: line.type !== 'parenthetical',
        items: matchingPresets(presets.presets, text).map((preset) => ({ key: preset, label: preset, apply: preset })),
      };
    }
    return list.items.length > 0 ? list : null;
  }, [suggest, activeEditingLineId, lines, characterCatalog, locationCatalog]);

  /** ↑ ↓ / Enter / Tab / Esc on a line whose suggestion list is open. True when the key was used. */
  const handleSuggestionKeys = (event: React.KeyboardEvent, line: ScriptLine): boolean => {
    if (!lineSuggestions || lineSuggestions.lineId !== line.id) return false;
    const count = lineSuggestions.items.length;
    const action = suggestionKeyAction(event, count);
    if (!action) return false;
    event.preventDefault();
    if (action === 'next') setSuggestIndex((index) => (index + 1) % count);
    else if (action === 'previous') setSuggestIndex((index) => (index - 1 + count) % count);
    else if (action === 'pick') {
      updateLine(line.id, lineSuggestions.items[Math.min(suggestIndex, count - 1)].apply);
      setSuggest(null);
    } else setSuggest(null);
    return true;
  };

  const renderSuggestions = (line: ScriptLine) =>
    lineSuggestions && lineSuggestions.lineId === line.id ? (
      <SuggestionList
        label={lineSuggestions.label}
        tone={lineSuggestions.tone}
        uppercase={lineSuggestions.uppercase}
        items={lineSuggestions.items}
        highlight={Math.min(suggestIndex, lineSuggestions.items.length - 1)}
        onPick={(item) => {
          const chosen = lineSuggestions.items.find((candidate) => candidate.key === item.key);
          if (chosen) updateLine(line.id, chosen.apply);
          setSuggest(null);
        }}
      />
    ) : null;

  /**
   * Move the caret to another line from the keyboard. Every line's input
   * stays mounted, so focus has to be moved by hand (autoFocus only fires on
   * mount); `column` keeps the caret roughly where it was.
   */
  const focusLine = (lineId: string, column: number | 'end') => {
    setActiveEditingLineId(lineId);
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(`[data-line-input="${CSS.escape(lineId)}"]`);
      if (!input) return;
      input.focus();
      const position = column === 'end' ? input.value.length : Math.min(column, input.value.length);
      input.setSelectionRange(position, position);
    });
  };

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

  const importRaw = (raw: string, name: string, markRevision?: number) => {
    // Re-importing a revised draft keeps linings and scheduled scenes attached
    // to the lines that survived (ids are reconciled, not minted afresh).
    const reconciled = reconcileScriptLineIds(parseScreenplay(raw, name), lines);
    // A revised draft stars the lines it changed, in its revision colour.
    const parsed = markRevision === undefined
      ? reconciled
      : markRevisedLines(reconciled, new Set(lines.map((line) => line.id)), markRevision);
    // A script that arrives with a cover keeps it — title, credit, author and
    // draft used to be stripped at the door and thrown away.
    const cover = parseScreenplayTitlePage(raw);
    // An imported script's scenes do not each get a setup (see above).
    importingScriptRef.current = true;
    setScriptLines(parsed, {
      scriptTitle: cover?.title?.trim() || name,
      scriptText: raw,
      ...(cover ? { titlePage: cover } : {}),
    });
    // A Final Draft file tagged in its Tagger brings its breakdown along.
    const tagged = parseFdxTags(raw);
    if (tagged.length > 0) {
      const lineIds = fdxTagLineIds(tagged, parsed);
      runCommand(updateBreakdownItemsCommand, {
        update: (items) => tagged.reduce((next, element, index) => tagBreakdownItem(next, {
          category: element.category,
          name: element.name,
          scriptLineIds: lineIds[index],
          ...(element.sourceCategory ? { notes: `Final Draft category: ${element.sourceCategory}` } : {}),
        }), items),
        description: `Import ${tagged.length} breakdown element${tagged.length === 1 ? '' : 's'} from Final Draft`,
      }, { domain: 'script' });
    }
    clearSelection();
  };

  /**
   * A first script goes straight in. Anything arriving on top of an existing
   * one — imported or pasted — is a new draft: compared first, then applied
   * with its changes marked and the old draft kept in revision history.
   */
  const stageImport = (raw: string, name: string) => {
    if (lines.length === 0) {
      importRaw(raw, name);
      return;
    }
    setPendingRevision({
      raw,
      name,
      comparison: compareScriptRevisions(lines, parseScreenplay(raw, name)),
    });
  };

  const loadScript = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => stageImport(String(reader.result || ''), file.name);
    reader.readAsText(file);
  };

  const applyPendingRevision = () => {
    if (!pendingRevision) return;
    const { comparison, name, raw } = pendingRevision;
    runCommand(addScriptRevisionCommand, {
      revision: {
          id: createId('script-revision'),
          createdAt: new Date().toISOString(),
          sourceFileName: name,
          scriptTitle: scriptTitle || 'Screenplay',
          scriptText:
            project.scriptText ?? serializeToFountain(lines, scriptTitle || 'Screenplay', project.titlePage),
          summary: {
            added: comparison.added,
            removed: comparison.removed,
            changed: comparison.changed,
            unchanged: comparison.unchanged,
          },
      },
    }, { domain: 'script' });
    // The new draft goes out on the next colour in the sequence.
    const nextColor = currentRevisionColor(project).index + 1;
    if (project.scriptRevisionColor !== undefined) {
      runCommand(setScriptRevisionColorCommand, { index: nextColor }, { domain: 'script' });
    }
    importRaw(raw, name, nextColor);
    setPendingRevision(null);
  };

  const exportFdxFile = () => {
    const xml = serializeToFdx(lines, { title: scriptTitle, titlePage: project.titlePage });
    downloadText(xml, `${safeFileName(scriptTitle, 'screenplay').toLowerCase()}.fdx`, { type: 'application/xml;charset=utf-8' });
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
    void confirm({
      title: 'Clear screenplay?',
      message: 'Are you sure you want to clear this entire screenplay? This will remove all script lines.',
      confirmLabel: 'Clear',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      setScriptLines([], { scriptTitle: '', scriptText: '' });
      clearSelection();
      setRawFountainText('');
      setActiveEditingLineId(null);
    });
  };

  const handleClearAVScript = () => {
    void confirm({
      title: 'Clear AV script?',
      message: 'Are you sure you want to clear all rows from the AV script?',
      confirmLabel: 'Clear',
      danger: true,
    }).then((confirmed) => {
      if (!confirmed) return;
      setAVScriptRows([]);
    });
  };

  /*
   * A scene written here also gets a floor-plan setup — named after its
   * heading, with one example camera — so the plan and shot list keep up with
   * the script. Only scenes written in this editor: importing a whole
   * screenplay must not fill the plan with dozens of setups (Reports →
   * Scenes has "Create setups" for that). The setup is made once the heading
   * names a location and the writer has moved on from it, so a half-typed
   * heading never creates one, and never when the scene number already has a
   * setup.
   */
  const knownHeadingIdsRef = useRef<Set<string> | null>(null);
  const pendingSetupHeadingsRef = useRef<Set<string>>(new Set());
  const importingScriptRef = useRef(false);
  useEffect(() => {
    const ids = new Set(lines.filter((line) => line.type === 'scene').map((line) => line.id));
    if (knownHeadingIdsRef.current && !importingScriptRef.current) {
      for (const id of ids) if (!knownHeadingIdsRef.current.has(id)) pendingSetupHeadingsRef.current.add(id);
    }
    importingScriptRef.current = false;
    knownHeadingIdsRef.current = ids;
  }, [lines]);
  useEffect(() => {
    const pending = pendingSetupHeadingsRef.current;
    if (pending.size === 0) return;
    const additions: SceneSetup[] = [];
    for (const id of [...pending]) {
      if (id === activeEditingLineId) continue; // still being written
      const line = lines.find((candidate) => candidate.id === id);
      if (!line || line.type !== 'scene' || line.omitted) {
        pending.delete(id);
        continue;
      }
      const location = parseSceneHeading(line.text || '').location;
      if (!location || /^LOCATION$/i.test(location)) continue; // not named yet
      const scene = (project.scriptScenes ?? []).find((candidate) => candidate.id === id);
      if (!scene) continue;
      pending.delete(id);
      const taken = [...project.setups, ...additions].some((setup) => setup.sceneNumber === scene.sceneNumber);
      if (!taken) additions.push(setupForScriptScene(scene));
    }
    if (additions.length > 0) runCommand(addSetupsCommand, { setups: additions, open: false }, { domain: 'script' });
    // runCommand is stable in effect; the inputs that decide are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEditingLineId, lines, project.scriptScenes, project.setups]);

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

  // Script highlighter (colour coding by department, character or location).
  const [highlightMode, setHighlightModeState] = useState<HighlightMode>(() =>
    readUiPref<HighlightMode>('script_highlight', ['off', 'breakdown', 'characters', 'locations'], 'breakdown'),
  );
  const [highlightFocus, setHighlightFocus] = useState<string | null>(null);
  const setHighlightMode = (mode: HighlightMode) => {
    setHighlightModeState(mode);
    writeUiPref('script_highlight', mode);
  };
  const scriptBreakdown = useMemo(
    () => cachedScriptBreakdown(lines, project.characters, project.locations),
    [lines, project.characters, project.locations],
  );
  // Page numbers (locked or fresh) for the page markers and the page count.
  const pageInfo = useMemo(() => pageLabels(lines, project.scriptPageLock), [lines, project.scriptPageLock]);
  const pageStartMap = useMemo(() => new Map(pageInfo.starts.map((start) => [start.lineId, start.label] as const)), [pageInfo]);
  const scenePageEighths = useMemo(
    () => new Map(scriptBreakdown.scenes.flatMap((scene) =>
      scene.pageLengthEighths === undefined ? [] : [[scene.id, scene.pageLengthEighths] as const])),
    [scriptBreakdown],
  );
  const highlights = useMemo(() => {
    const sceneLocation = new Map<string, { key: string; label: string }>();
    for (const location of scriptBreakdown.locations) {
      for (const scene of location.scenes) sceneLocation.set(scene.id, { key: location.key, label: location.name });
    }
    return deriveLineHighlights(lines, {
      mode: highlightMode,
      characters: scriptBreakdown.characters,
      sceneLocation,
      focusKey: highlightFocus,
    });
  }, [lines, highlightMode, highlightFocus, scriptBreakdown]);
  const setCharacterHighlightColor = (characterId: string, color: string) => {
    runCommand(setCharacterColorCommand, { characterId, color, fallbackCharacters: scriptBreakdown.characters }, { domain: 'script' });
  };

  /**
   * Untag every line of the selection at once. Untagging one line of a phrase
   * that spans two would leave half a mark on the page, which reads as a bug
   * rather than a partial edit.
   */
  const untagFromSelection = (itemId: string) => {
    runCommand(updateBreakdownItemsCommand, {
      update: (current) => selectedLineIds.reduce((next, lineId) => untagScriptLine(next, itemId, lineId), current),
      description: 'Untag the selection',
    }, { domain: 'script' });
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
    // ↑ ↓ move between lines, keeping the caret's column; omitted headings
    // have no field and are stepped over.
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const step = e.key === 'ArrowDown' ? 1 : -1;
      for (let i = index + step; i >= 0 && i < lines.length; i += step) {
        const target = lines[i];
        if (target.type === 'scene' && target.omitted) continue;
        e.preventDefault();
        setSuggest(null);
        focusLine(target.id, e.currentTarget.selectionStart ?? 0);
        return;
      }
      return;
    }

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
      if (prevLine) focusLine(prevLine.id, 'end');
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
    'border-line-strong bg-surface hover:bg-surface-hover text-ink-soft'
  }`;

  const barButton = `px-2 py-1 rounded border text-[10px] font-semibold flex items-center gap-1 transition-colors ${
    'border-line-strong bg-surface hover:bg-surface-hover text-ink-soft'
  }`;

  return (
    <div className={`h-full flex flex-col bg-surface text-ink`}>
      <div className={`p-2 sm:p-2.5 border-b flex flex-col gap-2 border-line bg-slate-50/80 dark:bg-slate-950/60`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <ViewSwitcher
            className="basis-full"
            label="Script view"
            value={activeTab}
            onChange={(tab) => (tab === 'title_page' || tab === 'reports' ? setActiveTab(tab) : handleTabSwitch(tab))}
            items={[
              { id: 'lined_coverage', icon: Layers, label: 'Lined script' },
              { id: 'screenplay', icon: PenTool, label: 'Screenplay' },
              { id: 'av_script', icon: Tv, label: 'A/V script' },
              { id: 'title_page', icon: FileText, label: 'Title page' },
              { id: 'reports', icon: BarChart3, label: 'Reports' },
            ]}
          />

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
              <div className={`flex items-center rounded-lg border mr-1 border-line-strong`}>
                <button
                  onClick={() => setFountainViewMode('page')}
                  aria-pressed={fountainViewMode === 'page'}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-l-md ${
                    fountainViewMode === 'page' ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'
                  }`}
                  title="Hollywood Standard 12pt Courier Page View"
                >
                  Page View
                </button>
                <button
                  onClick={() => setFountainViewMode('raw')}
                  aria-pressed={fountainViewMode === 'raw'}
                  className={`px-2.5 py-1 text-[11px] font-semibold rounded-r-md flex items-center gap-1 ${
                    fountainViewMode === 'raw' ? 'bg-accent text-white' : 'text-ink-muted hover:text-ink'
                  }`}
                  title="Raw Fountain Syntax Markdown Code"
                >
                  <Code2 className="w-3 h-3" /> Fountain Code
                </button>
              </div>
            )}

            <button
              onClick={() => fileRef.current?.click()}
              className="px-2.5 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-[11px] font-semibold flex items-center gap-1 shadow-sm"
              title="Import .fountain, .fdx or .txt screenplay"
            >
              <Upload className="w-3.5 h-3.5" /> Import
            </button>

            {activeTab === 'screenplay' && (
              <button onClick={exportFountainFile} className={headerButton} title="Download .fountain file">
                <Download className="w-3.5 h-3.5" /> Fountain
              </button>
            )}
            {activeTab === 'screenplay' && lines.length > 0 && (
              <button onClick={exportFdxFile} className={headerButton} title="Download a Final Draft (.fdx) file">
                <Download className="w-3.5 h-3.5" /> Final Draft
              </button>
            )}

            {/* Screenplay PDF sits directly beside Fountain: the two ways out of the script. */}
            {activeTab === 'screenplay' && lines.length > 0 && (
              <PdfExportButton
                onClick={() => openExportModal('linedscript')}
                title="Skript als PDF exportieren"
              />
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
                title="Switch to the Screenplay view to write and edit scenes"
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
              <PdfExportButton onClick={() => openExportModal('scriptreports')} title="Download the script reports as a PDF" />
            )}

            {activeTab !== 'reports' && activeTab !== 'title_page' && activeTab !== 'screenplay' && lines.length > 0 && (
              <PdfExportButton
                onClick={() => openExportModal(activeTab === 'av_script' ? 'avscript' : 'linedscript')}
                title={activeTab === 'av_script' ? 'Download the AV script as a PDF' : 'Download the script as a PDF'}
              />
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
                className="px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition-colors border-transparent text-ink-muted hover:text-danger hover:bg-danger-soft"
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
                  if (!sceneNumbersLocked) {
                    setSceneNumbersLocked(true);
                    return;
                  }
                  void confirm({
                    title: 'Unlock scene numbers?',
                    message: 'Unlock scene numbers? Every scene is renumbered by position (1, 2, 3 …), so any breakdown, strip or call sheet that quotes a number may no longer match.',
                    confirmLabel: 'Unlock',
                    danger: true,
                  }).then((confirmed) => {
                    if (confirmed) setSceneNumbersLocked(false);
                  });
                }}
                title={sceneNumbersLocked
                  ? 'Scene numbers are LOCKED production numbers: a scene added between 3 and 4 becomes 3A, an omitted scene keeps its number, a removed one leaves a gap. Click to unlock and renumber by position.'
                  : 'Scene numbers follow position and shift when scenes are added or removed. Lock them before breakdown and scheduling so every department refers to the same numbers.'}
                className={`h-7 px-2 rounded-lg border text-[10px] font-semibold flex items-center gap-1 ${
                  sceneNumbersLocked
                    ? 'border-amber-400 dark:border-amber-600/60 bg-warn-soft text-warn'
                    : 'border-line-strong bg-surface text-ink-soft'
                }`}
              >
                {sceneNumbersLocked ? <Lock className="w-3 h-3" /> : <LockOpen className="w-3 h-3" />}
                {sceneNumbersLocked ? 'Numbers locked' : 'Lock scene numbers'}
              </button>
            )}

            {activeTab !== 'reports' && activeTab !== 'title_page' && <div className={`flex items-center rounded-lg border border-line-strong`}>
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
                      ? 'bg-accent text-white border-violet-400 shadow-sm'
                      : info.color
                  }`}
                >
                  <span>{info.label}</span>
                  {type === 'parenthetical' && <span className="opacity-70 text-[10px]">[Tab]</span>}
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
                'bg-field border-line-strong'
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
                    stageImport(pasteText, 'Pasted Screenplay');
                  }
                  setPasteText('');
                  setPasteOpen(false);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-[11px] font-semibold"
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
        <div className={`flex-1 overflow-auto custom-scrollbar bg-surface-sunken`}>
          <TitlePageEditor isLight={isLight} />
        </div>
      )}

      {activeTab === 'screenplay' && (
        <div ref={scrollRef} className={`flex-1 overflow-auto custom-scrollbar p-3 sm:p-6 bg-surface-sunken`}>
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
                  'bg-surface border-line-strong text-ink focus:border-violet-500'
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
                      className="px-3.5 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold shadow-sm"
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
                        onFocus={() => setActiveEditingLineId(line.id)}
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
                            className="text-[10px] px-1 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-sky-300"
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
                            <div className="flex flex-wrap items-center justify-between gap-y-0.5 font-bold text-amber-300">
                              {/* Both margins, like a production draft. The left
                                  one mirrors the right, which is the one you
                                  edit when the numbers are locked. */}
                              {line.sceneNumber && (
                                <span aria-hidden className="mr-2 shrink-0 font-mono text-[10px] text-warn opacity-70">
                                  {line.sceneNumber}
                                </span>
                              )}
                              <SceneHeadingInput
                                lineId={line.id}
                                text={line.text || ''}
                                autoFocus={isSelected}
                                extraTimes={scriptTimesOfDay}
                                onChange={(text) => updateLine(line.id, text)}
                                onTyped={() => openSuggest(line.id, 'location')}
                                onKeyDown={(e) => {
                                  if (handleSuggestionKeys(e, line)) return;
                                  handleLineKeyDown(e, line, idx);
                                }}
                                // The suggestion buttons keep focus with
                                // preventDefault on mousedown, so closing on
                                // blur never eats the click that picks one.
                                onBlur={() => setSuggest(null)}
                              >
                                {renderSuggestions(line)}
                              </SceneHeadingInput>
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
                                  className={`w-12 ml-2 text-[10px] text-center font-mono rounded border outline-none border-amber-300 dark:border-amber-700/60 bg-warn-soft text-warn`}
                                />
                              ) : line.sceneNumber ? (
                                <span className="text-[10px] text-warn font-mono ml-2 opacity-70" title="Numbered by position; lock the numbers before scheduling">
                                  #{line.sceneNumber}#
                                </span>
                              ) : null}
                            </div>
                          ) : line.type === 'parenthetical' ? (
                            <div className="relative text-sky-300 italic flex items-center">
                              <input
                                autoFocus={isSelected}
                                data-line-input={line.id}
                                aria-label="Parenthetical"
                                value={line.text}
                                onChange={(e) => {
                                  updateLine(line.id, e.target.value);
                                  openSuggest(line.id, 'preset');
                                }}
                                onKeyDown={(e) => {
                                  if (handleSuggestionKeys(e, line)) return;
                                  handleLineKeyDown(e, line, idx);
                                }}
                                className="w-full bg-transparent outline-none italic text-sky-300 focus:bg-sky-950/20 px-1 rounded"
                                placeholder="(whispering / beat / delivery)"
                              />
                              {renderSuggestions(line)}
                            </div>
                          ) : line.type === 'character' ? (
                            <div className="relative flex items-center gap-1">
                              <input
                                autoFocus={isSelected}
                                data-line-input={line.id}
                                aria-label="Character cue"
                                value={line.text}
                                onChange={(e) => {
                                  updateLine(line.id, e.target.value);
                                  openSuggest(line.id, 'character');
                                }}
                                onKeyDown={(e) => {
                                  if (handleSuggestionKeys(e, line)) return;
                                  handleLineKeyDown(e, line, idx);
                                }}
                                onBlur={() => setSuggest(null)}
                                className="w-full bg-transparent outline-none uppercase font-bold text-emerald-300 focus:bg-emerald-950/20 px-1 rounded"
                                placeholder="CHARACTER NAME"
                              />
                              <select
                                aria-label="Add or remove a cue extension"
                                title="V.O., O.S., CONT'D…"
                                value=""
                                onChange={(e) => {
                                  if (e.target.value) updateLine(line.id, toggleCueExtension(line.text || '', e.target.value));
                                }}
                                className="shrink-0 bg-transparent text-[10px] font-bold text-emerald-300/70 hover:text-emerald-300 outline-none rounded px-0.5 hover:bg-emerald-950/30 cursor-pointer"
                              >
                                <option value="" className="bg-slate-900 text-emerald-300">( )</option>
                                {CUE_EXTENSIONS.map((extension) => (
                                  <option key={extension} value={extension} className="bg-slate-900 text-emerald-300">
                                    {splitCue(line.text || '').extensions.includes(extension) ? `✓ (${extension})` : `(${extension})`}
                                  </option>
                                ))}
                              </select>
                              {renderSuggestions(line)}
                            </div>
                          ) : (
                            <div className="relative">
                            <input
                              autoFocus={isSelected}
                              data-line-input={line.id}
                              aria-label={line.type === 'dialogue' ? 'Dialogue' : line.type === 'transition' ? 'Transition' : line.type === 'shot' ? 'Shot' : 'Action'}
                              value={line.text}
                              onChange={(e) => {
                                updateLine(line.id, e.target.value);
                                if (LINE_PRESETS[line.type || 'action']) openSuggest(line.id, 'preset');
                              }}
                              onKeyDown={(e) => {
                                if (handleSuggestionKeys(e, line)) return;
                                handleLineKeyDown(e, line, idx);
                              }}
                              className={`w-full bg-transparent outline-none focus:bg-slate-800/40 px-1 rounded ${
                                line.type === 'dialogue' ? 'text-slate-100' : 'text-slate-300'
                              }`}
                              placeholder={line.type === 'dialogue' ? 'Spoken dialogue...' : line.type === 'transition' ? 'CUT TO:' : line.type === 'shot' ? 'ANGLE ON…' : 'Action description...'}
                            />
                            {renderSuggestions(line)}
                            </div>
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

      {activeTab === 'av_script' && <AVScriptView isLight={isLight} />}

      {activeTab === 'lined_coverage' && (
        <>
          {lines.length > 0 && (() => {
            const revision = currentRevisionColor(project);
            const changed = lines.filter((line) => line.revisedIn !== undefined && line.revisedIn === revision.index).length;
            const locked = !!project.scriptPageLock;
            return (
              <div className="px-2.5 py-1 border-b border-line flex items-center gap-2 text-[11px]">
                <span className="w-3.5 h-3.5 rounded-sm border border-line-strong" style={{ background: revision.hex }} aria-hidden />
                <label className="flex items-center gap-1 font-semibold">
                  Revision
                  <select
                    value={revision.index}
                    onChange={(event) => runCommand(setScriptRevisionColorCommand, { index: Number(event.target.value) }, { domain: 'script' })}
                    aria-label="Script revision colour"
                    title="The colour this draft goes out on. Importing a revised draft moves to the next colour automatically."
                    className="rounded border border-line-strong bg-field text-ink px-1 py-0.5 text-[11px]"
                  >
                    {Array.from({ length: Math.max(REVISION_COLORS.length, revision.index + 2) }, (_, index) => revisionColorAt(index)).map((color) => (
                      <option key={color.index} value={color.index}>{color.label}</option>
                    ))}
                  </select>
                </label>
                {revision.index > 0 && <span className="text-ink-muted">{changed} line{changed === 1 ? '' : 's'} marked * in this revision</span>}
                <span className="ml-auto text-ink-muted">
                  {locked
                    ? `Pages locked${pageInfo.addedPages ? ` · ${pageInfo.addedPages} A-page${pageInfo.addedPages === 1 ? '' : 's'}` : ''}${pageInfo.omitted.length ? ` · p. ${pageInfo.omitted.join(', ')} omitted` : ''}`
                    : `${pageInfo.starts.length} page${pageInfo.starts.length === 1 ? '' : 's'}`}
                </span>
                <button
                  type="button"
                  onClick={() => runCommand(setScriptPageLockCommand, { lock: locked ? undefined : lockPages(lines) }, { domain: 'script' })}
                  title={locked ? 'Unlock pages: number pages freshly again' : 'Lock pages: keep every page number from now on; new text goes onto A-pages'}
                  aria-pressed={locked}
                  className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${locked ? 'bg-accent text-white border-transparent' : 'border-line-strong hover:bg-surface-hover'}`}
                >
                  {locked ? 'Pages locked' : 'Lock pages'}
                </button>
              </div>
            );
          })()}
          {lines.length > 0 && (
            <ScriptHighlightBar
              mode={highlightMode}
              onModeChange={setHighlightMode}
              legend={highlights.legend}
              focusKey={highlightFocus}
              onFocusChange={setHighlightFocus}
              onColorChange={highlightMode === 'characters' ? setCharacterHighlightColor : undefined}
              isLight={isLight}
            />
          )}
          {pendingLinkShot && (
            <div
              className={`px-2.5 py-2 border-b flex items-center justify-between gap-2 ${
                'bg-violet-50 dark:bg-violet-950/60 border-violet-200 dark:border-violet-800 text-violet-900 dark:text-violet-100'
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
                    className="px-2.5 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-[11px] font-semibold"
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

          <div ref={scrollRef} className={`flex-1 overflow-auto custom-scrollbar bg-surface-sunken`}>
            {lines.length === 0 ? (
              <div className={`m-4 p-8 text-center border border-dashed rounded-xl border-line-strong bg-white dark:bg-slate-900/60`}>
                <FileText className="w-10 h-10 mx-auto mb-3 text-slate-500" />
                <p className="text-sm font-bold text-slate-200">No Screenplay Loaded</p>
                <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-4">
                  Import an existing screenplay (.fountain, .fdx, .txt) or write scenes directly. It will be rendered in Hollywood format for visual coverage lining.
                </p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <button
                    onClick={handleStartBlankScreenplay}
                    className="px-3.5 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm"
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
                  breakdownItems={highlightMode === 'breakdown' ? breakdownItems : undefined}
                  highlightedBreakdownItemId={highlightedBreakdownItemId}
                  onSelectBreakdownItem={setHighlightedBreakdownItemId}
                  lineHighlights={highlights.lines}
                  nameMentions={highlights.mentions}
                  revisionIndex={currentRevisionColor(project).index}
                  pageStarts={pageStartMap}
                  scenePageEighths={scenePageEighths}
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
            <div className={`border-t p-2 space-y-2 border-line bg-surface-sunken`}>
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
                    'bg-surface border-line-strong'
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
                  className={`${barButton} ${selectedMark.continuesNext ? 'bg-accent text-white border-sky-500' : ''}`}
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
                <span className="text-[10px] opacity-55">or drag the round handles on the line</span>
              </div>
            </div>
          )}

          {effectiveRange && (
            <div className={`border-t p-2 space-y-2 border-line bg-surface-sunken`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold flex items-center gap-1.5 min-w-0">
                  <Scissors className="w-3.5 h-3.5 text-warn flex-shrink-0" />
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
                    'bg-surface border-line-strong'
                  }`}
                />
                <select
                  value={shotSize}
                  onChange={(event) => setShotSize(event.target.value as ShotSize)}
                  className={`rounded-lg border px-2 py-1.5 text-[11px] ${
                    'bg-surface border-line-strong'
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
                  className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-[11px] font-semibold flex items-center gap-1"
                >
                  <Video className="w-3.5 h-3.5" /> Make Shot
                </button>
                {unlinedShots.length > 0 && (
                  <select
                    value=""
                    onMouseDown={(event) => event.stopPropagation()}
                    onChange={(event) => linkExistingShot(event.target.value)}
                    aria-label="Line a shot that already exists in the shot list over the highlighted text" title="Line a shot that already exists in the shot list over the highlighted text"
                    className={`rounded-lg border px-2 py-1.5 text-[11px] font-semibold ${
                      'bg-surface border-line-strong text-ink-soft'
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
                  <span className={`text-[10px] uppercase tracking-wider font-semibold text-ink-muted`}>
                    Tagged here
                  </span>
                  {taggedInSelection.map((item) => (
                    <span
                      key={item.id}
                      title={`${breakdownCategoryLabel(item.category)} — click the cross to untag these lines`}
                      onMouseEnter={() => setHighlightedBreakdownItemId(item.id)}
                      onMouseLeave={() => setHighlightedBreakdownItemId(null)}
                      className={`inline-flex items-center gap-1 pl-1.5 pr-1 py-0.5 rounded-full border text-[10px] font-semibold ${
                        'bg-surface'
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
              'border-line text-ink-muted'
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

      {pendingRevision && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/65" onClick={() => setPendingRevision(null)} />
          <div className={`relative w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-2xl border shadow-2xl bg-surface border-line-strong text-ink`} role="dialog" aria-modal="true" aria-labelledby="script-revision-title">
            <div className="p-4 border-b border-inherit flex items-start justify-between gap-3">
              <div>
                <h2 id="script-revision-title" className="text-sm font-black flex items-center gap-2"><GitCompareArrows className="w-4 h-4 text-violet-500" /> Review revised screenplay</h2>
                <p className="mt-1 text-[11px] opacity-60">{pendingRevision.name} will replace the working draft. The current draft is retained in revision history.</p>
              </div>
              <button onClick={() => setPendingRevision(null)} aria-label="Cancel screenplay import" className="p-1.5"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[58vh]">
              <div className="grid grid-cols-4 gap-2">
                {[
                  ['Added', pendingRevision.comparison.added, 'text-ok'],
                  ['Removed', pendingRevision.comparison.removed, 'text-rose-500'],
                  ['Changed', pendingRevision.comparison.changed, 'text-warn'],
                  ['Unchanged', pendingRevision.comparison.unchanged, 'text-slate-500'],
                ].map(([label, count, tone]) => (
                  <div key={String(label)} className={`rounded-xl border p-3 border-line bg-surface-sunken`}>
                    <div className="text-[10px] font-bold uppercase opacity-60">{label}</div>
                    <div className={`text-xl font-mono font-black ${tone}`}>{count}</div>
                  </div>
                ))}
              </div>
              <ul className="mt-4 space-y-1.5">
                {pendingRevision.comparison.scenes
                  .filter((scene) => scene.kind !== 'unchanged')
                  .map((scene) => (
                    <li key={scene.key} className={`rounded-lg border px-3 py-2 text-[11px] flex items-center gap-2 border-line`}>
                      <span className={`w-16 font-black uppercase text-[10px] ${scene.kind === 'added' ? 'text-ok' : scene.kind === 'removed' ? 'text-rose-500' : 'text-warn'}`}>{scene.kind}</span>
                      <span className="truncate">{scene.label}</span>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="p-4 border-t border-inherit flex justify-end gap-2">
              <button onClick={() => setPendingRevision(null)} className={headerButton}>Cancel</button>
              <button onClick={applyPendingRevision} className="px-3 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-bold">Import revised draft</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
