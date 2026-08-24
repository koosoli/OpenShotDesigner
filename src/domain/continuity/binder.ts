/**
 * Wardrobe, hair, make-up and props continuity — the script supervisor's
 * binder (plan §36).
 *
 * The take log records what was SHOT. This records what it LOOKED LIKE: which
 * coat, which side the parting was on, whether the glass was full. It is the
 * other half of continuity and it answers a different question — not "did we
 * get it" but "will it cut".
 *
 * ## Script day is the organising idea, not scene number
 *
 * A feature is shot out of order. Scene 4 and scene 51 can be the same
 * afternoon in the story and three weeks apart on the schedule, and the
 * costume that has to match is the one from the same SCRIPT DAY, not the one
 * from the adjacent scene number. Everything here is keyed on script day for
 * that reason, and the conflict check below is only possible because of it.
 *
 * Script day is free text ("D1", "N3", "Day 4 — cont."). Productions write it
 * their own way and a fixed format would be one more thing to fight; it is
 * compared case-insensitively and trimmed, which is enough to match "d1"
 * against "D1" and honest about the rest.
 *
 * ## What is deliberately NOT here
 *
 * No automatic verdict on whether two descriptions match. "Blue coat, buttoned"
 * and "blue coat, top button undone" differ, and a machine cannot tell whether
 * that is a continuity error or the point of the scene. What this does instead
 * is put the two side by side and say they differ — which is the question a
 * human answers in a second and an algorithm gets wrong in both directions.
 */

import type { BreakdownCategory } from '../script/types';

/**
 * The departments that keep continuity. A subset of `BreakdownCategory` on
 * purpose — those are the tags in a script, these are the people who own a
 * look — with hair split from make-up because on most productions they are two
 * chairs and two notes.
 */
export const CONTINUITY_DEPARTMENTS = ['wardrobe', 'hair', 'makeup', 'props'] as const;

export type ContinuityDepartment = (typeof CONTINUITY_DEPARTMENTS)[number];

export const CONTINUITY_DEPARTMENT_LABELS: Record<ContinuityDepartment, string> = {
  wardrobe: 'Wardrobe',
  hair: 'Hair',
  makeup: 'Make-up',
  props: 'Props',
};

/** The breakdown category a department's notes correspond to, where one exists. */
export const CONTINUITY_DEPARTMENT_TAGS: Record<ContinuityDepartment, BreakdownCategory> = {
  wardrobe: 'wardrobe',
  hair: 'makeup',
  makeup: 'makeup',
  props: 'prop',
};

/**
 * One continuity note: a department's record of how one character looked in
 * one scene.
 *
 * A note belongs to a CHARACTER and a SCENE. Both are optional and for the same
 * reason the rest of the app makes them optional: a production with no
 * screenplay still dresses people, and a note about a set dressing prop belongs
 * to a scene and to nobody (rule 1).
 */
export interface ContinuityNote {
  id: string;
  department: ContinuityDepartment;
  /** The `Character` this describes, when the project has a script. */
  characterId?: string;
  /**
   * Who this is about when there is no character to point at — an extra, a
   * stand-in, or a production with no screenplay at all. Ignored when
   * `characterId` is set, so the two can never disagree (rule 37).
   */
  characterName?: string;
  /** The scene this was established in. */
  sceneNumber?: string;
  /**
   * The script day, as the production writes it. The field that makes
   * out-of-order shooting checkable at all.
   */
  scriptDay?: string;
  /** What it is: "Navy overcoat, top button undone, scarf in left pocket". */
  description: string;
  /** Anything else: how it got that way, what it changes into. */
  notes?: string;
  /**
   * Continuity photographs, in the asset store, referenced by id.
   *
   * Ids and never base64 (rules 17 and 26). A binder for a feature runs to
   * hundreds of photographs; embedding them would put tens of megabytes into
   * every autosave and into every collaborative document.
   */
  photoAssetIds?: string[];
  /** Setups this note was established on, so the plan can be jumped to. */
  setupIds?: string[];
  /**
   * The state changes DURING the scene — "coat comes off at the door". The one
   * fact a single description cannot hold, and the one most often needed by
   * the next unit to shoot the other half of the same moment.
   */
  changeNote?: string;
}

/** The slice of a project the binder derivations read. */
export interface BinderSources {
  notes: readonly ContinuityNote[];
  /** For naming a character in a message. */
  characters?: ReadonlyArray<{ id: string; canonicalName: string }>;
  /** Scenes, for resolving a scene's script day when a note omits it. */
  scriptScenes?: ReadonlyArray<{ sceneNumber: string; scriptDay?: string }>;
}

/** A script day as written, normalised for comparison only. */
const dayKey = (scriptDay: string | undefined): string =>
  (scriptDay ?? '').trim().toLocaleLowerCase();

/** Who a note is about, as one comparable key. */
const subjectKey = (note: ContinuityNote): string =>
  note.characterId ?? `name:${(note.characterName ?? '').trim().toLocaleLowerCase()}`;

/** Who a note is about, as a display name. */
export const subjectNameOf = (
  note: ContinuityNote,
  characters: BinderSources['characters'],
): string =>
  (note.characterId
    ? characters?.find((character) => character.id === note.characterId)?.canonicalName
    : undefined) ??
  note.characterName?.trim() ??
  'Unnamed';

/**
 * The script day a note applies to: its own, or the one its scene declares.
 *
 * The scene's is the fallback rather than the other way round: a note can
 * legitimately belong to a different script day than its scene, in a flashback
 * or a scene that spans midnight, and the note is the more specific statement.
 */
export const scriptDayOf = (
  note: ContinuityNote,
  scriptScenes: BinderSources['scriptScenes'],
): string | undefined => {
  const own = note.scriptDay?.trim();
  if (own) return own;
  const scene = scriptScenes?.find(
    (candidate) => candidate.sceneNumber.trim() === note.sceneNumber?.trim(),
  );
  return scene?.scriptDay?.trim() || undefined;
};

/** Notes for one character, newest scene last, filtered by department. */
export const notesForCharacter = (
  sources: BinderSources,
  characterKey: string,
  department?: ContinuityDepartment,
): ContinuityNote[] =>
  sources.notes.filter(
    (note) =>
      subjectKey(note) === characterKey &&
      (department === undefined || note.department === department),
  );

/** Notes established in one scene, in entry order. */
export const notesForScene = (
  sources: BinderSources,
  sceneNumber: string,
): ContinuityNote[] =>
  sources.notes.filter((note) => note.sceneNumber?.trim() === sceneNumber.trim());

export interface ContinuityConflict {
  /** The character the descriptions disagree about. */
  subjectKey: string;
  subjectName: string;
  department: ContinuityDepartment;
  /** The script day both notes claim to be on. */
  scriptDay: string;
  /** The notes that differ, in entry order. At least two. */
  notes: ContinuityNote[];
  message: string;
}

/**
 * Where the binder disagrees with itself: the same character, the same
 * department, the same script day, two different descriptions.
 *
 * This is the whole reason to key on script day. On a feature these two notes
 * are written weeks apart by different people and the scenes are nowhere near
 * each other in the schedule — there is no moment at which anyone would
 * naturally compare them.
 *
 * A description that merely differs in case or spacing is NOT a conflict:
 * "Navy overcoat" and "navy  overcoat " are one description typed twice.
 * Anything else is reported and left to a human. Notes with no script day are
 * skipped entirely rather than pooled under a blank one, which would report
 * every un-dayed note as conflicting with every other.
 */
export const continuityConflicts = (sources: BinderSources): ContinuityConflict[] => {
  /** subject → department → script day → notes. */
  const grouped = new Map<string, ContinuityNote[]>();
  for (const note of sources.notes) {
    const day = scriptDayOf(note, sources.scriptScenes);
    if (!day) continue;
    const key = `${subjectKey(note)} ${note.department} ${dayKey(day)}`;
    const list = grouped.get(key);
    if (list) list.push(note);
    else grouped.set(key, [note]);
  }

  const conflicts: ContinuityConflict[] = [];
  for (const notes of grouped.values()) {
    const distinct = new Map<string, ContinuityNote>();
    for (const note of notes) {
      const normalised = note.description.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
      if (!normalised) continue;
      if (!distinct.has(normalised)) distinct.set(normalised, note);
    }
    if (distinct.size < 2) continue;

    const involved = [...distinct.values()];
    const first = involved[0];
    const subjectName = subjectNameOf(first, sources.characters);
    const scriptDay = scriptDayOf(first, sources.scriptScenes) as string;
    const scenes = involved
      .map((note) => note.sceneNumber?.trim())
      .filter((sceneNumber): sceneNumber is string => !!sceneNumber);
    conflicts.push({
      subjectKey: subjectKey(first),
      subjectName,
      department: first.department,
      scriptDay,
      notes: involved,
      message: `${subjectName}'s ${CONTINUITY_DEPARTMENT_LABELS[
        first.department
      ].toLocaleLowerCase()} differs across script day ${scriptDay}${
        scenes.length > 0 ? ` (scenes ${scenes.join(', ')})` : ''
      }.`,
    });
  }

  return conflicts;
};

export interface DepartmentDayEntry {
  department: ContinuityDepartment;
  subjectName: string;
  scriptDay?: string;
  sceneNumbers: string[];
  notes: ContinuityNote[];
}

/**
 * What each department has to prepare for a set of scenes — the sheet a
 * costume supervisor wants the night before.
 *
 * Grouped by department and then by character, because that is the order the
 * work happens in: one person packs wardrobe, another does the chairs, and
 * neither wants the other's rows interleaved.
 *
 * `sceneNumbers` are the scenes on the day this subject's notes cover, so a
 * character appearing in three of the day's scenes is one row naming three
 * scenes rather than three rows. A note with no scene contributes none rather
 * than a blank.
 */
export const departmentDayPlan = (
  sources: BinderSources,
  sceneNumbers: readonly string[],
): DepartmentDayEntry[] => {
  const wanted = new Set(sceneNumbers.map((sceneNumber) => sceneNumber.trim()));
  const grouped = new Map<string, DepartmentDayEntry>();

  for (const note of sources.notes) {
    const sceneNumber = note.sceneNumber?.trim();
    if (!sceneNumber || !wanted.has(sceneNumber)) continue;
    const key = `${note.department} ${subjectKey(note)}`;
    let entry = grouped.get(key);
    if (!entry) {
      entry = {
        department: note.department,
        subjectName: subjectNameOf(note, sources.characters),
        ...(scriptDayOf(note, sources.scriptScenes)
          ? { scriptDay: scriptDayOf(note, sources.scriptScenes) }
          : {}),
        sceneNumbers: [],
        notes: [],
      };
      grouped.set(key, entry);
    }
    if (!entry.sceneNumbers.includes(sceneNumber)) entry.sceneNumbers.push(sceneNumber);
    entry.notes.push(note);
  }

  // Department order as declared, then subject alphabetically — stable, and
  // the order the sheet reads in.
  return [...grouped.values()].sort((a, b) => {
    const byDepartment =
      CONTINUITY_DEPARTMENTS.indexOf(a.department) - CONTINUITY_DEPARTMENTS.indexOf(b.department);
    return byDepartment !== 0 ? byDepartment : a.subjectName.localeCompare(b.subjectName);
  });
};

/** Every distinct script day the binder mentions, in first-use order. */
export const scriptDaysInUse = (sources: BinderSources): string[] => {
  const seen = new Set<string>();
  const days: string[] = [];
  for (const note of sources.notes) {
    const day = scriptDayOf(note, sources.scriptScenes);
    if (!day || seen.has(dayKey(day))) continue;
    seen.add(dayKey(day));
    days.push(day);
  }
  return days;
};

/** Photo asset ids referenced anywhere in the binder, deduplicated. */
export const binderPhotoAssetIds = (notes: readonly ContinuityNote[]): string[] => [
  ...new Set(notes.flatMap((note) => note.photoAssetIds ?? [])),
];
