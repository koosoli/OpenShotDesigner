import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ClipboardPaste,
  FileText,
  Minus,
  Plus,
  Printer,
  Scissors,
  Trash2,
  Video,
  Waves,
  Upload,
  X,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { ScriptMark, ShotSize } from '../../types';
import { parseScreenplay } from './screenplayParser';
import { LinedScriptPage, PAGE_COLUMNS } from './LinedScriptPage';

const SHOT_SIZES: ShotSize[] = ['WS', 'FS', 'MWS', 'MS', 'MCU', 'CU', 'ECU', 'OTS', 'POV', 'Insert'];

export const ScriptPanel: React.FC = () => {
  const {
    activeSetup,
    scriptLines,
    scriptTitle,
    allScriptMarks,
    allShots,
    setupIdForMark,
    setActiveSetupId,
    selectedShotId,
    selectShot,
    createShotFromScriptRange,
    linkShotToScriptRange,
    scriptLinkShotId,
    cancelScriptLinking,
    updateScriptMark,
    setLiningDescription,
    deleteScriptMark,
    setScriptLines,
    openExportModal,
    theme,
  } = useFloorPlan();

  const isLight = theme === 'light';
  const lines = scriptLines;
  // Every scene's linings share the one screenplay, so the lined script shows
  // the whole production's coverage, not just the scene being edited.
  const marks = allScriptMarks;

  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<string, HTMLElement>>(new Map());
  const anchorRef = useRef<string | null>(null);
  const focusRef = useRef<string | null>(null);

  const [zoom, setZoom] = useState(1);
  const [autoFontSize, setAutoFontSize] = useState(13);
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

  /* ------------------------------------------------------------------ import */

  const importRaw = (raw: string, name: string) => {
    setScriptLines(parseScreenplay(raw, name), { scriptTitle: name, scriptText: raw });
    clearSelection();
  };

  const loadScript = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => importRaw(String(reader.result || ''), file.name);
    reader.readAsText(file);
  };

  /* ------------------------------------------------------- responsive sizing */

  // Fit the 60-column page to the panel: on a phone the type shrinks instead of
  // forcing a horizontal scroll.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => {
      const available = element.clientWidth - 28; // gutter + padding
      setAutoFontSize(Math.max(8.5, Math.min(14, available / (PAGE_COLUMNS * 0.6))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /* ------------------------------------------------------------- selection */

  const selection = useMemo(() => {
    if (!anchorId || !focusId) return null;
    const a = indexById.get(anchorId);
    const b = indexById.get(focusId);
    if (a === undefined || b === undefined) return null;
    return { from: Math.min(a, b), to: Math.max(a, b) };
  }, [anchorId, focusId, indexById]);

  /**
   * What "Make Shot" will cover: a caret/word selection if there is one,
   * otherwise the tap-selected whole lines.
   */
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
    // Mouse: press-and-drag paints a range. Touch/pen: first tap sets the start,
    // the next tap extends to the end (dragging would fight page scrolling).
    // Refs (not state) so two quick taps in the same tick still pair up.
    const anchor = anchorRef.current;
    const extend = event.shiftKey || (event.pointerType !== 'mouse' && !!anchor);
    if (extend && anchor) {
      focusRef.current = lineId;
      setFocusId(lineId);
      return;
    }
    if (anchor === lineId && focusRef.current === lineId) {
      clearSelection();
      return;
    }
    anchorRef.current = lineId;
    focusRef.current = lineId;
    setAnchorId(lineId);
    setFocusId(lineId);
    if (event.pointerType === 'mouse') setIsDragging(true);
  };

  // Word-level selection: whatever the user highlights with the caret (a single
  // word, half a sentence, several speeches) is what the shot will cover.
  useEffect(() => {
    const readSelection = () => {
      const container = scrollRef.current;
      const selectionObj = window.getSelection();
      if (!container || !selectionObj || selectionObj.rangeCount === 0) return;

      const range = selectionObj.getRangeAt(0);
      // Selections made outside the page (e.g. clicking a toolbar button, which
      // collapses the caret) must not wipe what the user just highlighted.
      if (!container.contains(range.commonAncestorContainer)) return;
      if (selectionObj.isCollapsed) {
        setTextSelection(null);
        return;
      }
      const rowOf = (node: Node): HTMLElement | null => {
        const element = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
        return element?.closest('[data-line-id]') as HTMLElement | null;
      };
      const startRow = rowOf(range.startContainer);
      const endRow = rowOf(range.endContainer);
      if (!startRow?.dataset.lineId || !endRow?.dataset.lineId) {
        setTextSelection(null);
        return;
      }
      // Offsets only make sense when the range edge sits inside the text node.
      const startOffset = range.startContainer.nodeType === Node.TEXT_NODE ? range.startOffset : 0;
      const endText = endRow.querySelector('[data-line-text]')?.textContent || '';
      const endOffset = range.endContainer.nodeType === Node.TEXT_NODE ? range.endOffset : endText.length;

      setTextSelection({
        startLineId: startRow.dataset.lineId,
        startOffset,
        endLineId: endRow.dataset.lineId,
        endOffset,
        text: range.toString(),
      });
    };

    document.addEventListener('selectionchange', readSelection);
    return () => document.removeEventListener('selectionchange', readSelection);
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (event: PointerEvent) => {
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const row = target?.closest('[data-line-id]') as HTMLElement | null;
      if (row?.dataset.lineId) {
        focusRef.current = row.dataset.lineId;
        setFocusId(row.dataset.lineId);
      }
    };
    const handleUp = () => setIsDragging(false);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [isDragging]);

  // Selecting a camera on the floor plan while this tab is open should reveal
  // its lining rather than send the user to the inspector.
  useEffect(() => {
    if (!selectedMark) return;
    const row = lineRefs.current.get(selectedMark.startLineId);
    row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [selectedMark?.id]);

  /* -------------------------------------------------------------- lining ops */

  const pendingLinkShot = useMemo(
    () => allShots.find((shot) => shot.id === scriptLinkShotId) || null,
    [allShots, scriptLinkShotId]
  );

  /** Shots that have no lining yet — candidates for "line an existing shot". */
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
      text:
        effectiveRange.text ||
        lines.slice(effectiveRange.from, effectiveRange.to + 1).map((line) => line.text).join('\n'),
    });
    clearSelection();
  };

  /** Grow (or shrink) the selected lining so it covers the highlighted lines. */
  const extendSelectedMarkToSelection = () => {
    if (!effectiveRange || !selectedMark) return;
    const markFrom = indexById.get(selectedMark.startLineId) ?? effectiveRange.from;
    const markTo = indexById.get(selectedMark.endLineId) ?? effectiveRange.to;
    const from = Math.min(markFrom, effectiveRange.from);
    const to = Math.max(markTo, effectiveRange.to);
    updateScriptMark(selectedMark.id, {
      startLineId: lines[from].id,
      endLineId: lines[to].id,
      // Growing past the original edge drops that edge's word offset.
      startOffset: from === effectiveRange.from ? effectiveRange.startOffset : selectedMark.startOffset,
      endOffset: to === effectiveRange.to ? effectiveRange.endOffset : selectedMark.endOffset,
    });
    clearSelection();
  };

  /** Mark the highlighted stretch as out of frame (drawn as a squiggle). */
  const setSquiggleFromSelection = () => {
    if (!effectiveRange || !selectedMark) return;
    const markFrom = indexById.get(selectedMark.startLineId) ?? 0;
    const markTo = indexById.get(selectedMark.endLineId) ?? lines.length - 1;
    const from = Math.max(markFrom, effectiveRange.from);
    const to = Math.min(markTo, effectiveRange.to);
    if (from > to) return;
    updateScriptMark(selectedMark.id, {
      wavyStartLineId: lines[from].id,
      wavyEndLineId: lines[to].id,
      // Word-level squiggle when the highlight starts/ends inside a line.
      wavyStartOffset: from === effectiveRange.from ? effectiveRange.startOffset : undefined,
      wavyEndOffset: to === effectiveRange.to ? effectiveRange.endOffset : undefined,
    });
    clearSelection();
  };

  const handleExtendMark = (markId: string, edge: 'start' | 'end', lineId: string) => {
    const mark = marks.find((item) => item.id === markId);
    if (!mark) return;
    const next = { ...mark, [edge === 'start' ? 'startLineId' : 'endLineId']: lineId };
    const from = indexById.get(next.startLineId) ?? 0;
    const to = indexById.get(next.endLineId) ?? 0;
    // Dragging one edge past the other simply flips the range.
    updateScriptMark(markId, {
      startLineId: lines[Math.min(from, to)].id,
      endLineId: lines[Math.max(from, to)].id,
    });
  };

  /* ---------------------------------------------------------------- render */

  const headerButton = `px-2 py-1.5 rounded-lg border text-[11px] flex items-center gap-1 ${
    isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
  }`;
  const barButton = `px-2 py-1.5 rounded-lg border text-[10px] font-semibold flex items-center gap-1 ${
    isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
  }`;

  return (
    <div className={`h-full flex flex-col min-h-0 ${isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'}`}>
      {/* Header */}
      <div className={`p-2.5 border-b ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800'}`}>
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-xs font-bold uppercase tracking-wide flex items-center gap-2">
              <FileText className="w-4 h-4 text-violet-500" /> Lined Script
            </h2>
            <p className="text-[10px] opacity-60 mt-0.5 truncate max-w-[16rem]">
              {scriptTitle || 'Import a TXT, Fountain or Final Draft (FDX) screenplay'}
            </p>
          </div>
          <div className="flex flex-wrap gap-1 items-center">
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
            <button
              onClick={() => fileRef.current?.click()}
              className="px-2 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-semibold flex items-center gap-1"
            >
              <Upload className="w-3.5 h-3.5" /> Import
            </button>
            <button onClick={() => setPasteOpen((open) => !open)} className={headerButton} title="Paste screenplay text">
              <ClipboardPaste className="w-3.5 h-3.5" /> Paste
            </button>
            {lines.length > 0 && (
              <button
                onClick={() => openExportModal('linedscript')}
                className={headerButton}
                title="Export / print the lined script"
              >
                <Printer className="w-3.5 h-3.5" /> Export
              </button>
            )}
            <div className={`flex items-center rounded-lg border ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>
              <button onClick={() => setZoom((z) => Math.max(0.7, +(z - 0.1).toFixed(2)))} className="px-1.5 py-1.5" title="Smaller text">
                <Minus className="w-3 h-3" />
              </button>
              <span className="text-[10px] font-mono w-8 text-center opacity-70">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(1.8, +(z + 0.1).toFixed(2)))} className="px-1.5 py-1.5" title="Larger text">
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        {pasteOpen && (
          <div className="mt-2 space-y-1.5">
            <textarea
              value={pasteText}
              onChange={(event) => setPasteText(event.target.value)}
              rows={5}
              placeholder={'INT. LOFT - NIGHT\n\nJenna steps closer.\n\nJENNA\nStop it, Reggie!'}
              className={`w-full rounded-lg border p-2 text-[11px] font-mono ${
                isLight ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'
              }`}
            />
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  if (!pasteText.trim()) return;
                  importRaw(pasteText, 'Pasted screenplay');
                  setPasteText('');
                  setPasteOpen(false);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-violet-600 text-white text-[11px] font-semibold"
              >
                Format screenplay
              </button>
              <button onClick={() => setPasteOpen(false)} className={headerButton}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {lines.length > 0 && (
          <p className="text-[10px] opacity-55 mt-2 leading-relaxed">
            Select any part of the screenplay — a word, a line, a whole speech — then either “Make Shot” (creates a shot
            with its own camera) or “Line existing shot…” to attach a shot you already have. Click a lining to extend it,
            add a squiggle, or let it run onto the next page.
          </p>
        )}
      </div>

      {/* "Line this shot" prompt, started from the shot list */}
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
              className="p-1 rounded opacity-70 hover:opacity-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Screenplay page */}
      <div ref={scrollRef} className={`flex-1 overflow-auto custom-scrollbar ${isLight ? 'bg-slate-100' : 'bg-slate-950'}`}>
        {lines.length === 0 ? (
          <div className={`m-4 p-6 text-center border border-dashed rounded-xl ${isLight ? 'border-slate-300 bg-white' : 'border-slate-700'}`}>
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-xs font-semibold">No screenplay loaded</p>
            <p className="text-[11px] opacity-60 mt-1">
              Import a .fountain, .fdx or .txt screenplay — it is reformatted into standard Hollywood layout so you can
              line it for coverage.
            </p>
          </div>
        ) : (
          <div className="p-2 sm:p-3">
            <LinedScriptPage
              lines={lines}
              marks={marks}
              shots={allShots}
              fontSize={fontSize}
              isLight={isLight}
              selection={textSelection ? null : selection}
              selectedShotId={selectedShotId}
              onLinePointerDown={handleLinePointerDown}
              onSelectMark={(mark) => {
                // Clicking a lining from another scene jumps there first.
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
        )}
      </div>

      {/* Selected lining editor */}
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

      {/* Selection action bar */}
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
            <button onClick={clearSelection} className="p-1 rounded opacity-60 hover:opacity-100" title="Clear selection">
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
        </div>
      )}

      {/* Footer: lining summary */}
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
    </div>
  );
};
