import React, { useMemo, useState } from 'react';
import { Plus, Tag, Trash2 } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  BREAKDOWN_CATEGORIES,
  breakdownCategoryTint,
  groupBreakdownItems,
  removeBreakdownItem,
  scenesForBreakdownItem,
  tagBreakdownItem,
  updateBreakdownItem,
} from '../../domain/script';
import type { BreakdownCategory, BreakdownItem, ScriptScene } from '../../domain/script';
import type { ScriptLine } from '../../types';

interface BreakdownElementsPanelProps {
  /** Script lines, so an element can say which scenes it was tagged in. */
  lines: ScriptLine[];
  /** Scenes derived from those lines. */
  scenes: ScriptScene[];
  isLight: boolean;
}

/**
 * The element manager: every tagged breakdown element grouped by department,
 * with the scenes it appears in resolved through the script lines it was tagged
 * from (rule 37 — the scene list is derived, never stored twice).
 *
 * Elements can also be added here without a script, because plenty of
 * productions know they need a picture vehicle before a page is written.
 */
export const BreakdownElementsPanel: React.FC<BreakdownElementsPanelProps> = ({
  lines,
  scenes,
  isLight,
}) => {
  const { project, updateProjectMeta } = useFloorPlan();
  const [newCategory, setNewCategory] = useState<BreakdownCategory>('prop');
  const [newName, setNewName] = useState('');

  const items = useMemo(() => project.breakdownItems ?? [], [project.breakdownItems]);
  const groups = useMemo(() => groupBreakdownItems(items), [items]);

  const sceneNumbersFor = (item: BreakdownItem) =>
    scenesForBreakdownItem(item, lines, scenes).map((scene) => scene.sceneNumber);

  const patch = (itemId: string, updates: Partial<Omit<BreakdownItem, 'id'>>) =>
    updateProjectMeta((prev) => ({
      breakdownItems: updateBreakdownItem(prev.breakdownItems ?? [], itemId, updates),
    }));

  const remove = (item: BreakdownItem) => {
    if (!window.confirm(`Remove “${item.name}” from the breakdown?`)) return;
    updateProjectMeta((prev) => ({
      breakdownItems: removeBreakdownItem(prev.breakdownItems ?? [], item.id),
    }));
  };

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    updateProjectMeta((prev) => ({
      breakdownItems: tagBreakdownItem(prev.breakdownItems ?? [], { category: newCategory, name }),
    }));
    setNewName('');
  };

  const card = isLight ? 'border-slate-200 bg-white shadow-sm' : 'border-slate-800 bg-slate-900/80';
  const muted = isLight ? 'text-slate-500' : 'text-slate-400';
  const field = `rounded-lg border px-2 py-1 text-[11px] ${
    isLight ? 'bg-white border-slate-300' : 'bg-slate-950 border-slate-700'
  }`;

  return (
    <div className="space-y-3">
      <div className={`border rounded-xl p-2.5 flex flex-wrap items-center gap-1.5 ${card}`}>
        <select
          value={newCategory}
          onChange={(event) => setNewCategory(event.target.value as BreakdownCategory)}
          className={field}
          style={{ borderLeft: `3px solid ${breakdownCategoryTint(newCategory)}` }}
        >
          {BREAKDOWN_CATEGORIES.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Add an element the script does not mention…"
          className={`flex-1 min-w-[12rem] ${field}`}
        />
        <button
          onClick={add}
          disabled={!newName.trim()}
          className={`px-2.5 py-1 rounded-lg text-white text-[11px] font-semibold flex items-center gap-1 ${
            newName.trim() ? 'bg-amber-600 hover:bg-amber-500' : 'bg-slate-500 opacity-40 cursor-not-allowed'
          }`}
        >
          <Plus className="w-3 h-3" /> Add
        </button>
        <span className={`text-[10px] ${muted}`}>
          {items.length} element{items.length === 1 ? '' : 's'}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className={`border border-dashed rounded-xl p-4 text-[11px] ${
          isLight ? 'border-slate-300 text-slate-500' : 'border-slate-700 text-slate-400'
        }`}>
          <p className="flex items-center gap-1.5 font-semibold mb-1">
            <Tag className="w-3.5 h-3.5 text-amber-500" /> Nothing tagged yet
          </p>
          <p>
            Highlight a prop, vehicle or effect in the script and press <strong>Tag element</strong>
            {' '}in the selection bar. Tagging the same thing again in another scene adds that scene
            to the element rather than making a second copy of it.
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.category} className={`border rounded-xl overflow-hidden ${card}`}>
            <header
              className={`px-2.5 py-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider ${
                isLight ? 'bg-slate-50 text-slate-600' : 'bg-slate-950/60 text-slate-300'
              }`}
              style={{ borderLeft: `4px solid ${group.tint}` }}
            >
              <span>{group.label}</span>
              <span className={muted}>{group.items.length}</span>
            </header>
            <ul>
              {group.items.map((item) => {
                const sceneNumbers = sceneNumbersFor(item);
                return (
                  <li
                    key={item.id}
                    className={`px-2.5 py-1.5 flex flex-wrap items-center gap-1.5 border-t ${
                      isLight ? 'border-slate-100' : 'border-slate-800'
                    }`}
                  >
                    <input
                      value={item.name}
                      onChange={(event) => patch(item.id, { name: event.target.value })}
                      title="Element name"
                      className={`flex-1 min-w-[8rem] font-semibold ${field}`}
                    />
                    <select
                      value={item.category}
                      onChange={(event) => patch(item.id, { category: event.target.value as BreakdownCategory })}
                      title="Move this element to another department"
                      className={field}
                    >
                      {BREAKDOWN_CATEGORIES.map((entry) => (
                        <option key={entry.value} value={entry.value}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={item.notes ?? ''}
                      onChange={(event) => patch(item.id, { notes: event.target.value })}
                      placeholder="Notes"
                      title="Notes for the department"
                      className={`flex-1 min-w-[8rem] ${field}`}
                    />
                    <span
                      className={`text-[10px] font-mono px-1.5 py-1 rounded ${
                        sceneNumbers.length > 0
                          ? isLight ? 'bg-violet-500/10 text-violet-600' : 'bg-violet-500/15 text-violet-300'
                          : muted
                      }`}
                      title={
                        sceneNumbers.length > 0
                          ? `Tagged in scene${sceneNumbers.length === 1 ? '' : 's'} ${sceneNumbers.join(', ')}`
                          : 'Not tagged in the script — added by hand, or its scene was cut'
                      }
                    >
                      {sceneNumbers.length > 0 ? `Sc ${sceneNumbers.join(', ')}` : 'no scene'}
                    </span>
                    <button
                      onClick={() => remove(item)}
                      title="Remove this element from the breakdown"
                      className="p-1 rounded opacity-60 hover:opacity-100 hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
};
