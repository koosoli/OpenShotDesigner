export type { Person, PersonKind, CastAssignment } from './types';
export {
  PERSON_KINDS,
  PERSON_KIND_LABELS,
  PRODUCTION_DEPARTMENTS,
  assignCast,
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
} from './logic';
export type { DepartmentGroup, PeopleFilter, PeopleReferences } from './logic';
