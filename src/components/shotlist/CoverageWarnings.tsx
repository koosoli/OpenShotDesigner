import React from 'react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { coverageIssues } from '../../domain/shots';
import { PlanningWarnings } from '../common/PlanningWarnings';

/**
 * Coverage warnings above the shot list.
 *
 * Reads the context directly rather than taking a dozen props — the same
 * reason `inspector/elements/LightInspector` does: a prop list that mirrors
 * the context is just a copy of the context.
 *
 * `scope` decides which shots are examined. Scene scope is what someone
 * blocking a scene wants; project scope is what an AD wants before a schedule
 * meeting, and it is the only scope where "this character is in scene 12 and
 * appears in no shot" can be asked at all.
 *
 * ## Why the ids are rewritten before the domain sees them
 *
 * An actor MARKER is a per-setup floor-plan element. The same performer
 * standing in two setups of the same scene is two elements with two ids, and
 * `Shot.subjectActorIds` points at those element ids. Handing that straight to
 * the domain reports one person twice — "CHARACTER C is in scene 1 but appears
 * in no shot", printed once per marker — which is what this did on the sample
 * project before the mapping below existed.
 *
 * So every marker is reduced to a CANONICAL key first: the script character it
 * plays; failing that its display name; failing that its own element id. Shots
 * are translated through the same map, so both sides of every comparison speak
 * the same identity.
 *
 * Matching unlinked markers BY NAME is a judgement, and it is the same one
 * `locations/linking.ts` already makes for set names: two markers both reading
 * "CHARACTER C" are one performer standing in two setups, not two people who
 * happen to share a name. Getting it wrong costs a merged warning; not doing it
 * costs the identical sentence printed once per marker, which is what this did
 * on the sample project. A marker with no name at all stays its own person,
 * because there is nothing to match on.
 */
export interface CoverageWarningsProps {
  scope: 'scene' | 'project';
  isLight: boolean;
}

export const CoverageWarnings: React.FC<CoverageWarningsProps> = ({ scope, isLight }) => {
  const { project, activeSetup } = useFloorPlan();

  const issues = React.useMemo(() => {
    const setups = scope === 'scene' ? [activeSetup] : project.setups;

    /**
     * Every actor marker in the project — not only the ones in scope. A shot
     * in this scene can name a marker that lives on another setup, and a
     * marker missing from the map would leave the performer unnamed in the
     * message for no reason the user could see.
     */
    const canonicalOf = new Map<string, string>();
    const nameOf = new Map<string, string>();
    for (const setup of project.setups) {
      for (const element of setup.elements) {
        if (element.type !== 'actor') continue;
        const name = (element.characterName || element.name || element.characterLetter || '').trim();
        const key = element.characterId ?? (name ? `name:${name.toLocaleLowerCase()}` : element.id);
        canonicalOf.set(element.id, key);
        if (name && !nameOf.has(key)) nameOf.set(key, name);
      }
    }
    const canonical = (elementId: string): string => canonicalOf.get(elementId) ?? elementId;

    const shots = setups.flatMap((setup) =>
      setup.shots.map((shot) => ({
        ...shot,
        subjectActorIds: [...new Set((shot.subjectActorIds ?? []).map(canonical))],
      })),
    );

    /**
     * Which performers a scene contains, for the "in the scene but in no shot"
     * check — only at project scope, where every scene's shots are visible.
     * Asking it scene-by-scene would report a character as uncovered whenever
     * their shots live on a different setup of the same scene.
     *
     * Built from the actor markers rather than from the screenplay, so it works
     * for a project with no script (rule 1); a project with neither supplies
     * nothing and the check is skipped rather than guessed at.
     */
    const sceneActorIds =
      scope === 'project'
        ? project.setups.reduce<Record<string, string[]>>((accumulated, setup) => {
            const sceneNumber = setup.sceneNumber?.trim();
            if (!sceneNumber) return accumulated;
            const keys = setup.elements
              .filter((element) => element.type === 'actor')
              .map((element) => canonical(element.id));
            if (keys.length === 0) return accumulated;
            accumulated[sceneNumber] = [
              ...new Set([...(accumulated[sceneNumber] ?? []), ...keys]),
            ];
            return accumulated;
          }, {})
        : undefined;

    return coverageIssues({
      shots,
      actors: [...nameOf].map(([id, name]) => ({ id, name })),
      ...(sceneActorIds ? { sceneActorIds } : {}),
    });
  }, [scope, activeSetup, project.setups]);

  return (
    <PlanningWarnings
      title={scope === 'scene' ? 'Coverage — this scene' : 'Coverage — whole project'}
      clearMessage={
        'Checked for a wide to cut back to, more than one angle, every performer framed alone, ' +
        'and anyone in a scene with no shot. Nothing found — which is these four questions ' +
        'answered, not a verdict on the coverage.'
      }
      issues={issues}
      isLight={isLight}
    />
  );
};
