import React, { useMemo } from 'react';
import type { DraftComparison, DraftDiff } from '../../domain/script/compareDrafts';

const KIND_TONE: Record<DraftDiff['kind'], string> = {
  added: 'text-ok',
  removed: 'text-rose-500',
  changed: 'text-warn',
  moved: 'text-sky-500',
};

const ELEMENT_LABEL: Record<string, string> = {
  scene: 'Heading',
  action: 'Action',
  character: 'Cue',
  parenthetical: 'Paren.',
  dialogue: 'Dialogue',
  transition: 'Transition',
  shot: 'Shot',
  note: 'Note',
};

/** One changed line, word by word: struck-out words removed, underlined words added. */
const DiffText: React.FC<{ diff: DraftDiff }> = ({ diff }) => {
  if (!diff.pieces) {
    return <span className={diff.kind === 'removed' ? 'line-through opacity-70' : ''}>{diff.text}</span>;
  }
  return (
    <span>
      {diff.pieces.map((piece, index) =>
        piece.op === 'same' ? (
          <span key={index}>{piece.text}</span>
        ) : piece.op === 'removed' ? (
          <del key={index} className="text-rose-500 decoration-rose-500/70">{piece.text}</del>
        ) : (
          <ins key={index} className="text-ok no-underline bg-emerald-500/15 rounded-sm">{piece.text}</ins>
        ),
      )}
    </span>
  );
};

/**
 * What a new draft changes, line by line and word by word, grouped by the
 * scene it happens in. Each scene folds open so a long revision stays
 * scannable.
 */
export const DraftDiffList: React.FC<{ comparison: DraftComparison }> = ({ comparison }) => {
  const groups = useMemo(() => {
    const byScene = new Map<string, DraftDiff[]>();
    for (const diff of comparison.diffs) {
      const key = diff.scene || 'Before the first scene';
      byScene.set(key, [...(byScene.get(key) ?? []), diff]);
    }
    return [...byScene.entries()];
  }, [comparison]);

  if (groups.length === 0) return <p className="text-[11px] opacity-60">No line differs from the working draft.</p>;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] opacity-70">
        {comparison.changed} reworded · {comparison.added} new · {comparison.removed} cut{comparison.moved ? ` · ${comparison.moved} moved` : ''} lines.
        Reworded lines keep their linings and tags and are starred in the new colour.
      </p>
      {groups.map(([scene, diffs]) => (
        <details key={scene} className="rounded-lg border border-line px-3 py-1.5 text-[11px]">
          <summary className="cursor-pointer select-none font-semibold flex items-center gap-2">
            <span className="truncate">{scene}</span>
            <span className="ml-auto shrink-0 font-normal opacity-60">{diffs.length} line{diffs.length === 1 ? '' : 's'}</span>
          </summary>
          <ul className="mt-1.5 space-y-1 font-mono">
            {diffs.map((diff, index) => (
              <li key={index} className="flex gap-2">
                <span className={`w-16 shrink-0 font-sans font-black uppercase text-[9px] pt-0.5 ${KIND_TONE[diff.kind]}`}>
                  {diff.kind}
                  <span className="block font-normal normal-case opacity-60">{ELEMENT_LABEL[diff.type] ?? diff.type}</span>
                </span>
                <DiffText diff={diff} />
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
};
