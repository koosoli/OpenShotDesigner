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
   * The WORK number: agency, office, or the mobile someone gives out
   * professionally. This is the field that has always existed, so it keeps its
   * name and its meaning — an existing project needs no migration (rule 13).
   *
   * This is what a call sheet prints when no production number was issued.
   */
  phone?: string;
  /**
   * A private number, held for emergencies and never suggested for paperwork.
   *
   * Separate from `phone` precisely so it can be excluded: a call sheet is
   * copied, printed and left on a table, and someone's home number does not
   * belong on it. `callSheetPhone` never returns this.
   */
  privatePhone?: string;
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
  /**
   * Headshot in the asset store, referenced by id — never base64 in project
   * state (rule 26). Project state is snapshotted for undo and copied whole on
   * duplicate, so an inline photo is re-copied every time; the id is fifty
   * bytes and the bytes are stored once, content-addressed.
   */
  headshotAssetId?: string;
  /**
   * How that headshot is cropped into its circle. Absent = centred and
   * unzoomed, which is what `object-fit: cover` does anyway, so nothing needs
   * backfilling (rule 13). Stored beside the image rather than baked into it —
   * see `domain/people/headshot.ts` for why.
   */
  headshotFraming?: import('./headshot').HeadshotFraming;
  /** Optional contact-sheet fields (plan §4.5); absent = unknown, never blank-filled. */
  company?: string;
  address?: string;
  /** Free text such as "€450/day" — never parsed into money math; kept for notes like "+ overtime after 10h". */
  rate?: string;
  /**
   * The structured rate the budget prices this person by: amount, whether it
   * is per day, per week or a flat fee, and the VAT on top (absent = the
   * production's default). Absent means unpriced, which the budget reports
   * rather than reading as free (rule 13).
   */
  rateCard?: import('../budget/types').RateCard;
  /** Budget section override; absent = decided by kind and role (`isAboveTheLine`). */
  aboveTheLine?: boolean;
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
