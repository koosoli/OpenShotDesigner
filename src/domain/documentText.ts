/**
 * The language a production's paperwork is printed in.
 *
 * This is a PROJECT setting, not a browser setting, for exactly the reason
 * currency formatting is (see `documentFormat.ts`). A call sheet is a shared
 * artefact: if it followed the exporting browser, the same document would be
 * German for the producer who made it and English for the AD who re-exported
 * it an hour later, and the crew would be holding two different pages. The
 * production decides once, and every export agrees.
 *
 * The app's own chrome stays on the reader's language — that is `src/i18n`,
 * and it is a different question. A German AD can prefer a German interface
 * while shooting an English-language co-production whose paperwork must be
 * English, and vice versa.
 *
 * Scope, stated honestly: this covers the CALL SHEET. It is the document the
 * crew physically holds, so it was the right one to do first, and doing one
 * document completely is worth more than doing thirteen of them partially.
 * The remaining report views still print English; adding one is a matter of
 * extending `DOCUMENT_STRINGS` and swapping its literals, with no further
 * design decisions to make.
 */

export type DocumentLanguage = 'en' | 'de';

export const DOCUMENT_LANGUAGES: readonly DocumentLanguage[] = ['en', 'de'];

/** How each language is offered in the picker, in its own language. */
export const DOCUMENT_LANGUAGE_LABELS: Record<DocumentLanguage, string> = {
  en: 'English',
  de: 'Deutsch',
};

/**
 * Every string a call sheet prints.
 *
 * English is the source of truth and the fallback: a key missing from another
 * language falls back to English rather than rendering the key itself, because
 * an English word on a German call sheet is readable and `callsheet.unitBase`
 * is not.
 *
 * The German is deliberately the vocabulary German crews actually use on set,
 * not a dictionary translation. "Disposition" is what a German call sheet is
 * called; "Anruf" for `Call` would be wrong and slightly comic.
 */
type DocumentKey =
  | 'callsheet.draft'
  | 'callsheet.generalCrewCall'
  | 'callsheet.plannedWrap'
  | 'callsheet.weather'
  | 'callsheet.sunrise'
  | 'callsheet.sunset'
  | 'callsheet.magicHourAm'
  | 'callsheet.magicHourPm'
  | 'callsheet.unitBase'
  | 'callsheet.parking'
  | 'callsheet.walkies'
  | 'callsheet.nearestHospital'
  | 'callsheet.safetyBulletin'
  | 'callsheet.generalNotes'
  | 'callsheet.readinessWarnings'
  | 'callsheet.shootingSchedule'
  | 'callsheet.totalEstimatedTime'
  | 'callsheet.locations'
  | 'callsheet.location'
  | 'callsheet.address'
  | 'callsheet.map'
  | 'callsheet.openMap'
  | 'callsheet.cast'
  | 'callsheet.crew'
  | 'callsheet.headsOfDepartment'
  | 'callsheet.name'
  | 'callsheet.role'
  | 'callsheet.call'
  | 'callsheet.contact'
  | 'callsheet.contactNotes'
  | 'callsheet.transportAndPickups'
  | 'callsheet.pickUpFrom'
  | 'callsheet.time'
  | 'callsheet.start'
  | 'callsheet.type'
  | 'callsheet.item'
  | 'callsheet.omitted'
  | 'callsheet.pickup';

const EN: Record<DocumentKey, string> = {
  'callsheet.draft': 'DRAFT',
  'callsheet.generalCrewCall': 'General crew call',
  'callsheet.plannedWrap': 'Planned wrap',
  'callsheet.weather': 'Weather',
  'callsheet.sunrise': 'Sunrise',
  'callsheet.sunset': 'Sunset',
  'callsheet.magicHourAm': 'Magic hour AM',
  'callsheet.magicHourPm': 'Magic hour PM',
  'callsheet.unitBase': 'Unit base',
  'callsheet.parking': 'Parking / access',
  'callsheet.walkies': 'Walkies',
  'callsheet.nearestHospital': 'Nearest hospital',
  'callsheet.safetyBulletin': 'Safety bulletin',
  'callsheet.generalNotes': 'General notes',
  'callsheet.readinessWarnings': 'Readiness warnings',
  'callsheet.shootingSchedule': 'Shooting schedule',
  'callsheet.totalEstimatedTime': 'Total estimated time',
  'callsheet.locations': 'Locations',
  'callsheet.location': 'Location',
  'callsheet.address': 'Address',
  'callsheet.map': 'Map',
  'callsheet.openMap': 'Open map',
  'callsheet.cast': 'Cast',
  'callsheet.crew': 'Crew',
  'callsheet.headsOfDepartment': 'Heads of department',
  'callsheet.name': 'Name',
  'callsheet.role': 'Role',
  'callsheet.call': 'Call',
  'callsheet.contact': 'Contact',
  'callsheet.contactNotes': 'Contact / notes',
  'callsheet.transportAndPickups': 'Transport & pick-ups',
  'callsheet.pickUpFrom': 'Pick-up from',
  'callsheet.time': 'Time',
  'callsheet.start': 'Start',
  'callsheet.type': 'Type',
  'callsheet.item': 'Item',
  'callsheet.omitted': 'Omitted',
  'callsheet.pickup': 'P/U',
};

const DE: Partial<Record<DocumentKey, string>> = {
  'callsheet.draft': 'ENTWURF',
  'callsheet.generalCrewCall': 'Allgemeine Crew-Zeit',
  'callsheet.plannedWrap': 'Geplantes Drehende',
  'callsheet.weather': 'Wetter',
  'callsheet.sunrise': 'Sonnenaufgang',
  'callsheet.sunset': 'Sonnenuntergang',
  'callsheet.magicHourAm': 'Blaue Stunde morgens',
  'callsheet.magicHourPm': 'Blaue Stunde abends',
  'callsheet.unitBase': 'Basislager',
  'callsheet.parking': 'Parken / Zufahrt',
  'callsheet.walkies': 'Funkkanäle',
  'callsheet.nearestHospital': 'Nächstes Krankenhaus',
  'callsheet.safetyBulletin': 'Sicherheitshinweise',
  'callsheet.generalNotes': 'Allgemeine Hinweise',
  'callsheet.readinessWarnings': 'Offene Punkte',
  'callsheet.shootingSchedule': 'Drehplan',
  'callsheet.totalEstimatedTime': 'Geschätzte Gesamtzeit',
  'callsheet.locations': 'Motive',
  'callsheet.location': 'Motiv',
  'callsheet.address': 'Adresse',
  'callsheet.map': 'Karte',
  'callsheet.openMap': 'Karte öffnen',
  'callsheet.cast': 'Darsteller',
  'callsheet.crew': 'Crew',
  'callsheet.headsOfDepartment': 'Abteilungsleitungen',
  'callsheet.name': 'Name',
  'callsheet.role': 'Funktion',
  'callsheet.call': 'Zeit',
  'callsheet.contact': 'Kontakt',
  'callsheet.contactNotes': 'Kontakt / Notizen',
  'callsheet.transportAndPickups': 'Transport & Abholungen',
  'callsheet.pickUpFrom': 'Abholung ab',
  'callsheet.time': 'Zeit',
  'callsheet.start': 'Beginn',
  'callsheet.type': 'Art',
  'callsheet.item': 'Position',
  'callsheet.omitted': 'Entfällt',
  'callsheet.pickup': 'N.D.',
};

const DICTIONARIES: Record<DocumentLanguage, Partial<Record<DocumentKey, string>>> = {
  en: EN,
  de: DE,
};

/** Reads a document string, falling back to English for anything untranslated. */
export type DocumentText = (key: DocumentKey) => string;

/**
 * The translator for one language.
 *
 * Returns a plain function rather than an object so call sites read as
 * `t('callsheet.call')` and a missing key is a compile error, not a blank cell
 * on a printed page.
 */
export const documentTextFor = (language: DocumentLanguage | undefined): DocumentText => {
  const dictionary = DICTIONARIES[language ?? 'en'] ?? EN;
  return (key) => dictionary[key] ?? EN[key];
};

/** Every key, for the completeness test. Not used at runtime. */
export const DOCUMENT_TEXT_KEYS = Object.keys(EN) as DocumentKey[];
