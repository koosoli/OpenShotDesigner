import type { Take } from './types';

export type SlateTag = NonNullable<Take['slateTag']>;

/** Format the shot field as it should be written on reports and sent to editorial. */
export const taggedShotNumber = (
  shotNumber: string | undefined,
  tag: SlateTag | undefined,
): string => {
  const base = (shotNumber ?? '').trim();
  if (!tag) return base;
  if (!base) return tag;
  const suffix = `-${tag}`;
  return base.toUpperCase().endsWith(suffix) ? base : `${base}${suffix}`;
};
