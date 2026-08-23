export type { Person, PersonKind, CastAssignment } from './types';
export {
  DEFAULT_HEADSHOT_FRAMING,
  framingSlack,
  MAX_HEADSHOT_ZOOM,
  headshotImageStyle,
  isDefaultFraming,
  normaliseFraming,
  panFraming,
  zoomFraming,
} from './headshot';
export type { FramingSlack, HeadshotFraming } from './headshot';
export {
  PERSON_KINDS,
  PERSON_KIND_LABELS,
  PRODUCTION_DEPARTMENTS,
  allPhonesFor,
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
