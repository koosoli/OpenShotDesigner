import React, { useEffect, useRef } from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Copy,
  Link2,
  Lock,
  Package,
  Scissors,
  Sliders,
  Trash2,
  Unlink,
  Unlock,
} from 'lucide-react';
import { promptSaveAssemblyFromIds } from './AssembliesPanel';
import { useDialogs } from '../dialog/DialogProvider';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';

export interface ElementContextMenuState {
  /** Viewport (client) coordinates of the pointer that opened the menu. */
  x: number;
  y: number;
  /** Element under the pointer when the menu opened (null = empty canvas). */
  elementId: string | null;
}

interface ElementContextMenuProps {
  state: ElementContextMenuState;
  onClose: () => void;
}

/**
 * Canvas context menu (plan §6.3). Opens on desktop right-click and on touch
 * long-press (~550 ms) from FloorPlanCanvas. Items act on the current
 * selection; opening the menu on an element selects it first so locked
 * elements stay reachable (Lock/Unlock).
 *
 * Touch targets are ≥40px; the menu closes on outside click/pointer-down,
 * scroll/wheel, and Escape. Styling mirrors the TopNavbar dropdown menus.
 */
export const ElementContextMenu: React.FC<ElementContextMenuProps> = ({ state, onClose }) => {
  const { activeSetup, selectedElementIds, selectElement, updateMultipleElements, deleteSelectedElements, duplicateSelected, copySelectedElements, pasteElements, updateSetupMeta, groupSelection, ungroupSelection } = useFloorPlan();
  const { theme, setActiveRightTab } = useWorkspaceUI();
  const { prompt } = useDialogs();

  const isLight = theme === 'light';
  const menuRef = useRef<HTMLDivElement>(null);

  // Opening the menu on an element makes it the selection (forced, so locked
  // elements can be unlocked from here). The clicked element is always part of
  // the target set even if a larger selection was active.
  const targetIds = useRef<string[]>(selectedElementIds);
  useEffect(() => {
    const { elementId } = state;
    if (elementId && !selectedElementIds.includes(elementId)) {
      selectElement(elementId, false, true);
      targetIds.current = [elementId];
    } else if (elementId) {
      targetIds.current = selectedElementIds.includes(elementId)
        ? selectedElementIds
        : [elementId];
    } else {
      targetIds.current = selectedElementIds;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on Escape, scroll/wheel, and outside pointer-down.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('wheel', handleScroll, { passive: true });
    window.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('wheel', handleScroll);
      window.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [onClose]);

  const element = state.elementId
    ? activeSetup.elements.find((el) => el.id === state.elementId)
    : null;
  const anyLocked = targetIds.current.some(
    (id) => activeSetup.elements.find((el) => el.id === id)?.locked
  );

  // Group actions (plan §6.4): Group needs ≥2 selected elements; Ungroup is
  // offered when the selection exactly matches a whole group's membership.
  const canGroup = targetIds.current.length >= 2;
  const canUngroup = (() => {
    const selection = new Set(targetIds.current);
    if (selection.size < 2) return false;
    return (activeSetup.groups || []).some(
      (g) =>
        g.childIds.length === selection.size &&
        g.childIds.every((id) => selection.has(id))
    );
  })();

  const itemClass = `w-full min-h-[40px] px-2.5 py-2 rounded-lg text-xs flex items-center justify-between gap-3 transition-colors ${
    isLight ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-200 hover:bg-slate-800'
  }`;

  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  const openInInspector = run(() => {
    if (!state.elementId) return;
    selectElement(state.elementId, false, true);
    setActiveRightTab('inspector');
  });

  const toggleLock = run(() => {
    updateMultipleElements(
      targetIds.current.map((id) => ({ id, updates: { locked: !anyLocked } })),
      true
    );
  });

  const reorder = (direction: 'forward' | 'backward') =>
    run(() => {
      if (!state.elementId) return;
      const elements = [...activeSetup.elements];
      const index = elements.findIndex((el) => el.id === state.elementId);
      if (index === -1) return;
      const swapWith = direction === 'forward' ? index + 1 : index - 1;
      if (swapWith < 0 || swapWith >= elements.length) return;
      [elements[index], elements[swapWith]] = [elements[swapWith], elements[index]];
      updateSetupMeta({ elements });
    });

  const cut = run(() => {
    copySelectedElements();
    deleteSelectedElements();
  });

  // Reusable assemblies (plan §6.5): serialize the selection into a named
  // workspace-level template (localStorage, not project data).
  const saveAsAssembly = run(() => {
    void promptSaveAssemblyFromIds(targetIds.current, activeSetup.elements, prompt);
  });

  // Keep the anchored menu inside the viewport (estimated max size).
  const left = Math.max(8, Math.min(state.x, window.innerWidth - 236));
  const top = Math.max(8, Math.min(state.y, window.innerHeight - 420));

  return (
    <div
      ref={menuRef}
      className={`fixed z-[70] w-56 border rounded-xl shadow-2xl p-1.5 space-y-0.5 animate-in fade-in zoom-in-95 ${
        isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
      }`}
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {element && (
        <>
          <button onClick={openInInspector} className={itemClass}>
            <span className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-sky-500" /> Open in Inspector
            </span>
          </button>
          <button onClick={toggleLock} className={itemClass}>
            <span className="flex items-center gap-2">
              {anyLocked ? (
                <Unlock className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-amber-500" />
              )}
              {anyLocked ? 'Unlock' : 'Lock'}
            </span>
          </button>
          <button onClick={run(duplicateSelected)} className={itemClass}>
            <span className="flex items-center gap-2">
              <Copy className="w-3.5 h-3.5" /> Duplicate
            </span>
          </button>
          {canGroup && (
            <button onClick={run(groupSelection)} className={itemClass}>
              <span className="flex items-center gap-2">
                <Link2 className="w-3.5 h-3.5 text-sky-500" /> Group
              </span>
            </button>
          )}
          {canUngroup && (
            <button onClick={run(ungroupSelection)} className={itemClass}>
              <span className="flex items-center gap-2">
                <Unlink className="w-3.5 h-3.5 text-amber-500" /> Ungroup
              </span>
            </button>
          )}
          <div className={`my-1 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`} />
          <button onClick={reorder('forward')} className={itemClass}>
            <span className="flex items-center gap-2">
              <ChevronUp className="w-3.5 h-3.5" /> Bring Forward
            </span>
          </button>
          <button onClick={reorder('backward')} className={itemClass}>
            <span className="flex items-center gap-2">
              <ChevronDown className="w-3.5 h-3.5" /> Send Backward
            </span>
          </button>
          <div className={`my-1 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`} />
        </>
      )}

      {element && (
        <button
          onClick={run(copySelectedElements)}
          disabled={targetIds.current.length === 0}
          className={`${itemClass} disabled:opacity-40`}
        >
          <span className="flex items-center gap-2">
            <Copy className="w-3.5 h-3.5" /> Copy
          </span>
        </button>
      )}
      {element && (
        <button
          onClick={cut}
          disabled={anyLocked}
          title={anyLocked ? 'Unlock before cutting' : 'Copy and delete'}
          className={`${itemClass} disabled:opacity-40`}
        >
          <span className="flex items-center gap-2">
            <Scissors className="w-3.5 h-3.5" /> Cut
          </span>
        </button>
      )}
      <button onClick={run(pasteElements)} className={itemClass}>
        <span className="flex items-center gap-2">
          <ClipboardPaste className="w-3.5 h-3.5" /> Paste
        </span>
      </button>
      {element && (
        <button onClick={saveAsAssembly} className={itemClass}>
          <span className="flex items-center gap-2">
            <Package className="w-3.5 h-3.5 text-emerald-500" /> Save as Assembly
          </span>
        </button>
      )}

      {element && (
        <>
          <div className={`my-1 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`} />
          <button
            onClick={run(deleteSelectedElements)}
            disabled={anyLocked}
            title={anyLocked ? 'Unlock before deleting' : undefined}
            className={`${itemClass} !text-red-500 hover:!bg-red-500/10 disabled:opacity-40`}
          >
            <span className="flex items-center gap-2">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </span>
          </button>
        </>
      )}
    </div>
  );
};
