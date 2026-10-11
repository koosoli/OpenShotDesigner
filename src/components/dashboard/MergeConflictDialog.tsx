import React, { useState } from 'react';
import { GitMerge } from 'lucide-react';
import type { MergeConflict } from '../../domain/sync/threeWayMerge';
import { describeMergeValue } from '../../domain/sync/threeWayMerge';
import { useDialogFocusTrap } from '../../utils/useDialogFocusTrap';

/**
 * The few changes a cloud merge could not settle on its own: the same value
 * edited on both sides. One choice per conflict, "mine" preselected.
 */
export const MergeConflictDialog: React.FC<{
  fileName: string;
  theirChanges: number;
  conflicts: MergeConflict[];
  onApply: (useTheirs: Set<number>) => void;
  onCancel: () => void;
}> = ({ fileName, theirChanges, conflicts, onApply, onCancel }) => {
  const [useTheirs, setUseTheirs] = useState<Set<number>>(new Set());
  const ref = useDialogFocusTrap(true);
  const choose = (index: number, theirs: boolean) =>
    setUseTheirs((current) => {
      const next = new Set(current);
      if (theirs) next.add(index);
      else next.delete(index);
      return next;
    });

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/60">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="merge-title"
        tabIndex={-1}
        className="w-full max-w-xl max-h-[85vh] flex flex-col rounded-2xl border border-line bg-surface text-ink shadow-2xl outline-none"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      >
        <div className="px-5 pt-4 pb-3 border-b border-line">
          <h2 id="merge-title" className="text-sm font-bold flex items-center gap-2">
            <GitMerge className="w-4 h-4 text-accent-ink" /> Merge with the newer copy
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            Someone saved <span className="font-semibold text-ink">{fileName}</span> since you opened it.
            {' '}{theirChanges} of their change{theirChanges === 1 ? '' : 's'} merged in on their own; {conflicts.length} change{conflicts.length === 1 ? '' : 's'} touched the same thing as yours. Pick which version to keep for each.
          </p>
        </div>
        <ul className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {conflicts.map((conflict, index) => {
            const theirs = useTheirs.has(index);
            return (
              <li key={index} className="rounded-xl border border-line p-2.5">
                <div className="text-[11px] font-semibold text-ink-soft break-words">{conflict.label}</div>
                <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                  {[false, true].map((pickTheirs) => (
                    <label
                      key={String(pickTheirs)}
                      className={`flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-xs cursor-pointer ${
                        theirs === pickTheirs ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-hover'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`merge-${index}`}
                        checked={theirs === pickTheirs}
                        onChange={() => choose(index, pickTheirs)}
                        className="mt-0.5 accent-sky-700"
                      />
                      <span className="min-w-0">
                        <span className="block text-[10px] font-bold uppercase tracking-wide text-ink-muted">{pickTheirs ? 'Theirs' : 'Mine'}</span>
                        <span className="block break-words">{describeMergeValue(pickTheirs ? conflict.theirs : conflict.mine)}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-line">
          <div className="flex gap-1.5">
            <button type="button" onClick={() => setUseTheirs(new Set())} className="px-2 py-1 rounded-md text-[11px] font-semibold text-ink-muted hover:bg-surface-hover">All mine</button>
            <button type="button" onClick={() => setUseTheirs(new Set(conflicts.map((_, index) => index)))} className="px-2 py-1 rounded-md text-[11px] font-semibold text-ink-muted hover:bg-surface-hover">All theirs</button>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel} className="min-h-[36px] px-3.5 rounded-lg border border-line-strong text-xs font-semibold hover:bg-surface-hover">Cancel</button>
            <button type="button" onClick={() => onApply(useTheirs)} className="min-h-[36px] px-3.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-bold">Merge and save</button>
          </div>
        </div>
      </div>
    </div>
  );
};
