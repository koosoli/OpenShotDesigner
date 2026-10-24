/**
 * The canvas area, optionally split into side-by-side scenes.
 *
 * Each pane shows one scene, picked from the drop-down in its header; the
 * dividers between panes drag to resize them. Every pane can be worked in:
 * the editable canvas sits in the pane of the scene being edited, and a press
 * on any other pane makes that scene the one being edited and moves the
 * canvas there, carrying the press on so press-and-drag works in one go
 * (ScenePreviewPane / FloorPlanCanvas `pendingPress`). Each scene keeps its own
 * pan and zoom, so nothing jumps when the canvas moves.
 *
 * Which scenes are open, and how wide, is a per-viewer convenience remembered
 * in this browser only.
 */
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Pencil, Plus, X } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';
import { FloorPlanCanvas } from './FloorPlanCanvas';
import { ScenePreviewPane, type PanePress } from './ScenePreviewPane';

const STORAGE_KEY = 'osd.splitScenes';
const MAX_PANES = 4;
const MIN_FRACTION = 0.12;
/** Below this width the panes stack top to bottom. */
const STACK_BELOW_PX = 640;

interface Slot {
  setupId: string;
  /** Fit the plan into the pane once — a scene was just put here. */
  fit: boolean;
}

interface Stored {
  setupIds: string[];
  sizes: number[];
}

const readStored = (): Stored => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<Stored> | null;
    const setupIds = Array.isArray(parsed?.setupIds) ? parsed.setupIds.filter((id): id is string => typeof id === 'string') : [];
    const sizes = Array.isArray(parsed?.sizes) ? parsed.sizes.filter((size): size is number => typeof size === 'number' && size > 0) : [];
    return { setupIds: setupIds.slice(0, MAX_PANES), sizes };
  } catch {
    return { setupIds: [], sizes: [] };
  }
};

const evenSizes = (count: number) => Array.from({ length: count }, () => 1 / count);

export const sceneOptionLabel = (setup: { name: string; sceneNumber?: string }): string =>
  setup.sceneNumber ? `Sc ${setup.sceneNumber} · ${setup.name}` : setup.name;

export const SplitCanvasArea: React.FC = () => {
  const { project, setActiveSetupId } = useFloorPlan();
  const { theme } = useWorkspaceUI();
  const isLight = theme === 'light';
  const activeId = project.activeSetupId;

  const [slots, setSlots] = useState<Slot[]>(() => readStored().setupIds.map((setupId) => ({ setupId, fit: false })));
  const [sizes, setSizes] = useState<number[]>(() => readStored().sizes);
  const [pendingPress, setPendingPress] = useState<PanePress | null>(null);
  const lastLiveIndex = useRef(0);

  // Keep the panes consistent with the project: scenes deleted since drop
  // out, and the scene being edited is always on screen — when it was picked
  // somewhere else (the scene menu, a link) it takes over the pane that was
  // being edited in.
  const known = new Set(project.setups.map((setup) => setup.id));
  let shown = slots.filter((slot) => known.has(slot.setupId));
  if (!shown.some((slot) => slot.setupId === activeId)) {
    const index = Math.min(lastLiveIndex.current, Math.max(shown.length - 1, 0));
    shown = shown.length === 0 ? [{ setupId: activeId, fit: false }] : shown.map((slot, i) => (i === index ? { setupId: activeId, fit: true } : slot));
  }
  const liveIndex = shown.findIndex((slot) => slot.setupId === activeId);
  lastLiveIndex.current = liveIndex;
  const split = shown.length > 1;
  const paneSizes = sizes.length === shown.length ? sizes : evenSizes(shown.length);

  // Commit the reconciled list, so it is what gets remembered.
  const shownKey = shown.map((slot) => `${slot.setupId}:${slot.fit}`).join('|');
  const slotsKey = slots.map((slot) => `${slot.setupId}:${slot.fit}`).join('|');
  useEffect(() => {
    if (shownKey !== slotsKey) setSlots(shown);
    // `shown` is derived from the keys compared here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, slotsKey]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ setupIds: split ? shown.map((slot) => slot.setupId) : [], sizes: paneSizes }));
    } catch {
      // Not remembered in a private window; the split still works.
    }
    // Saved whenever what is on screen changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey, paneSizes.join(',')]);

  /** The next scene worth showing: one not already on screen. */
  const nextScene = (open: Slot[]): string | null => {
    const onScreen = new Set(open.map((slot) => slot.setupId));
    const index = project.setups.findIndex((setup) => setup.id === activeId);
    const ordered = [...project.setups.slice(index + 1), ...project.setups.slice(0, Math.max(index, 0))];
    return ordered.find((setup) => !onScreen.has(setup.id))?.id ?? null;
  };

  const setLayout = (next: Slot[]) => {
    setSlots(next);
    setSizes(evenSizes(next.length));
  };

  // Every pane changes size when one is added or removed: fit them all.
  const addPane = () => {
    const id = nextScene(shown);
    if (!id || shown.length >= MAX_PANES) return;
    setLayout([...shown, { setupId: id, fit: true }].map((slot) => ({ ...slot, fit: true })));
  };
  const closePane = (index: number) => {
    const rest = shown.filter((_, i) => i !== index);
    if (index === liveIndex && rest.length > 0) setActiveSetupId(rest[Math.min(index, rest.length - 1)].setupId);
    setLayout(rest.map((slot) => ({ ...slot, fit: true })));
  };
  const toggleSplit = () => {
    if (split) setLayout([{ setupId: activeId, fit: true }]);
    else addPane();
  };

  /** Show `setupId` in pane `index`; a scene already shown elsewhere swaps places. */
  const pickScene = (index: number, setupId: string) => {
    const from = shown.findIndex((slot) => slot.setupId === setupId);
    const next = shown.map((slot) => ({ ...slot }));
    if (from >= 0) next[from] = { setupId: shown[index].setupId, fit: true };
    next[index] = { setupId, fit: true };
    setSlots(next);
    // The pane being edited in stays the one being edited in.
    if (index === liveIndex) setActiveSetupId(setupId);
  };

  const activate = useCallback(
    (setupId: string, press: PanePress | null) => {
      setPendingPress(press);
      setActiveSetupId(setupId);
    },
    [setActiveSetupId],
  );

  const clearFit = (index: number) =>
    setSlots((current) => current.map((slot, i) => (i === index && slot.fit ? { ...slot, fit: false } : slot)));

  // Pane layout: side by side, or stacked on a narrow screen.
  const areaRef = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(false);
  useLayoutEffect(() => {
    const node = areaRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setStacked(entry.contentRect.width < STACK_BELOW_PX));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Dragging the divider after pane `index` trades space between it and the next.
  const startResize = (index: number, event: React.PointerEvent) => {
    event.preventDefault();
    const node = areaRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const total = stacked ? rect.height : rect.width;
    const start = stacked ? event.clientY : event.clientX;
    const initial = [...paneSizes];
    const pair = initial[index] + initial[index + 1];
    const onMove = (move: PointerEvent) => {
      const delta = ((stacked ? move.clientY : move.clientX) - start) / total;
      const first = Math.min(pair - MIN_FRACTION, Math.max(MIN_FRACTION, initial[index] + delta));
      const next = [...initial];
      next[index] = first;
      next[index + 1] = pair - first;
      setSizes(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };
  const nudgeResize = (index: number, event: React.KeyboardEvent) => {
    const step = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -0.02 : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 0.02 : 0;
    if (!step) return;
    event.preventDefault();
    const pair = paneSizes[index] + paneSizes[index + 1];
    const first = Math.min(pair - MIN_FRACTION, Math.max(MIN_FRACTION, paneSizes[index] + step));
    const next = [...paneSizes];
    next[index] = first;
    next[index + 1] = pair - first;
    setSizes(next);
  };

  const canAdd = shown.length < MAX_PANES && nextScene(shown) !== null;
  const headerTone = isLight ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-900 border-slate-800 text-slate-300';

  return (
    <div ref={areaRef} className={`absolute inset-0 flex ${stacked ? 'flex-col' : 'flex-row'}`}>
      {shown.map((slot, index) => {
        const live = index === liveIndex;
        const setup = project.setups.find((candidate) => candidate.id === slot.setupId);
        return (
          <React.Fragment key={index}>
            {index > 0 && (
              <div
                role="separator"
                aria-orientation={stacked ? 'horizontal' : 'vertical'}
                aria-label="Resize the scenes"
                aria-valuenow={Math.round(paneSizes[index - 1] * 100)}
                aria-valuemin={Math.round(MIN_FRACTION * 100)}
                aria-valuemax={Math.round((1 - MIN_FRACTION) * 100)}
                // A separator with a value is a widget (WAI-ARIA window splitter): focusable, arrow keys resize.
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                tabIndex={0}
                onPointerDown={(event) => startResize(index - 1, event)}
                onKeyDown={(event) => nudgeResize(index - 1, event)}
                onDoubleClick={() => setSizes(evenSizes(shown.length))}
                title="Drag to resize · double-click to even out"
                data-testid="split-divider"
                className={`group relative z-20 flex-none touch-none ${
                  stacked ? 'h-1.5 cursor-row-resize' : 'w-1.5 cursor-col-resize'
                } ${isLight ? 'bg-slate-300' : 'bg-slate-800'} hover:bg-accent focus-visible:bg-accent outline-none`}
              >
                <span
                  className={`absolute rounded-full bg-slate-500 group-hover:bg-white ${
                    stacked ? 'left-1/2 top-1/2 h-0.5 w-8 -translate-x-1/2 -translate-y-1/2' : 'left-1/2 top-1/2 h-8 w-0.5 -translate-x-1/2 -translate-y-1/2'
                  }`}
                />
              </div>
            )}
            <section
              className="relative flex min-h-0 min-w-0 flex-col"
              style={{ flex: `${paneSizes[index]} 1 0%` }}
              aria-label={setup ? `Scene ${sceneOptionLabel(setup)}${live ? ' (editing)' : ''}` : undefined}
              data-testid="split-pane"
            >
              {split && (
                <header className={`flex flex-none items-center gap-1.5 border-b px-2 py-1 text-xs ${headerTone} ${live ? 'shadow-[inset_0_-2px_0_var(--color-accent)]' : ''}`}>
                  <select
                    value={slot.setupId}
                    onChange={(event) => pickScene(index, event.target.value)}
                    aria-label={`Scene in pane ${index + 1}`}
                    className={`min-w-0 flex-1 truncate rounded border px-1.5 py-0.5 text-xs ${
                      isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-950 border-slate-700 text-slate-200'
                    }`}
                  >
                    {project.setups.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {sceneOptionLabel(candidate)}
                      </option>
                    ))}
                  </select>
                  {live ? (
                    <span className="flex flex-none items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      <Pencil className="h-3 w-3" />
                      Editing
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => activate(slot.setupId, null)}
                      title="Edit this scene (or just click into it)"
                      className="flex flex-none items-center gap-1 rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                    >
                      <Pencil className="h-3 w-3" />
                      <span>Edit</span>
                    </button>
                  )}
                  {index === shown.length - 1 && canAdd && (
                    <button
                      type="button"
                      onClick={addPane}
                      title="Show one more scene"
                      aria-label="Show one more scene"
                      className="flex-none rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => closePane(index)}
                    title="Close this pane"
                    aria-label={`Close pane ${index + 1}`}
                    className="flex-none rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </header>
              )}
              <div className="relative min-h-0 flex-1">
                {live ? (
                  <FloorPlanCanvas
                    splitOpen={split}
                    onToggleSplit={project.setups.length > 1 || split ? toggleSplit : undefined}
                    fitRequested={slot.fit}
                    onFitted={() => clearFit(index)}
                    fitOnSceneChange={!split}
                    pendingPress={pendingPress}
                    onPendingPressHandled={() => setPendingPress(null)}
                  />
                ) : (
                  <ScenePreviewPane
                    setupId={slot.setupId}
                    onActivate={(press) => activate(slot.setupId, press)}
                    fitRequested={slot.fit}
                    onFitted={() => clearFit(index)}
                  />
                )}
              </div>
            </section>
          </React.Fragment>
        );
      })}
    </div>
  );
};
