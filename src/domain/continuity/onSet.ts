import { seedNextTake } from './sticky';
import { takesForDay } from './logic';
import type { Take } from './types';

export interface OnSetTakeInput {
  id: string;
  shotId: string;
  productionDayId?: string;
  loggedAt: string;
  judgement?: boolean;
  comments?: string;
  mos?: boolean;
}

/**
 * Apply one on-set take action to the canonical continuity log.
 *
 * GOOD/NG completes the latest unjudged take for this shot when there is one;
 * otherwise it logs a judged take in one step. TAKE + (no judgement) always
 * starts a new row. Day scoping matters because an open take from yesterday
 * must never be judged by today's button press.
 */
export const recordOnSetTake = (
  takes: readonly Take[],
  input: OnSetTakeInput,
): Take[] => {
  const scoped = input.productionDayId
    ? takesForDay(takes, input.productionDayId)
    : [...takes];
  const unjudged = [...scoped]
    .reverse()
    .find((take) => take.shotId === input.shotId && take.isGoodTake === undefined);

  if (input.judgement !== undefined && unjudged) {
    return takes.map((take) =>
      take.id === unjudged.id
        ? {
            ...take,
            isGoodTake: input.judgement,
            ...(input.comments ? { comments: input.comments } : {}),
            ...(input.mos ? { mos: true } : {}),
          }
        : take,
    );
  }

  const previous = scoped[scoped.length - 1];
  const { take } = seedNextTake(takes, {
    id: input.id,
    shotId: input.shotId,
    productionDayId: input.productionDayId,
    loggedAt: input.loggedAt,
    previous,
  });
  return [
    ...takes,
    {
      ...take,
      ...(input.judgement !== undefined ? { isGoodTake: input.judgement } : {}),
      ...(input.comments ? { comments: input.comments } : {}),
      ...(input.mos ? { mos: true } : {}),
    },
  ];
};
