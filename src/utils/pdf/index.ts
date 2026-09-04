/**
 * Shared client-side PDF layer (offline, real text, no server).
 *
 * Document shell and table engine plus the paperwork documents (shot list,
 * equipment manifest, call sheet, DMX patch, power, rigging, logistics,
 * floor plan, storyboard, budget, budget actuals, task report, readiness,
 * continuity, daily progress), production-safe filenames, and the ZIP helper
 * used by direct Production Packs.
 */

export {
  DEFAULT_PDF_MARGINS,
  PDF_PAGE_DIMENSIONS,
  addPdfPage,
  createPdfDocument,
  drawDocumentHeader,
  embedProductionLogoPng,
  finalizePdfDocument,
  formatPdfDate,
} from './document';
export type {
  PdfDocumentContext,
  PdfDocumentSettings,
  PdfHeaderLogo,
  PdfHeaderOptions,
  PdfMargins,
  PdfOrientation,
  PdfPageSize,
} from './document';
export {
  buildAvScriptPdfFilename,
  avScriptRowNumber,
  avScriptRowsFromAvRows,
  createAvScriptPdf,
} from './avScriptPdf';
export type {
  AvScriptPdfInput,
  AvScriptPdfRow,
  AvScriptPdfShot,
} from './avScriptPdf';
export {
  buildBudgetActualsPdfFilename,
  budgetActualsEstimatesFromEntries,
  createBudgetActualsPdf,
} from './budgetActualsPdf';
export type {
  BudgetActualsCategoryTotal,
  BudgetActualsEstimateLine,
  BudgetActualsPdfFilenameInput,
  BudgetActualsPdfInput,
} from './budgetActualsPdf';
export { buildBudgetPdfFilename, createBudgetPdf } from './budgetPdf';
export type { BudgetPdfFilenameInput, BudgetPdfInput } from './budgetPdf';
export {
  buildCalendarPdfFilename,
  calendarDaysFromPrintable,
  calendarEventsFromPrintable,
  createCalendarPdf,
} from './calendarPdf';
export type {
  CalendarPdfDay,
  CalendarPdfEvent,
  CalendarPdfFilenameInput,
  CalendarPdfInput,
} from './calendarPdf';
export {
  buildCallSheetPdfFilename,
  callSheetRevisionLabel,
  createCallSheetPdf,
} from './callSheetPdf';
export type {
  CallSheetPdfFilenameInput,
  CallSheetPdfInput,
  CallSheetPdfLocation,
  CallSheetPdfPerson,
  CallSheetPdfPickup,
  CallSheetPdfStrip,
} from './callSheetPdf';
export {
  buildDailyProgressPdfFilename,
  createDailyProgressPdf,
} from './dailyProgressPdf';
export type { DailyProgressPdfFilenameInput, DailyProgressPdfInput } from './dailyProgressPdf';
export {
  buildContinuityPdfFilename,
  createContinuityPdf,
} from './continuityPdf';
export type {
  ContinuityPdfChecklistRow,
  ContinuityPdfFilenameInput,
  ContinuityPdfInput,
  ContinuityPdfTakeRow,
  ContinuityPdfTotals,
} from './continuityPdf';
export {
  createEquipmentManifestPdf,
  equipmentManifestItemsFromEquipmentItems,
} from './equipmentManifestPdf';
export type { EquipmentManifestPdfInput, EquipmentManifestPdfItem } from './equipmentManifestPdf';
export {
  buildDmxPatchPdfFilename,
  createDmxPatchPdf,
  dmxPatchRowsFromSheetRows,
} from './dmxPatchPdf';
export type { DmxPatchPdfFilenameInput, DmxPatchPdfInput, DmxPatchPdfRow } from './dmxPatchPdf';
export { buildFloorPlanPdfFilename, createFloorPlanPdf } from './floorPlanPdf';
export type { FloorPlanPdfFilenameInput, FloorPlanPdfInput } from './floorPlanPdf';
export { buildPdfFilename, buildProductionPackZipFilename, slugifyPdfSegment } from './filenames';
export type { PdfFilenameInput } from './filenames';
export {
  buildLinedScriptPdfFilename,
  createLinedScriptPdf,
} from './linedScriptPdf';
export type { LinedScriptPdfInput, LinedScriptPdfLine } from './linedScriptPdf';
export {
  buildScriptReportsPdfFilename,
  createScriptReportsPdf,
  doodPdfFromDood,
  scriptReportCharactersFromReports,
  scriptReportElementsFromItems,
  scriptReportLocationsFromBreakdown,
  scriptReportScenesFromScenes,
} from './scriptReportsPdf';
export type {
  DoodPdfColumn,
  DoodPdfRow,
  DoodPdfStatus,
  ScriptReportPdfCharacter,
  ScriptReportPdfElement,
  ScriptReportPdfLocation,
  ScriptReportPdfScene,
  ScriptReportsPdfInput,
} from './scriptReportsPdf';
export type {
  LogisticsPdfContainer,
  LogisticsPdfFilenameInput,
  LogisticsPdfFleetSummary,
  LogisticsPdfGroup,
  LogisticsPdfInput,
  LogisticsPdfItem,
} from './logisticsPdf';
export { buildLogisticsPdfFilename, createLogisticsPdf, formatLogisticsKg } from './logisticsPdf';
export { buildMoodboardPdfFilename, createMoodboardPdf } from './moodboardPdf';
export type { MoodboardPdfCard, MoodboardPdfFilenameInput, MoodboardPdfInput } from './moodboardPdf';
export { buildPowerPdfFilename, createPowerPdf } from './powerPdf';
export type {
  PowerPdfCircuit,
  PowerPdfConsumer,
  PowerPdfFilenameInput,
  PowerPdfInput,
  PowerPdfPhaseLeg,
  PowerPdfSource,
  PowerPdfWattsSource,
} from './powerPdf';
export { buildRiggingPdfFilename, createRiggingPdf, formatRiggingKg } from './riggingPdf';
export type {
  RiggingPdfFilenameInput,
  RiggingPdfHardware,
  RiggingPdfInput,
  RiggingPdfLoad,
  RiggingPdfRun,
} from './riggingPdf';
export { buildReadinessPdfFilename, createReadinessPdf, readinessFixTargetLabel } from './readinessPdf';
export type { ReadinessPdfFilenameInput, ReadinessPdfInput } from './readinessPdf';
export {
  buildContactSheetPdfFilename,
  buildCrewSheetPdfFilename,
  createCrewSheetPdf,
  crewSheetCastFromContactList,
  crewSheetDepartmentsFromCrewSheet,
} from './crewSheetPdf';
export type {
  CrewSheetPdfCastEntry,
  CrewSheetPdfDepartment,
  CrewSheetPdfFilenameInput,
  CrewSheetPdfInput,
  CrewSheetPdfMember,
  CrewSheetPdfTimelineEntry,
} from './crewSheetPdf';
export {
  buildCoveragePdfFilename,
  coverageRowsFromPrintable,
  createCoveragePdf,
} from './coveragePdf';
export type { CoveragePdfFilenameInput, CoveragePdfInput, CoveragePdfRow } from './coveragePdf';
export {
  buildRunOfShowPdfFilename,
  createRunOfShowPdf,
  runOfShowCuesFromPrintable,
} from './runOfShowPdf';
export type {
  RunOfShowPdfCue,
  RunOfShowPdfFilenameInput,
  RunOfShowPdfInput,
  RunOfShowPdfIssue,
  RunOfShowPdfNote,
} from './runOfShowPdf';
export { buildSetReportPdfFilename, createSetReportPdf } from './setReportPdf';
export type {
  CameraSetReportPdfInput,
  DailySetReportPdfInput,
  SetReportPdfFilenameInput,
  SetReportPdfInput,
  SetReportPdfVariant,
  SoundSetReportPdfInput,
} from './setReportPdf';
export { createShotListPdf, shotListRowsFromSetups } from './shotListPdf';
export type { ShotListPdfInput, ShotListPdfRow } from './shotListPdf';
export {
  buildStripboardPdfFilename,
  createStripboardPdf,
  stripboardDaysFromPrintable,
} from './stripboardPdf';
export type {
  StripboardPdfDay,
  StripboardPdfFilenameInput,
  StripboardPdfInput,
  StripboardPdfItem,
} from './stripboardPdf';
export { buildStoryboardPdfFilename, createStoryboardPdf } from './storyboardPdf';
export type {
  StoryboardPdfFilenameInput,
  StoryboardPdfFrame,
  StoryboardPdfInput,
} from './storyboardPdf';
export {
  buildSidesPdfFilename,
  createSidesPdf,
  sidesPdfScenesFromLines,
} from './sidesPdf';
export type { SidesPdfInput, SidesPdfLine, SidesPdfScene } from './sidesPdf';
export { buildTaskReportPdfFilename, createTaskReportPdf, taskReportRowsFromTasks } from './taskReportPdf';
export type {
  TaskReportPdfFilenameInput,
  TaskReportPdfInput,
  TaskReportPdfTask,
} from './taskReportPdf';
export { drawPdfTable, paginateTableRows, wrapPdfCellText } from './tables';
export type { PdfTableColumn, PdfTableResult, PdfTableStyle } from './tables';
export { PDF_UNENCODABLE_REPLACEMENT, isWinAnsiPrintable, sanitizePdfText } from './text';
export { zipPdfs } from './zip';
