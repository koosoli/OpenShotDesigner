import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ImageOff,
  Images,
  Link2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { createIdbAssetStore } from '../../domain/storage/idbAssetStore';
import type { MoodBoard, MoodBoardCard } from '../../domain/moodboard';
import { addCard, addSection, createBoard, moveCard } from '../../domain/moodboard';
import { createId } from '../../domain/ids';

const assetStore = createIdbAssetStore();

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
    assetStore
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
  const { project, theme, updateProjectMeta } = useFloorPlan();
  const isLight = theme === 'light';

  const boards = useMemo(() => project.moodBoards ?? [], [project.moodBoards]);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? boards[0] ?? null;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileTargetSectionRef = useRef<string | null>(null);
  const [pasteTargetSectionId, setPasteTargetSectionId] = useState<string | null>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [urlInput, setUrlInput] = useState('');

  const setBoards = useCallback(
    (next: MoodBoard[]) => updateProjectMeta({ moodBoards: next }),
    [updateProjectMeta],
  );

  const updateBoard = useCallback(
    (next: MoodBoard) => {
      setBoards(boards.map((b) => (b.id === next.id ? next : b)));
    },
    [boards, setBoards],
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

  const handleAddSection = () => {
    if (!activeBoard) return;
    updateBoard(addSection(activeBoard, newSectionTitle.trim() || `Section ${activeBoard.sections.length + 1}`));
    setNewSectionTitle('');
  };

  const addImageFiles = useCallback(
    async (files: File[], sectionId: string) => {
      if (!activeBoard) return;
      let board = activeBoard;
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        try {
          const ref = await assetStore.put(file, { source: file.name });
          board = addCard(board, {
            id: createId('card'),
            assetId: ref.id,
            caption: file.name.replace(/\.[^.]+$/, ''),
            tags: [],
            sectionId,
          });
        } catch {
          continue;
        }
      }
      updateBoard(board);
    },
    [activeBoard, updateBoard],
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
        void assetStore.delete(card.assetId).catch(() => {});
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
    <div
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
