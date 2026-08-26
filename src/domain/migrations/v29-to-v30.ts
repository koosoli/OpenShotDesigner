/**
 * v29 -> v30 gives every cast assignment a stable production cast number.
 *
 * Existing valid positive numbers are preserved. Missing/invalid/duplicate
 * numbers receive the next free positive integer in stored assignment order,
 * making the migration deterministic without guessing story importance.
 */
import type { Project } from '../../types';

type UnknownRecord = Record<string, unknown>;

export const migrateV29ToV30 = (raw: UnknownRecord): Project => {
  const assignments = Array.isArray(raw.castAssignments) ? raw.castAssignments : undefined;
  const used = new Set<number>();
  const nextNumber = (): number => {
    let value = 1;
    while (used.has(value)) value += 1;
    used.add(value);
    return value;
  };

  return {
    ...(raw as unknown as Project),
    ...(assignments
      ? {
          castAssignments: assignments.map((value) => {
            if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
            const assignment = value as UnknownRecord;
            const candidate = assignment.castNumber;
            const valid = typeof candidate === 'number'
              && Number.isInteger(candidate)
              && candidate > 0
              && !used.has(candidate);
            const castNumber = valid ? candidate : nextNumber();
            if (valid) used.add(candidate);
            return { ...assignment, castNumber };
          }),
        }
      : {}),
    schemaVersion: 30,
  } as Project;
};
