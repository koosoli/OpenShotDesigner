/**
 * Coverage warnings — what an editor will wish you had shot.
 *
 * Everything here is read off data the project already holds: the shot list,
 * the actor markers on the plan, and the scene's characters. Nothing new is
 * typed and nothing is inferred about intent.
 *
 * That last part is the design constraint. A coverage checker that guesses
 * gets ignored: a documentary crew shooting a single locked-off wide is not
 * making a mistake, and a tool that calls it one every time teaches the user
 * to stop reading warnings. So the rules here are the ones that are almost
 * always worth a second look and are cheap to dismiss when they are not:
 *
 *  - a scene with no wide shot to cut back to,
 *  - a scene covered from one angle, where a cut has nowhere to go,
 *  - a character who appears in a scene and is never framed alone,
 *  - a character named in the scene who has no shot at all.
 *
 * Each warning names the scene, and the character where there is one, so the
 * caller can jump to it rather than hunt. Severity is `warning` for the two
 * that block an edit and `note` for the two that are often deliberate — the
 * distinction is the whole reason the list stays readable.
 *
 * NOT included, deliberately: anything about the axis or the 180-degree line.
 * The plan has the geometry to attempt it, and getting it wrong on a scene
 * with a legitimate crossing move would be exactly the false positive that
 * makes the rest of the list worthless.
 */

import type { Shot, ShotSize } from '../../types';

/** Sizes that read as a master: something an editor can cut back out to. */
const WIDE_SIZES: ReadonlySet<ShotSize> = new Set<ShotSize>(['ELS', 'WS', 'FS', 'MWS']);

/** Sizes that isolate a performer. `OTS` deliberately does not: it frames two. */
const SINGLE_SIZES: ReadonlySet<ShotSize> = new Set<ShotSize>(['MS', 'MCU', 'CU', 'ECU']);

export type CoverageIssueCode =
  | 'no_master'
  | 'single_angle'
  | 'character_never_solo'
  | 'character_uncovered';

export type CoverageSeverity = 'warning' | 'note';

export interface CoverageIssue {
  code: CoverageIssueCode;
  severity: CoverageSeverity;
  sceneNumber: string;
  /** The performer the issue is about, where it is about one. */
  actorId?: string;
  actorName?: string;
  /** Ready to show; the caller does not compose these. */
  message: string;
  /** Shots the issue was derived from, so the caller can reveal them. */
  shotIds: string[];
}

/**
 * The slice of a project the check needs.
 *
 * Actors are supplied by id and name rather than as plan elements so the check
 * works for a project that names its cast in the people list and never places a
 * marker on the floor plan — planning without a plan is a supported path
 * (rule 36).
 */
export interface CoverageSources {
  shots: readonly Shot[];
  /** Actor markers / cast members, for naming the performer in the message. */
  actors?: ReadonlyArray<{ id: string; name?: string }>;
  /**
   * Characters a scene is known to contain, from the breakdown, keyed by scene
   * number. Used only for `character_uncovered`: without it that check cannot
   * run, and it is skipped rather than guessed at.
   */
  sceneActorIds?: Readonly<Record<string, readonly string[]>>;
}

const nameOf = (
  actorId: string,
  actors: CoverageSources['actors'],
): string | undefined => actors?.find((actor) => actor.id === actorId)?.name;

/**
 * How a shot is framed, as one comparable string.
 *
 * Two shots count as the same angle when they are the same size from the same
 * camera height — that is what an editor means by "we only got it from one
 * angle". Movement is left out: a pan and a static from the same position do
 * not give a cut anywhere new to go.
 */
const angleKey = (shot: Shot): string => `${shot.shotSize}|${shot.cameraAngle}`;

/** Shots grouped by the scene number they carry, in list order. */
const groupByScene = (shots: readonly Shot[]): Map<string, Shot[]> => {
  const grouped = new Map<string, Shot[]>();
  for (const shot of shots) {
    // A shot with no scene number belongs to no scene and is not evidence
    // about one; reporting it under "" would put a phantom scene on the list.
    const sceneNumber = shot.sceneNumber?.trim();
    if (!sceneNumber) continue;
    const list = grouped.get(sceneNumber);
    if (list) list.push(shot);
    else grouped.set(sceneNumber, [shot]);
  }
  return grouped;
};

/**
 * Coverage warnings for one scene's shots.
 *
 * Omitted shots are excluded throughout: a scene whose only wide was struck
 * has no master, and saying so is the point.
 */
const issuesForScene = (
  sceneNumber: string,
  sceneShots: readonly Shot[],
  sources: CoverageSources,
): CoverageIssue[] => {
  const shots = sceneShots.filter((shot) => shot.status !== 'omitted');
  if (shots.length === 0) return [];

  const issues: CoverageIssue[] = [];
  const allIds = shots.map((shot) => shot.id);

  if (!shots.some((shot) => WIDE_SIZES.has(shot.shotSize))) {
    issues.push({
      code: 'no_master',
      severity: 'warning',
      sceneNumber,
      message: `Scene ${sceneNumber} has no wide shot — nothing to cut back out to.`,
      shotIds: allIds,
    });
  }

  // Only worth saying when there is more than one shot: a scene deliberately
  // covered in a single take is not "one angle", it is one shot, and the
  // no-master check above already speaks for it if it needs speaking for.
  const angles = new Set(shots.map(angleKey));
  if (shots.length > 1 && angles.size === 1) {
    issues.push({
      code: 'single_angle',
      severity: 'note',
      sceneNumber,
      message: `Scene ${sceneNumber} is covered from one angle only (${shots[0].shotSize}, ${shots[0].cameraAngle}).`,
      shotIds: allIds,
    });
  }

  // Performers who appear in the scene's shots, in first-appearance order so
  // the list is stable rather than hash-ordered.
  const appearing: string[] = [];
  const seen = new Set<string>();
  for (const shot of shots) {
    for (const actorId of shot.subjectActorIds ?? []) {
      if (seen.has(actorId)) continue;
      seen.add(actorId);
      appearing.push(actorId);
    }
  }

  for (const actorId of appearing) {
    const soloShots = shots.filter(
      (shot) =>
        (shot.subjectActorIds ?? []).length === 1 &&
        shot.subjectActorIds[0] === actorId &&
        SINGLE_SIZES.has(shot.shotSize),
    );
    if (soloShots.length > 0) continue;
    const actorName = nameOf(actorId, sources.actors);
    issues.push({
      code: 'character_never_solo',
      severity: 'note',
      sceneNumber,
      actorId,
      ...(actorName ? { actorName } : {}),
      message: `${actorName ?? 'A performer'} is never framed alone in scene ${sceneNumber}.`,
      shotIds: shots
        .filter((shot) => (shot.subjectActorIds ?? []).includes(actorId))
        .map((shot) => shot.id),
    });
  }

  // Characters the breakdown says are in the scene but no shot names.
  for (const actorId of sources.sceneActorIds?.[sceneNumber] ?? []) {
    if (seen.has(actorId)) continue;
    const actorName = nameOf(actorId, sources.actors);
    issues.push({
      code: 'character_uncovered',
      severity: 'warning',
      sceneNumber,
      actorId,
      ...(actorName ? { actorName } : {}),
      message: `${actorName ?? 'A performer'} is in scene ${sceneNumber} but appears in no shot.`,
      shotIds: [],
    });
  }

  return issues;
};

/**
 * Every coverage warning across the project, grouped scene by scene in the
 * order the scenes first appear in the shot list.
 *
 * An empty array means the checks found nothing, NOT that the coverage is
 * good — these are four specific questions, not a verdict, and the caller
 * should say so rather than printing a tick.
 */
export const coverageIssues = (sources: CoverageSources): CoverageIssue[] => {
  const grouped = groupByScene(sources.shots);
  const issues: CoverageIssue[] = [];
  for (const [sceneNumber, sceneShots] of grouped) {
    issues.push(...issuesForScene(sceneNumber, sceneShots, sources));
  }

  // Scenes the breakdown knows about that have no shots at all: every listed
  // character is uncovered, and reporting them one by one would bury the real
  // finding, which is that the scene has not been broken down yet.
  for (const [sceneNumber, actorIds] of Object.entries(sources.sceneActorIds ?? {})) {
    if (grouped.has(sceneNumber)) continue;
    issues.push({
      code: 'character_uncovered',
      severity: 'warning',
      sceneNumber,
      message: `Scene ${sceneNumber} has no shots (${actorIds.length} character${
        actorIds.length === 1 ? '' : 's'
      } in the scene).`,
      shotIds: [],
    });
  }

  return issues;
};

/** Counts by severity, for a badge that does not need the whole list. */
export const coverageSummary = (
  issues: readonly CoverageIssue[],
): { warnings: number; notes: number } => ({
  warnings: issues.filter((issue) => issue.severity === 'warning').length,
  notes: issues.filter((issue) => issue.severity === 'note').length,
});
