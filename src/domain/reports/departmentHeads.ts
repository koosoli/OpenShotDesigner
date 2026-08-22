/**
 * The head-of-department contact block on a call sheet (plan §16).
 *
 * A call sheet is read at 05:00 by someone who needs to reach the person
 * responsible for one thing — the gaffer about a genny, the 1st AD about a
 * schedule slip. The crew table lists everyone alphabetically by department,
 * which is the wrong shape for that: you have to know the name to find the
 * number. The HOD block inverts it, listing by role.
 *
 * Derived from `Person.role` through the existing key-crew vocabulary, never
 * stored (rule 37) — there is no second copy of who the gaffer is, so a change
 * on the crew page is on the next sheet without anyone re-entering it.
 */

import { KEY_CREW_ROLES, callSheetPhone, personHoldsRole } from '../people';
import type { Person } from '../people';

export interface CallSheetDepartmentHead {
  /** Canonical role title — what the sheet is organised by. */
  roleLabel: string;
  department: string;
  displayName: string;
  /** The number to ring today: production-issued when there is one. */
  phone?: string;
  email?: string;
  /** True when several people hold this title (co-directors, two gaffers). */
  shared?: boolean;
}

/**
 * Heads in canonical role order, skipping roles nobody holds.
 *
 * An unfilled role is omitted rather than printed empty: a line reading
 * "Gaffer — —" tells the reader the production has no gaffer, which is almost
 * never what it means. It usually means nobody has typed the title yet, and
 * printing it as a fact is worse than leaving it out (rule 13).
 *
 * When several people carry one title, the first in list order is named and
 * the entry is flagged `shared`, so the sheet can say so instead of silently
 * dropping the others.
 */
export const deriveDepartmentHeads = (
  people: readonly Person[],
): CallSheetDepartmentHead[] => {
  const heads: CallSheetDepartmentHead[] = [];

  for (const role of KEY_CREW_ROLES) {
    const holders = people.filter((person) => personHoldsRole(person, role));
    const [first] = holders;
    if (!first) continue;
    heads.push({
      roleLabel: role.label,
      department: role.department,
      displayName: first.displayName,
      ...(callSheetPhone(first) ? { phone: callSheetPhone(first) } : {}),
      ...(first.email ? { email: first.email } : {}),
      ...(holders.length > 1 ? { shared: true } : {}),
    });
  }

  return heads;
};

/**
 * Heads grouped by department, for a sheet that prints department by
 * department rather than as one list. Departments appear in the order their
 * first head does, so the layout follows the same canonical role order.
 */
export const groupDepartmentHeads = (
  heads: readonly CallSheetDepartmentHead[],
): Array<{ department: string; heads: CallSheetDepartmentHead[] }> => {
  const groups: Array<{ department: string; heads: CallSheetDepartmentHead[] }> = [];
  for (const head of heads) {
    const existing = groups.find((group) => group.department === head.department);
    if (existing) existing.heads.push(head);
    else groups.push({ department: head.department, heads: [head] });
  }
  return groups;
};
