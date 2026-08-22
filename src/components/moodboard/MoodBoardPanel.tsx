import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Copy,
  ImageOff,
  Images,
  LayoutGrid,
  Link2,
  Palette,
  Plus,
  Printer,
  Rows3,
  Trash2,
  X,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import type { MoodBoard, MoodBoardCard, MoodBoardCardLayout } from '../../domain/moodboard';
import {
  addCard,
  addSection,
  autoArrangeCollage,
  bringCardToFront,
  collageCanvasHeight,
  createBoard,
  moveCard,
  setCardLayout,
} from '../../domain/moodboard';
import { createId } from '../../domain/ids';
import { useMoodboardImageSrcs, moodboardAssetStore } from './moodboardAssets';
import { CollageFreeform, CollageGrid } from './MoodboardCollage';
import { extractBoardPalette } from './paletteClient';

type LinkKind = NonNullable<MoodBoardCard['linkedEntity']>['kind'];

const LINK_KINDS: LinkKind[] = ['project', 'character', 'location', 'script_scene', 'setup', 'shot'];

const LINK_KIND_LABELS: Record<LinkKind, string> = {
  project: 'Project',
  character: 'Character',
  location: 'Location',
  script_scene: 'Script Scene',
  setup: 'Setup',
  shot: 'Shot',
};

const useAssetObjectUrl = (assetId?: string): string | null => {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!assetId) {
      setUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    moodboardAssetStore
      .get(assetId)
      .then((blob) => {
        if (!blob || cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId]);
  return url;
};

const CardThumb: React.FC<{ card: MoodBoardCard; isLight: boolean }> = ({ card, isLight }) => {
  const objectUrl = useAssetObjectUrl(card.assetId);
  const src = objectUrl ?? (card.sourceUrl ? card.sourceUrl : null);
  if (src) {
    return (
      <img
        src={src}
        alt={card.caption || 'Mood board card'}
        draggable={false}
        className="w-full h-28 object-cover rounded-md pointer-events-none"
      />
    );
  }
  return (
    <div
      className={`w-full h-28 rounded-md flex flex-col items-center justify-center gap-1 text-[10px] ${
        isLight ? 'bg-slate-100 text-slate-400' : 'bg-slate-800/60 text-slate-500'
      }`}
    >
      <ImageOff className="w-5 h-5" />
      <span>{card.assetId ? 'Asset missing' : card.sourceUrl ? 'Preview unavailable' : 'No image'}</span>
    </div>
  );
};

interface CardViewProps {
  card: MoodBoardCard;
  sections: MoodBoard['sections'];
  isLight: boolean;
  onUpdate: (id: string, updates: Partial<MoodBoardCard>) => void;
  onDelete: (card: MoodBoardCard) => void;
  onMove: (cardId: string, sectionId: string) => void;
}

const CardView: React.FC<CardViewProps> = ({ card, sections, isLight, onUpdate, onDelete, onMove }) => {
  const [showNotes, setShowNotes] = useState(false);
  const [linkKind, setLinkKind] = useState<LinkKind | ''>(card.linkedEntity?.kind ?? '');
  const [linkId, setLinkId] = useState(card.linkedEntity?.id ?? '');

  const inputCls = `min-h-[36px] w-full rounded-md border px-2 py-1.5 text-xs outline-none transition-colors ${
    isLight
      ? 'border-slate-200 bg-white text-slate-800 focus:border-sky-400'
      : 'border-slate-700 bg-slate-950/60 text-slate-200 focus:border-sky-500'
  }`;

  const commitLink = (kind: LinkKind | '', id: string) => {
    setLinkKind(kind);
    setLinkId(id);
    onUpdate(card.id, {
      linkedEntity: kind && id.trim() ? { kind, id: id.trim() } : undefined,
    });
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-moodboard-card', card.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      className={`rounded-lg border p-2 space-y-2 ${
        isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700/70 bg-slate-900/60'
      }`}
    >
      <CardThumb card={card} isLight={isLight} />

      <input
        value={card.caption ?? ''}
        placeholder="Caption…"
        onChange={(e) => onUpdate(card.id, { caption: e.target.value })}
        className={inputCls}
      />

      <input
        value={card.tags.join(', ')}
        placeholder="Tags (comma separated)"
        onChange={(e) =>
          onUpdate(card.id, {
            tags: e.target.value
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean),
          })
        }
        className={inputCls}
      />

      <div className="flex items-center gap-1.5">
        <select
          value={card.sectionId}
          onChange={(e) => onMove(card.id, e.target.value)}
          title="Move to section"
          className={`min-h-[36px] flex-1 rounded-md border px-1.5 py-1 text-xs outline-none ${
            isLight
              ? 'border-slate-200 bg-white text-slate-700'
              : 'border-slate-700 bg-slate-950/60 text-slate-300'
          }`}
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
        <button
          onClick={() => onDelete(card)}
          title="Delete card"
          className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md transition-colors ${
            isLight ? 'text-slate-500 hover:bg-red-50 hover:text-red-600' : 'text-slate-400 hover:bg-red-950/40 hover:text-red-400'
          }`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <button
        onClick={() => setShowNotes((v) => !v)}
        className={`min-h-[36px] w-full flex items-center gap-1 px-1 text-[11px] font-semibold transition-colors rounded-md ${
          isLight ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/60' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
        }`}
      >
        {showNotes ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        Notes &amp; link
      </button>

      {showNotes && (
        <div className="space-y-1.5">
          <input
            value={card.colorNotes ?? ''}
            placeholder="Color notes…"
            onChange={(e) => onUpdate(card.id, { colorNotes: e.target.value })}
            className={inputCls}
          />
          <input
            value={card.lensNotes ?? ''}
            placeholder="Lens notes…"
            onChange={(e) => onUpdate(card.id, { lensNotes: e.target.value })}
            className={inputCls}
          />
          <input
            value={card.lightingNotes ?? ''}
            placeholder="Lighting notes…"
            onChange={(e) => onUpdate(card.id, { lightingNotes: e.target.value })}
            className={inputCls}
          />
          <textarea
            value={card.notes ?? ''}
            placeholder="Notes…"
            rows={2}
            onChange={(e) => onUpdate(card.id, { notes: e.target.value })}
            className={`${inputCls} resize-y`}
          />
          <div className={`flex items-center gap-1 pt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            <Link2 className="w-3.5 h-3.5 flex-shrink-0" />
            <select
              value={linkKind}
              onChange={(e) => commitLink(e.target.value as LinkKind | '', linkId)}
              title="Linked entity kind"
              className={`min-h-[36px] rounded-md border px-1 py-1 text-xs outline-none flex-shrink-0 ${
                isLight
                  ? 'border-slate-200 bg-white text-slate-700'
                  : 'border-slate-700 bg-slate-950/60 text-slate-300'
              }`}
            >
              <option value="">—</option>
              {LINK_KINDS.map((k) => (
                <option key={k} value={k}>
                  {LINK_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <input
              value={linkId}
              placeholder="Entity id…"
              onChange={(e) => commitLink(linkKind, e.target.value)}
              className={`${inputCls} min-w-0 flex-1`}
            />
            {(linkKind || linkId) && (
              <button
                onClick={() => commitLink('', '')}
                title="Clear link"
                className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md transition-colors ${
                  isLight ? 'hover:bg-slate-200/60' : 'hover:bg-slate-800'
                }`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {card.sourceUrl && (
            <p className={`truncate text-[10px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`} title={card.sourceUrl}>
              Source: {card.sourceUrl}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export const MoodBoardPanel: React.FC = () => {
  const { project, theme, updateProjectMeta, openExportModal } = useFloorPlan();
  const isLight = theme === 'light';

  const boards = useMemo(() => project.moodBoards ?? [], [project.moodBoards]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? boards[0] ?? null;
  /** Session-only view mode (rule 38): sections board vs full collage. */
  const [view, setView] = useState<'sections' | 'collage'>('sections');
  const [extracting, setExtracting] = useState(false);
  const [paletteError, setPaletteError] = useState<string | null>(null);
  const [copiedHex, setCopiedHex] = useState<string | null>(null);
  /** Session-only selection inside the free-form collage (rule 38). */
  const [selectedCollageCardId, setSelectedCollageCardId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileTargetSectionRef = useRef<string | null>(null);
  const [pasteTargetSectionId, setPasteTargetSectionId] = useState<string | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [urlInput, setUrlInput] = useState('');

  // Collage needs every image source resolved (IDB blobs → object URLs).
  const allCards = useMemo(
    () => (activeBoard ? [...activeBoard.cards].sort((a, b) => a.order - b.order) : []),
    [activeBoard]
  );
  const imageSrcs = useMoodboardImageSrcs(allCards);

  const setBoards = useCallback(
    (next: MoodBoard[]) => updateProjectMeta({ moodBoards: next }),
    [updateProjectMeta],
  );

  const updateBoard = useCallback(
    (next: MoodBoard) => {
      // Merge against the LATEST boards, not the render-time array, so a write
      // that lands while another board is being edited does not revert it.
      updateProjectMeta((prev) => ({
        moodBoards: (prev.moodBoards ?? []).map((b) => (b.id === next.id ? next : b)),
      }));
    },
    [updateProjectMeta],
  );

  /**
   * Mutate one board from its latest stored value. Required by anything that
   * writes after an `await` (asset upload, palette extraction): rebuilding from
   * the render-time board would drop cards added in the meantime.
   */
  const updateBoardWith = useCallback(
    (boardId: string, fn: (prev: MoodBoard) => MoodBoard) => {
      updateProjectMeta((prev) => ({
        moodBoards: (prev.moodBoards ?? []).map((b) => (b.id === boardId ? fn(b) : b)),
      }));
    },
    [updateProjectMeta],
  );

  useEffect(() => {
    if (!activeBoard) {
      setPasteTargetSectionId(null);
      return;
    }
    const ids = new Set(activeBoard.sections.map((s) => s.id));
    if (!pasteTargetSectionId || !ids.has(pasteTargetSectionId)) {
      setPasteTargetSectionId(activeBoard.sections[0]?.id ?? null);
    }
  }, [activeBoard, pasteTargetSectionId]);

  const handleNewBoard = () => {
    const board = createBoard(createId('board'), `Mood Board ${boards.length + 1}`);
    setBoards([...boards, board]);
    setActiveBoardId(board.id);
  };

  const handleRenameBoard = (title: string) => {
    if (!activeBoard) return;
    updateBoard({ ...activeBoard, title });
  };

  const handleDeleteBoard = () => {
    if (!activeBoard) return;
    const remaining = boards.filter((b) => b.id !== activeBoard.id);
    setBoards(remaining);
    setActiveBoardId(remaining[0]?.id ?? null);
  };

  /** Persist collage layout settings on the board (shared with print/export). */
  const updateCollage = (updates: Partial<NonNullable<MoodBoard['collage']>>) => {
    if (!activeBoard) return;
    updateBoard({ ...activeBoard, collage: { ...(activeBoard.collage ?? {}), ...updates } });
  };

  const handleCollageLayoutChange = (cardId: string, layout: MoodBoardCardLayout) => {
    if (!activeBoard) return;
    updateBoard(setCardLayout(activeBoard, cardId, layout));
  };

  const handleCollageRaise = (cardId: string) => {
    if (!activeBoard) return;
    const next = bringCardToFront(activeBoard, cardId);
    if (next !== activeBoard) updateBoard(next);
  };

  /** Sample all board images and store the merged dominant-color palette. */
  const handleExtractPalette = async () => {
    if (!activeBoard || extracting) return;
    setExtracting(true);
    setPaletteError(null);
    try {
      const sources = allCards.map((card) => imageSrcs[card.id] ?? null);
      const palette = await extractBoardPalette(sources, 8);
      if (palette.length === 0) {
        setPaletteError(
          sources.some(Boolean)
            ? 'No colors could be sampled — remote images without CORS headers cannot be read; upload the files instead.'
            : 'Images are still loading — try again in a moment.',
        );
        return;
      }
      // Written after an await: patch the stored board so cards added while
      // sampling was running survive.
      updateBoardWith(activeBoard.id, (prevBoard) => ({ ...prevBoard, palette }));
    } catch (error) {
      setPaletteError(error instanceof Error ? error.message : 'Palette extraction failed.');
    } finally {
      setExtracting(false);
    }
  };

  const copyHex = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex.toUpperCase());
      setCopiedHex(hex);
      window.setTimeout(() => setCopiedHex((current) => (current === hex ? null : current)), 1200);
    } catch {
      // Clipboard blocked — the hex label is selectable anyway.
    }
  };

  const handleAddSection = () => {
    if (!activeBoard) return;
    updateBoard(addSection(activeBoard, newSectionTitle.trim() || `Section ${activeBoard.sections.length + 1}`));
    setNewSectionTitle('');
  };

  const addImageFiles = useCallback(
    async (files: File[], sectionId: string) => {
      if (!activeBoard) return;
      const boardId = activeBoard.id;
      // Store every file first, then commit all the cards in ONE update built
      // from the latest board. Committing inside the loop would race a second
      // upload (or any other board edit) running at the same time.
      const stored: Array<{ assetId: string; caption: string }> = [];
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        try {
          const ref = await moodboardAssetStore.put(file, { source: file.name });
          stored.push({ assetId: ref.id, caption: file.name.replace(/\.[^.]+$/, '') });
        } catch {
          continue;
        }
      }
      if (stored.length === 0) return;
      updateBoardWith(boardId, (prevBoard) =>
        stored.reduce(
          (board, entry) =>
            addCard(board, {
              id: createId('card'),
              assetId: entry.assetId,
              caption: entry.caption,
              tags: [],
              sectionId,
            }),
          prevBoard,
        ),
      );
    },
    [activeBoard, updateBoardWith],
  );

  const handleAddUrl = () => {
    const trimmed = urlInput.trim();
    if (!activeBoard || !trimmed || !pasteTargetSectionId) return;
    try {
      updateBoard(
        addCard(activeBoard, {
          id: createId('card'),
          sourceUrl: trimmed,
          tags: [],
          sectionId: pasteTargetSectionId,
        }),
      );
      setUrlInput('');
    } catch {
      return;
    }
  };

  const handleUpdateCard = useCallback(
    (cardId: string, updates: Partial<MoodBoardCard>) => {
      if (!activeBoard) return;
      updateBoard({
        ...activeBoard,
        cards: activeBoard.cards.map((c) => (c.id === cardId ? { ...c, ...updates } : c)),
      });
    },
    [activeBoard, updateBoard],
  );

  const handleDeleteCard = useCallback(
    (card: MoodBoardCard) => {
      if (!activeBoard) return;
      const nextBoard = {
        ...activeBoard,
        cards: activeBoard.cards.filter((c) => c.id !== card.id),
      };
      const otherCards = [
        ...boards.filter((b) => b.id !== activeBoard.id).flatMap((b) => b.cards),
        ...nextBoard.cards,
      ];
      if (card.assetId && !otherCards.some((c) => c.assetId === card.assetId)) {
        void moodboardAssetStore.delete(card.assetId).catch(() => {});
      }
      updateBoard(nextBoard);
    },
    [activeBoard, boards, updateBoard],
  );

  const handleMoveCard = useCallback(
    (cardId: string, targetSectionId: string) => {
      if (!activeBoard) return;
      const targetCount = activeBoard.cards.filter((c) => c.sectionId === targetSectionId && c.id !== cardId).length;
      updateBoard(moveCard(activeBoard, cardId, targetSectionId, targetCount));
    },
    [activeBoard, updateBoard],
  );

  const handleContainerPaste = (e: React.ClipboardEvent) => {
    if (!activeBoard || !pasteTargetSectionId) return;
    const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    void addImageFiles(files, pasteTargetSectionId);
  };

  const handleSectionDrop = (e: React.DragEvent, sectionId: string) => {
    e.preventDefault();
    setDragOverSectionId(null);
    if (!activeBoard) return;
    const draggedCardId = e.dataTransfer.getData('application/x-moodboard-card');
    if (draggedCardId && activeBoard.cards.some((c) => c.id === draggedCardId)) {
      handleMoveCard(draggedCardId, sectionId);
      return;
    }
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length > 0) void addImageFiles(files, sectionId);
  };

  const openFilePicker = (sectionId: string) => {
    fileTargetSectionRef.current = sectionId;
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const sectionId = fileTargetSectionRef.current;
    e.target.value = '';
    if (sectionId && files.length > 0) void addImageFiles(files, sectionId);
  };

  const inputCls = `min-h-[36px] rounded-md border px-2 py-1.5 text-xs outline-none transition-colors ${
    isLight
      ? 'border-slate-200 bg-white text-slate-800 focus:border-sky-400'
      : 'border-slate-700 bg-slate-950/60 text-slate-200 focus:border-sky-500'
  }`;
  const btnCls = `min-h-[36px] flex items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors ${
    isLight
      ? 'bg-slate-200/80 text-slate-700 hover:bg-slate-300/80'
      : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
  }`;
  const mutedCls = isLight ? 'text-slate-500' : 'text-slate-400';

  return (
    // The panel is focusable so a paste anywhere in it lands on the board.
    // `role="group"` makes that a legitimate focus target rather than a
    // focusable plain container.
    <div
      role="group"
      aria-label="Mood board"
      tabIndex={0}
      onPaste={handleContainerPaste}
      className={`h-full overflow-y-auto p-3 space-y-3 outline-none ${isLight ? 'bg-white' : 'bg-slate-900'}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={handleFileInputChange}
      />

      <div className="flex items-center gap-1.5 flex-wrap">
        <Images className={`w-4 h-4 flex-shrink-0 ${mutedCls}`} />
        <select
          value={activeBoard?.id ?? ''}
          onChange={(e) => setActiveBoardId(e.target.value || null)}
          title="Select mood board"
          className={`min-h-[36px] rounded-md border px-2 py-1.5 text-xs font-semibold outline-none ${
            isLight
              ? 'border-slate-200 bg-white text-slate-800'
              : 'border-slate-700 bg-slate-950/60 text-slate-200'
          }`}
        >
          {boards.length === 0 && <option value="">No boards yet</option>}
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title}
            </option>
          ))}
        </select>
        <button onClick={handleNewBoard} className={btnCls} title="Create a new mood board">
          <Plus className="w-3.5 h-3.5" /> New board
        </button>
        {activeBoard && (
          <>
            <input
              value={activeBoard.title}
              onChange={(e) => handleRenameBoard(e.target.value)}
              title="Board name"
              className={`${inputCls} w-40`}
            />
            <div className={`flex p-0.5 rounded-md border ${isLight ? 'border-slate-200 bg-white' : 'border-slate-700 bg-slate-950/60'}`}>
              <button
                onClick={() => setView('sections')}
                title="Sections board view"
                className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-colors ${
                  view === 'sections' ? (isLight ? 'bg-sky-600 text-white' : 'bg-sky-600 text-white') : mutedCls
                }`}
              >
                <Rows3 className="w-3 h-3" /> Sections
              </button>
              <button
                onClick={() => setView('collage')}
                title="Collage of all images"
                className={`px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 transition-colors ${
                  view === 'collage' ? 'bg-sky-600 text-white' : mutedCls
                }`}
              >
                <LayoutGrid className="w-3 h-3" /> Collage
              </button>
            </div>
            <button onClick={() => openExportModal('moodboard')} title="Print or export this mood board" className={btnCls}>
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
            <button
              onClick={handleDeleteBoard}
              title="Delete this board"
              className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-md transition-colors ${
                isLight ? 'text-slate-500 hover:bg-red-50 hover:text-red-600' : 'text-slate-400 hover:bg-red-950/40 hover:text-red-400'
              }`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {!activeBoard ? (
        <p className={`py-8 text-center text-xs ${mutedCls}`}>
          No mood boards yet — create one to collect visual references.
        </p>
      ) : view === 'collage' ? (
        <>
          {/* Collage controls — persisted on the board so print/export match */}
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex flex-col gap-1">
              <span className={`text-[9px] font-bold uppercase ${mutedCls}`}>Layout</span>
              <div className={`flex p-0.5 rounded-md border ${isLight ? 'border-slate-200 bg-white' : 'border-slate-700 bg-slate-950/60'}`}>
                {(['grid', 'free'] as const).map((mode) => {
                  const active = (activeBoard.collage?.mode ?? 'grid') === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => updateCollage({ mode })}
                      title={mode === 'grid' ? 'Flow images in columns' : 'Free drag-and-drop placement (drag to move, corner to resize)'}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${active ? 'bg-sky-600 text-white' : mutedCls}`}
                    >
                      {mode === 'grid' ? 'Grid' : 'Free'}
                    </button>
                  );
                })}
              </div>
            </div>
            {(activeBoard.collage?.mode ?? 'grid') === 'grid' ? (
              <>
                <label className="flex flex-col gap-1">
                  <span className={`text-[9px] font-bold uppercase ${mutedCls}`}>Columns</span>
                  <input
                    type="range" min={1} max={6} step={1}
                    value={activeBoard.collage?.columns ?? 3}
                    onChange={(e) => updateCollage({ columns: Number(e.target.value) })}
                    className="w-24 accent-sky-600"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={`text-[9px] font-bold uppercase ${mutedCls}`}>Gap</span>
                  <input
                    type="range" min={0} max={24} step={1}
                    value={activeBoard.collage?.gap ?? 8}
                    onChange={(e) => updateCollage({ gap: Number(e.target.value) })}
                    className="w-20 accent-sky-600"
                  />
                </label>
              </>
            ) : (
              <>
                <label className="flex flex-col gap-1">
                  <span className={`text-[9px] font-bold uppercase ${mutedCls}`}>Canvas height</span>
                  <input
                    type="range" min={300} max={2000} step={50}
                    value={collageCanvasHeight(activeBoard)}
                    onChange={(e) => updateCollage({ canvasHeight: Number(e.target.value) })}
                    className="w-24 accent-sky-600"
                  />
                </label>
                <button
                  onClick={() => updateBoard(autoArrangeCollage(activeBoard))}
                  className={btnCls}
                  title="Reset every image to a tidy grid; you can drag from there"
                >
                  Auto-arrange
                </button>
              </>
            )}
            <label className="flex flex-col gap-1">
              <span className={`text-[9px] font-bold uppercase ${mutedCls}`}>Background</span>
              <input
                type="color"
                value={activeBoard.collage?.background || '#ffffff'}
                onChange={(e) => updateCollage({ background: e.target.value })}
                className="w-10 h-8 p-0 border-0 bg-transparent cursor-pointer rounded"
                aria-label="Collage background color"
              />
            </label>
            <button
              onClick={() => updateCollage({ showCaptions: !(activeBoard.collage?.showCaptions ?? true) })}
              className={`${btnCls} ${!(activeBoard.collage?.showCaptions ?? true) ? 'opacity-50' : ''}`}
              title="Toggle captions under each image"
            >
              Captions {activeBoard.collage?.showCaptions ?? true ? 'on' : 'off'}
            </button>
            <button onClick={handleExtractPalette} disabled={extracting || allCards.length === 0} className={`${btnCls} disabled:opacity-40`}>
              <Palette className="w-3.5 h-3.5" /> {extracting ? 'Analyzing…' : 'Extract palette'}
            </button>
            <span className={`text-[10px] max-w-[220px] leading-snug ${mutedCls}`}>
              Layout and palette are saved with the board and used by Print / Export.
            </span>
          </div>
          {paletteError && (
            <p className="text-[10px] text-rose-400" role="alert">{paletteError}</p>
          )}

          {(activeBoard.palette?.length ?? 0) > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[9px] font-bold uppercase ${mutedCls}`}>Dominant colors</span>
              {activeBoard.palette!.map((hex) => (
                <button
                  key={hex}
                  onClick={() => copyHex(hex)}
                  title={`${hex.toUpperCase()}${copiedHex === hex ? ' — copied!' : ' — click to copy'}`}
                  className="group relative w-12 h-8 rounded border border-slate-400/60 cursor-pointer"
                  style={{ backgroundColor: hex }}
                >
                  {copiedHex === hex && (
                    <Copy className="absolute inset-0 m-auto w-3 h-3 text-white drop-shadow" />
                  )}
                </button>
              ))}
            </div>
          )}

          <div className={`rounded-xl overflow-auto ${isLight ? 'bg-white' : 'bg-slate-950/40'}`} style={{ maxHeight: 'calc(100% - 4rem)' }}>
            {(activeBoard.collage?.mode ?? 'grid') === 'free' ? (
              <CollageFreeform
                board={activeBoard}
                srcs={imageSrcs}
                onLayoutChange={handleCollageLayoutChange}
                onRaise={handleCollageRaise}
                selectedCardId={selectedCollageCardId}
                onSelect={setSelectedCollageCardId}
              />
            ) : (
              <CollageGrid
                cards={allCards}
                srcs={imageSrcs}
                collage={activeBoard.collage ?? {}}
              />
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1.5 flex-wrap">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddUrl();
              }}
              placeholder="Add by image URL (referenced, not downloaded — attribution preserved)"
              className={`${inputCls} flex-1 min-w-[200px]`}
            />
            <button onClick={handleAddUrl} disabled={!urlInput.trim()} className={`${btnCls} disabled:opacity-40`}>
              <Plus className="w-3.5 h-3.5" /> Add URL card
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <input
              value={newSectionTitle}
              onChange={(e) => setNewSectionTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddSection();
              }}
              placeholder="New section name…"
              className={`${inputCls} w-44`}
            />
            <button onClick={handleAddSection} className={btnCls}>
              <Plus className="w-3.5 h-3.5" /> Add section
            </button>
            <span className={`text-[10px] ${mutedCls}`}>
              Paste or drop images anywhere — they land in the highlighted section.
            </span>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 items-start">
            {[...activeBoard.sections]
              .sort((a, b) => a.order - b.order)
              .map((section) => {
                const cards = activeBoard.cards
                  .filter((c) => c.sectionId === section.id)
                  .sort((a, b) => a.order - b.order);
                const isPasteTarget = pasteTargetSectionId === section.id;
                return (
                  <div
                    key={section.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverSectionId(section.id);
                    }}
                    onDragLeave={() => setDragOverSectionId((prev) => (prev === section.id ? null : prev))}
                    onDrop={(e) => handleSectionDrop(e, section.id)}
                    onClick={() => setPasteTargetSectionId(section.id)}
                    className={`flex-shrink-0 w-64 rounded-xl border p-2 space-y-2 transition-colors ${
                      dragOverSectionId === section.id
                        ? 'border-sky-400 ring-2 ring-sky-400/30'
                        : isPasteTarget
                        ? isLight
                          ? 'border-sky-300 bg-slate-50'
                          : 'border-sky-700/60 bg-slate-950/40'
                        : isLight
                        ? 'border-slate-200 bg-slate-50/50'
                        : 'border-slate-800 bg-slate-950/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold truncate" title={section.title}>
                        {section.title}
                      </span>
                      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                        isLight ? 'bg-slate-200 text-slate-600' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {cards.length}
                      </span>
                    </div>

                    {cards.map((card) => (
                      <CardView
                        key={card.id}
                        card={card}
                        sections={activeBoard.sections}
                        isLight={isLight}
                        onUpdate={handleUpdateCard}
                        onDelete={handleDeleteCard}
                        onMove={handleMoveCard}
                      />
                    ))}

                    <button onClick={() => openFilePicker(section.id)} className={`${btnCls} w-full`}>
                      <Plus className="w-3.5 h-3.5" /> Add images
                    </button>
                  </div>
                );
              })}
          </div>
        </>
      )}
    </div>
  );
};
