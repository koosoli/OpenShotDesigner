/**
 * Camera file names: guessing the next one, and reconciling a card against the
 * day's log.
 *
 * DaVinci Resolve's metadata importer matches rows to clips by file name and
 * nothing else. That makes this the join key of the whole feature, and it is
 * also the field the person keeping continuity cannot know at the moment they
 * are logging: clip counters restart per card, ARRI and RED encode reel and
 * camera into the name, and an aborted take still burns a clip number. A log
 * that drifts by one clip makes Resolve attach EVERY subsequent row to the
 * wrong shot — silently, and not noticed until the grade.
 *
 * So file names are filled afterwards, against the card's actual listing, with
 * the mismatches visible. The increment rule survives as a convenience inside
 * that pass rather than as the thing standing between the user and the next
 * take.
 *
 * Pure functions over strings and plain records.
 */

/**
 * The next file name after `fileName`, or null when there is no honest guess.
 *
 * Two cases, because "increment the last number" is wrong on the naming scheme
 * most likely to be in use:
 *
 *  1. **The stem ends in digits.** That run is the counter; increment it,
 *     keeping the field width and widening only when the number outgrows it.
 *     `C0001` → `C0002`, `A001C009` → `A001C010`, `1.MTS` → `2.MTS`,
 *     `MVI_1234.MOV` → `MVI_1235.MOV`.
 *  2. **The stem ends in letters, but contains a `C####` clip field.** This is
 *     the ARRI/RED/Sony convention — `A001C002_230815_R1AB.mov` is camera A,
 *     reel 001, *clip 002*, dated 15/08/23, on reel R1AB. The rightmost digit
 *     run there is the `1` in `R1AB`, so incrementing it would produce
 *     `R2AB` — a different reel, and a file name that will match nothing in
 *     the media pool. Increment the clip field instead: `A001C003_230815_R1AB.mov`.
 *
 * Anything else returns null. A name with no counter at all (`MASTER.mov`) has
 * no successor, and guessing one would be exactly the confidently-wrong
 * metadata this module exists to prevent.
 */
export const nextFileName = (fileName: string | undefined): string | null => {
  const name = (fileName ?? '').trim();
  if (!name) return null;

  // Split off the extension first: the digits in ".mp4" are not a counter, and
  // a name that is nothing but digits ("1.MTS") must still work.
  const dot = name.lastIndexOf('.');
  const hasExtension = dot > 0;
  const stem = hasExtension ? name.slice(0, dot) : name;
  const extension = hasExtension ? name.slice(dot) : '';

  const bump = (digits: string): string =>
    String(Number(digits) + 1).padStart(digits.length, '0');

  const trailing = /(\d+)$/.exec(stem);
  if (trailing) {
    const head = stem.slice(0, trailing.index);
    return `${head}${bump(trailing[1])}${extension}`;
  }

  // The clip field of a camera-original name. Last one wins, so a path-like
  // stem carrying more than one still resolves to the file's own clip.
  const clip = /^(.*[Cc])(\d+)(\D.*)$/.exec(stem);
  if (clip) return `${clip[1]}${bump(clip[2])}${clip[3]}${extension}`;

  return null;
};

/** A take as this module needs to see it. Keeps the functions testable. */
export interface ReconcilableTake {
  id: string;
  fileName?: string;
}

export type ReconciliationStatus =
  /** A card file lined up with a take in order. */
  | 'matched'
  /** A take with no card file left to give it — the log ran long. */
  | 'take-without-file'
  /** A card file with no take left to take it — the card ran long. */
  | 'file-without-take';

export interface ReconciliationEntry {
  status: ReconciliationStatus;
  takeId?: string;
  fileName?: string;
  /** The take already had a different name; reconciling would overwrite it. */
  replaces?: string;
}

export interface ReconciliationResult {
  entries: ReconciliationEntry[];
  matchedCount: number;
  /** True when either side has leftovers — the pass needs a human. */
  hasDrift: boolean;
}

/**
 * Parse a pasted card listing into file names: one per line, blank lines and
 * surrounding whitespace dropped, directory prefixes stripped.
 *
 * Accepts what people actually paste — a `dir` listing, a column copied out of
 * a spreadsheet, drag-and-dropped names — without asking them to clean it up
 * first.
 */
export const parseCardListing = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^.*[\\/]/, ''))
    .filter((line) => line.length > 0);

/**
 * Line the day's takes up against the card's files, in order.
 *
 * Order is the only signal available — the log has no timecode and the file
 * names carry no take numbers — so this pairs the Nth take with the Nth file
 * and reports the leftovers rather than guessing past them. That is the whole
 * point: `hasDrift` is what tells the user their log and their card disagree,
 * at the one moment it is still cheap to fix.
 */
export const reconcileFileNames = (
  takes: readonly ReconcilableTake[],
  fileNames: readonly string[],
): ReconciliationResult => {
  const entries: ReconciliationEntry[] = [];
  const count = Math.max(takes.length, fileNames.length);
  let matchedCount = 0;

  for (let index = 0; index < count; index += 1) {
    const take = takes[index];
    const fileName = fileNames[index];
    if (take && fileName) {
      matchedCount += 1;
      entries.push({
        status: 'matched',
        takeId: take.id,
        fileName,
        ...(take.fileName && take.fileName !== fileName ? { replaces: take.fileName } : {}),
      });
    } else if (take) {
      entries.push({ status: 'take-without-file', takeId: take.id });
    } else {
      entries.push({ status: 'file-without-take', fileName });
    }
  }

  return {
    entries,
    matchedCount,
    hasDrift: takes.length !== fileNames.length,
  };
};

/**
 * Apply a reconciliation to the takes, returning new records.
 *
 * Only `matched` entries write anything; a take with no file keeps whatever it
 * had rather than being blanked, because losing a name the user typed by hand
 * is worse than leaving the pass incomplete.
 */
export const applyReconciliation = <T extends ReconcilableTake>(
  takes: readonly T[],
  result: ReconciliationResult,
): T[] => {
  const byTakeId = new Map(
    result.entries
      .filter((entry) => entry.status === 'matched' && entry.takeId)
      .map((entry) => [entry.takeId as string, entry.fileName as string] as const),
  );
  return takes.map((take) => {
    const fileName = byTakeId.get(take.id);
    if (fileName === undefined || take.fileName === fileName) return take;
    return { ...take, fileName };
  });
};

/**
 * Fill blank file names by counting on from the last one that is set — the
 * convenience version of the pass, for a card that really is sequential.
 *
 * Stops contributing as soon as the increment rule has no answer (a name with
 * no digits), rather than inventing one.
 */
export const fillSequentialFileNames = <T extends ReconcilableTake>(
  takes: readonly T[],
  startFrom?: string,
): T[] => {
  let previous = startFrom;
  return takes.map((take) => {
    if (take.fileName) {
      previous = take.fileName;
      return take;
    }
    const guess = nextFileName(previous);
    if (guess === null) return take;
    previous = guess;
    return { ...take, fileName: guess };
  });
};
