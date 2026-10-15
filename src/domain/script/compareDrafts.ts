/**
 * Compare two drafts line by line, with word-level differences.
 *
 * Ported from ScriptCraft's draft comparison (MIT/Apache-2.0,
 * https://github.com/NoJuanNobody/scriptcraft): lines are aligned by element
 * and text (longest common subsequence). In each run of differing lines,
 * removed and added lines that are mostly the same words pair up as
 * **changed**, with a word diff; a removed line whose exact text comes back
 * elsewhere is **moved**; the rest are **added** or **removed**.
 *
 * Two things use it. The revision dialog shows what a new draft changed,
 * down to the word. And re-importing a draft keeps a reworded line's identity
 * (`reconcileScriptLineIds`), so the shot lined over "She opens the door."
 * is still lined over "She slowly opens the door." and the line gets its
 * revision asterisk instead of losing its lining.
 */

export interface DraftLine {
  type?: string;
  text: string;
}

export interface WordPiece {
  op: 'same' | 'added' | 'removed';
  text: string;
}

export type DraftDiffKind = 'added' | 'removed' | 'changed' | 'moved';

export interface DraftDiff {
  kind: DraftDiffKind;
  /** Line index in the older draft. */
  old?: number;
  /** Line index in the newer draft. */
  new?: number;
  type: string;
  /** The newer text, or the removed one. */
  text: string;
  /** For changed lines: the words, in order. */
  pieces?: WordPiece[];
  /** Heading of the scene the line is in (in the draft it belongs to). */
  scene: string;
}

export interface DraftComparison {
  added: number;
  removed: number;
  changed: number;
  moved: number;
  unchanged: number;
  diffs: DraftDiff[];
  /** Older index → newer index for every line that survived, edited or not. */
  pairs: Array<[number, number]>;
}

/** Most table cells for an LCS; bigger inputs fall back to coarser matching. */
const CAP = 4_000_000;

const norm = (text: string) => text.replace(/\s+/g, ' ').trim();
const typeOf = (line: DraftLine) => line.type ?? 'action';
const keyOf = (line: DraftLine) => `${typeOf(line)}\u0000${norm(line.text).toLowerCase()}`;

/** Index pairs of a longest common subsequence, or [] when the table would be too big. */
const lcsPairs = <T>(a: readonly T[], b: readonly T[], eq: (x: T, y: T) => boolean): Array<[number, number]> => {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0 || (n + 1) * (m + 1) > CAP) return [];
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = eq(a[i], b[j])
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
};

/** Runs of word and runs of space, so joining them gives the text back. */
const tokens = (text: string): string[] => text.match(/\s+|\S+/g) ?? [];

/** Word-level diff of two texts. */
export const wordDiff = (a: string, b: string): WordPiece[] => {
  const x = tokens(a);
  const y = tokens(b);
  const out: WordPiece[] = [];
  const push = (op: WordPiece['op'], text: string) => {
    if (!text) return;
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  let i = 0;
  let j = 0;
  for (const [pi, pj] of [...lcsPairs(x, y, (p, q) => p === q), [x.length, y.length] as [number, number]]) {
    while (i < pi) push('removed', x[i++]);
    while (j < pj) push('added', y[j++]);
    if (pi < x.length) push('same', x[pi]);
    i = pi + 1;
    j = pj + 1;
  }
  return out;
};

/** Shared words over all words, 0–1. */
export const textSimilarity = (a: string, b: string): number => {
  const wa = norm(a).toLowerCase().split(' ').filter(Boolean);
  const wb = norm(b).toLowerCase().split(' ').filter(Boolean);
  if (wa.length === 0 && wb.length === 0) return 1;
  const pool = new Map<string, number>();
  for (const word of wb) pool.set(word, (pool.get(word) ?? 0) + 1);
  let shared = 0;
  for (const word of wa) {
    const left = pool.get(word) ?? 0;
    if (left > 0) {
      pool.set(word, left - 1);
      shared += 1;
    }
  }
  return (2 * shared) / (wa.length + wb.length);
};

/** How alike two lines must be to count as one line edited. */
const CHANGED_THRESHOLD = 0.5;
/** Lower bar for a line edited where it stood (same place, same element). */
const IN_PLACE_THRESHOLD = 0.25;

const sceneNames = (lines: readonly DraftLine[]): string[] => {
  let current = '';
  return lines.map((line) => {
    if (typeOf(line) === 'scene') current = norm(line.text);
    return current;
  });
};

/** Compare an older draft with a newer one. */
export const compareDrafts = (older: readonly DraftLine[], newer: readonly DraftLine[]): DraftComparison => {
  const oldKeys = older.map(keyOf);
  const newKeys = newer.map(keyOf);
  let pre = 0;
  while (pre < older.length && pre < newer.length && oldKeys[pre] === newKeys[pre]) pre += 1;
  let suf = 0;
  while (suf < older.length - pre && suf < newer.length - pre && oldKeys[older.length - 1 - suf] === newKeys[newer.length - 1 - suf]) suf += 1;

  const middle = lcsPairs(oldKeys.slice(pre, older.length - suf), newKeys.slice(pre, newer.length - suf), (a, b) => a === b)
    .map(([i, j]) => [i + pre, j + pre] as [number, number]);
  const pairs: Array<[number, number]> = [];
  for (let k = 0; k < pre; k += 1) pairs.push([k, k]);
  pairs.push(...middle);
  for (let k = suf; k > 0; k -= 1) pairs.push([older.length - k, newer.length - k]);

  const removed: number[] = [];
  const added: number[] = [];
  const changed: Array<[number, number]> = [];
  let prev: [number, number] = [pre, pre];
  for (const [i, j] of [...middle, [older.length - suf, newer.length - suf] as [number, number]]) {
    const runOld = Array.from({ length: i - prev[0] }, (_, k) => prev[0] + k);
    const runNew = Array.from({ length: j - prev[1] }, (_, k) => prev[1] + k);
    prev = [i + 1, j + 1];
    // Edited in place: as many lines of the same elements on both sides, each
    // still sharing some words with the one it replaces (a line's identity
    // follows this pairing, so two unrelated lines must not be paired).
    if (
      runOld.length > 0 &&
      runOld.length === runNew.length &&
      runOld.every((a, k) => typeOf(older[a]) === typeOf(newer[runNew[k]]) && textSimilarity(older[a].text, newer[runNew[k]].text) >= IN_PLACE_THRESHOLD)
    ) {
      runOld.forEach((a, k) => changed.push([a, runNew[k]]));
      continue;
    }
    // Pair in order: each removed line with the most alike added one after the last pair.
    let nextNew = 0;
    for (const a of runOld) {
      let best: { k: number; score: number } | undefined;
      for (let k = nextNew; k < runNew.length; k += 1) {
        const b = runNew[k];
        if (typeOf(older[a]) !== typeOf(newer[b])) continue;
        const score = textSimilarity(older[a].text, newer[b].text);
        if (score >= CHANGED_THRESHOLD && (!best || score > best.score)) best = { k, score };
      }
      if (best) {
        for (let k = nextNew; k < best.k; k += 1) added.push(runNew[k]);
        changed.push([a, runNew[best.k]]);
        nextNew = best.k + 1;
      } else {
        removed.push(a);
      }
    }
    for (let k = nextNew; k < runNew.length; k += 1) added.push(runNew[k]);
  }

  // A removed line whose exact text was added elsewhere moved.
  const moved: Array<[number, number]> = [];
  const addedByKey = new Map<string, number[]>();
  for (const b of added) addedByKey.set(newKeys[b], [...(addedByKey.get(newKeys[b]) ?? []), b]);
  const stillRemoved: number[] = [];
  for (const a of removed) {
    const bucket = addedByKey.get(oldKeys[a]);
    const b = bucket?.shift();
    if (b !== undefined) moved.push([a, b]);
    else stillRemoved.push(a);
  }
  const movedNew = new Set(moved.map(([, b]) => b));
  const stillAdded = added.filter((b) => !movedNew.has(b));

  const oldScenes = sceneNames(older);
  const newScenes = sceneNames(newer);
  const diffs: DraftDiff[] = [
    ...changed.map(([a, b]): DraftDiff => ({
      kind: 'changed', old: a, new: b, type: typeOf(newer[b]), text: newer[b].text,
      pieces: wordDiff(norm(older[a].text), norm(newer[b].text)), scene: newScenes[b],
    })),
    ...moved.map(([a, b]): DraftDiff => ({ kind: 'moved', old: a, new: b, type: typeOf(newer[b]), text: newer[b].text, scene: newScenes[b] })),
    ...stillAdded.map((b): DraftDiff => ({ kind: 'added', new: b, type: typeOf(newer[b]), text: newer[b].text, scene: newScenes[b] })),
    ...stillRemoved.map((a): DraftDiff => ({ kind: 'removed', old: a, type: typeOf(older[a]), text: older[a].text, scene: oldScenes[a] })),
  ].sort((x, y) => (x.new ?? x.old ?? 0) - (y.new ?? y.old ?? 0) || (x.old ?? 0) - (y.old ?? 0));

  return {
    added: stillAdded.length,
    removed: stillRemoved.length,
    changed: changed.length,
    moved: moved.length,
    unchanged: pairs.length,
    diffs,
    pairs: [...pairs, ...changed, ...moved].sort((x, y) => x[1] - y[1]),
  };
};
