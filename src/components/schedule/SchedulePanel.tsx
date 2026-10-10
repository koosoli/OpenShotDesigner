import React, { useEffect, useMemo, useState } from 'react';
import { printPdfBytes } from '../../utils/printPdf';
import { WhatIfPanel } from './WhatIfPanel';
import { scheduleWhatIf } from '../../domain/reports/scheduleWhatIf';
import { readScheduleView, requestScheduleView } from '../../utils/uiPrefs';
import type { ScheduleView } from '../../utils/uiPrefs';
import { ScheduleDood } from './DoodReport';
import { PanelTitle } from '../common/PanelHeader';
import { PerformerTimeReportView } from './PerformerTimeReportView';
import { OneLinerView } from './OneLinerView';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CalendarRange,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Inbox,
  FileCheck2,
  GripVertical,
  Search,
  Plus,
  Trash2,
  Users,
  ListOrdered,
  Printer,
} from 'lucide-react';
import { DoodIcon, StripboardIcon, TimeSheetIcon } from '../icons/ProductionIcons';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useDialogs } from '../dialog/DialogProvider';
import { CoverageMatrixEditor } from './CoverageMatrixEditor';
import { TimelineCalendar } from './TimelineCalendar';
import { CalendarEventEditor, MonthCalendar } from './MonthCalendar';
import { createId } from '../../domain/ids';
import { waitForImages } from '../../utils/image';
import {
  MANUAL_TYPE_LABELS,
  blockLabel,
  stripColorKey,
  buildPrintableCoverageRows,
  buildPrintableStripboardDays,
  buildStripboardLabelContext,
  defaultCalendarMonth,
  defaultNewEventPeriod,
  deriveDaySummary,
  findScheduleConflicts,
  followingDayAfterLast,
  todayIso,
} from '../../domain/scheduling';
import type { ManualType } from '../../domain/scheduling';
import type {
  CallSheetLocation,
  CallSheetData,
} from '../../domain/reports';
import type { ProductionCalendarEvent, ProductionDay, ScheduleBlock } from '../../domain/scheduling';
import { castNumbersScheduledOn, formatPageEighths, resolveDayLocations as resolveDayLocationsForBlocks } from '../../domain/reports';
import { ScheduleHealth } from './ScheduleHealth';
import { CallSheetPrintView } from '../reports/CallSheetPrintView';
import { StripboardPrintView } from '../reports/StripboardPrintView';
import type { PrintableStripboardDay } from '../reports/StripboardPrintView';
import { ScheduleCalendarPrintView } from '../reports/ScheduleCalendarPrintView';
import type { PrintableCalendarDay, PrintableCalendarEvent } from '../reports/ScheduleCalendarPrintView';
import { CoverageMatrixPrintView } from '../reports/CoverageMatrixPrintView';
import type { PrintableCoverageRow } from '../reports/CoverageMatrixPrintView';
import { CallSheetWorkspace } from './CallSheetWorkspace';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';
import { PdfExportButton } from '../common/PdfExportButton';
import {
  addCalendarEventCommand,
  addProductionDayCommand,
  addScheduleBlockCommand,
  moveScheduleBlockCommand,
  removeCalendarEventCommand,
  removeProductionDayCommand,
  removeScheduleBlockCommand,
  updateCalendarEventCommand,
  updateProductionDayCommand,
  updateScheduleBlockCommand,
} from '../../domain/commands';
import { buildCallSheetProjectContext, callSheetForDay } from '../../domain/reports';

const MANUAL_TYPES: ManualType[] = [
  'meal',
  'move',
  'rehearsal',
  'load_in',
  'strike',
  'other',
];

/** "3h 15m" / "45m" / "0m" */
const formatMinutes = (total: number): string => {
  if (total <= 0) return '0m';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m`.trim() : `${m}m`;
};

export const SchedulePanel: React.FC = () => {
  const { project, runCommand, activeSetup, scriptLines, avScriptRows, allShots } = useFloorPlan();
  const { theme, setActiveRightTab } = useWorkspaceUI();
  const { confirm } = useDialogs();
  const isLight = theme === 'light';

  // Memoised: `?? []` mints a fresh array every render, which made every memo
  // downstream of these recompute on every render instead of memoising.
  const days = useMemo(() => project.productionDays ?? [], [project.productionDays]);
  const blocks = useMemo(() => project.scheduleBlocks ?? [], [project.scheduleBlocks]);
  const calendarEvents = useMemo(
    () => project.productionCalendarEvents ?? [],
    [project.productionCalendarEvents],
  );

  // Inline add-block form state
  const [newBlockLabel, setNewBlockLabel] = useState('');
  const [newBlockType, setNewBlockType] = useState<ManualType>('meal');
  // The view is remembered, and other modules can ask for one (requestScheduleView).
  const [workspaceView, setWorkspaceViewState] = useState<ScheduleView>(readScheduleView);
  const setWorkspaceView = (view: ScheduleView) => {
    setWorkspaceViewState(view);
    requestScheduleView(view);
  };
  const [selectedCallSheetDayId, setSelectedCallSheetDayId] = useState<string | null>(() => days[0]?.id ?? null);
  const [sourceQuery, setSourceQuery] = useState('');
  const [selectedShotIds, setSelectedShotIds] = useState<Set<string>>(() => new Set());
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventStart, setNewEventStart] = useState('');
  const [newEventEnd, setNewEventEnd] = useState('');
  // Calendar presentation (session-only, rule 38): timeline strip or month grid.
  const [calendarMode, setCalendarMode] = useState<'timeline' | 'month' | 'list'>('timeline');
  const [calendarMonth, setCalendarMonth] = useState(() => defaultCalendarMonth(calendarEvents, days, todayIso()));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(() => days.find((day) => day.date)?.date ?? todayIso());
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const selectedEvent = calendarEvents.find((event) => event.id === selectedEventId) ?? null;

  // HTML5 drag state (buttons provide the accessible alternative)
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Call-sheet printing: the derived sheet for the day being printed, or null.
  const [printSheet, setPrintSheet] = useState<CallSheetData | null>(null);
  // Whole-view printing for the other tabs: stripboard, calendar, coverage.
  const [printView, setPrintView] = useState<'stripboard' | 'calendar' | 'coverage' | null>(null);

  const shotEntries = useMemo(
    () => project.setups.flatMap((setup) => setup.shots.map((shot) => ({ shot, setup }))),
    [project.setups]
  );

  // Scene / setup / segment / shot display names, derived once in the domain
  // so the workspace and the exporter label strips identically.
  const labelCtx = useMemo(() => buildStripboardLabelContext(project), [project]);
  // Mount the hidden print document, let the browser paint it, print, then
  // unmount. Covers the per-day call sheet and the whole-view printouts.
  useEffect(() => {
    if (!printSheet && !printView) return;
    const unmount = () => {
      setPrintSheet(null);
      setPrintView(null);
    };
    window.addEventListener('afterprint', unmount);
    // Wait for the logo (and any other image) to decode before printing.
    // Printing on a bare timer raced image loading, which is why an attached
    // production logo could be missing from the printed call sheet.
    let cancelled = false;
    const printTimer = window.setTimeout(() => {
      void waitForImages(document.querySelector('.call-sheet-print-host') ?? document.body).then(() => {
        if (!cancelled) window.print();
      });
    }, 50);
    const fallbackTimer = window.setTimeout(unmount, 15000);
    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', unmount);
      window.clearTimeout(printTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, [printSheet, printView]);

  /** Blocks not referenced by any day. */
  const pooledBlockIds = useMemo(() => {
    const scheduled = new Set<string>();
    for (const day of days) {
      for (const id of day.scheduleBlockIds) scheduled.add(id);
    }
    const inUse = new Set(scheduled);
    return blocks.filter((b) => !inUse.has(b.id));
  }, [days, blocks]);

  /** Script scenes that have not yet been turned into schedule blocks. */
  const unscheduledScenes = useMemo(() => {
    const represented = new Set(
      blocks.filter((block): block is Extract<ScheduleBlock, { kind: 'scene' }> => block.kind === 'scene')
        .map((block) => block.scriptSceneId)
    );
    const query = sourceQuery.trim().toLocaleLowerCase();
    return (project.scriptScenes ?? []).filter((scene) => {
      if (represented.has(scene.id) || scene.omitted) return false;
      if (!query) return true;
      return `${scene.sceneNumber} ${scene.heading} ${scene.synopsis ?? ''}`.toLocaleLowerCase().includes(query);
    });
  }, [blocks, project.scriptScenes, sourceQuery]);

  /** Floor-plan setups remain schedulable when a project has no screenplay. */
  const unscheduledSetups = useMemo(() => {
    const representedSetups = new Set(
      blocks.filter((block): block is Extract<ScheduleBlock, { kind: 'setup' }> => block.kind === 'setup')
        .map((block) => block.setupId)
    );
    const representedShots = new Set(
      blocks.filter((block): block is Extract<ScheduleBlock, { kind: 'shots' }> => block.kind === 'shots')
        .flatMap((block) => block.shotIds)
    );
    const query = sourceQuery.trim().toLocaleLowerCase();
    return project.setups.filter((setup) => {
      if (representedSetups.has(setup.id) || setup.shots.some((shot) => representedShots.has(shot.id))) return false;
      if (!query) return true;
      return `${setup.sceneNumber} ${setup.name} ${setup.location}`.toLocaleLowerCase().includes(query);
    });
  }, [blocks, project.setups, sourceQuery]);

  /** Individual shots stay available unless covered by a setup block or shot block. */
  const unscheduledShots = useMemo(() => {
    const representedSetups = new Set(
      blocks.filter((block): block is Extract<ScheduleBlock, { kind: 'setup' }> => block.kind === 'setup')
        .map((block) => block.setupId)
    );
    const representedShots = new Set(
      blocks.filter((block): block is Extract<ScheduleBlock, { kind: 'shots' }> => block.kind === 'shots')
        .flatMap((block) => block.shotIds)
    );
    const query = sourceQuery.trim().toLocaleLowerCase();
    return shotEntries.filter(({ shot, setup }) => {
      if (representedSetups.has(setup.id) || representedShots.has(shot.id)) return false;
      if (!query) return true;
      return `${shot.shotNumber} ${shot.name} ${shot.cameraLabel} ${shot.shotSize} ${setup.name}`.toLocaleLowerCase().includes(query);
    });
  }, [blocks, shotEntries, sourceQuery]);

  useEffect(() => {
    const available = new Set(unscheduledShots.map(({ shot }) => shot.id));
    setSelectedShotIds((current) => {
      const next = new Set([...current].filter((id) => available.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [unscheduledShots]);

  /** Blocks referenced by a day but missing from scheduleBlocks. */
  const danglingRefs = useMemo(() => {
    const known = new Set(blocks.map((b) => b.id));
    const issues: { dayId: string; blockId: string }[] = [];
    for (const day of days) {
      for (const id of day.scheduleBlockIds) {
        if (!known.has(id)) issues.push({ dayId: day.id, blockId: id });
      }
    }
    return issues;
  }, [days, blocks]);

  const conflicts = useMemo(() => findScheduleConflicts(blocks), [blocks]);

  /**
   * Locations linked to a day's blocks (rule 37: derived, never duplicated).
   * Semantic location links resolve to canonical Location entities so their
   * address/map data flows into call sheets; legacy free-text setup
   * locations still work and are matched to an entity by name when possible.
   */
  /** Where the day shoots; every strip kind resolves through the domain (dayLocations.ts). */
  const resolveDayLocations = (day: ProductionDay): CallSheetLocation[] =>
    resolveDayLocationsForBlocks(day.scheduleBlockIds, blocks, {
      locations: project.locations,
      scriptScenes: project.scriptScenes,
      setups: project.setups,
    });

  /**
   * Derive the call sheet for one day.
   *
   * The assembly moved to `domain/reports/callSheetForDay`, so the readiness
   * centre can ask the same question without rendering this panel. The panel
   * keeps only the memoised project context, which is the part worth caching
   * across the days it renders.
   */
  const callSheetContext = useMemo(() => buildCallSheetProjectContext(project), [project]);
  const buildCallSheet = (day: ProductionDay): CallSheetData =>
    callSheetForDay(project, day, callSheetContext);

  // --- Mutations (domain commands in domain/commands/schedule.ts) ---

  const addDay = () => {
    const day: ProductionDay = {
      id: createId('day'),
      name: `Day ${days.length + 1}`,
      // Default to the day AFTER the last dated shoot day so adding a week of
      // days just works; undated projects start from today.
      date: followingDayAfterLast(days),
      scheduleBlockIds: [],
    };
    runCommand(addProductionDayCommand, { day }, { domain: 'schedule' });
  };

  const updateDay = (dayId: string, updates: Partial<ProductionDay>) => {
    runCommand(updateProductionDayCommand, { dayId, updates }, { domain: 'schedule' });
  };

  const deleteDay = (dayId: string) => {
    // Blocks are never deleted with a day — they return to the pool because
    // they simply stop being referenced. Continuity takes behave the same way
    // for a stronger reason: the clips exist on a card, so deleting the day
    // does not unshoot them. They keep everything except the day they pointed
    // at, and still export — only `Date Recorded` goes blank.
    runCommand(removeProductionDayCommand, { dayId }, { domain: 'schedule' });
  };

  const addManualBlock = () => {
    const label = newBlockLabel.trim() || MANUAL_TYPE_LABELS[newBlockType];
    const block: ScheduleBlock = {
      id: createId('block'),
      kind: 'manual',
      label,
      manualType: newBlockType,
    };
    runCommand(addScheduleBlockCommand, { block }, { domain: 'schedule' });
    setNewBlockLabel('');
  };

  const deleteBlock = (blockId: string) => {
    runCommand(removeScheduleBlockCommand, { blockId }, { domain: 'schedule' });
  };

  /**
   * Place a block into a day at `index`, or back into the pool when dayId is
   * null. A block can only live in one place, so it leaves every other day.
   *
   * Delegates to `moveScheduleBlockCommand`. That command existed and was
   * tested but had never been wired in, and the panel kept an equivalent copy
   * here — two implementations of the same stripboard rule, free to drift.
   * The command also names what happened ("Move Sc. 14 from Day 3 to Day 4"),
   * where the patch this replaced logged "Update project metadata".
   */
  const placeBlock = (blockId: string, dayId: string | null, index?: number) => {
    runCommand(
      moveScheduleBlockCommand,
      { blockId, toDayId: dayId, ...(index === undefined ? {} : { toIndex: Math.max(0, index) }) },
      { domain: 'schedule' },
    );
  };

  const addCalendarEvent = () => {
    const title = newEventTitle.trim();
    if (!title) return;
    // No date typing required: new lines default to the FIRST production day
    // (or today) as a one-day clip, ready to drag into place on the timeline.
    const fallback = defaultNewEventPeriod(days);
    const startDate = newEventStart || fallback.startDate;
    const endDate = newEventEnd && newEventEnd >= startDate ? newEventEnd : startDate;
    const event: ProductionCalendarEvent = {
      id: createId('event'),
      title,
      startDate,
      endDate,
      category: 'preproduction',
      status: 'planned',
    };
    runCommand(addCalendarEventCommand, { event }, { domain: 'schedule' });
    setNewEventTitle('');
    setNewEventStart('');
    setNewEventEnd('');
  };

  const updateCalendarEvent = (eventId: string, updates: Partial<ProductionCalendarEvent>) => {
    runCommand(updateCalendarEventCommand, { eventId, updates }, { domain: 'schedule' });
  };

  const deleteCalendarEvent = (eventId: string) => {
    runCommand(removeCalendarEventCommand, { eventId }, { domain: 'schedule' });
  };

  const updateBlock = (blockId: string, updates: Partial<ScheduleBlock>) => {
    runCommand(updateScheduleBlockCommand, { blockId, updates }, { domain: 'schedule' });
  };

  const requestCallSheetPrint = (day: ProductionDay, currentSheet?: CallSheetData) => {
    const sheet = currentSheet ?? buildCallSheet(day);
    if (sheet.warnings.length === 0) {
      setPrintSheet(sheet);
      return;
    }
    void confirm({
      title: 'Print draft call sheet?',
      message: `This call sheet has ${sheet.warnings.length} readiness warning${sheet.warnings.length === 1 ? '' : 's'}:\n\n${sheet.warnings.join('\n')}\n\nPrint draft anyway?`,
      confirmLabel: 'Print draft',
    }).then((confirmed) => {
      if (!confirmed) return;
      setPrintSheet(sheet);
    });
  };

  // --- Whole-view printouts (Board / Timeline / Coverage) ---

  /**
   * Print tones mirroring the on-screen strip colors: manual banners key off
   * their type (meal emerald, move violet, rehearsal amber, load-in cyan,
   * strike/other slate), content strips off their block kind (scene amber,
   * setup cyan, shots violet, cue pink, segment indigo). Presentation-only.
   */
  const printableBoardDays = useMemo<PrintableStripboardDay[]>(
    () => buildPrintableStripboardDays(project, labelCtx, (block) => castNumbersScheduledOn(
      [block.id],
      [block],
      {
        scriptScenes: project.scriptScenes,
        setups: project.setups,
        castAssignments: project.castAssignments,
      },
    )),
    [project, labelCtx],
  );

  const printableCalendarEvents = useMemo<PrintableCalendarEvent[]>(
    () =>
      [...calendarEvents].sort((a, b) => a.startDate.localeCompare(b.startDate)).map((event) => ({
        title: event.title,
        startDate: event.startDate,
        endDate: event.endDate,
        category: event.category,
        status: event.status,
        color: event.color,
      })),
    [calendarEvents]
  );

  const printableCalendarDays = useMemo<PrintableCalendarDay[]>(
    () =>
      days.map((day) => ({
        name: day.name,
        date: day.date,
        crewCall: day.crewCall,
        plannedWrap: day.plannedWrap,
        totalMinutes: deriveDaySummary(day, blocks).totalEstimatedMinutes,
        items: printableBoardDays.find((printDay) => printDay.id === day.id)?.items.map((item) => item.label) ?? [],
      })),
    [days, blocks, printableBoardDays]
  );

  const printableCoverageRows = useMemo<PrintableCoverageRow[]>(
    () => buildPrintableCoverageRows(project),
    [project],
  );

  /**
   * Board, Timeline and Coverage print and download the SAME PDF, so the
   * printout can never differ from the file. If the PDF cannot be built the
   * older on-screen print view is the fallback.
   */
  const pdfSection = (): 'stripboard' | 'calendar' | 'coverage' | null =>
    workspaceView === 'stripboard' || workspaceView === 'calendar' || workspaceView === 'coverage' ? workspaceView : null;
  const sectionContext = () => ({ project, activeSetup, scriptLines, avScriptRows, allShots });

  const handlePrintCurrent = () => {
    if (workspaceView === 'callsheets') {
      if (selectedCallSheetDay) requestCallSheetPrint(selectedCallSheetDay);
      return;
    }
    const section = pdfSection();
    if (!section) return;
    void import('../../utils/pdf/exportStudio')
      .then(({ renderSectionPdf }) => renderSectionPdf(section, sectionContext()))
      .then(({ bytes }) => printPdfBytes(bytes))
      .catch(() => setPrintView(section));
  };

  const handleDownloadCurrent = () => {
    const section = pdfSection();
    if (!section) return;
    void import('../../utils/pdf/exportStudio').then(({ downloadSectionPdf }) => downloadSectionPdf(section, sectionContext()));
  };

  const addScheduledBlock = (block: ScheduleBlock, dayId: string | null, index?: number) => {
    runCommand(addScheduleBlockCommand, { block, dayId, ...(index === undefined ? {} : { index }) }, { domain: 'schedule' });
  };

  const scheduleScene = (scriptSceneId: string, dayId: string | null, index?: number) => {
    const block: ScheduleBlock = { id: createId('block'), kind: 'scene', scriptSceneId };
    addScheduledBlock(block, dayId, index);
  };

  const scheduleSetup = (setupId: string, dayId: string | null, index?: number) => {
    const block: ScheduleBlock = { id: createId('block'), kind: 'setup', setupId };
    addScheduledBlock(block, dayId, index);
  };

  const scheduleShots = (shotIds: string[], dayId: string | null, index?: number) => {
    const uniqueShotIds = [...new Set(shotIds)].filter((id) => shotEntries.some((entry) => entry.shot.id === id));
    if (uniqueShotIds.length === 0) return;
    const block: ScheduleBlock = { id: createId('block'), kind: 'shots', shotIds: uniqueShotIds };
    addScheduledBlock(block, dayId, index);
    setSelectedShotIds((current) => {
      const next = new Set(current);
      for (const id of uniqueShotIds) next.delete(id);
      return next;
    });
  };

  const toggleShotSelection = (shotId: string) => {
    setSelectedShotIds((current) => {
      const next = new Set(current);
      if (next.has(shotId)) next.delete(shotId);
      else next.add(shotId);
      return next;
    });
  };

  const moveWithinDay = (day: ProductionDay, blockId: string, direction: 'up' | 'down') => {
    const index = day.scheduleBlockIds.indexOf(blockId);
    if (index < 0) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= day.scheduleBlockIds.length) return;
    const ids = [...day.scheduleBlockIds];
    [ids[index], ids[target]] = [ids[target], ids[index]];
    updateDay(day.id, { scheduleBlockIds: ids });
  };

  // --- Drag & drop handlers ---

  const handleDragStart = (blockId: string) => (e: React.DragEvent) => {
    setDraggedBlockId(blockId);
    e.dataTransfer.setData('text/plain', blockId);
    e.dataTransfer.effectAllowed = 'move';
  };

  // What dropping the dragged strip on the hovered day would change.
  const whatIf = useMemo(() => {
    if (!draggedBlockId || !dropTarget || dropTarget.startsWith('pool:')) return undefined;
    const toDayId = dropTarget.startsWith('day:') ? dropTarget.slice(4) : dropTarget.split(':')[0];
    if (!days.some((day) => day.id === toDayId)) return undefined;
    return scheduleWhatIf(project, draggedBlockId, toDayId);
  }, [draggedBlockId, dropTarget, days, project]);

  const handleDragEnd = () => {
    setDraggedBlockId(null);
    setDropTarget(null);
  };

  const allowDrop = (target: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(target);
  };

  const handleDrop = (dayId: string | null, index?: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const blockId = draggedBlockId ?? e.dataTransfer.getData('text/plain');
    if (blockId.startsWith('scene:')) scheduleScene(blockId.slice(6), dayId, index);
    else if (blockId.startsWith('setup:')) scheduleSetup(blockId.slice(6), dayId, index);
    else if (blockId.startsWith('shots:')) scheduleShots(blockId.slice(6).split(',').filter(Boolean), dayId, index);
    else if (blockId.startsWith('shot:')) scheduleShots([blockId.slice(5)], dayId, index);
    else if (blockId) placeBlock(blockId, dayId, index);
    setDraggedBlockId(null);
    setDropTarget(null);
  };

  // --- Shared style helpers ---

  const cardClass = isLight
    ? 'bg-white border-slate-200'
    : 'bg-slate-900 border-slate-700';
  const mutedText = 'text-ink-muted';
  const inputClass = `min-h-[36px] px-2 py-1 rounded-lg border text-xs w-full transition-colors ${
    isLight
      ? 'bg-white border-slate-300 text-slate-800 focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500'
      : 'bg-slate-950 border-slate-700 text-slate-100 focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500'
  }`;
  const iconBtnClass = `flex items-center justify-center min-w-[36px] min-h-[36px] rounded-lg transition-colors ${
    'text-ink-muted hover:text-ink hover:bg-surface-hover'
  }`;

  const renderBlockRow = (block: ScheduleBlock, opts: { day?: ProductionDay; indexInDay?: number } = {}) => {
    const { day, indexInDay } = opts;
    const scene = block.kind === 'scene' ? project.scriptScenes?.find((candidate) => candidate.id === block.scriptSceneId) : undefined;
    const setup = block.kind === 'setup' ? project.setups.find((candidate) => candidate.id === block.setupId) : undefined;
    const blockShots = block.kind === 'shots'
      ? block.shotIds.map((id) => shotEntries.find((entry) => entry.shot.id === id)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      : [];
    const firstBlockShot = blockShots[0];
    // Setup and shot strips shoot a SCENE's material even when they were
    // created from the floor plan: their scene number resolves back to the
    // screenplay, which is where pages and cast live. Without this the board
    // showed dashes for exactly the strips an AD reads most.
    const effectiveSceneNumber = scene?.sceneNumber ?? setup?.sceneNumber ?? firstBlockShot?.setup.sceneNumber;
    const stripScriptScene =
      scene ??
      (effectiveSceneNumber
        ? project.scriptScenes?.find((candidate) => candidate.sceneNumber === effectiveSceneNumber)
        : undefined);
    const castNumbers = castNumbersScheduledOn([block.id], [block], {
      scriptScenes: project.scriptScenes,
      setups: project.setups,
      castAssignments: project.castAssignments,
    });
    const isManual = block.kind === 'manual';
    const manualTone = isManual && block.manualType === 'meal' ? 'bg-emerald-700' : isManual && block.manualType === 'move' ? 'bg-violet-600' : 'bg-slate-700';
    const targetKey = day ? `${day.id}:${indexInDay ?? 0}` : `pool:${block.id}`;
    const sceneEnvironment = scene
      ? `${scene.intExt ?? ''} ${scene.timeOfDay ?? ''}`.toUpperCase()
      : (setup?.timeOfDay ?? firstBlockShot?.setup.timeOfDay ?? '').toUpperCase();
    // Same colour rule as the printed board (domain/scheduling/stripboardPrint).
    const colorKey = stripColorKey(block, sceneEnvironment);
    const stripTone = day
      ? colorKey === 'ext_night'
        ? 'bg-emerald-100 border-emerald-300 text-emerald-950 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-50'
        : colorKey === 'ext_day'
          ? 'bg-amber-100 border-amber-300 text-amber-950 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-50'
          : colorKey === 'int_night'
            ? 'bg-blue-100 border-blue-300 text-blue-950 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-50'
            : 'bg-surface border-line-strong text-ink'
      : 'bg-surface border-line';
    const displayNumber = scene?.sceneNumber ?? setup?.sceneNumber ?? (block.kind === 'shots' ? (block.shotIds.length === 1 ? firstBlockShot?.shot.shotNumber ?? 'SHOT' : `${block.shotIds.length}×`) : block.kind.slice(0, 2).toUpperCase());
    const primaryLabel = scene?.heading ?? setup?.name ?? (block.kind === 'shots' && block.shotIds.length === 1 ? firstBlockShot?.shot.name : undefined) ?? blockLabel(block, labelCtx);
    const secondaryLabel = scene
      ? `${scene.intExt?.replace('_', '/') ?? 'SCENE'} · ${scene.timeOfDay ?? 'TIME TBD'}${scene.synopsis ? ` · ${scene.synopsis}` : ''}`
      : setup
        ? `${setup.timeOfDay} · ${setup.location || 'LOCATION TBD'} · ${setup.shots.length} SHOTS`
        : block.kind === 'shots'
          ? `${firstBlockShot?.setup.name ?? 'SETUP TBD'} · ${blockShots.map(({ shot }) => `${shot.cameraLabel} ${shot.shotSize}`).join(' + ')}`
        : block.kind;

    if (isManual && day) {
      return (
        <li key={block.id} draggable onDragStart={handleDragStart(block.id)} onDragEnd={handleDragEnd} onDragOver={allowDrop(targetKey)} onDrop={handleDrop(day.id, indexInDay)} className={`${manualTone} text-white min-h-9 flex items-center gap-2 px-2.5 text-[10px] font-black uppercase tracking-wider ${draggedBlockId === block.id ? 'opacity-40' : ''}`}>
          <GripVertical className="w-3.5 h-3.5 opacity-60 cursor-grab" /><span className="flex-1">{blockLabel(block, labelCtx)}</span><input type="number" min={0} value={block.estimatedMinutes ?? ''} onChange={(event) => updateBlock(block.id, { estimatedMinutes: event.target.value === '' ? undefined : Number(event.target.value) })} placeholder="—" aria-label="Estimated minutes" className="w-10 bg-black/20 rounded px-1 py-0.5 text-right font-mono" /><span className="opacity-90">min</span><button onClick={() => placeBlock(block.id, null)} title="Return to unscheduled" aria-label="Return to unscheduled"><ChevronLeft className="w-3.5 h-3.5" /></button>
        </li>
      );
    }

    // Scenes removed from the screenplay stay as explicit OMITTED strips
    // until the user deletes them — they are never silently resurrected or
    // dropped, and they print on call sheets as informational lines.
    const omittedLabel = block.kind === 'scene' ? block.omittedLabel : undefined;
    if (omittedLabel !== undefined) {
      return (
        <li key={block.id} draggable onDragStart={handleDragStart(block.id)} onDragEnd={handleDragEnd} onDragOver={allowDrop(targetKey)} onDrop={handleDrop(day ? day.id : null, indexInDay)} title="This scene was deleted from the screenplay. Delete this strip to remove it entirely." className={`group border border-dashed transition-all ${draggedBlockId === block.id ? 'opacity-40' : ''} ${isLight ? 'bg-slate-100 border-slate-300 text-slate-500' : 'bg-slate-900/60 border-slate-700 text-slate-400'}`}>
          <div className={`grid items-center min-h-10 ${day ? 'grid-cols-[22px_42px_1fr_68px]' : 'grid-cols-[22px_42px_1fr_42px]'}`}>
            <span className="flex justify-center cursor-grab"><GripVertical className={`w-3.5 h-3.5 ${mutedText}`} /></span>
            <span className="font-mono text-[10px] font-black text-center opacity-70">OM.</span>
            <div className="min-w-0 px-2 border-l border-inherit">
              <div className="text-[10px] font-black truncate line-through decoration-1">{omittedLabel}</div>
              <div className="text-[10px] uppercase font-bold tracking-wide opacity-70">Omitted from screenplay · {day ? 'kept for records' : 'unscheduled'}</div>
            </div>
            <span className="flex items-center justify-end gap-1 pr-1">
              <button onClick={() => deleteBlock(block.id)} title="Delete this omitted strip" aria-label="Delete this omitted strip" className={`${iconBtnClass} !min-w-6 !min-h-6 hover:!text-red-500`}><Trash2 className="w-3 h-3" /></button>
              {!day && <button onClick={() => days[0] && placeBlock(block.id, days[0].id)} disabled={!days.length} title="Add to first shooting day" aria-label="Add to first shooting day" className={`${iconBtnClass} !min-w-5 !min-h-7 disabled:opacity-30`}><ChevronRight className="w-3.5 h-3.5" /></button>}
            </span>
          </div>
        </li>
      );
    }

    return (
      <li key={block.id} draggable onDragStart={handleDragStart(block.id)} onDragEnd={handleDragEnd} onDragOver={allowDrop(targetKey)} onDrop={handleDrop(day ? day.id : null, indexInDay)} className={`group border transition-all ${draggedBlockId === block.id ? 'opacity-40' : ''} ${dropTarget === targetKey ? 'border-cyan-500 ring-1 ring-cyan-500' : stripTone}`}>
        <div className={`grid items-center min-h-12 ${day ? 'grid-cols-[22px_42px_minmax(170px,1fr)_54px_64px_58px_68px]' : 'grid-cols-[22px_42px_1fr_42px]'}`}>
          <span className="flex justify-center cursor-grab"><GripVertical className={`w-3.5 h-3.5 ${mutedText}`} /></span>
          <span className="font-mono text-[10px] font-black text-center">{displayNumber}</span>
          <div className="min-w-0 px-2 border-l border-inherit"><div className="text-[10px] font-black truncate">{primaryLabel}</div><div className="text-[10px] uppercase font-bold tracking-wide truncate opacity-80">{secondaryLabel}</div></div>
          {day ? <>
            <span className="text-[10px] font-bold text-center">{formatPageEighths(stripScriptScene?.pageLengthEighths)}</span>
            <span
              className="text-[10px] font-bold font-mono text-center truncate px-1"
              title={castNumbers.length ? `Cast ${castNumbers.join(', ')}` : undefined}
            >
              {castNumbers.length ? castNumbers.join(', ') : '—'}
            </span>
            <label className="flex items-center justify-center text-[10px] font-mono"><input type="number" min={0} value={block.estimatedMinutes ?? ''} onChange={(event) => updateBlock(block.id, { estimatedMinutes: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value)) })} placeholder="—" className={`w-9 rounded border px-1 py-1 text-right bg-surface-sunken border-line-strong`} />m</label>
            <span className="flex items-center justify-end gap-0.5 pr-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100"><button onClick={() => moveWithinDay(day, block.id, 'up')} disabled={indexInDay === 0} title="Move earlier in the day" aria-label="Move earlier in the day" className={`${iconBtnClass} !min-w-6 !min-h-6 disabled:opacity-20`}><ChevronUp className="w-3 h-3" /></button><button onClick={() => moveWithinDay(day, block.id, 'down')} disabled={indexInDay === day.scheduleBlockIds.length - 1} title="Move later in the day" aria-label="Move later in the day" className={`${iconBtnClass} !min-w-6 !min-h-6 disabled:opacity-20`}><ChevronDown className="w-3 h-3" /></button><button onClick={() => placeBlock(block.id, null)} className={`${iconBtnClass} !min-w-6 !min-h-6`} title="Return to unscheduled" aria-label="Return to unscheduled"><ChevronLeft className="w-3 h-3" /></button></span>
          </> : <span className="flex items-center"><button onClick={() => days[0] && placeBlock(block.id, days[0].id)} disabled={!days.length} title="Add to first shooting day" aria-label="Add to first shooting day" className={`${iconBtnClass} !min-w-5 !min-h-7 disabled:opacity-30`}><ChevronRight className="w-3.5 h-3.5" /></button><button onClick={() => deleteBlock(block.id)} title="Delete schedule item" aria-label="Delete schedule item" className={`${iconBtnClass} !min-w-5 !min-h-7 hover:!text-red-500`}><Trash2 className="w-3 h-3" /></button></span>}
        </div>
      </li>
    );
  };

  const renderDayBoard = (day: ProductionDay, dayIndex: number) => {
    const summary = deriveDaySummary(day, blocks);
    const shootableCount = day.scheduleBlockIds.reduce((count, blockId) => {
      const block = blocks.find((candidate) => candidate.id === blockId);
      return count + (block && block.kind !== 'manual' ? 1 : 0);
    }, 0);
    return (
      <section key={day.id} onDragOver={allowDrop(`day:${day.id}`)} onDrop={handleDrop(day.id)} className={`overflow-hidden rounded-lg border shadow-sm ${dropTarget === `day:${day.id}` ? 'border-cyan-500 ring-2 ring-cyan-500/20' : 'border-line-strong bg-surface'}`}>
        <div className="bg-slate-900 text-white px-3 py-2.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-cyan-500 text-slate-950 flex flex-col items-center justify-center leading-none shrink-0"><span className="text-[10px] font-black uppercase">Day</span><span className="text-base font-black">{dayIndex + 1}</span></div>
          <div className="min-w-0 flex-1"><input aria-label={`Name of ${day.name || 'this day'}`} value={day.name} onChange={(event) => updateDay(day.id, { name: event.target.value })} className="w-full bg-transparent text-sm font-black outline-none placeholder:text-slate-500" placeholder={`Shooting day ${dayIndex + 1}`} /><div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400"><input type="date" aria-label={`Date of ${day.name}`} value={day.date ?? ''} onChange={(event) => updateDay(day.id, { date: event.target.value || undefined })} className="bg-transparent font-mono outline-none" /><span>CALL</span><input aria-label={`Crew call on ${day.name}`} value={day.crewCall ?? ''} onChange={(event) => updateDay(day.id, { crewCall: event.target.value || undefined })} placeholder="07:00" className="w-12 bg-transparent font-mono text-white outline-none" /><span>WRAP</span><input aria-label={`Planned wrap on ${day.name}`} value={day.plannedWrap ?? ''} onChange={(event) => updateDay(day.id, { plannedWrap: event.target.value || undefined })} placeholder="18:30" className="w-12 bg-transparent font-mono text-white outline-none" /></div></div>
          <div className="text-right shrink-0"><div className="text-[11px] font-black font-mono">{formatMinutes(summary.totalEstimatedMinutes)}</div><div className="text-[10px] uppercase tracking-wider text-slate-400">{shootableCount} shoot items · {day.scheduleBlockIds.length} strips</div></div>
          <button onClick={() => { setSelectedCallSheetDayId(day.id); setWorkspaceView('callsheets'); }} className="h-8 px-2.5 rounded-md bg-white/10 hover:bg-white/20 text-[10px] font-black uppercase flex items-center gap-1.5"><FileCheck2 className="w-3.5 h-3.5" /> Call sheet</button>
          <button onClick={() => deleteDay(day.id)} title="Delete this shooting day" aria-label="Delete this shooting day" className="w-8 h-8 rounded-md hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
        {(() => {
          const dayLocations = resolveDayLocations(day);
          if (!dayLocations.length) return null;
          return (
            <div className={`px-3 py-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold border-b bg-surface-sunken border-line text-ink-soft`}>
              <span className="uppercase tracking-wider text-[10px] text-cyan-700 dark:text-cyan-400 font-black">Locations</span>
              {dayLocations.map((location, index) => (
                <span key={`${location.name}-${index}`} className="px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-800 dark:text-cyan-300 max-w-[220px] truncate" title={location.address ?? location.name}>{location.name}</span>
              ))}
            </div>
          );
        })()}
        <div className={`grid grid-cols-[22px_42px_minmax(170px,1fr)_54px_64px_58px_68px] px-0 min-h-6 items-center text-[10px] font-black uppercase tracking-wider border-b bg-surface-sunken text-ink-muted border-line`}><span></span><span className="text-center">Sc.</span><span className="px-2">Scene / schedule item</span><span className="text-center">Pages</span><span className="text-center">Cast #</span><span className="text-center">Time</span><span></span></div>
        <ol className="divide-y divide-slate-200 dark:divide-slate-800">{day.scheduleBlockIds.map((blockId, index) => { const block = blocks.find((candidate) => candidate.id === blockId); return block ? renderBlockRow(block, { day, indexInDay: index }) : null; })}</ol>
        {day.scheduleBlockIds.length === 0 && <div className={`m-2 min-h-14 rounded-md border border-dashed flex items-center justify-center text-[10px] ${mutedText} border-line-strong`}>Drag scene strips or banners into this shooting day</div>}
        <div className={`h-8 px-3 flex items-center justify-between border-t text-[10px] font-black uppercase tracking-wide bg-surface-sunken border-line-strong text-ink-soft`}><span>End of day {dayIndex + 1} of {days.length}</span><span className="font-mono">{shootableCount} shoot items · {formatMinutes(summary.totalEstimatedMinutes)} · {day.date || 'date TBD'}</span></div>
      </section>
    );
  };

  const hasIssues = conflicts.length > 0 || danglingRefs.length > 0;
  const selectedCallSheetDay = days.find((day) => day.id === selectedCallSheetDayId) ?? days[0];
  const selectedCallSheet = selectedCallSheetDay ? buildCallSheet(selectedCallSheetDay) : null;
  return (
    <div className={`h-full overflow-hidden flex flex-col ${isLight ? 'bg-[#f3f5f7]' : 'bg-slate-950'}`}>
      <header className={`shrink-0 border-b bg-surface border-line`}>
        <div className="min-h-12 px-4 py-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <PanelTitle icon={<CalendarDays />} title="Production schedule" subtitle={`${days.length} shoot days · ${days.reduce((sum, day) => sum + day.scheduleBlockIds.length, 0)} scheduled strips · ${pooledBlockIds.length + unscheduledScenes.length + unscheduledSetups.length + unscheduledShots.length} available items`} />
          <div className="flex items-center gap-2">
            {workspaceView === 'stripboard' && (
              <button
                type="button"
                onClick={() => setActiveRightTab('contacts')}
                title="Assign performers and edit their production cast numbers"
                className={`h-8 px-2.5 rounded-md border text-[10px] font-black flex items-center gap-1.5 transition-colors bg-field border-line-strong hover:border-emerald-500 hover:text-ok`}
              >
                <Users className="w-3.5 h-3.5" /><span className="hidden sm:inline">Cast numbers</span>
              </button>
            )}
            <div className={`flex h-8 rounded-md border p-0.5 bg-surface-sunken border-line`}>
              {([['stripboard', StripboardIcon, 'Board'], ['oneliner', ListOrdered, 'One-liner'], ['dood', DoodIcon, 'DOOD'], ['calendar', CalendarRange, 'Timeline'], ['callsheets', FileCheck2, 'Call sheets'], ['coverage', Users, 'Coverage'], ['timereport', TimeSheetIcon, 'Time report']] as const).map(([view, Icon, label]) => <button key={view} onClick={() => setWorkspaceView(view)} aria-pressed={workspaceView === view} aria-label={label} title={label} className={`px-2 sm:px-2.5 rounded text-[10px] font-black flex items-center gap-1.5 transition-colors ${workspaceView === view ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm' : mutedText}`}><Icon className="w-3.5 h-3.5" /><span className="hidden sm:inline">{label}</span></button>)}
            </div>
            {(pdfSection() || workspaceView === 'callsheets') && (
              <button
                type="button"
                onClick={handlePrintCurrent}
                disabled={workspaceView === 'callsheets' && !selectedCallSheetDay}
                title="Print this view (the same document as the PDF)"
                aria-label="Print this schedule view"
                className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md border border-line-strong text-ink-soft hover:bg-surface-hover disabled:opacity-40"
              >
                <Printer className="h-3.5 w-3.5" />
              </button>
            )}
            {pdfSection() && (
              <PdfExportButton onClick={handleDownloadCurrent} title="Download this schedule view as a PDF" />
            )}
          </div>
        </div>
      </header>

      {hasIssues && <div className="shrink-0 px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-[10px] font-bold text-amber-900 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" />{conflicts.length + danglingRefs.length} schedule integrity warning{conflicts.length + danglingRefs.length === 1 ? '' : 's'} need attention.</div>}

      {workspaceView === 'stripboard' && <div className="relative flex-1 min-h-0 flex overflow-hidden">
        {whatIf && <WhatIfPanel whatIf={whatIf} />}
        <aside onDragOver={allowDrop('pool')} onDrop={handleDrop(null)} className={`w-[150px] sm:w-[205px] shrink-0 border-r flex flex-col min-h-0 bg-surface border-line`}>
          <div className="p-2.5 border-b border-inherit"><div className="flex items-center justify-between"><h3 className="text-[10px] font-black uppercase tracking-[0.14em] flex items-center gap-1.5"><Inbox className="w-3.5 h-3.5 text-cyan-700 dark:text-cyan-400" />Unscheduled</h3><span className="text-[10px] font-mono font-bold text-slate-500">{pooledBlockIds.length + unscheduledScenes.length + unscheduledSetups.length + unscheduledShots.length}</span></div><div className="relative mt-2"><Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" /><input value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} placeholder="Search scenes, setups, shots" className={`${inputClass} !min-h-8 !pl-7 !text-[10px]`} /></div></div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
            {selectedShotIds.size > 0 && <div className={`sticky top-0 z-10 rounded-md border p-1.5 flex items-center gap-1.5 shadow-sm ${isLight ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-white text-slate-950'}`}><span className="flex-1 text-[10px] font-black">{selectedShotIds.size} shots selected</span><button type="button" disabled={!days.length} onClick={() => days[0] && scheduleShots([...selectedShotIds], days[0].id)} className="h-6 px-2 rounded bg-cyan-500 text-slate-950 text-[10px] font-black disabled:opacity-40">Add to day 1</button><button type="button" onClick={() => setSelectedShotIds(new Set())} title="Clear the shot selection" aria-label="Clear the shot selection" className="w-6 h-6 text-sm opacity-70">×</button></div>}
            {unscheduledScenes.map((scene) => <div key={scene.id} draggable onDragStart={handleDragStart(`scene:${scene.id}`)} onDragEnd={handleDragEnd} className={`border rounded-md overflow-hidden cursor-grab ${isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-950/20 border-amber-800/50'}`}><div className="flex"><div className="w-7 bg-amber-400 text-amber-950 flex items-center justify-center font-mono text-[10px] font-black">{scene.sceneNumber}</div><div className="min-w-0 flex-1 px-2 py-2"><div className="text-[10px] font-black truncate">{scene.heading}</div><div className={`mt-0.5 text-[10px] font-bold uppercase ${mutedText}`}>{scene.intExt?.replace('_', '/') ?? 'SCENE'} · {scene.timeOfDay ?? 'TBD'} · {formatPageEighths(scene.pageLengthEighths)}</div></div><button type="button" disabled={!days.length} onClick={() => days[0] && scheduleScene(scene.id, days[0].id)} title="Add to first shooting day" aria-label="Add to first shooting day" className="w-7 shrink-0 flex items-center justify-center text-amber-800 hover:bg-amber-200 disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button></div></div>)}
            {unscheduledSetups.map((setup) => <div key={setup.id} draggable onDragStart={handleDragStart(`setup:${setup.id}`)} onDragEnd={handleDragEnd} className={`border rounded-md overflow-hidden cursor-grab ${isLight ? 'bg-cyan-50 border-cyan-200' : 'bg-cyan-950/20 border-cyan-800/50'}`}><div className="flex"><div className="w-7 bg-cyan-500 text-slate-950 flex items-center justify-center font-mono text-[10px] font-black">SET</div><div className="min-w-0 flex-1 px-2 py-2"><div className="text-[10px] font-black truncate">{setup.name}</div><div className={`mt-0.5 text-[10px] font-bold uppercase truncate ${mutedText}`}>{setup.sceneNumber || 'No scene'} · {setup.location || 'Location TBD'} · {setup.shots.length} shots</div></div><button type="button" disabled={!days.length} onClick={() => days[0] && scheduleSetup(setup.id, days[0].id)} title="Add to first shooting day" aria-label="Add to first shooting day" className="w-7 shrink-0 flex items-center justify-center text-cyan-800 hover:bg-cyan-200 disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button></div></div>)}
            {unscheduledShots.map(({ shot, setup }) => { const selected = selectedShotIds.has(shot.id); const dragIds = selected ? [...selectedShotIds] : [shot.id]; return <div key={shot.id} draggable onDragStart={handleDragStart(`shots:${dragIds.join(',')}`)} onDragEnd={handleDragEnd} className={`border rounded-md overflow-hidden cursor-grab transition-colors ${selected ? 'ring-2 ring-violet-500 border-violet-500' : isLight ? 'bg-violet-50 border-violet-200' : 'bg-violet-950/20 border-violet-800/50'}`}><div className="flex items-stretch"><label className="w-7 shrink-0 flex items-center justify-center bg-violet-500/15"><input type="checkbox" checked={selected} onChange={() => toggleShotSelection(shot.id)} aria-label={`Select shot ${shot.shotNumber}`} className="accent-violet-600" /></label><div className="min-w-0 flex-1 px-2 py-1.5"><div className="text-[10px] font-black truncate">{shot.shotNumber} · {shot.name}</div><div className={`mt-0.5 text-[10px] font-bold uppercase truncate ${mutedText}`}>{shot.cameraLabel} · {shot.shotSize} · {shot.lensMm}mm · {setup.name}</div></div><button type="button" disabled={!days.length} onClick={() => days[0] && scheduleShots([shot.id], days[0].id)} title={`Add shot ${shot.shotNumber} to first shooting day`} aria-label={`Add shot ${shot.shotNumber} to first shooting day`} className="w-7 shrink-0 flex items-center justify-center text-violet-700 hover:bg-violet-200 disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button></div></div>; })}
            {pooledBlockIds.map((block) => renderBlockRow(block))}
            {!unscheduledScenes.length && !unscheduledSetups.length && !unscheduledShots.length && !pooledBlockIds.length && <div className={`py-8 text-center text-[10px] ${mutedText}`}>Everything is scheduled.</div>}
          </div>
          <div className="p-2 border-t border-inherit space-y-1.5"><div className="flex gap-1"><select aria-label="Banner type" value={newBlockType} onChange={(event) => setNewBlockType(event.target.value as ManualType)} className={`${inputClass} !min-h-8 !w-[74px] !text-[10px]`}>{MANUAL_TYPES.map((type) => <option key={type} value={type}>{MANUAL_TYPE_LABELS[type]}</option>)}</select><input aria-label="Banner label" value={newBlockLabel} onChange={(event) => setNewBlockLabel(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addManualBlock()} placeholder="Banner label" className={`${inputClass} !min-h-8 !text-[10px]`} /><button onClick={addManualBlock} title="Add this banner to the schedule" aria-label="Add this banner to the schedule" className="w-8 h-8 rounded-md bg-slate-900 text-white dark:bg-white dark:text-slate-950 flex items-center justify-center shrink-0"><Plus className="w-3.5 h-3.5" /></button></div><button onClick={addDay} className="w-full h-8 rounded-md bg-cyan-700 hover:bg-cyan-500 text-white text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" />Add shooting day</button></div>
        </aside>
        <main className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-3 space-y-3">{days.length > 0 && <ScheduleHealth isLight={isLight} />}{days.map(renderDayBoard)}{!days.length && <div className={`h-40 rounded-lg border border-dashed flex flex-col items-center justify-center gap-2 ${mutedText} bg-surface border-line-strong`}><CalendarDays className="w-6 h-6" /><p className="text-[10px] font-bold">Add your first shooting day, then drag scenes onto the board.</p></div>}</main>
      </div>}

      {workspaceView === 'calendar' && <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className={`flex p-0.5 rounded-md border border-line-strong bg-field`}>
            {(['timeline', 'month', 'list'] as const).map((mode) => (
              <button key={mode} onClick={() => setCalendarMode(mode)} aria-pressed={calendarMode === mode} className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${calendarMode === mode ? 'bg-accent text-white' : mutedText}`}>
                {mode === 'timeline' ? 'Timeline' : mode === 'month' ? 'Month' : 'List'}
              </button>
            ))}
          </div>
          <span className={`text-[10px] ${mutedText}`}>{calendarEvents.length} event{calendarEvents.length === 1 ? '' : 's'} · {days.filter((day) => day.date).length} dated shooting day{days.filter((day) => day.date).length === 1 ? '' : 's'}</span>
        </div>
        {selectedEvent && (
          <CalendarEventEditor
            event={selectedEvent}
            people={project.people ?? []}
            isLight={isLight}
            onUpdate={(updates) => updateCalendarEvent(selectedEvent.id, updates)}
            onDelete={() => {
              deleteCalendarEvent(selectedEvent.id);
              setSelectedEventId(null);
            }}
            onClose={() => setSelectedEventId(null)}
          />
        )}
        {calendarMode === 'month' && (<>
          <MonthCalendar
            yearMonth={calendarMonth}
            onChangeMonth={setCalendarMonth}
            events={calendarEvents}
            days={days}
            workDays={printableBoardDays}
            tasks={project.tasks ?? []}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
            onSelectDate={setSelectedCalendarDate}
            selectedDate={selectedCalendarDate}
            isLight={isLight}
          />
          <section className={`rounded-lg border overflow-hidden ${cardClass}`}>
            <div className={`px-3 py-2 border-b border-line bg-surface-sunken`}>
              <h3 className="text-[10px] font-black uppercase tracking-wider">Daily shooting schedule</h3>
              <p className={`text-[10px] ${mutedText}`}>{selectedCalendarDate ?? 'Select a day in the month above'}.</p>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {printableBoardDays
                .filter((day) => day.date === selectedCalendarDate)
                .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
                .map((day) => (
                  <article key={day.id} className="grid grid-cols-[120px_1fr_auto] gap-3 px-3 py-2.5 items-start">
                    <div>
                      <div className="text-[10px] font-black">{day.name}</div>
                      <div className={`text-[10px] font-mono ${mutedText}`}>{day.date}</div>
                      <div className={`text-[10px] ${mutedText}`}>{day.crewCall ?? 'Call TBD'} - {day.plannedWrap ?? 'Wrap TBD'}</div>
                    </div>
                    <ol className="space-y-0.5 min-w-0">
                      {day.items.map((item, index) => (
                        <li key={`${item.label}-${index}`} className="text-[10px] truncate" title={item.label}>
                          <span className="font-mono text-slate-400 mr-1.5">{index + 1}.</span>{item.label}
                        </li>
                      ))}
                      {day.items.length === 0 && <li className={`text-[10px] ${mutedText}`}>No strips scheduled.</li>}
                    </ol>
                    <span className={`text-[10px] font-mono font-bold ${mutedText}`}>{formatMinutes(day.totalMinutes)}</span>
                  </article>
                ))}
              {!printableBoardDays.some((day) => day.date === selectedCalendarDate) && (
                <p className={`px-3 py-4 text-[10px] ${mutedText}`}>No shooting day is scheduled on this date.</p>
              )}
            </div>
          </section>
        </>)}
        {calendarMode === 'timeline' && <>
        <div className={`rounded-lg border p-2.5 grid grid-cols-[1fr_130px_130px_auto] gap-2 items-end ${cardClass}`}>
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Event or milestone
            <input value={newEventTitle} onChange={(event) => setNewEventTitle(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addCalendarEvent()} placeholder="Tech scout, principal photography, picture lock…" className={`${inputClass} mt-1 !min-h-8`} />
          </label>
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Start (optional)
            <input type="date" value={newEventStart} onChange={(event) => setNewEventStart(event.target.value)} className={`${inputClass} mt-1 !min-h-8`} />
          </label>
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">End (optional)
            <input type="date" value={newEventEnd} onChange={(event) => setNewEventEnd(event.target.value)} className={`${inputClass} mt-1 !min-h-8`} />
          </label>
          <button onClick={addCalendarEvent} disabled={!newEventTitle.trim()} title="New lines default to the first production day — drag them into place on the timeline." className="h-8 px-3 rounded-md bg-cyan-700 text-white text-[10px] font-black disabled:opacity-40">Add line</button>
        </div>
        <TimelineCalendar
          events={calendarEvents}
          days={days}
          isLight={isLight}
          onUpdateEvent={updateCalendarEvent}
          onDeleteEvent={deleteCalendarEvent}
          onUpdateDay={updateDay}
        />
        <p className={`text-[10px] ${mutedText}`}>Drag a clip to move it between days · drag its edges to resize the period · shooting-day clips re-date their day. New lines start on the first production day. Switch to Month to edit category, status, assignees and notes.</p>
        </>}
        {calendarMode === 'list' && (
          <section className={`rounded-lg border overflow-hidden ${cardClass}`}>
            <div className={`px-3 py-2 border-b border-line bg-surface-sunken`}>
              <h3 className="text-[10px] font-black uppercase tracking-wider">Shooting-day list</h3>
              <p className={`text-[10px] ${mutedText}`}>Every dated day and every scheduled strip.</p>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {[...printableBoardDays].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).map((day) => (
                <article key={day.id} className="grid grid-cols-[120px_1fr_auto] gap-3 px-3 py-2.5 items-start">
                  <div><div className="text-[10px] font-black">{day.name}</div><div className={`text-[10px] font-mono ${mutedText}`}>{day.date ?? 'Date TBD'}</div></div>
                  <ol className="space-y-0.5 min-w-0">{day.items.map((item, index) => <li key={`${item.label}-${index}`} className="text-[10px] truncate"><span className="font-mono text-slate-400 mr-1.5">{index + 1}.</span>{item.label}</li>)}</ol>
                  <span className={`text-[10px] font-mono font-bold ${mutedText}`}>{formatMinutes(day.totalMinutes)}</span>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>}

      {workspaceView === 'callsheets' && <div className="flex-1 min-h-0"><CallSheetWorkspace days={days} selectedDayId={selectedCallSheetDay?.id ?? null} onSelectDay={setSelectedCallSheetDayId} sheet={selectedCallSheet} updateDay={updateDay} onPrint={requestCallSheetPrint} isLight={isLight} /></div>}
      {workspaceView === 'coverage' && <div className="flex-1 min-h-0"><CoverageMatrixEditor /></div>}
      {workspaceView === 'dood' && <div className="flex-1 min-h-0 overflow-auto custom-scrollbar p-3"><ScheduleDood isLight={isLight} onOpenBoard={() => setWorkspaceView('stripboard')} /></div>}
      {workspaceView === 'oneliner' && <div className="flex-1 min-h-0"><OneLinerView isLight={isLight} /></div>}
      {workspaceView === 'timereport' && <div className="flex-1 min-h-0"><PerformerTimeReportView days={days} isLight={isLight} /></div>}

      {printSheet && createPortal(<div className="call-sheet-print-host"><CallSheetPrintView sheet={printSheet} /></div>, document.body)}
      {printView === 'stripboard' && createPortal(
        <div className="schedule-print-host">
          <StripboardPrintView productionTitle={project.title} company={project.productionCompany} logo={project.logo} days={printableBoardDays} />
        </div>,
        document.body
      )}
      {printView === 'calendar' && createPortal(
        <div className="schedule-print-host">
          <ScheduleCalendarPrintView productionTitle={project.title} company={project.productionCompany} logo={project.logo} events={printableCalendarEvents} days={printableCalendarDays} mode={calendarMode} yearMonth={calendarMonth} />
        </div>,
        document.body
      )}
      {printView === 'coverage' && createPortal(
        <div className="schedule-print-host">
          <CoverageMatrixPrintView
            productionTitle={project.title}
            company={project.productionCompany}
            logo={project.logo}
            cameras={project.coverageMatrix?.cameraIds ?? []}
            rows={printableCoverageRows}
          />
        </div>,
        document.body
      )}
    </div>
  );
};
