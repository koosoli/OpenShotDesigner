/**
 * The screenplay slice of the project: writing script lines (with scene
 * numbering, the derived scene list, character catalog, breakdown pruning and
 * omission labels kept in step), the title page, scene-number locking, and
 * the catalog repair for projects saved with drifted character ids.
 * Extracted from `FloorPlanContext`.
 */
import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { Project, ScriptLine } from '../types';
import type { ScreenplayTitlePage } from '../domain/script';
import { deriveScriptBreakdown, scriptScenesHaveDriftedIds } from '../domain/script/logic';
import { hasProductionSceneNumbers, normaliseSceneNumbers } from '../domain/script/numbering';
import { pruneBreakdownScriptLines, screenplayLayoutOptions } from '../domain/script';
import { editScriptText } from '../domain/script/editing';

export const useScreenplay = (input: {
  project: Project;
  setProject: (value: Project | ((prev: Project) => Project)) => void;
  pendingSnapshotsRef: MutableRefObject<Project[]>;
}) => {
  const { project, setProject, pendingSnapshotsRef } = input;

  /**
   * Replace the production's screenplay. It is stored once for the whole
   * project (every scene sees it) and linings that no longer resolve to a line
   * are dropped from each setup.
   *
   * The derived scene list is persisted here (scene ids are their source
   * heading-line ids) so the scheduler can link strips to scenes. Scenes that
   * disappear from the screenplay do NOT silently orphan their schedule
   * strips: affected scene blocks are stamped with an `omittedLabel` and stay
   * visible as OMITTED until the user deletes them.
   */
  const setScriptLines = (lines: ScriptLine[], meta?: { scriptTitle?: string; scriptText?: string; titlePage?: ScreenplayTitlePage }) => {
    const ids = new Set(lines.map((line) => line.id));
    /**
     * Every line id that still exists, including the ones inside an omitted
     * scene's stored body — those lines are hidden, not gone, and a tag on one
     * has to survive restoring the scene.
     *
     * `ids` above is the flat top-level set and is what `scriptMarks` are
     * filtered against; a lining that reached into an omitted body would be
     * drawn nowhere, so dropping it is right. A breakdown tag is a different
     * thing: it is a fact about the words, and the words are still there.
     */
    const liveLineIds = new Set<string>();
    const walkLines = (candidates: readonly ScriptLine[]): void => {
      for (const line of candidates) {
        liveLineIds.add(line.id);
        if (line.omittedBody) walkLines(line.omittedBody);
      }
    };
    walkLines(lines);
    setProject((prev) => {
      // Scene numbers follow the project's regime (domain/script/numbering.ts).
      // A project that has never chosen one is decided by its script: numbers
      // that are not simply positional — an imported production draft with a
      // 12A in it — are kept, anything else is numbered by position.
      const locked = prev.sceneNumbersLocked ?? hasProductionSceneNumbers(lines);
      const previousById = new Map((prev.scriptLines ?? []).map((line) => [line.id, line]));
      const numbered = normaliseSceneNumbers(
        lines.map((line, index) => {
          const before = previousById.get(line.id);
          if (!before || before.text === line.text) return { ...line, lineNumber: index + 1 };
          const adjusted = editScriptText(before, line.text);
          return { ...line, lineNumber: index + 1, ...(line.styles === before.styles ? { styles: adjusted.styles } : {}), ...(line.notes === before.notes ? { notes: adjusted.notes } : {}) };
        }),
        locked,
      );
      // Derive old/new scene lists so removed headings can be detected.
      //
      // The persisted characters MUST be passed in. `buildCharacterCatalog`
      // mints a fresh id for every cue it finds, and `mergeCharacterCatalogs`
      // only preserves a stable id when it has the existing catalog to match
      // against. Deriving with `[]` therefore stamped every scene with
      // character ids that existed nowhere else — so `castAssignments`, which
      // key on the persisted character ids, matched nothing and a scheduled
      // scene produced a call sheet with an empty cast table.
      const layout = screenplayLayoutOptions(prev.screenplayLayout);
      const oldScenes = deriveScriptBreakdown(
        prev.scriptLines || [],
        prev.characters || [],
        prev.locations || [],
        layout,
      ).scenes;
      const derived = deriveScriptBreakdown(numbered, prev.characters || [], prev.locations || [], layout);
      const newScenes = derived.scenes;
      // A scene counts as "live" only when its heading exists AND is not
      // flagged OMITTED — omitted scenes keep their number but are not shootable.
      const newSceneIds = new Set(newScenes.filter((scene) => !scene.omitted).map((scene) => scene.id));
      const omittedLabelById = new Map(
        [...oldScenes, ...newScenes.filter((scene) => scene.omitted)]
          .filter((scene) => !newSceneIds.has(scene.id))
          .map((scene) => [scene.id, `${scene.sceneNumber} · ${scene.heading}`] as const)
      );

      const next: Project = {
        ...prev,
        scriptTitle: meta?.scriptTitle ?? prev.scriptTitle,
        scriptText: meta?.scriptText ?? prev.scriptText,
        // An imported cover belongs to the draft that just arrived; when the
        // file carries none the existing one is kept rather than blanked.
        titlePage: meta?.titlePage ?? prev.titlePage,
        scriptLines: numbered,
        sceneNumbersLocked: locked,
        scriptScenes: newScenes,
        // Persist the merged catalog too: a character discovered by this edit
        // has a fresh id, and it has to be the SAME id next time or the scenes
        // and the cast list drift apart again.
        characters: derived.characters,
        setups: prev.setups.map((setup) => ({
          ...setup,
          // The legacy per-setup copy is cleared so there is one source of truth.
          scriptLines: undefined,
          scriptMarks: (setup.scriptMarks || []).filter(
            (mark) => ids.has(mark.startLineId) && ids.has(mark.endLineId)
          ),
        })),
        /**
         * Breakdown tags pointing at deleted lines are pruned HERE rather than
         * by the script panel, which is where this used to live.
         *
         * It mattered: `setSceneNumbersLocked` and every import path call
         * this function directly, so an edit made anywhere but the panel left
         * tags referencing lines that no longer existed — and the reports read
         * scenes through those tags. Doing it inside the same updater also
         * removes the panel's second `updateProjectMeta` in the same tick,
         * which is the shape of write this codebase has lost data to before.
         */
        breakdownItems: prev.breakdownItems?.length
          ? pruneBreakdownScriptLines(prev.breakdownItems, liveLineIds)
          : prev.breakdownItems,
        scheduleBlocks: (prev.scheduleBlocks || []).map((block) => {
          if (block.kind !== 'scene') return block;
          if (newSceneIds.has(block.scriptSceneId)) {
            // Scene exists again (or never vanished): clear a stale omission stamp.
            if (block.omittedLabel === undefined) return block;
            const next: typeof block = { id: block.id, kind: 'scene', scriptSceneId: block.scriptSceneId };
            if (block.estimatedMinutes !== undefined) next.estimatedMinutes = block.estimatedMinutes;
            return next;
          }
          const label = omittedLabelById.get(block.scriptSceneId);
          if (!label && !block.omittedLabel) return block;
          return label ? { ...block, omittedLabel: label } : block;
        }),
      };
      // Screenplay edits (text, title, omissions) are undoable like any other
      // project change.
      pendingSnapshotsRef.current.push(next);
      return next;
    });
  };

  /** The screenplay's cover. Merged, so the editor can write one field at a time. */
  const setTitlePage = (updates: Partial<ScreenplayTitlePage>) => {
    setProject((prev) => {
      const next = { ...prev, titlePage: { ...(prev.titlePage ?? {}), ...updates } };
      pendingSnapshotsRef.current.push(next);
      return next;
    });
  };

  /**
   * Locking stamps every heading with its current number so nothing shifts
   * again; unlocking renumbers by position. Both go through `setScriptLines`
   * so the derived scene list, strips and omission labels follow.
   */
  const setSceneNumbersLocked = (locked: boolean) => {
    setProject((prev) => {
      const next = { ...prev, sceneNumbersLocked: locked };
      pendingSnapshotsRef.current.push(next);
      return next;
    });
    // Runs after the flag write above (state updates apply in order), so the
    // regime `setScriptLines` reads from `prev` is already the new one.
    setScriptLines(normaliseSceneNumbers(project.scriptLines || [], locked));
  };

  /**
   * Keep the persisted character catalog and the derived scene list in step.
   *
   * `buildCharacterCatalog` mints a fresh id for every cue it finds. Only
   * `mergeCharacterCatalogs`, given the persisted catalog, keeps a stable one.
   * So a project whose `characters` were never persisted regenerates every id
   * each time anything re-derives — and a cast assignment made against one of
   * those ids stops resolving the moment it does. That is silent data loss: the
   * assignment is still in the file, pointing at a character that no longer
   * exists under that id, and the call sheet simply shows no cast.
   *
   * This runs when the catalog is missing, when the scene list is missing, or
   * when the scenes reference characters the project does not have. Projects
   * already saved in that state cannot fix themselves — the old backfill only
   * ran when the scene list was absent, and theirs is present and wrong.
   */
  useEffect(() => {
    if (!project.scriptLines?.length) return;
    const catalogMissing = !project.characters?.length;
    const needsRepair =
      catalogMissing ||
      !project.scriptScenes ||
      scriptScenesHaveDriftedIds(project.scriptScenes, project.characters);
    if (!needsRepair) return;

    setProject((prev) => {
      const stillNeeded =
        !prev.characters?.length ||
        !prev.scriptScenes ||
        scriptScenesHaveDriftedIds(prev.scriptScenes, prev.characters);
      if (!stillNeeded) return prev;
      const derived = deriveScriptBreakdown(
        prev.scriptLines || [],
        prev.characters || [],
        prev.locations || [],
        screenplayLayoutOptions(prev.screenplayLayout),
      );
      // Nothing to persist for a screenplay with no cues in it; returning `prev`
      // keeps this effect from looping on projects that will never have any.
      if (derived.characters.length === 0) return prev;
      return { ...prev, scriptScenes: derived.scenes, characters: derived.characters };
    });
  }, [project.scriptScenes, project.scriptLines, project.characters, setProject]);

  return { setScriptLines, setTitlePage, setSceneNumbersLocked };
};
