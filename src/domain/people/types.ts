/**
 * People domain types (plan §4.5).
 *
 * A Person is a real human being in the production's world: crew, cast,
 * talent, contacts, clients, artists. Characters are screenplay/story
 * entities owned by the script domain; the two are linked via
 * CastAssignment, never merged (plan rule 1: no feature requires a script).
 */

export type PersonKind = 'crew' | 'cast' | 'talent' | 'contact' | 'client' | 'artist' | 'other';

export interface Person {
  id: string;
  displayName: string;
  kind?: PersonKind;
  department?: string;
  role?: string;
  email?: string;
  /**
   * The person's own number — agency, mobile, however they are normally
   * reached. Kept as the number of record beyond this production.
   */
  phone?: string;
  /**
   * A number the production issued for this job only: a rented handset, a
   * department line, a temporary SIM. When present it is what belongs on the
   * call sheet — that is the number the unit should ring today, and it is the
   * one that stops working when the production wraps.
   *
   * Absent means there is no production number, not that it equals `phone`;
   * `callSheetPhone` does the falling back so nothing is ever copied between
   * the two fields (rule 13).
   */
  productionPhone?: string;
  notes?: string;
  /** Optional contact-sheet fields (plan §4.5); absent = unknown, never blank-filled. */
  company?: string;
  address?: string;
  /** Free text such as "€450/day" — never parsed into money math. */
  rate?: string;
  emergencyContact?: string;
  /**
   * Lodging for an away shoot. All optional and independent: a production may
   * know the hotel long before the dates, or the dates before the address.
   * Absent means "not staying / not known" — never an empty booking.
   */
  hotelName?: string;
  hotelAddress?: string;
  /** ISO date (YYYY-MM-DD) or free text; stored exactly as entered. */
  hotelCheckIn?: string;
  hotelCheckOut?: string;
}

/** Character = screenplay/story entity; Person = real human. Linked, never merged. */
export interface CastAssignment {
  id: string;
  characterId: string;
  personId: string;
  notes?: string;
}
