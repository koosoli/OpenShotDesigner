/**
 * One "Download PDF" for every export-studio section (roadmap Phase 3).
 *
 * The studio prints through bespoke views; this module gives each of them a
 * direct-PDF twin without touching the views. Data comes from the same domain
 * builders the views use, so paper and PDF can never disagree — a PDF that
 * resolves its own numbers a second way would be a second source of truth
 * wearing the same filename.
 *
 * Image bytes (storyboard frames, mood-board cards, logo) resolve through the
 * asset store here because object URLs from the UI layer are unreadable to
 * pdf-lib. Anything unresolvable renders as an empty frame, never as a throw:
 * an export with one corrupt image must still deliver the other nineteen
 * pages.
 *
 * Schedule-board, calendar and coverage PDFs live with the SchedulePanel
 * (which already memoises their print models); budget, tasks and readiness
 * PDFs live on their own panels next to the data they print. Everything the
 * export studio itself previews lives here.
 */
import type { ExportSection } from '../../context/WorkspaceUIContext';
import type { AVScriptRow, LightElement, Project, SceneSetup, ScriptLine, Shot } from '../../types';
import { bytesToBlob, downloadBlob } from '../download';
import { createIdbAssetStore } from '../../domain/storage/idbAssetStore';
import { isAssetRef } from '../../domain/media/imageRef';
import {
  attachBreakdownItemsToScenes,
} from '../../domain/script';
import { deriveScriptBreakdown } from '../../domain/script/logic';
import {
  castNumbersScheduledOn,
  deriveCharacterReport,
  deriveDood,
} from '../../domain/reports';
import {
  collectFixturePatches,
  findConflicts,
  sortedPatchRows,
} from '../dmxPatch';
import {
  deriveAllScenesEquipment,
  deriveSceneEquipment,
} from '../equipmentList';
import { buildPowerPrintModel } from '../../components/reports/PowerPrintView';
import { buildRiggingPrintModel } from '../../components/reports/RiggingPrintView';
import { buildLogisticsPrintModel } from '../../components/reports/LogisticsPrintView';
import { buildContinuityPrintModel } from '../../components/reports/ContinuityPrintView';
import { buildRunOfShowPrintModel } from '../../components/reports/RunOfShowPrintView';
import { buildDailyProgressPrintModel } from '../../components/reports/DailyProgressPrintView';
import { buildCameraReportPrintModel, buildSoundReportPrintModel } from '../../components/reports/SetReportsPrintView';
import type { TrussCapacityVerdict } from '../../domain/rigging/logic';
import { renderSvgToPngBytes } from '../exportFloorPlanPng';
import {
  buildAvScriptPdfFilename,
  buildCalendarPdfFilename,
  buildContinuityPdfFilename,
  buildCoveragePdfFilename,
  buildDailyProgressPdfFilename,
  buildDmxPatchPdfFilename,
  buildFloorPlanPdfFilename,
  buildLinedScriptPdfFilename,
  buildLogisticsPdfFilename,
  buildMoodboardPdfFilename,
  buildPdfFilename,
  buildPowerPdfFilename,
  buildProductionPackZipFilename,
  buildRiggingPdfFilename,
  buildRunOfShowPdfFilename,
  buildScriptReportsPdfFilename,
  buildSetReportPdfFilename,
  buildStoryboardPdfFilename,
  buildSidesPdfFilename,
  buildStripboardPdfFilename,
  calendarDaysFromPrintable,
  calendarEventsFromPrintable,
  coverageRowsFromPrintable,
  createAvScriptPdf,
  createCalendarPdf,
  createContinuityPdf,
  createCoveragePdf,
  createDailyProgressPdf,
  createDmxPatchPdf,
  createEquipmentManifestPdf,
  createFloorPlanPdf,
  createLinedScriptPdf,
  createLogisticsPdf,
  createMoodboardPdf,
  createPowerPdf,
  createRiggingPdf,
  createRunOfShowPdf,
  createScriptReportsPdf,
  createSetReportPdf,
  createShotListPdf,
  createSidesPdf,
  createStoryboardPdf,
  createStripboardPdf,
  crewSheetCastFromContactList,
  dmxPatchRowsFromSheetRows,
  doodPdfFromDood,
  equipmentManifestItemsFromEquipmentItems,
  runOfShowCuesFromPrintable,
  scriptReportCharactersFromReports,
  scriptReportElementsFromItems,
  scriptReportLocationsFromBreakdown,
  scriptReportScenesFromScenes,
  shotListRowsFromSetups,
  sidesPdfScenesFromLines,
  stripboardDaysFromPrintable,
  zipPdfs,
} from './index';
import {
  buildPrintableCoverageRows,
  buildPrintableStripboardDays,
} from '../../domain/scheduling/stripboardPrint';
import { deriveDaySummary } from '../../domain/scheduling';
import { buildCrewSheetPdfFilename, createCrewSheetPdf } from './crewSheetPdf';

export interface SectionPdfContext {
  project: Project;
  activeSetup: SceneSetup;
  scriptLines: ScriptLine[];
  avScriptRows: AVScriptRow[];
  allShots: Shot[];
  /** Set screenplay character cues in bold (export-studio option, off by default). */
  boldScriptCharacters?: boolean;
  /** Sides selection from the studio; absent means the whole screenplay. */
  sidesSceneIds?: string[] | null;
  sidesCharacter?: string;
  equipmentScope?: 'current' | 'all';
  moodboardId?: string | null;
  /** Live SVG element for the floor-plan blueprint render. */
  floorPlanSvg?: SVGSVGElement | null;
  omitBlankStoryboardFrames?: boolean;
}

interface ResolvedImage {
  bytes: Uint8Array;
  mimeType: string;
}

export interface RenderedPdf {
  filename: string;
  bytes: Uint8Array;
}

/** Asset id, data URL or nothing -> raster bytes. Never throws. */
export const resolvePdfImageBytes = async (ref?: string): Promise<ResolvedImage | null> => {
  try {
    if (!ref) return null;
    if (ref.startsWith('data:')) {
      const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(ref);
      if (!match || match[2] !== ';base64') return null;
      const binary = atob(match[3]);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return { bytes, mimeType: match[1] || 'application/octet-stream' };
    }
    if (!isAssetRef(ref)) return null;
    const blob = await createIdbAssetStore().get(ref);
    if (!blob) return null;
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mimeType: blob.type || 'application/octet-stream' };
  } catch {
    return null;
  }
};

const resolveLogoBytes = async (project: Project): Promise<Uint8Array | undefined> => {
  const resolved = await resolvePdfImageBytes(project.logo);
  if (!resolved || !resolved.mimeType.includes('png')) return undefined;
  return resolved.bytes;
};

const renderedPdf = (bytes: Uint8Array, filename: string): RenderedPdf => ({ bytes, filename });

const productionTitleOf = (project: Project): string => project.title || 'Untitled production';

/** Same verdict line as the rigging print view, so paper and PDF agree. */
const riggingVerdictText = (capacity: TrussCapacityVerdict): string => {
  const kg = (value: number | null): string => (value === null ? '—' : `${Number(value.toFixed(2))} kg`);
  const pct = (fraction: number | null): string => (fraction === null ? '—' : `${Math.round(fraction * 100)}%`);
  if (capacity.verdict === 'over') {
    return `OVER CAPACITY — ${pct(capacity.utilization)} of ${kg(capacity.capacityKg)}`;
  }
  if (capacity.verdict === 'within') {
    return `Within capacity — ${pct(capacity.utilization)} of ${kg(capacity.capacityKg)}`;
  }
  if (capacity.pointCount === 0) return 'No verdict — no motors or hang points recorded';
  if (capacity.unknownCapacityPointCount > 0) {
    return `No verdict — ${capacity.unknownCapacityPointCount} of ${capacity.pointCount} rigging points have no rated capacity`;
  }
  return 'No verdict — planned load unknown (truss self-weight missing)';
};

const storyboardFramesOf = async (
  setup: SceneSetup,
  omitBlank: boolean,
): Promise<Array<{ imageBytes?: Uint8Array; mimeType?: string; shotNumber?: string; caption?: string }>> => {
  const frames: Array<{ imageBytes?: Uint8Array; mimeType?: string; shotNumber?: string; caption?: string }> = [];
  for (const shot of setup.shots ?? []) {
    const candidates: Array<{ ref?: string; caption: string }> = [
      { ref: shot.storyboardImage, caption: shot.shotNumber || '' },
      { ref: shot.storyboardImageEnd, caption: `${shot.shotNumber || ''} · end` },
      ...Object.entries(shot.storyboardFrames ?? {}).map(([slot, frame]) => ({
        ref: frame.image,
        caption: `${shot.shotNumber || ''} · ${slot}`,
      })),
    ];
    const withImages = omitBlank ? candidates.filter((candidate) => candidate.ref) : candidates;
    for (const candidate of withImages) {
      const resolved = await resolvePdfImageBytes(candidate.ref);
      frames.push({
        ...(resolved ? { imageBytes: resolved.bytes, mimeType: resolved.mimeType } : {}),
        ...(shot.shotNumber ? { shotNumber: shot.shotNumber } : {}),
        caption: candidate.caption || shot.name || '',
      });
    }
  }
  return frames;
};

const boardDaysOf = (project: Project) =>
  buildPrintableStripboardDays(project, undefined, (block) =>
    castNumbersScheduledOn([block.id], [block], {
      scriptScenes: project.scriptScenes,
      setups: project.setups,
      castAssignments: project.castAssignments,
    }),
  );

/**
 * Sections the studio previews (ExportSection) plus the schedule-board views,
 * which live in the SchedulePanel and call the same dispatcher.
 */
export type SectionPdfKind = ExportSection | 'stripboard' | 'calendar' | 'coverage';

/**
 * Render one export-studio section to PDF without downloading it.
 */
export const renderSectionPdf = async (
  section: SectionPdfKind,
  ctx: SectionPdfContext,
): Promise<RenderedPdf> => {
  const { project, activeSetup } = ctx;
  const title = productionTitleOf(project);
  const logoPngBytes = await resolveLogoBytes(project);
  const logo = logoPngBytes ? { logoPngBytes } : {};
  const date = project.date && /^\d{4}-\d{2}-\d{2}$/.test(project.date) ? project.date : undefined;

  switch (section) {
    case 'floorplan': {
      if (!ctx.floorPlanSvg) throw new Error('Open the floor plan section once so the blueprint can render.');
      const png = await renderSvgToPngBytes(ctx.floorPlanSvg, {
        scale: 2,
        title: project.title,
        subtitle: `SCENE ${activeSetup.sceneNumber}: ${activeSetup.name}`,
      });
      const bytes = await createFloorPlanPdf({
        productionTitle: title,
        sceneName: `Scene ${activeSetup.sceneNumber}: ${activeSetup.name}`,
        ...(date ? { date } : {}),
        ...(png ? { imageBytes: png, mimeType: 'image/png' } : {}),
        orientation: 'landscape',
        ...logo,
      });
      return renderedPdf(bytes, buildFloorPlanPdfFilename({ productionTitle: title }));
    }
    case 'shotlist': {
      const bytes = await createShotListPdf({
        productionTitle: title,
        subtitle: `Scene ${activeSetup.sceneNumber || ''} — ${activeSetup.name || ''}`.trim(),
        rows: shotListRowsFromSetups([activeSetup]),
        ...logo,
      });
      return renderedPdf(bytes, buildPdfFilename({ production: title, document: 'shot-list' }));
    }
    case 'storyboard': {
      const frames = await storyboardFramesOf(activeSetup, ctx.omitBlankStoryboardFrames ?? false);
      const bytes = await createStoryboardPdf({
        productionTitle: title,
        subtitle: `Scene ${activeSetup.sceneNumber || ''} — ${activeSetup.name || ''}`.trim(),
        frames,
        orientation: 'landscape',
        ...logo,
      });
      return renderedPdf(bytes, buildStoryboardPdfFilename({ productionTitle: title }));
    }
    case 'linedscript': {
      const bytes = await createLinedScriptPdf({
        productionTitle: title,
        lines: ctx.scriptLines.map((line) => ({
          type: line.type ?? '',
          text: line.text,
          ...(line.sceneNumber ? { sceneNumber: line.sceneNumber } : {}),
          ...(line.omitted ? { omitted: true } : {}),
        })),
        // The print studio shows the cover when the production asked for
        // one; the PDF carries the same cover on its own first page.
        titlePage: project.titlePage,
        scriptTitle: project.scriptTitle,
        boldCharacters: ctx.boldScriptCharacters ?? false,
        ...logo,
      });
      return renderedPdf(bytes, buildLinedScriptPdfFilename({ productionTitle: title }));
    }
    case 'avscript': {
      const bytes = await createAvScriptPdf({
        productionTitle: title,
        rows: ctx.avScriptRows,
        shots: ctx.allShots.map((shot) => ({ id: shot.id, shotNumber: shot.shotNumber })),
        orientation: 'landscape',
        ...logo,
      });
      return renderedPdf(bytes, buildAvScriptPdfFilename({ productionTitle: title }));
    }
    case 'sides': {
      const { scenes } = sidesPdfScenesFromLines(ctx.scriptLines, {
        sceneIds: ctx.sidesSceneIds ?? undefined,
        character: ctx.sidesCharacter || undefined,
      });
      const bytes = await createSidesPdf({ productionTitle: title, scenes, ...logo });
      return renderedPdf(bytes, buildSidesPdfFilename({ productionTitle: title }));
    }
    case 'scriptreports': {
      const derived = deriveScriptBreakdown(ctx.scriptLines, project.characters ?? [], project.locations ?? []);
      const scenes = attachBreakdownItemsToScenes(derived.scenes, ctx.scriptLines, project.breakdownItems ?? []);
      const characterReports = derived.characters
        .map((character) =>
          deriveCharacterReport(character.id, {
            scriptScenes: scenes,
            characters: derived.characters,
            people: project.people,
            castAssignments: project.castAssignments,
          }),
        )
        .filter((entry) => entry.scenes.length > 0);
      const sceneCharacters = new Map(scenes.map((scene) => [scene.id, scene.characterIds] as const));
      const dood = deriveDood({
        days: project.productionDays ?? [],
        blocks: project.scheduleBlocks ?? [],
        characters: derived.characters,
        castAssignments: project.castAssignments,
        people: project.people,
        getSceneCharacterIds: (sceneId) => sceneCharacters.get(sceneId),
      });
      const doodMapped = doodPdfFromDood(dood);
      const bytes = await createScriptReportsPdf({
        productionTitle: title,
        scenes: scriptReportScenesFromScenes(scenes, derived.characters, project.breakdownItems ?? []),
        characters: scriptReportCharactersFromReports(characterReports),
        locations: scriptReportLocationsFromBreakdown(derived.locations),
        elements: scriptReportElementsFromItems(project.breakdownItems ?? [], scenes),
        doodColumns: doodMapped.columns,
        doodRows: doodMapped.rows,
        orientation: 'landscape',
        ...logo,
      });
      return renderedPdf(bytes, buildScriptReportsPdfFilename({ productionTitle: title }));
    }
    case 'equipment': {
      const scope = ctx.equipmentScope ?? 'current';
      const items = scope === 'all'
        ? deriveAllScenesEquipment(project.setups ?? [])
        : deriveSceneEquipment(activeSetup);
      const bytes = await createEquipmentManifestPdf({
        productionTitle: title,
        scopeLabel: scope === 'all' ? 'Master package' : `Scene ${activeSetup.sceneNumber || ''}`.trim(),
        items: equipmentManifestItemsFromEquipmentItems(items),
        orientation: 'landscape',
        ...logo,
      });
      return renderedPdf(
        bytes,
        buildPdfFilename({ production: title, document: 'equipment-manifest' }),
      );
    }
    case 'dmx': {
      const lights = activeSetup.elements.filter((element): element is LightElement => element.type === 'light');
      const rows = dmxPatchRowsFromSheetRows(sortedPatchRows(findConflicts(collectFixturePatches(lights))));
      const bytes = await createDmxPatchPdf({
        productionTitle: title,
        sceneName: `Scene ${activeSetup.sceneNumber}: ${activeSetup.name}`,
        rows,
        orientation: 'landscape',
        ...logo,
      });
      return renderedPdf(bytes, buildDmxPatchPdfFilename({ productionTitle: title }));
    }
    case 'crew': {
      const people = project.people ?? [];
      const byDepartment = new Map<string, typeof people>();
      for (const person of people) {
        const bucket = person.department || 'Unassigned';
        byDepartment.set(bucket, [...(byDepartment.get(bucket) ?? []), person]);
      }
      const bytes = await createCrewSheetPdf({
        productionTitle: title,
        departments: [...byDepartment.entries()].map(([name, members]) => ({
          name,
          members: members.map((person) => ({
            name: person.displayName,
            ...(person.role ? { role: person.role } : {}),
            ...(person.phone ? { phone: person.phone } : {}),
            ...(person.email ? { email: person.email } : {}),
          })),
        })),
        cast: crewSheetCastFromContactList(people, project.characters ?? [], project.castAssignments ?? []),
        ...logo,
      });
      return renderedPdf(bytes, buildCrewSheetPdfFilename({ productionTitle: title }));
    }
    case 'power': {
      const planLights = activeSetup.elements.filter((element): element is LightElement => element.type === 'light');
      const model = buildPowerPrintModel(project, { planLights });
      const bytes = await createPowerPdf({
        productionTitle: model.productionTitle,
        ...(model.sceneName ? { sceneName: model.sceneName } : {}),
        consumers: model.consumers.map((consumer) => ({ ...consumer })),
        circuits: model.circuits.map((circuit) => ({ ...circuit })),
        sources: model.sources.map((source) => ({ ...source })),
        totalKnownWatts: model.totalKnownWatts,
        unknownConsumerCount: model.unknownConsumerCount,
        orientation: 'landscape',
        ...logo,
      });
      return renderedPdf(bytes, buildPowerPdfFilename({ productionTitle: title }));
    }
    case 'rigging': {
      const model = buildRiggingPrintModel(project);
      const assumptions = model.assumptions;
      const kg = (value: number | null | undefined): string =>
        value === null || value === undefined ? '—' : `${Number(value.toFixed(2))} kg`;
      const bytes = await createRiggingPdf({
        productionTitle: model.productionTitle,
        runs: model.runs.map((run) => ({
          ...run,
          verdict: riggingVerdictText(run.capacity),
        })),
        unassignedHardware: [...(model.unassignedHardware ?? [])],
        assumptionsLine:
          `Hardware weights are assumptions set in the Rigging panel and stored with the project: ` +
          `clamp ${kg(assumptions.clampWeightKg)}, safety ${kg(assumptions.safetyWeightKg)}, ` +
          `cable allowance ${kg(assumptions.cableAllowanceKg)} per run.`,
        orientation: 'landscape',
        ...logo,
      });
      return renderedPdf(bytes, buildRiggingPdfFilename({ productionTitle: title }));
    }
    case 'logistics': {
      const model = buildLogisticsPrintModel(project);
      const bytes = await createLogisticsPdf({
        productionTitle: model.productionTitle,
        groups: model.groups.map((group) => ({ ...group })),
        unassignedItems: [...(model.unassignedItems ?? [])],
        ...(model.fleet ? { fleet: { ...model.fleet } } : {}),
        orientation: 'landscape',
        ...logo,
      });
      return renderedPdf(bytes, buildLogisticsPdfFilename({ productionTitle: title }));
    }
    case 'continuity': {
      const model = buildContinuityPrintModel(project);
      const bytes = await createContinuityPdf({
        productionTitle: model.productionTitle,
        ...(model.company ? { company: model.company } : {}),
        ...(model.director ? { director: model.director } : {}),
        ...(model.cinematographer ? { cinematographer: model.cinematographer } : {}),
        ...(model.scriptSupervisor ? { scriptSupervisor: model.scriptSupervisor } : {}),
        ...(model.scopeLabel ? { scopeLabel: model.scopeLabel } : {}),
        takeRows: model.takeRows.map((row) => ({ ...row })),
        checklist: model.checklist.map((row) => ({ ...row })),
        unscheduled: model.unscheduled.map((row) => ({ ...row })),
        notes: model.notes.map((note) => ({ ...note })),
        gaps: {
          notShot: model.gaps.notShot.map((row) => ({ ...row })),
          noGoodTake: model.gaps.noGoodTake.map((row) => ({ ...row })),
        },
        totals: { ...model.totals },
        orientation: 'landscape',
        ...logo,
      });
      return renderedPdf(bytes, buildContinuityPdfFilename({ productionTitle: title }));
    }
    case 'camerareport': {
      const model = buildCameraReportPrintModel(project);
      const bytes = await createSetReportPdf({
        variant: 'camera',
        productionTitle: model.productionTitle,
        ...(model.company ? { company: model.company } : {}),
        ...(model.crewLine ? { crewLine: model.crewLine } : {}),
        ...(model.scopeLabel ? { scopeLabel: model.scopeLabel } : {}),
        report: model.report,
        orientation: 'landscape',
        ...logo,
      });
      return renderedPdf(
        bytes,
        buildSetReportPdfFilename({ productionTitle: title, variant: 'camera' }),
      );
    }
    case 'soundreport': {
      const model = buildSoundReportPrintModel(project);
      const bytes = await createSetReportPdf({
        variant: 'sound',
        productionTitle: model.productionTitle,
        ...(model.company ? { company: model.company } : {}),
        ...(model.crewLine ? { crewLine: model.crewLine } : {}),
        ...(model.scopeLabel ? { scopeLabel: model.scopeLabel } : {}),
        report: model.report,
        orientation: 'landscape',
        ...logo,
      });
      return renderedPdf(
        bytes,
        buildSetReportPdfFilename({ productionTitle: title, variant: 'sound' }),
      );
    }
    case 'dailyprogress': {
      const model = buildDailyProgressPrintModel(project);
      if (!model) throw new Error('No shooting day yet — add a day in the Schedule module first.');
      const bytes = await createDailyProgressPdf({
        productionTitle: model.productionTitle,
        ...(model.company ? { company: model.company } : {}),
        ...(model.director ? { director: model.director } : {}),
        ...(model.firstAd ? { firstAd: model.firstAd } : {}),
        report: model.report,
        plannedDayMinutes: model.plannedDayMinutes,
        ...logo,
      });
      return renderedPdf(bytes, buildDailyProgressPdfFilename({ productionTitle: title }));
    }
    case 'runofshow': {
      const model = buildRunOfShowPrintModel(project);
      const bytes = await createRunOfShowPdf({
        productionTitle: model.productionTitle,
        cues: runOfShowCuesFromPrintable(model.cues),
        ...(model.issues ? { issues: [...model.issues] } : {}),
        orientation: 'landscape',
        ...logo,
      });
      return renderedPdf(bytes, buildRunOfShowPdfFilename({ productionTitle: title }));
    }
    case 'moodboard': {
      const boards = project.moodBoards ?? [];
      const board = boards.find((candidate) => candidate.id === ctx.moodboardId) ?? boards[0];
      if (!board) throw new Error('No mood board yet — add one in the Moodboard module first.');
      const cards = [...board.cards].sort((a, b) => a.order - b.order);
      const frames: Array<{ imageBytes?: Uint8Array; mimeType?: string; caption?: string }> = [];
      for (const card of cards) {
        const resolved = await resolvePdfImageBytes(card.assetId);
        frames.push({
          ...(resolved ? { imageBytes: resolved.bytes, mimeType: resolved.mimeType } : {}),
          caption: card.caption || card.tags.join(', '),
        });
      }
      const bytes = await createMoodboardPdf({
        productionTitle: title,
        boardTitle: board.title,
        cards: frames,
        orientation: 'landscape',
        ...logo,
      });
      return renderedPdf(bytes, buildMoodboardPdfFilename({ productionTitle: title }));
    }
    case 'stripboard':
    case 'calendar':
    case 'coverage': {
      // Schedule-board sections live in the SchedulePanel, which already
      // memoises these print models; the dispatcher re-derives them from the
      // same builders so paper and PDF agree.
      if (section === 'stripboard') {
        const days = stripboardDaysFromPrintable(boardDaysOf(project));
        const bytes = await createStripboardPdf({
          productionTitle: title,
          days,
          orientation: 'landscape',
          ...logo,
        });
        return renderedPdf(bytes, buildStripboardPdfFilename({ productionTitle: title }));
      }
      if (section === 'calendar') {
        const blocks = project.scheduleBlocks ?? [];
        const days = project.productionDays ?? [];
        const boardDays = boardDaysOf(project);
        const events = [...(project.productionCalendarEvents ?? [])]
          .sort((a, b) => a.startDate.localeCompare(b.startDate))
          .map((event) => ({
            title: event.title,
            startDate: event.startDate,
            endDate: event.endDate,
            category: event.category,
            status: event.status,
            ...(event.color ? { color: event.color } : {}),
          }));
        const printableDays = days.map((day) => ({
          id: day.id,
          name: day.name,
          ...(day.date ? { date: day.date } : {}),
          ...(day.crewCall ? { crewCall: day.crewCall } : {}),
          ...(day.plannedWrap ? { plannedWrap: day.plannedWrap } : {}),
          totalMinutes: deriveDaySummary(day, blocks).totalEstimatedMinutes,
          items: boardDays.find((printDay) => printDay.id === day.id)?.items.map((item) => item.label) ?? [],
        }));
        const bytes = await createCalendarPdf({
          productionTitle: title,
          events: calendarEventsFromPrintable(events),
          days: calendarDaysFromPrintable(printableDays),
          orientation: 'landscape',
          ...logo,
        });
        return renderedPdf(bytes, buildCalendarPdfFilename({ productionTitle: title }));
      }
      const rows = coverageRowsFromPrintable(buildPrintableCoverageRows(project));
      const bytes = await createCoveragePdf({
        productionTitle: title,
        cameras: project.coverageMatrix?.cameraIds ?? [],
        rows,
        orientation: 'landscape',
        ...logo,
      });
      return renderedPdf(bytes, buildCoveragePdfFilename({ productionTitle: title }));
    }
    case 'combined':
      throw new Error('The complete package is available as a Production Pack ZIP or through the print dialog.');
    default:
      throw new Error(`No direct PDF for section "${section}".`);
  }
};

/** Render one section and download the resulting PDF. */
export const downloadSectionPdf = async (
  section: SectionPdfKind,
  ctx: SectionPdfContext,
): Promise<string> => {
  const { bytes, filename } = await renderSectionPdf(section, ctx);
  downloadBlob(bytesToBlob(bytes, 'application/pdf'), filename);
  return filename;
};

export type ProductionPackPdfSection =
  | 'shotlist'
  | 'equipment'
  | 'continuity'
  | 'camerareport'
  | 'soundreport'
  | 'storyboard'
  | 'floorplan';

export interface ProductionPackPdfZipOptions {
  /** Override the default core document selection. */
  sections?: readonly ProductionPackPdfSection[];
}

const CORE_PRODUCTION_PACK_SECTIONS: readonly ProductionPackPdfSection[] = [
  'shotlist',
  'equipment',
  'continuity',
  'camerareport',
  'soundreport',
  'storyboard',
  'floorplan',
];

type SectionPdfRenderer = (section: SectionPdfKind, ctx: SectionPdfContext) => Promise<RenderedPdf>;

/** A section that could not be rendered, and why. */
export interface ProductionPackFailure {
  section: ProductionPackPdfSection;
  reason: string;
}

export interface ProductionPackResult {
  documents: RenderedPdf[];
  /** Sections that failed. Empty when the pack is complete. */
  failures: ProductionPackFailure[];
}

/**
 * Render the core paperwork, isolating one document's failure from the rest.
 *
 * Isolation is right: a missing live floor-plan SVG must not cost the producer
 * the other six documents. Isolation SILENTLY was not. This used to return
 * only the successes, so a pack missing its call sheet was indistinguishable
 * from a complete one — you get a ZIP, you hand it out, and the gap turns up
 * on the shooting day. The failures now travel with the result so the caller
 * can say what is not in the archive.
 */
export const renderProductionPackPdfs = async (
  ctx: SectionPdfContext,
  options: ProductionPackPdfZipOptions = {},
  render: SectionPdfRenderer = renderSectionPdf,
): Promise<ProductionPackResult> => {
  const documents: RenderedPdf[] = [];
  const failures: ProductionPackFailure[] = [];
  for (const section of options.sections ?? CORE_PRODUCTION_PACK_SECTIONS) {
    try {
      documents.push(await render(section, ctx));
    } catch (error) {
      failures.push({
        section,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
  return { documents, failures };
};

/**
 * Render the core paperwork and download it as one deterministic ZIP archive.
 *
 * Returns the filename AND whatever could not be rendered, so the caller can
 * tell the user the pack is short a document rather than letting them assume
 * a ZIP is a complete ZIP.
 */
export const downloadProductionPackPdfZip = async (
  ctx: SectionPdfContext,
  options?: ProductionPackPdfZipOptions,
): Promise<{ filename: string; failures: ProductionPackFailure[] }> => {
  const { documents, failures } = await renderProductionPackPdfs(ctx, options);
  if (documents.length === 0) throw new Error('No production-pack PDFs could be created.');
  const filename = buildProductionPackZipFilename(productionTitleOf(ctx.project));
  const archive = zipPdfs(Object.fromEntries(documents.map((document) => [document.filename, document.bytes])));
  downloadBlob(bytesToBlob(archive, 'application/zip'), filename);
  return { filename, failures };
};
