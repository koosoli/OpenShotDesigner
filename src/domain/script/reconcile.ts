/**
 * Script line identity reconciliation (plan §12).
 *
 * Linings, shot links and schedule strips all point at script line ids, and a
 * scene's id IS its heading line id. Re-parsing a screenplay (raw-text edits,
 * re-importing a revised draft) must therefore reuse the ids of lines that
 * still exist, otherwise every lining is dropped and every scheduled scene is
 * stamped OMITTED. Matching is positional-greedy: each new line claims the
 * next unmatched previous line with the same type and text (scene headings
 * also match on scene number, so a retyped slugline keeps its identity).
 */

export interface ReconcilableLine {
  id: string;
  type?: string;
  text: string;
  sceneNumber?: string;
}

const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim().toLowerCase();

const isSceneHeading = (line: ReconcilableLine): boolean => line.type === 'scene';

/**
 * Returns `next` with ids replaced by the matching ids from `previous` where
 * a line clearly survived. Unmatched lines keep their freshly minted ids.
 * Ids are never duplicated: each previous id is reused at most once.
 */
export const reconcileScriptLineIds = <T extends ReconcilableLine>(
  next: readonly T[],
  previous: readonly ReconcilableLine[],
): T[] => {
  if (previous.length === 0 || next.length === 0) return [...next];

  const used = new Set<string>();
  const claim = (line: ReconcilableLine | undefined): string | undefined => {
    if (!line || used.has(line.id)) return undefined;
    used.add(line.id);
    return line.id;
  };

  // Pass 1: scene headings by scene number (numbers are the stable identity
  // on production drafts, even when the slugline wording changes).
  const headingByNumber = new Map<string, ReconcilableLine[]>();
  for (const line of previous) {
    if (!isSceneHeading(line) || !line.sceneNumber) continue;
    const bucket = headingByNumber.get(line.sceneNumber) ?? [];
    bucket.push(line);
    headingByNumber.set(line.sceneNumber, bucket);
  }
  const resolved = new Map<number, string>();
  next.forEach((line, index) => {
    if (!isSceneHeading(line) || !line.sceneNumber) return;
    const bucket = headingByNumber.get(line.sceneNumber);
    const candidate = bucket?.find((prev) => !used.has(prev.id));
    const id = claim(candidate);
    if (id) resolved.set(index, id);
  });

  // Pass 2: everything else by (type, text), scanning forward from the last
  // match so repeated lines ("Beat.") pair up in order.
  let cursor = 0;
  next.forEach((line, index) => {
    if (resolved.has(index)) return;
    const key = normalize(line.text);
    for (let i = cursor; i < previous.length; i += 1) {
      const prev = previous[i];
      if (used.has(prev.id)) continue;
      if ((prev.type ?? 'action') !== (line.type ?? 'action')) continue;
      if (normalize(prev.text) !== key) continue;
      const id = claim(prev);
      if (id) {
        resolved.set(index, id);
        cursor = i + 1;
      }
      break;
    }
  });

  return next.map((line, index) => {
    const id = resolved.get(index);
    return id && id !== line.id ? { ...line, id } : line;
  });
};
