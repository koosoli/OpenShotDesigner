/**
 * Three-way merge of two edited copies of a project against the copy both
 * started from.
 *
 * Two people open the same cloud file, both edit, both save. Instead of
 * "keep yours as a copy or replace theirs", the second save merges: every
 * change made on only one side is kept, and only a value changed on BOTH
 * sides, differently, is a conflict for the user to decide.
 *
 *  - Plain objects merge key by key.
 *  - Lists of objects with an `id` (setups, shots, people, strips, script
 *    lines…) merge item by item, so one person adding a shot while the other
 *    changes a lens is no conflict at all. List order follows whichever side
 *    reordered; if both did, theirs, with our additions placed before the item
 *    they preceded (or at the end). Deleting an item the other side edited is a conflict.
 *  - Lists of unique strings (a day's strip ids) merge the same way, by value.
 *  - Anything else that both sides changed differently is a conflict.
 *
 * View state (zoom, pan, the playhead, which setup is open) is never a
 * conflict: it is this person's view, so theirs is ignored.
 *
 * Pure and framework-free (rule 37). Conflicts default to "mine" in the
 * merged result; `resolveMergeConflicts` applies the user's choices.
 */

export type PathSegment = string | { id: string };

export interface MergeConflict {
  /** Where the conflicting value lives. */
  path: PathSegment[];
  /** Human-readable location: "Scene 1 › Shot 1/2 › lensMm". */
  label: string;
  base: unknown;
  mine: unknown;
  theirs: unknown;
}

export interface MergeResult<T> {
  merged: T;
  conflicts: MergeConflict[];
  /** How many changes from their side were taken in without a conflict. */
  theirChanges: number;
}

/** Keys that describe this person's view of the project, not its content. */
const VIEW_STATE_KEYS = new Set([
  'updatedAt',
  'activeSetupId',
  'continuityDayFilterId',
  'logisticsDayFilterId',
  'canvasScale',
  'canvasOffset',
  'currentBeat',
  'isPlaying',
]);

type Plain = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Plain =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((item, index) => deepEqual(item, other[index]));
  }
  const left = a as Plain;
  const right = b as Plain;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (left[key] === undefined && right[key] === undefined) continue;
    if (!deepEqual(left[key], right[key])) return false;
  }
  return true;
};

const idOf = (value: unknown): string | undefined =>
  isPlainObject(value) && typeof value.id === 'string' ? value.id : undefined;

/** Every item is an object with a unique id, or every item is a unique string. */
const keyedList = (list: unknown): string[] | null => {
  if (!Array.isArray(list)) return null;
  const keys = list.map((item) => (typeof item === 'string' ? item : idOf(item)));
  if (keys.some((key) => key === undefined)) return null;
  if (new Set(keys).size !== keys.length) return null;
  return keys as string[];
};

/** A short name for an item, for conflict labels. */
const nameOf = (item: unknown): string | undefined => {
  if (!isPlainObject(item)) return typeof item === 'string' ? item : undefined;
  for (const key of ['shotNumber', 'name', 'title', 'displayName', 'canonicalName', 'label', 'sceneNumber']) {
    const value = item[key];
    if (typeof value === 'string' && value.trim()) {
      return key === 'shotNumber' ? `Shot ${value}` : value.trim().slice(0, 40);
    }
  }
  if (typeof item.text === 'string') return `“${item.text.trim().slice(0, 30)}${item.text.trim().length > 30 ? '…' : ''}”`;
  return undefined;
};

interface Context {
  conflicts: MergeConflict[];
  theirChanges: number;
}

const mergeValue = (
  base: unknown,
  mine: unknown,
  theirs: unknown,
  path: PathSegment[],
  labels: string[],
  ctx: Context,
): unknown => {
  if (deepEqual(mine, theirs)) return mine;
  if (deepEqual(base, theirs)) return mine;
  if (deepEqual(base, mine)) {
    ctx.theirChanges += 1;
    return theirs;
  }

  if (isPlainObject(mine) && isPlainObject(theirs)) {
    const baseObject = isPlainObject(base) ? base : {};
    const out: Plain = {};
    const keys = new Set([...Object.keys(mine), ...Object.keys(theirs)]);
    for (const key of keys) {
      if (VIEW_STATE_KEYS.has(key)) {
        if (mine[key] !== undefined) out[key] = mine[key];
        continue;
      }
      const value = mergeValue(baseObject[key], mine[key], theirs[key], [...path, key], [...labels, key], ctx);
      if (value !== undefined) out[key] = value;
    }
    return out;
  }

  const mineKeys = keyedList(mine);
  const theirKeys = keyedList(theirs);
  const baseKeys = base === undefined ? [] : keyedList(base);
  if (mineKeys && theirKeys && baseKeys) {
    return mergeKeyedList(base as unknown[] | undefined, mine as unknown[], theirs as unknown[], baseKeys, mineKeys, theirKeys, path, labels, ctx);
  }

  ctx.conflicts.push({ path, label: labels.join(' › '), base, mine, theirs });
  return mine;
};

const mergeKeyedList = (
  base: unknown[] | undefined,
  mine: unknown[],
  theirs: unknown[],
  baseKeys: string[],
  mineKeys: string[],
  theirKeys: string[],
  path: PathSegment[],
  labels: string[],
  ctx: Context,
): unknown[] => {
  const keyOf = (item: unknown) => (typeof item === 'string' ? item : (idOf(item) as string));
  const baseBy = new Map((base ?? []).map((item) => [keyOf(item), item] as const));
  const mineBy = new Map(mine.map((item) => [keyOf(item), item] as const));
  const theirBy = new Map(theirs.map((item) => [keyOf(item), item] as const));

  // Which items survive, and with what content.
  const kept = new Map<string, unknown>();
  const all = new Set([...baseKeys, ...mineKeys, ...theirKeys]);
  for (const key of all) {
    const inBase = baseBy.has(key);
    const inMine = mineBy.has(key);
    const inTheirs = theirBy.has(key);
    const itemLabel = [...labels, nameOf(mineBy.get(key) ?? theirBy.get(key) ?? baseBy.get(key)) ?? key];
    const itemPath: PathSegment[] = [...path, { id: key }];
    if (inMine && inTheirs) {
      kept.set(key, mergeValue(baseBy.get(key), mineBy.get(key), theirBy.get(key), itemPath, itemLabel, ctx));
    } else if (inMine && !inTheirs) {
      if (!inBase) {
        kept.set(key, mineBy.get(key)); // added by me
      } else if (!deepEqual(baseBy.get(key), mineBy.get(key))) {
        // They deleted it, I edited it.
        ctx.conflicts.push({ path: itemPath, label: `${itemLabel.join(' › ')} (deleted by them)`, base: baseBy.get(key), mine: mineBy.get(key), theirs: undefined });
        kept.set(key, mineBy.get(key));
      } else {
        ctx.theirChanges += 1; // they deleted it, I left it alone
      }
    } else if (!inMine && inTheirs) {
      if (!inBase) {
        ctx.theirChanges += 1; // added by them
        kept.set(key, theirBy.get(key));
      } else if (!deepEqual(baseBy.get(key), theirBy.get(key))) {
        // I deleted it, they edited it.
        ctx.conflicts.push({ path: itemPath, label: `${itemLabel.join(' › ')} (deleted by me)`, base: baseBy.get(key), mine: undefined, theirs: theirBy.get(key) });
      }
      // else: I deleted it, they left it alone — stays deleted.
    }
  }

  // Order: the side that reordered wins; both reordered -> theirs, with my
  // additions placed before the item they precede in my list.
  const sameSequence = (a: string[], b: string[]) => {
    const common = a.filter((key) => b.includes(key));
    const other = b.filter((key) => a.includes(key));
    return common.length === other.length && common.every((key, index) => key === other[index]);
  };
  const mineReordered = !sameSequence(baseKeys, mineKeys);
  const primary = mineReordered && sameSequence(baseKeys, theirKeys) ? mineKeys : theirKeys;
  const secondary = primary === mineKeys ? theirKeys : mineKeys;
  const order = primary.filter((key) => kept.has(key));
  secondary.forEach((key, index) => {
    if (!kept.has(key) || order.includes(key)) return;
    // Before the next item it preceded; at the end if it was last.
    let at = order.length;
    for (let ahead = index + 1; ahead < secondary.length; ahead += 1) {
      const position = order.indexOf(secondary[ahead]);
      if (position >= 0) {
        at = position;
        break;
      }
    }
    order.splice(at, 0, key);
  });
  // Items only base had but that a conflict kept (theirs-only edits I deleted, resolved later) are not in either list yet.
  for (const key of kept.keys()) if (!order.includes(key)) order.push(key);
  return order.map((key) => kept.get(key));
};

export const threeWayMerge = <T>(base: T, mine: T, theirs: T): MergeResult<T> => {
  const ctx: Context = { conflicts: [], theirChanges: 0 };
  const merged = mergeValue(base, mine, theirs, [], [], ctx) as T;
  return { merged, conflicts: ctx.conflicts, theirChanges: ctx.theirChanges };
};

/** Write `value` at `path` (undefined removes); returns a new tree. */
const setAtPath = (tree: unknown, path: PathSegment[], value: unknown): unknown => {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (typeof head === 'string') {
    const object = isPlainObject(tree) ? tree : {};
    const next = setAtPath(object[head], rest, value);
    const out: Plain = { ...object };
    if (next === undefined) delete out[head];
    else out[head] = next;
    return out;
  }
  const list = Array.isArray(tree) ? tree : [];
  const index = list.findIndex((item) => (typeof item === 'string' ? item === head.id : idOf(item) === head.id));
  if (rest.length === 0 && value === undefined) return list.filter((_, position) => position !== index);
  if (index < 0) return rest.length === 0 ? [...list, value] : list;
  return list.map((item, position) => (position === index ? setAtPath(item, rest, value) : item));
};

/**
 * Apply the user's choice per conflict. A conflict left out keeps "mine",
 * which the merged result already holds.
 */
export const resolveMergeConflicts = <T>(merged: T, conflicts: MergeConflict[], useTheirs: ReadonlySet<number>): T => {
  let out: unknown = merged;
  conflicts.forEach((conflict, index) => {
    if (useTheirs.has(index)) out = setAtPath(out, conflict.path, conflict.theirs);
  });
  return out as T;
};

/** A short preview of a conflicting value for the chooser. */
export const describeMergeValue = (value: unknown): string => {
  if (value === undefined) return 'deleted';
  if (value === null) return 'empty';
  if (typeof value === 'string') return value.length > 60 ? `“${value.slice(0, 60)}…”` : `“${value}”`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  return nameOf(value) ?? 'changed';
};
