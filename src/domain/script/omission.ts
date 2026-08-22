/**
 * Scene omission (plan §12).
 *
 * Production scripts never renumber when a scene is cut: the slugline stays
 * in place as "SCENE 12 — OMITTED" so every department's paperwork keeps
 * pointing at the same numbers. Deleting a scene heading therefore first
 * *omits* the scene (body lines parked on the heading, heading flagged);
 * restoring puts the body back exactly as it was; deleting the omitted
 * heading a second time removes everything for good.
 *
 * Pure functions over the minimal line shape — no React, no I/O.
 */

export interface OmittableLine {
  id: string;
  type?: string;
  text: string;
  omitted?: boolean;
  /** Body lines removed when the scene was omitted, kept so Restore can bring them back. */
  omittedBody?: OmittableLine[];
}

/** Index range `[start, end)` of the body lines that belong to a scene heading. */
export const sceneBodyRange = <T extends OmittableLine>(
  lines: readonly T[],
  headingId: string,
): { start: number; end: number } | null => {
  const start = lines.findIndex((line) => line.id === headingId);
  if (start === -1 || lines[start].type !== 'scene') return null;
  let end = start + 1;
  while (end < lines.length && lines[end].type !== 'scene') end += 1;
  return { start: start + 1, end };
};

/** True when `lineId` is a scene heading that is currently omitted. */
export const isOmittedHeading = <T extends OmittableLine>(lines: readonly T[], lineId: string): boolean => {
  const line = lines.find((candidate) => candidate.id === lineId);
  return !!line && line.type === 'scene' && line.omitted === true;
};

/**
 * Omit a scene: move its body lines onto the heading (`omittedBody`) and flag
 * it. The heading text and scene number are preserved. Returns the same
 * array when the heading is unknown or already omitted.
 */
export const omitScene = <T extends OmittableLine>(lines: readonly T[], headingId: string): T[] => {
  const range = sceneBodyRange(lines, headingId);
  if (!range) return [...lines];
  const heading = lines[range.start - 1];
  if (heading.omitted) return [...lines];
  const body = lines.slice(range.start, range.end);
  const flagged = { ...heading, omitted: true } as T;
  if (body.length > 0) flagged.omittedBody = body;
  else delete flagged.omittedBody;
  return [...lines.slice(0, range.start - 1), flagged, ...lines.slice(range.end)];
};

/** Clear the omitted flag and put the parked body lines back under the heading. */
export const restoreScene = <T extends OmittableLine>(lines: readonly T[], headingId: string): T[] => {
  const index = lines.findIndex((line) => line.id === headingId);
  if (index === -1) return [...lines];
  const heading = lines[index];
  if (heading.type !== 'scene' || !heading.omitted) return [...lines];
  const { omitted: _omitted, omittedBody, ...rest } = heading;
  const body = (omittedBody ?? []) as T[];
  return [...lines.slice(0, index), rest as T, ...body, ...lines.slice(index + 1)];
};

/**
 * The "delete" gesture for a single line:
 *  - a live scene heading → the scene becomes OMITTED (body parked);
 *  - an omitted heading, or any other line → removed outright.
 */
export const removeLineOrOmit = <T extends OmittableLine>(lines: readonly T[], lineId: string): T[] => {
  const line = lines.find((candidate) => candidate.id === lineId);
  if (!line) return [...lines];
  if (line.type === 'scene' && !line.omitted) return omitScene(lines, lineId);
  return lines.filter((candidate) => candidate.id !== lineId);
};

/** Display label for an omitted heading, e.g. "SCENE 12 — OMITTED". */
export const omittedSceneLabel = (sceneNumber: string | undefined): string =>
  sceneNumber ? `SCENE ${sceneNumber} — OMITTED` : 'SCENE OMITTED';
