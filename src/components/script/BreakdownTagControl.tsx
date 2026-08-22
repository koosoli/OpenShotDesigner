import React, { useMemo, useState } from 'react';
import { Tag } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import {
  BREAKDOWN_CATEGORIES,
  breakdownCategoryTint,
  breakdownItemKey,
  tagBreakdownItem,
} from '../../domain/script';
import type { BreakdownCategory } from '../../domain/script';

interface BreakdownTagControlProps {
  /** Script line ids the selection covers — the element's source in the script. */
  lineIds: string[];
  /** Text the user highlighted, offered as the element's name. */
  selectedText?: string;
  isLight: boolean;
}

/**
 * "Tag selection as element" — the control that finally lets a breakdown be
 * built from the script (plan §9). It sits in the script selection bar next to
 * *Make Shot* because tagging and lining are the same gesture on the same
 * highlight: one says "a camera covers this", the other "this scene needs that".
 *
 * Tagging the same element twice merges (`tagBreakdownItem`), so this can be
 * naive about whether the user has tagged it before — it only has to say so.
 */
export const BreakdownTagControl: React.FC<BreakdownTagControlProps> = ({
  lineIds,
  selectedText,
  isLight,
}) => {
  const { project, updateProjectMeta } = useFloorPlan();
  const [category, setCategory] = useState<BreakdownCategory>('prop');
  const [name, setName] = useState('');

  const items = useMemo(() => project.breakdownItems ?? [], [project.breakdownItems]);

  // The highlighted words are usually the element's name ("a chipped ASHTRAY"),
  // so offer them rather than making the user retype what they just selected.
  const suggestion = (selectedText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const effectiveName = (name || suggestion).trim();

  const existing = effectiveName
    ? items.find((item) => breakdownItemKey(item) === breakdownItemKey({ category, name: effectiveName }))
    : undefined;

  const tag = () => {
    if (!effectiveName) return;
    updateProjectMeta((prev) => ({
      breakdownItems: tagBreakdownItem(prev.breakdownItems ?? [], {
        category,
        name: effectiveName,
        scriptLineIds: lineIds,
      }),
    }));
    setName('');
  };

  const field = `rounded-lg border px-2 py-1.5 text-[11px] ${
    isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'
  }`;

  return (
    <>
      <select
        value={category}
        onMouseDown={(event) => event.stopPropagation()}
        onChange={(event) => setCategory(event.target.value as BreakdownCategory)}
        title="Which department this element belongs to"
        className={field}
        style={{ borderLeft: `3px solid ${breakdownCategoryTint(category)}` }}
      >
        {BREAKDOWN_CATEGORIES.map((entry) => (
          <option key={entry.value} value={entry.value}>
            {entry.label}
          </option>
        ))}
      </select>
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            tag();
          }
        }}
        placeholder={suggestion ? `Element name (${suggestion})` : 'Element name'}
        title="Leave blank to use the highlighted words"
        className={`flex-1 min-w-[9rem] ${field}`}
      />
      <button
        onMouseDown={(event) => event.preventDefault()}
        onClick={tag}
        disabled={!effectiveName}
        title={
          existing
            ? `Add this scene to “${existing.name}”, which is already tagged elsewhere`
            : 'Add the highlighted text to the scene breakdown as an element'
        }
        className={`px-3 py-1.5 rounded-lg text-white text-[11px] font-semibold flex items-center gap-1 ${
          effectiveName ? 'bg-amber-600 hover:bg-amber-500' : 'bg-slate-500 opacity-40 cursor-not-allowed'
        }`}
      >
        <Tag className="w-3.5 h-3.5" /> {existing ? 'Add to element' : 'Tag element'}
      </button>
    </>
  );
};
