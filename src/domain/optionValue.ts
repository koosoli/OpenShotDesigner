/**
 * Reading a union-typed value back out of a `<select>`.
 *
 * `e.target.value` is a `string`, and every field it feeds — `rigType`,
 * `sensorFormat`, `timeOfDay`, `cameraAngle` — is a string union. TypeScript
 * will not make that assignment, so fourteen call sites wrote
 * `e.target.value as any` and moved on.
 *
 * The cast is not a style problem. It is the one place in the app where a raw
 * DOM string is written straight into persisted project state, and `as any`
 * removes the only check there was. Rename one option value and the `<option>`
 * list stops matching the union: the old value keeps being written, the field
 * now holds something no renderer has a case for, and the symptom is a camera
 * that draws with no rig or a scene whose time of day prints blank — months
 * later, in an export, with nothing in the code to grep for.
 *
 * `parseOption` costs the same at the call site and keeps the check. It takes
 * the SAME array the `<option>` elements are rendered from, so the allowed set
 * cannot drift from what the user can actually pick, and it falls back to the
 * current value rather than to a hardcoded default: an unrecognised selection
 * leaves the field as it was instead of silently rewriting it to something
 * plausible (rule 13).
 */

/** The `value` fields of an options array, typed as the union they declare. */
export const optionValues = <T extends string>(
  options: readonly { value: T }[],
): readonly T[] => options.map((option) => option.value);

/**
 * `value` when it is one of `allowed`, otherwise `fallback`.
 *
 * `fallback` is normally the field's current value, so a selection that is not
 * in the list is a no-op rather than a write of something invented.
 */
export const parseOption = <T extends string>(
  allowed: readonly T[],
  value: string,
  fallback: T,
): T => ((allowed as readonly string[]).includes(value) ? (value as T) : fallback);

/**
 * `parseOption` against an options array directly, for the common case where
 * the `<option>` elements are rendered by mapping over that same array.
 */
export const parseOptionFrom = <T extends string>(
  options: readonly { value: T }[],
  value: string,
  fallback: T,
): T => parseOption(optionValues(options), value, fallback);
