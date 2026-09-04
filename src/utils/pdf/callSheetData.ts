/**
 * Map the derived call sheet model onto the PDF document input.
 *
 * The PDF layer stays free of domain imports (it renders plain rows), so this
 * small adapter lives beside it: the same mapping feeds the live draft, the
 * current preview and the immutable issued snapshot, which is exactly why an
 * issued REV PDF can never drift from its REV.
 */
import type { CallSheetData } from '../../domain/reports/callSheet';
import type { CallSheetPdfInput } from './callSheetPdf';

export const callSheetPdfInputFromData = (data: CallSheetData): CallSheetPdfInput => ({
  productionTitle: data.productionTitle,
  dayName: data.dayName,
  ...(data.date ? { date: data.date } : {}),
  ...(data.crewCall ? { crewCall: data.crewCall } : {}),
  ...(data.plannedWrap ? { plannedWrap: data.plannedWrap } : {}),
  isDraft: data.isDraft,
  ...(data.revision === undefined ? {} : { revision: data.revision }),
  ...(data.issuedAt ? { issuedAt: data.issuedAt } : {}),
  schedule: (data.schedule ?? []).map((entry) => ({
    scene: entry.sceneNumber,
    slugline: entry.slugline,
    label: entry.label,
    ...(entry.location ? { location: entry.location } : {}),
    ...(entry.scheduledStart ? { start: entry.scheduledStart } : {}),
    ...(entry.estimatedMinutes === undefined ? {} : { estimatedMinutes: entry.estimatedMinutes }),
    kind: entry.kind,
  })),
  cast: (data.cast ?? []).map((person) => ({
    name: person.displayName,
    ...(person.role ? { role: person.role } : {}),
    ...(person.department ? { department: person.department } : {}),
    ...(person.callTime ? { callTime: person.callTime } : {}),
    ...(person.phone ? { phone: person.phone } : {}),
  })),
  crew: (data.crew ?? []).map((person) => ({
    name: person.displayName,
    ...(person.role ? { role: person.role } : {}),
    ...(person.department ? { department: person.department } : {}),
    ...(person.callTime ? { callTime: person.callTime } : {}),
    ...(person.phone ? { phone: person.phone } : {}),
  })),
  locations: (data.locations ?? []).map((location) => ({
    name: location.name,
    ...(location.address ? { address: location.address } : {}),
  })),
  pickups: (data.pickups ?? []).map((pickup) => ({
    name: pickup.displayName,
    ...(pickup.role ? { role: pickup.role } : {}),
    ...(pickup.time ? { time: pickup.time } : {}),
    ...(pickup.location ? { location: pickup.location } : {}),
    ...(pickup.notes ? { notes: pickup.notes } : {}),
  })),
  ...(data.weatherSummary ? { weatherSummary: data.weatherSummary } : {}),
  ...(data.safetyNotes ? { safetyNotes: data.safetyNotes } : {}),
  ...(data.generalNotes ? { generalNotes: data.generalNotes } : {}),
  ...(data.parking ? { parking: data.parking } : {}),
  ...(data.unitBase ? { unitBase: data.unitBase } : {}),
  ...(data.walkieChannels ? { walkieChannels: data.walkieChannels } : {}),
  ...(data.nearestHospital ? { nearestHospital: data.nearestHospital } : {}),
  ...(data.totalEstimatedMinutes === null || data.totalEstimatedMinutes === undefined
    ? {}
    : { totalEstimatedMinutes: data.totalEstimatedMinutes }),
});
