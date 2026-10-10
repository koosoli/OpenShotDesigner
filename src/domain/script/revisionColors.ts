/**
 * Script revision colours — the WGA/industry page-colour sequence.
 *
 * Once a script is locked, every set of changes goes out on a new colour:
 * White (the original), Blue, Pink, Yellow, Green, Goldenrod, Buff, Salmon,
 * Cherry, then round again as "2nd White", "2nd Blue" and so on. A changed
 * line carries an asterisk in the right margin so readers can find what moved.
 *
 * The colour of the working draft is the number of revised drafts imported so
 * far, unless someone set it by hand (`Project.scriptRevisionColor`).
 */

export const REVISION_COLORS = [
  { key: 'white', label: 'White', hex: '#ffffff' },
  { key: 'blue', label: 'Blue', hex: '#bfdbfe' },
  { key: 'pink', label: 'Pink', hex: '#fbcfe8' },
  { key: 'yellow', label: 'Yellow', hex: '#fef08a' },
  { key: 'green', label: 'Green', hex: '#bbf7d0' },
  { key: 'goldenrod', label: 'Goldenrod', hex: '#fcd34d' },
  { key: 'buff', label: 'Buff', hex: '#f5deb3' },
  { key: 'salmon', label: 'Salmon', hex: '#fca5a5' },
  { key: 'cherry', label: 'Cherry', hex: '#f87171' },
] as const;

export type RevisionColorKey = (typeof REVISION_COLORS)[number]['key'];

export interface RevisionColor {
  /** Position in the endless sequence: 0 = White, 9 = 2nd White. */
  index: number;
  key: RevisionColorKey;
  /** "Blue", "2nd White". */
  label: string;
  hex: string;
}

const ORDINAL = ['', '2nd ', '3rd ', '4th ', '5th '];

export const revisionColorAt = (index: number): RevisionColor => {
  const safe = Math.max(0, Math.floor(index));
  const base = REVISION_COLORS[safe % REVISION_COLORS.length];
  const round = Math.floor(safe / REVISION_COLORS.length);
  return { index: safe, key: base.key, label: `${ORDINAL[round] ?? `${round + 1}th `}${base.label}`, hex: base.hex };
};

/** The working draft's colour: set by hand, else one step per imported revision. */
export const currentRevisionColor = (project: {
  scriptRevisionColor?: number;
  scriptRevisions?: readonly unknown[];
}): RevisionColor => revisionColorAt(project.scriptRevisionColor ?? (project.scriptRevisions?.length ?? 0));

/**
 * Mark the lines a new draft changed. Lines that kept their identity through
 * `reconcileScriptLineIds` (same text) keep whatever mark they had; lines
 * with a fresh id — new or reworded — are marked with the new colour.
 */
export const markRevisedLines = <T extends { id: string; revisedIn?: number }>(
  next: readonly T[],
  previousIds: ReadonlySet<string>,
  colorIndex: number,
): T[] => next.map((line) => (previousIds.has(line.id) ? line : { ...line, revisedIn: colorIndex }));
