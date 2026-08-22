export type { Person, PersonKind, CastAssignment } from './types';
export {
  PERSON_KINDS,
  PERSON_KIND_LABELS,
  PRODUCTION_DEPARTMENTS,
  assignCast,
  callSheetPhone,
  castPersonForCharacter,
  filterPeople,
  groupPeopleByDepartment,
  parsePeopleCsv,
  peopleToCsv,
  personInitials,
  removePerson,
  sortPeople,
  unassignCast,
  upsertPerson,
  usesProductionPhone,
} from './logic';
export type { DepartmentGroup, PeopleFilter, PeopleReferences } from './logic';
export {
  KEY_CREW_ROLES,
  assignKeyCrew,
  keyCrewDisplayName,
  keyCrewMember,
  keyCrewMembers,
  keyCrewRoleByKey,
  personHoldsRole,
  projectHeadFieldsFor,
} from './keyRoles';
export type { KeyCrewRole } from './keyRoles';
