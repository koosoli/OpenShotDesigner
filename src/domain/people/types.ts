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
  phone?: string;
  notes?: string;
}

/** Character = screenplay/story entity; Person = real human. Linked, never merged. */
export interface CastAssignment {
  id: string;
  characterId: string;
  personId: string;
  notes?: string;
}
