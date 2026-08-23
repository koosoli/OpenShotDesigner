/**
 * Derived paperwork (plan §16, §4.12 derived-view rule).
 *
 * Call sheets / crew sheets DERIVE from canonical project data. Only explicit
 * user overrides are stored — never a hidden duplicate copy of every field.
 */

import { callSheetPhone } from '../people';
import { deriveDaylight } from './callSheetSun';
import type { CallSheetDaylight } from './callSheetSun';
import { deriveDepartmentHeads } from './departmentHeads';
import { resolveStandingCallSheet } from './standingCallSheet';
import type { StandingCallSheet } from './standingCallSheet';
import type { StripContext } from './stripContext';
import type { CallSheetDepartmentHead } from './departmentHeads';
import type { Person } from '../people';
import type { ProductionDay, ScheduleBlock } from '../scheduling';

export type DocumentLifecycle = 'draft' | 'published' | 'superseded';

export interface CallSheetLocation {
  name: string;
  address?: string;
  /** Optional pin (WGS84) so paperwork can link out to a map provider. */
  lat?: number;
  lng?: number;
}

/** One captured map and the location it belongs to. */
export interface CallSheetMapPicture {
  assetId: string;
  locationName: string;
  address?: string;
}

/** Company contact block derived onto every sheet (single canonical source). */
export interface CallSheetCompanyInfo {
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
}

export interface CallSheetEntry {
  label: string;
  kind: ScheduleBlock['kind'];
  /** Scene number this strip belongs to — the key the whole sheet is read by. */
  sceneNumber?: string;
  /** Where this strip shoots; canonical name when linked, the set name otherwise. */
  location?: string;
  /** "INT. LIVING ROOM - DAY": the heading the strip shoots under. */
  slugline?: string;
  estimatedMinutes?: number;
  /** Derived clock time. Unknown after the first block without a duration. */
  scheduledStart?: string;
  /** True when the block referenced an entity we could not resolve. */
  unresolved?: boolean;
  /** True for strips whose scene was omitted from the screenplay. */
  omitted?: boolean;
}

export interface CallSheetPerson {
  displayName: string;
  /** Headshot asset id, so the sheet can show a face beside the name. */
  headshotAssetId?: string;
  department?: string;
  role?: string;
  email?: string;
  phone?: string;
  /**
   * This person's own call, when they have one. Absent means they work to the
   * general crew call — which is what the sheet already says at the top, so it
   * is never restated per line.
   */
  callTime?: string;
  /** What that call is for: make-up, pre-rig, travel. */
  callNote?: string;
  /**
   * This person's transport pick-up, when one is arranged. Lives on the row as
   * well as in the pick-up table because that is where the person looks for
   * it: a performer reads their own line, not a list at the foot of the sheet.
   */
  pickupTime?: string;
  pickupLocation?: string;
}

/** One resolved transport pick-up on a call sheet. */
export interface CallSheetPickup {
  displayName: string;
  role?: string;
  phone?: string;
  time?: string;
  location?: string;
  notes?: string;
  /** True when the referenced person no longer exists in the contact list. */
  unresolved?: boolean;
}

/** Sneak peek of the following shooting day printed at the foot of a sheet. */
export interface CallSheetLookAhead {
  dayName: string;
  date?: string;
  crewCall?: string;
  plannedWrap?: string;
  locations: CallSheetLocation[];
  /** Labels of the scheduled items in order (manual banners included). */
  items: Array<{ label: string; kind: ScheduleBlock['kind']; omitted?: boolean }>;
  /** Cast / talent called for that day (after cast filtering). */
  cast: CallSheetPerson[];
}

export interface CallSheetData {
  productionTitle: string;
  productionCompany?: string;
  productionCompanyInfo?: CallSheetCompanyInfo;
  productionLogo?: string;
  dayName: string;
  date?: string;
  crewCall?: string;
  plannedWrap?: string;
  type: NonNullable<ProductionDay['callSheet']>['type'];
  /** True until the day is explicitly marked final; drives the DRAFT watermark. */
  isDraft: boolean;
  /** True when cast numbers were deliberately withheld, so the sheet can say so. */
  castContactsHidden: boolean;
  parking?: string;
  /** Walkie plan, inherited from the production unless the day overrides it. */
  walkieChannels?: string;
  /** Where the unit is based, same inheritance. */
  unitBase?: string;
  nearestHospital?: string;
  weatherSummary?: string;
  /** Sunrise / sunset for the day: calculated from the location, override wins. */
  daylight: CallSheetDaylight;
  safetyNotes?: string;
  generalNotes?: string;
  /** Free-text transport arrangements for the day. */
  pickupNotes?: string;
  /**
   * Resolved pick-up list. A row whose person was deleted keeps its time and
   * location and is marked `unresolved`, so transport that was planned never
   * silently disappears from a sheet (plan rule 13).
   */
  pickups: CallSheetPickup[];
  locations: CallSheetLocation[];
  /**
   * Captured location maps, when the sheet asks for them: one per pinned
   * location, each labelled with the place it shows. Empty when the sheet has
   * none or the toggle is off.
   */
  maps: CallSheetMapPicture[];
  schedule: CallSheetEntry[];
  cast: CallSheetPerson[];
  crew: CallSheetPerson[];
  /**
   * Heads of department by role, so the sheet can be read by "who do I ring
   * about this" rather than by name. Derived from the crew list (rule 37).
   */
  departmentHeads: CallSheetDepartmentHead[];
  totalEstimatedMinutes: number | null;
  warnings: string[];
  /** Present when a following shooting day exists. */
  lookAhead?: CallSheetLookAhead;
}

/** Explicit, user-entered exception on top of derived defaults (rule 37). */
export interface SheetOverride {
  /** Dotted field path into CallSheetData, e.g. 'crewCall'. */
  field: string;
  value: string;
}

export interface GeneratedSheet {
  lifecycle: DocumentLifecycle;
  derived: CallSheetData;
  overrides: SheetOverride[];
  generatedAt: string;
}

export interface DeriveCallSheetInput {
  day: ProductionDay;
  blocks: ScheduleBlock[];
  productionTitle: string;
  productionCompany?: string;
  productionCompanyInfo?: CallSheetCompanyInfo;
  productionLogo?: string;
  /** Production-level content every day inherits unless it overrides a field. */
  standingCallSheet?: StandingCallSheet;
  people?: Person[];
  /** When supplied, only these cast/talent people are called for the day. */
  castPersonIds?: string[];
  /** Locations derived by the caller from the day's scheduled entities. */
  locations?: CallSheetLocation[];
  resolveSceneLabel?: (scriptSceneId: string) => string | undefined;
  resolveSetupLabel?: (setupId: string) => string | undefined;
  resolveSegmentLabel?: (segmentId: string) => string | undefined;
  resolveCueLabel?: (cueId: string) => string | undefined;
  resolveShotLabel?: (shotIds: string[]) => string | undefined;
  /** Scene number and location per strip — see `stripContext.ts`. */
  resolveStripContext?: (block: ScheduleBlock) => StripContext | undefined;
  /** The following shooting day, for the look-ahead block. */
  nextDay?: {
    day: ProductionDay;
    locations?: CallSheetLocation[];
    castPersonIds?: string[];
  };
}

/**
 * Which captured pictures print, and what each is captioned. Per-location maps
 * take their caption from the location they were captured for — matched by
 * name against today's resolved locations so the address rides along — and a
 * pre-v21 single map is read as the first pinned location's. A map whose
 * location is no longer on the day still prints under its stored name rather
 * than vanishing: someone chose to fetch it.
 */
export const deriveMapPictures = (
  callSheet: NonNullable<ProductionDay['callSheet']>,
  locations: readonly CallSheetLocation[],
): CallSheetMapPicture[] => {
  const byName = (name: string) => locations.find((location) => location.name.trim().toLowerCase() === name.trim().toLowerCase());
  const pictures: CallSheetMapPicture[] = (callSheet.locationMaps ?? []).map((map) => {
    const location = byName(map.locationName);
    return { assetId: map.assetId, locationName: location?.name ?? map.locationName, ...(location?.address ? { address: location.address } : {}) };
  });
  if (pictures.length === 0 && callSheet.mapAssetId) {
    const pinned = locations.find((location) => typeof location.lat === 'number' && typeof location.lng === 'number') ?? locations[0];
    pictures.push({ assetId: callSheet.mapAssetId, locationName: pinned?.name ?? 'Location', ...(pinned?.address ? { address: pinned.address } : {}) });
  }
  return pictures;
};

const labelForBlock = (block: ScheduleBlock, input: DeriveCallSheetInput): { label: string; omitted?: boolean } => {
  switch (block.kind) {
    case 'scene':
      if (block.omittedLabel !== undefined) return { label: `Omitted — ${block.omittedLabel}`, omitted: true };
      return { label: input.resolveSceneLabel?.(block.scriptSceneId) ?? `Unresolved scene ${block.scriptSceneId}` };
    case 'setup':
      return { label: input.resolveSetupLabel?.(block.setupId) ?? `Unresolved setup ${block.setupId}` };
    case 'segment':
      return { label: input.resolveSegmentLabel?.(block.segmentId) ?? `Unresolved segment ${block.segmentId}` };
    case 'cue':
      return { label: input.resolveCueLabel?.(block.cueId) ?? `Unresolved cue ${block.cueId}` };
    case 'shots':
      return { label: input.resolveShotLabel?.(block.shotIds) ?? `${block.shotIds.length} shot(s)` };
    case 'manual':
      return { label: block.label };
  }
};

const minutesOf = (block: ScheduleBlock): number | undefined =>
  'estimatedMinutes' in block ? block.estimatedMinutes : undefined;

const parseClockMinutes = (clock: string | undefined): number | null => {
  if (!clock || !/^\d{1,2}:\d{2}$/.test(clock)) return null;
  const [hours, minutes] = clock.split(':').map(Number);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const formatClockMinutes = (total: number): string => {
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
};

/**
 * Build the derived call-sheet data for one production day. Missing links and
 * missing estimates surface as warnings — they never silently disappear.
 */
export const deriveCallSheet = (input: DeriveCallSheetInput): CallSheetData => {
  const { day, blocks, productionTitle, productionCompany, productionCompanyInfo, productionLogo, people = [], locations = [] } = input;
  const warnings: string[] = [];

  // Standing content resolves before anything reads it, so the warnings below
  // and the printed sheet agree about what the day actually says.
  const standing = resolveStandingCallSheet(input.standingCallSheet, day.callSheet);

  const scheduled = day.scheduleBlockIds
    .map((id) => blocks.find((b) => b.id === id))
    .filter((b): b is ScheduleBlock => !!b);

  const unknownBlockIds = day.scheduleBlockIds.filter(
    (id) => !blocks.some((b) => b.id === id),
  );
  if (unknownBlockIds.length > 0) {
    warnings.push(`${unknownBlockIds.length} schedule block(s) could not be resolved.`);
  }

  let runningMinutes = parseClockMinutes(day.crewCall);
  const schedule: CallSheetEntry[] = scheduled.map((block) => {
    const entry = entryFor(block);
    // Scene and location ride alongside the label, never inside it, so the
    // sheet can give them their own columns.
    return { ...entry, ...(input.resolveStripContext?.(block) ?? {}) };
  });

  function entryFor(block: ScheduleBlock): CallSheetEntry {
    const scheduledStart = runningMinutes === null ? undefined : formatClockMinutes(runningMinutes);
    const duration = minutesOf(block);
    if (runningMinutes !== null) runningMinutes = duration === undefined ? null : runningMinutes + duration;
    switch (block.kind) {
      case 'scene': {
        // A scene removed from the screenplay stays as an explicit OMITTED
        // strip: it prints as informational, needs no estimate and raises no
        // "not found" warning.
        if (block.omittedLabel !== undefined) {
          return { label: `Omitted — ${block.omittedLabel}`, kind: block.kind, estimatedMinutes: 0, scheduledStart, omitted: true };
        }
        const label = input.resolveSceneLabel?.(block.scriptSceneId);
        if (!label) warnings.push(`Scene ${block.scriptSceneId} not found.`);
        return { label: label ?? `Unresolved scene ${block.scriptSceneId}`, kind: block.kind, estimatedMinutes: block.estimatedMinutes, scheduledStart, unresolved: !label };
      }
      case 'setup': {
        const label = input.resolveSetupLabel?.(block.setupId);
        if (!label) warnings.push(`Setup ${block.setupId} not found.`);
        return { label: label ?? `Unresolved setup ${block.setupId}`, kind: block.kind, estimatedMinutes: block.estimatedMinutes, scheduledStart, unresolved: !label };
      }
      case 'segment': {
        const label = input.resolveSegmentLabel?.(block.segmentId);
        if (!label) warnings.push(`Segment ${block.segmentId} not found.`);
        return { label: label ?? `Unresolved segment ${block.segmentId}`, kind: block.kind, estimatedMinutes: block.estimatedMinutes, scheduledStart, unresolved: !label };
      }
      case 'cue': {
        const label = input.resolveCueLabel?.(block.cueId);
        if (!label) warnings.push(`Cue ${block.cueId} not found.`);
        return { label: label ?? `Unresolved cue ${block.cueId}`, kind: block.kind, estimatedMinutes: block.estimatedMinutes, scheduledStart, unresolved: !label };
      }
      case 'shots': {
        const label = input.resolveShotLabel?.(block.shotIds);
        if (input.resolveShotLabel && !label) warnings.push(`${block.shotIds.length} scheduled shot(s) could not be resolved.`);
        return { label: label ?? `${block.shotIds.length} shot(s)`, kind: block.kind, estimatedMinutes: block.estimatedMinutes, scheduledStart, unresolved: Boolean(input.resolveShotLabel && !label) };
      }
      case 'manual':
        return { label: block.label, kind: block.kind, estimatedMinutes: block.estimatedMinutes, scheduledStart };
    }
  }

  for (const entry of schedule) {
    if (entry.estimatedMinutes === undefined) {
      warnings.push(`"${entry.label}" has no time estimate.`);
    }
  }

  // Locations are derived by the caller from scheduled entities (rule 37).
  const resolvedLocations = locations;

  const castIdFilter = input.castPersonIds ? new Set(input.castPersonIds) : null;
  const hideCastContacts = day.callSheet?.hideCastContacts === true;
  // Individual calls, keyed by person, applied to both lists below.
  const personCalls = new Map(
    (day.callSheet?.personCalls ?? []).map((entry) => [entry.personId, entry] as const),
  );
  // Pick-ups, keyed the same way. A person collected twice keeps the earliest
  // row; the full table below the cast list still shows every pick-up.
  const personPickups = new Map<string, { time?: string; location?: string }>();
  for (const pickup of day.callSheet?.pickups ?? []) {
    if (!personPickups.has(pickup.personId)) personPickups.set(pickup.personId, pickup);
  }
  const callFor = (personId: string) => {
    const entry = personCalls.get(personId);
    const pickup = personPickups.get(personId);
    return {
      ...(entry?.time ? { callTime: entry.time } : {}),
      ...(entry?.note ? { callNote: entry.note } : {}),
      ...(pickup?.time ? { pickupTime: pickup.time } : {}),
      ...(pickup?.location ? { pickupLocation: pickup.location } : {}),
    };
  };
  // An individual call is an explicit statement that this person is wanted on
  // this day, so it overrides the derived cast filter. Without this, giving a
  // performer a 06:15 make-up call quietly did nothing whenever the day's
  // scenes did not already resolve to them — the call was stored, and the
  // person it belonged to was filtered off the sheet before it could show.
  const cast = people
    .filter(
      (p) =>
        (p.kind === 'cast' || p.kind === 'talent') &&
        (!castIdFilter || castIdFilter.has(p.id) || personCalls.has(p.id) || personPickups.has(p.id)),
    )
    .map((p) => ({
      displayName: p.displayName,
      ...(p.headshotAssetId ? { headshotAssetId: p.headshotAssetId } : {}),
      role: p.role,
      // Withheld together: an email reaches a performer as surely as a number.
      ...(hideCastContacts ? {} : { email: p.email, phone: callSheetPhone(p) }),
      ...callFor(p.id),
    }));
  const crew = people
    .filter((p) => p.kind === 'crew')
    .map((p) => ({
      ...callFor(p.id),
      displayName: p.displayName,
      department: p.department,
      role: p.role,
      email: p.email,
      phone: callSheetPhone(p),
    }));

  const estimates = schedule.map((e) => e.estimatedMinutes);
  const totalEstimatedMinutes = estimates.every((m) => m !== undefined)
    ? estimates.reduce<number>((sum, m) => sum + (m ?? 0), 0)
    : null;

  if (!day.date) warnings.push('Shooting date is not set.');
  if (!day.crewCall) warnings.push('Crew call is not set.');
  if (schedule.length === 0) warnings.push('The shooting-day schedule is empty.');
  if (resolvedLocations.length === 0) warnings.push('No shooting location is linked to this day.');
  if (!standing.nearestHospital.value) warnings.push('Nearest hospital / emergency facility is not set.');

  let lookAhead: CallSheetLookAhead | undefined;
  if (input.nextDay) {
    const next = input.nextDay.day;
    const nextCastFilter = input.nextDay.castPersonIds ? new Set(input.nextDay.castPersonIds) : null;
    lookAhead = {
      dayName: next.name,
      date: next.date,
      crewCall: next.crewCall,
      plannedWrap: next.plannedWrap,
      locations: input.nextDay.locations ?? [],
      items: next.scheduleBlockIds
        .map((id) => blocks.find((b) => b.id === id))
        .filter((b): b is ScheduleBlock => !!b)
        .map((block) => ({ kind: block.kind, ...labelForBlock(block, input) })),
      cast: people
        .filter((p) => (p.kind === 'cast' || p.kind === 'talent') && (!nextCastFilter || nextCastFilter.has(p.id)))
        .map((p) => ({ displayName: p.displayName, role: p.role, email: p.email, phone: callSheetPhone(p) })),
    };
  }

  return {
    productionTitle,
    productionCompany,
    productionCompanyInfo,
    productionLogo,
    dayName: day.name,
    date: day.date,
    crewCall: day.crewCall,
    plannedWrap: day.plannedWrap,
    type: day.callSheet?.type ?? 'shoot',
    isDraft: day.callSheet?.status !== 'final',
    castContactsHidden: hideCastContacts,
    parking: standing.parking.value,
    walkieChannels: standing.walkieChannels.value,
    unitBase: standing.unitBase.value,
    nearestHospital: standing.nearestHospital.value,
    weatherSummary: day.callSheet?.weatherSummary,
    safetyNotes: standing.safetyNotes.value,
    generalNotes: standing.generalNotes.value,
    pickupNotes: day.callSheet?.pickupNotes,
    pickups: (day.callSheet?.pickups ?? []).map((pickup) => {
      const person = people.find((candidate) => candidate.id === pickup.personId);
      return {
        displayName: person?.displayName ?? 'Unknown contact',
        role: person?.role,
        phone: person ? callSheetPhone(person) : undefined,
        time: pickup.time,
        location: pickup.location,
        notes: pickup.notes,
        ...(person ? {} : { unresolved: true }),
      };
    }),
    locations: resolvedLocations,
    maps: day.callSheet?.showLocationMap ? deriveMapPictures(day.callSheet, resolvedLocations) : [],
    schedule,
    cast,
    crew,
    departmentHeads: deriveDepartmentHeads(people),
    // The first pinned location is the one the unit works to; a day that moves
    // between pins still has one sunset, and it is the one where they are.
    daylight: deriveDaylight({
      date: day.date,
      lat: resolvedLocations.find((location) => typeof location.lat === 'number')?.lat,
      lng: resolvedLocations.find((location) => typeof location.lng === 'number')?.lng,
      sunriseOverride: day.callSheet?.sunriseOverride,
      sunsetOverride: day.callSheet?.sunsetOverride,
    }),
    totalEstimatedMinutes,
    warnings,
    ...(lookAhead ? { lookAhead } : {}),
  };
};

/**
 * Apply explicit overrides on top of derived data. Overrides are sparse and
 * deliberate — the canonical source stays authoritative for everything else.
 */
export const applyOverrides = (
  derived: CallSheetData,
  overrides: SheetOverride[],
): CallSheetData => {
  let result: CallSheetData = { ...derived };
  for (const override of overrides) {
    if (Object.prototype.hasOwnProperty.call(result, override.field)) {
      result = { ...result, [override.field]: override.value } as CallSheetData;
    }
  }
  return result;
};

/** Freeze a sheet as a published revision; later edits must supersede it. */
export const publishSheet = (derived: CallSheetData, overrides: SheetOverride[] = []): GeneratedSheet => ({
  lifecycle: 'published',
  derived,
  overrides,
  generatedAt: new Date().toISOString(),
});

/**
 * The heading row to print above `entries[index]`, if it starts a new scene
 * group. A shooting schedule is read by slugline: consecutive strips under the
 * same "Sc 3 · INT. LIVING ROOM - DAY" share one header rather than each
 * carrying it, and a strip with no heading of its own — lunch, a company move —
 * never opens a group. The same slugline returning later (a split scene) opens
 * a fresh group, because the reader's eye has moved on.
 */
export const sluglineHeaderBefore = (
  entries: readonly Pick<CallSheetEntry, 'sceneNumber' | 'slugline'>[],
  index: number,
): string | undefined => {
  const entry = entries[index];
  if (!entry?.slugline) return undefined;
  const previous = entries[index - 1];
  const key = (e: Pick<CallSheetEntry, 'sceneNumber' | 'slugline'>) => `${e.sceneNumber ?? ''}|${e.slugline ?? ''}`;
  if (previous?.slugline && key(previous) === key(entry)) return undefined;
  return entry.sceneNumber ? `Sc ${entry.sceneNumber} · ${entry.slugline}` : entry.slugline;
};
