import React, { useEffect, useMemo, useState } from 'react';
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
  LayoutList,
  Printer,
  Search,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { CoverageMatrixEditor } from './CoverageMatrixEditor';
import { TimelineCalendar } from './TimelineCalendar';
import { CalendarEventEditor, MonthCalendar } from './MonthCalendar';
import { createId } from '../../domain/ids';
import { waitForImages } from '../../utils/image';
import {
  BLOCK_KIND_LABELS,
  MANUAL_TYPE_LABELS,
  blockLabel,
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
import type { Location } from '../../domain/locations';
import type { ProductionCalendarEvent, ProductionDay, ScheduleBlock } from '../../domain/scheduling';
import { castFilterForDay, deriveCallSheet } from '../../domain/reports';
import { CallSheetPrintView } from '../reports/CallSheetPrintView';
import { StripboardPrintView } from '../reports/StripboardPrintView';
import type { PrintableStripboardDay } from '../reports/StripboardPrintView';
import { ScheduleCalendarPrintView } from '../reports/ScheduleCalendarPrintView';
import type { PrintableCalendarDay, PrintableCalendarEvent } from '../reports/ScheduleCalendarPrintView';
import { CoverageMatrixPrintView } from '../reports/CoverageMatrixPrintView';
import type { PrintableCoverageRow } from '../reports/CoverageMatrixPrintView';
import { CallSheetWorkspace } from './CallSheetWorkspace';

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
  const { project, theme, updateProjectMeta } = useFloorPlan();
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
  const [workspaceView, setWorkspaceView] = useState<'stripboard' | 'calendar' | 'callsheets' | 'coverage'>('stripboard');
  const [selectedCallSheetDayId, setSelectedCallSheetDayId] = useState<string | null>(() => days[0]?.id ?? null);
  const [sourceQuery, setSourceQuery] = useState('');
  const [selectedShotIds, setSelectedShotIds] = useState<Set<string>>(() => new Set());
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventStart, setNewEventStart] = useState('');
  const [newEventEnd, setNewEventEnd] = useState('');
  // Calendar presentation (session-only, rule 38): timeline strip or month grid.
  const [calendarMode, setCalendarMode] = useState<'timeline' | 'month'>('timeline');
  const [calendarMonth, setCalendarMonth] = useState(() => defaultCalendarMonth(calendarEvents, days, todayIso()));
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
  const resolveDayLocations = (day: ProductionDay): CallSheetLocation[] => {
    const out: CallSheetLocation[] = [];
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const pushEntity = (entity: Location) => {
      if (seenIds.has(entity.id)) return;
      seenIds.add(entity.id);
      seenNames.add(entity.name.toLocaleLowerCase());
      out.push({ name: entity.name, address: entity.address, lat: entity.lat, lng: entity.lng });
    };
    const pushName = (name: string) => {
      if (!name || seenNames.has(name.toLocaleLowerCase())) return;
      seenNames.add(name.toLocaleLowerCase());
      const entity = (project.locations ?? []).find(
        (candidate) => candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase()
      );
      if (entity) pushEntity(entity);
      else out.push({ name });
    };
    for (const id of day.scheduleBlockIds) {
      const block = blocks.find((b) => b.id === id);
      if (!block) continue;
      if (block.kind === 'setup') {
        const setup = project.setups.find((s) => s.id === block.setupId);
        const entity = setup?.locationId
          ? (project.locations ?? []).find((candidate) => candidate.id === setup.locationId)
          : undefined;
        if (entity) pushEntity(entity);
        else if (setup?.location) pushName(setup.location);
      }
      if (block.kind === 'scene') {
        const entity = (project.locations ?? []).find((candidate) => candidate.id === project.scriptScenes?.find((s) => s.id === block.scriptSceneId)?.locationId);
        if (entity) pushEntity(entity);
      }
      if (block.kind === 'shots') {
        for (const shotId of block.shotIds) {
          const owner = shotEntries.find((entry) => entry.shot.id === shotId)?.setup;
          const entity = owner?.locationId
            ? (project.locations ?? []).find((candidate) => candidate.id === owner.locationId)
            : undefined;
          if (entity) pushEntity(entity);
          else if (owner?.location) pushName(owner.location);
        }
      }
    }
    return out;
  };

  /** Performers assigned to characters that appear in a day's scheduled scenes. */
  /**
   * Who is called on a day. Derived in the domain so scenes, setups AND shots
   * all contribute their cast — scheduling by setup used to yield nobody — and
   * so a production with no cast model at all (a concert, a broadcast) calls
   * everyone rather than nobody. `undefined` means "no filter".
   */
  const castPersonIdsForDay = (day: ProductionDay): string[] | undefined =>
    castFilterForDay(day.scheduleBlockIds, blocks, {
      scriptScenes: project.scriptScenes,
      setups: project.setups,
      castAssignments: project.castAssignments,
    });

  /** Derive the call sheet for one day, reusing the panel's label resolution. */
  const buildCallSheet = (day: ProductionDay): CallSheetData => {
    const locations = resolveDayLocations(day);
    const castPersonIds = castPersonIdsForDay(day);
    // Look-ahead: the next day in board order (by date when both are dated).
    const dayIndex = days.findIndex((candidate) => candidate.id === day.id);
    const following = days[dayIndex + 1];
    const nextDay = following
      ? { day: following, locations: resolveDayLocations(following), castPersonIds: castPersonIdsForDay(following) }
      : undefined;
    return deriveCallSheet({
      nextDay,
      day,
      blocks,
      productionTitle: project.title,
      productionCompany: project.productionCompany,
      productionCompanyInfo: project.productionCompanyInfo,
      productionLogo: project.logo,
      standingCallSheet: project.standingCallSheet,
      people: project.people ?? [],
      castPersonIds,
      locations,
      resolveSceneLabel: (id) => labelCtx.sceneNames.get(id),
      resolveSetupLabel: (id) => labelCtx.setupNames.get(id),
      resolveSegmentLabel: (id) => labelCtx.segmentNames.get(id),
      resolveShotLabel: (ids) => ids.map((id) => labelCtx.shotNames.get(id)).filter((label): label is string => Boolean(label)).join(' + ') || undefined,
    });
  };

  // --- Mutations (all via updateProjectMeta, immutable) ---

  const addDay = () => {
    const day: ProductionDay = {
      id: createId('day'),
      name: `Day ${days.length + 1}`,
      // Default to the day AFTER the last dated shoot day so adding a week of
      // days just works; undated projects start from today.
      date: followingDayAfterLast(days),
      scheduleBlockIds: [],
    };
    updateProjectMeta({ productionDays: [...days, day] });
  };

  const updateDay = (dayId: string, updates: Partial<ProductionDay>) => {
    updateProjectMeta({
      productionDays: days.map((d) => (d.id === dayId ? { ...d, ...updates } : d)),
    });
  };

  const deleteDay = (dayId: string) => {
    // Blocks are never deleted with a day — they return to the pool because
    // they simply stop being referenced.
    updateProjectMeta({ productionDays: days.filter((d) => d.id !== dayId) });
  };

  const addManualBlock = () => {
    const label = newBlockLabel.trim() || MANUAL_TYPE_LABELS[newBlockType];
    const block: ScheduleBlock = {
      id: createId('block'),
      kind: 'manual',
      label,
      manualType: newBlockType,
    };
    updateProjectMeta({ scheduleBlocks: [...blocks, block] });
    setNewBlockLabel('');
  };

  const deleteBlock = (blockId: string) => {
    updateProjectMeta({
      scheduleBlocks: blocks.filter((b) => b.id !== blockId),
      productionDays: days.map((d) => ({
        ...d,
        scheduleBlockIds: d.scheduleBlockIds.filter((id) => id !== blockId),
      })),
    });
  };

  /**
   * Place a block into a day at `index` (or the pool when dayId is null).
   * Removes it from every day first so a block can only live in one place.
   */
  const placeBlock = (blockId: string, dayId: string | null, index?: number) => {
    let nextDays = days.map((d) => ({
      ...d,
      scheduleBlockIds: d.scheduleBlockIds.filter((id) => id !== blockId),
    }));
    if (dayId !== null) {
      nextDays = nextDays.map((d) => {
        if (d.id !== dayId) return d;
        const ids = [...d.scheduleBlockIds];
        const at = index === undefined ? ids.length : Math.max(0, Math.min(index, ids.length));
        ids.splice(at, 0, blockId);
        return { ...d, scheduleBlockIds: ids };
      });
    }
    updateProjectMeta({ productionDays: nextDays });
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
    updateProjectMeta({ productionCalendarEvents: [...calendarEvents, event] });
    setNewEventTitle('');
    setNewEventStart('');
    setNewEventEnd('');
  };

  /** Month grid: clicking an empty day drops a one-day event there, ready to rename. */
  const addCalendarEventOn = (iso: string) => {
    const event: ProductionCalendarEvent = {
      id: createId('event'),
      title: 'New event',
      startDate: iso,
      endDate: iso,
      category: 'preproduction',
      status: 'planned',
    };
    updateProjectMeta({ productionCalendarEvents: [...calendarEvents, event] });
    setSelectedEventId(event.id);
  };

  const updateCalendarEvent = (eventId: string, updates: Partial<ProductionCalendarEvent>) => {
    updateProjectMeta({
      productionCalendarEvents: calendarEvents.map((event) =>
        event.id === eventId ? { ...event, ...updates } : event
      ),
    });
  };

  const deleteCalendarEvent = (eventId: string) => {
    updateProjectMeta({ productionCalendarEvents: calendarEvents.filter((event) => event.id !== eventId) });
  };

  const updateBlock = (blockId: string, updates: Partial<ScheduleBlock>) => {
    updateProjectMeta({
      scheduleBlocks: blocks.map((block) => block.id === blockId ? { ...block, ...updates } as ScheduleBlock : block),
    });
  };

  const requestCallSheetPrint = (day: ProductionDay) => {
    const sheet = buildCallSheet(day);
    if (sheet.warnings.length > 0 && !window.confirm(`This call sheet has ${sheet.warnings.length} readiness warning${sheet.warnings.length === 1 ? '' : 's'}:\n\n${sheet.warnings.join('\n')}\n\nPrint draft anyway?`)) {
      return;
    }
    setPrintSheet(sheet);
  };

  // --- Whole-view printouts (Board / Timeline / Coverage) ---

  /**
   * Print tones mirroring the on-screen strip colors: manual banners key off
   * their type (meal emerald, move violet, rehearsal amber, load-in cyan,
   * strike/other slate), content strips off their block kind (scene amber,
   * setup cyan, shots violet, cue pink, segment indigo). Presentation-only.
   */
  const printableBoardDays = useMemo<PrintableStripboardDay[]>(
    () => buildPrintableStripboardDays(project, labelCtx),
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
      })),
    [days, blocks]
  );

  const printableCoverageRows = useMemo<PrintableCoverageRow[]>(
    () => buildPrintableCoverageRows(project),
    [project],
  );

  /** The header Print button prints whatever tab is active. */
  const handlePrintCurrent = () => {
    switch (workspaceView) {
      case 'stripboard':
        setPrintView('stripboard');
        break;
      case 'calendar':
        setPrintView('calendar');
        break;
      case 'callsheets':
        if (selectedCallSheetDay) requestCallSheetPrint(selectedCallSheetDay);
        break;
      case 'coverage':
        setPrintView('coverage');
        break;
    }
  };

  const scheduleScene = (scriptSceneId: string, dayId: string | null, index?: number) => {
    const block: ScheduleBlock = {
      id: createId('block'),
      kind: 'scene',
      scriptSceneId,
    };
    let nextDays = days;
    if (dayId !== null) {
      nextDays = days.map((day) => {
        if (day.id !== dayId) return day;
        const ids = [...day.scheduleBlockIds];
        ids.splice(index === undefined ? ids.length : Math.max(0, Math.min(index, ids.length)), 0, block.id);
        return { ...day, scheduleBlockIds: ids };
      });
    }
    updateProjectMeta({ scheduleBlocks: [...blocks, block], productionDays: nextDays });
  };

  const scheduleSetup = (setupId: string, dayId: string | null, index?: number) => {
    const block: ScheduleBlock = { id: createId('block'), kind: 'setup', setupId };
    let nextDays = days;
    if (dayId !== null) {
      nextDays = days.map((day) => {
        if (day.id !== dayId) return day;
        const ids = [...day.scheduleBlockIds];
        ids.splice(index === undefined ? ids.length : Math.max(0, Math.min(index, ids.length)), 0, block.id);
        return { ...day, scheduleBlockIds: ids };
      });
    }
    updateProjectMeta({ scheduleBlocks: [...blocks, block], productionDays: nextDays });
  };

  const scheduleShots = (shotIds: string[], dayId: string | null, index?: number) => {
    const uniqueShotIds = [...new Set(shotIds)].filter((id) => shotEntries.some((entry) => entry.shot.id === id));
    if (uniqueShotIds.length === 0) return;
    const block: ScheduleBlock = { id: createId('block'), kind: 'shots', shotIds: uniqueShotIds };
    let nextDays = days;
    if (dayId !== null) {
      nextDays = days.map((day) => {
        if (day.id !== dayId) return day;
        const ids = [...day.scheduleBlockIds];
        ids.splice(index === undefined ? ids.length : Math.max(0, Math.min(index, ids.length)), 0, block.id);
        return { ...day, scheduleBlockIds: ids };
      });
    }
    updateProjectMeta({ scheduleBlocks: [...blocks, block], productionDays: nextDays });
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
  const mutedText = isLight ? 'text-slate-500' : 'text-slate-400';
  const inputClass = `min-h-[36px] px-2 py-1 rounded-lg border text-xs w-full transition-colors ${
    isLight
      ? 'bg-white border-slate-300 text-slate-800 focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500'
      : 'bg-slate-950 border-slate-700 text-slate-100 focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500'
  }`;
  const iconBtnClass = `flex items-center justify-center min-w-[36px] min-h-[36px] rounded-lg transition-colors ${
    isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/70' : 'text-slate-400 hover:text-white hover:bg-slate-800'
  }`;

  const renderBlockRow = (block: ScheduleBlock, opts: { day?: ProductionDay; indexInDay?: number } = {}) => {
    const { day, indexInDay } = opts;
    const scene = block.kind === 'scene' ? project.scriptScenes?.find((candidate) => candidate.id === block.scriptSceneId) : undefined;
    const setup = block.kind === 'setup' ? project.setups.find((candidate) => candidate.id === block.setupId) : undefined;
    const blockShots = block.kind === 'shots'
      ? block.shotIds.map((id) => shotEntries.find((entry) => entry.shot.id === id)).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      : [];
    const firstBlockShot = blockShots[0];
    const isManual = block.kind === 'manual';
    const manualTone = isManual && block.manualType === 'meal' ? 'bg-emerald-600' : isManual && block.manualType === 'move' ? 'bg-violet-600' : 'bg-slate-700';
    const targetKey = day ? `${day.id}:${indexInDay ?? 0}` : `pool:${block.id}`;
    const sceneEnvironment = scene
      ? `${scene.intExt ?? ''} ${scene.timeOfDay ?? ''}`.toUpperCase()
      : (setup?.timeOfDay ?? firstBlockShot?.setup.timeOfDay ?? '').toUpperCase();
    const isExterior = sceneEnvironment.includes('EXT');
    const isNight = sceneEnvironment.includes('NIGHT');
    const stripTone = day
      ? isExterior && isNight
        ? 'bg-emerald-100 border-emerald-300 text-emerald-950 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-50'
        : isExterior
          ? 'bg-amber-100 border-amber-300 text-amber-950 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-50'
          : isNight
            ? 'bg-blue-100 border-blue-300 text-blue-950 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-50'
            : isLight
              ? 'bg-white border-slate-300 text-slate-900'
              : 'bg-slate-900 border-slate-700 text-slate-100'
      : isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800';
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
          <GripVertical className="w-3.5 h-3.5 opacity-60 cursor-grab" /><span className="flex-1">{blockLabel(block, labelCtx)}</span><input type="number" min={0} value={block.estimatedMinutes ?? ''} onChange={(event) => updateBlock(block.id, { estimatedMinutes: event.target.value === '' ? undefined : Number(event.target.value) })} placeholder="—" className="w-10 bg-white/15 rounded px-1 py-0.5 text-right font-mono" /><span className="opacity-70">min</span><button onClick={() => placeBlock(block.id, null)} title="Return to unscheduled"><ChevronLeft className="w-3.5 h-3.5" /></button>
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
            <span className="font-mono text-[9px] font-black text-center opacity-70">OM.</span>
            <div className="min-w-0 px-2 border-l border-inherit">
              <div className="text-[10px] font-black truncate line-through decoration-1">{omittedLabel}</div>
              <div className="text-[8px] uppercase font-bold tracking-wide opacity-70">Omitted from screenplay · {day ? 'kept for records' : 'unscheduled'}</div>
            </div>
            <span className="flex items-center justify-end gap-1 pr-1">
              <button onClick={() => deleteBlock(block.id)} title="Delete this omitted strip" className={`${iconBtnClass} !min-w-6 !min-h-6 hover:!text-red-500`}><Trash2 className="w-3 h-3" /></button>
              {!day && <button onClick={() => days[0] && placeBlock(block.id, days[0].id)} disabled={!days.length} title="Add to first shooting day" className={`${iconBtnClass} !min-w-5 !min-h-7 disabled:opacity-30`}><ChevronRight className="w-3.5 h-3.5" /></button>}
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
          <div className="min-w-0 px-2 border-l border-inherit"><div className="text-[10px] font-black truncate">{primaryLabel}</div><div className="text-[8px] uppercase font-bold tracking-wide truncate opacity-60">{secondaryLabel}</div></div>
          {day ? <>
            <span className="text-[9px] font-bold text-center">{scene?.pageLengthEighths !== undefined ? `${scene.pageLengthEighths}/8` : '—'}</span>
            <span className="text-[9px] font-bold text-center truncate px-1">{scene?.characterIds.length ? `${scene.characterIds.length} cast` : '—'}</span>
            <label className="flex items-center justify-center text-[9px] font-mono"><input type="number" min={0} value={block.estimatedMinutes ?? ''} onChange={(event) => updateBlock(block.id, { estimatedMinutes: event.target.value === '' ? undefined : Math.max(0, Number(event.target.value)) })} placeholder="—" className={`w-9 rounded border px-1 py-1 text-right ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950 border-slate-700'}`} />m</label>
            <span className="flex items-center justify-end gap-0.5 pr-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100"><button onClick={() => moveWithinDay(day, block.id, 'up')} disabled={indexInDay === 0} className={`${iconBtnClass} !min-w-6 !min-h-6 disabled:opacity-20`}><ChevronUp className="w-3 h-3" /></button><button onClick={() => moveWithinDay(day, block.id, 'down')} disabled={indexInDay === day.scheduleBlockIds.length - 1} className={`${iconBtnClass} !min-w-6 !min-h-6 disabled:opacity-20`}><ChevronDown className="w-3 h-3" /></button><button onClick={() => placeBlock(block.id, null)} className={`${iconBtnClass} !min-w-6 !min-h-6`} title="Return to unscheduled"><ChevronLeft className="w-3 h-3" /></button></span>
          </> : <span className="flex items-center"><button onClick={() => days[0] && placeBlock(block.id, days[0].id)} disabled={!days.length} title="Add to first shooting day" className={`${iconBtnClass} !min-w-5 !min-h-7 disabled:opacity-30`}><ChevronRight className="w-3.5 h-3.5" /></button><button onClick={() => deleteBlock(block.id)} title="Delete schedule item" className={`${iconBtnClass} !min-w-5 !min-h-7 hover:!text-red-500`}><Trash2 className="w-3 h-3" /></button></span>}
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
      <section key={day.id} onDragOver={allowDrop(`day:${day.id}`)} onDrop={handleDrop(day.id)} className={`overflow-hidden rounded-lg border shadow-sm ${dropTarget === `day:${day.id}` ? 'border-cyan-500 ring-2 ring-cyan-500/20' : isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-900'}`}>
        <div className="bg-slate-900 text-white px-3 py-2.5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-cyan-500 text-slate-950 flex flex-col items-center justify-center leading-none shrink-0"><span className="text-[8px] font-black uppercase">Day</span><span className="text-base font-black">{dayIndex + 1}</span></div>
          <div className="min-w-0 flex-1"><input value={day.name} onChange={(event) => updateDay(day.id, { name: event.target.value })} className="w-full bg-transparent text-sm font-black outline-none placeholder:text-slate-500" placeholder={`Shooting day ${dayIndex + 1}`} /><div className="mt-1 flex items-center gap-2 text-[9px] text-slate-400"><input type="date" value={day.date ?? ''} onChange={(event) => updateDay(day.id, { date: event.target.value || undefined })} className="bg-transparent font-mono outline-none" /><span>CALL</span><input value={day.crewCall ?? ''} onChange={(event) => updateDay(day.id, { crewCall: event.target.value || undefined })} placeholder="07:00" className="w-12 bg-transparent font-mono text-white outline-none" /><span>WRAP</span><input value={day.plannedWrap ?? ''} onChange={(event) => updateDay(day.id, { plannedWrap: event.target.value || undefined })} placeholder="18:30" className="w-12 bg-transparent font-mono text-white outline-none" /></div></div>
          <div className="text-right shrink-0"><div className="text-[11px] font-black font-mono">{formatMinutes(summary.totalEstimatedMinutes)}</div><div className="text-[8px] uppercase tracking-wider text-slate-400">{shootableCount} shoot items · {day.scheduleBlockIds.length} strips</div></div>
          <button onClick={() => { setSelectedCallSheetDayId(day.id); setWorkspaceView('callsheets'); }} className="h-8 px-2.5 rounded-md bg-white/10 hover:bg-white/20 text-[9px] font-black uppercase flex items-center gap-1.5"><FileCheck2 className="w-3.5 h-3.5" /> Call sheet</button>
          <button onClick={() => deleteDay(day.id)} className="w-8 h-8 rounded-md hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
        {(() => {
          const dayLocations = resolveDayLocations(day);
          if (!dayLocations.length) return null;
          return (
            <div className={`px-3 py-1.5 flex flex-wrap items-center gap-1.5 text-[9px] font-bold border-b ${isLight ? 'bg-slate-50 border-slate-200 text-slate-600' : 'bg-slate-950/60 border-slate-800 text-slate-300'}`}>
              <span className="uppercase tracking-wider text-[8px] text-cyan-600 font-black">Locations</span>
              {dayLocations.map((location, index) => (
                <span key={`${location.name}-${index}`} className="px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 max-w-[220px] truncate" title={location.address ?? location.name}>{location.name}</span>
              ))}
            </div>
          );
        })()}
        <div className={`grid grid-cols-[22px_42px_minmax(170px,1fr)_54px_64px_58px_68px] px-0 min-h-6 items-center text-[8px] font-black uppercase tracking-wider border-b ${isLight ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-slate-950 text-slate-500 border-slate-800'}`}><span></span><span className="text-center">Sc.</span><span className="px-2">Scene / schedule item</span><span className="text-center">Pages</span><span className="text-center">Cast</span><span className="text-center">Time</span><span></span></div>
        <ol className="divide-y divide-slate-200 dark:divide-slate-800">{day.scheduleBlockIds.map((blockId, index) => { const block = blocks.find((candidate) => candidate.id === blockId); return block ? renderBlockRow(block, { day, indexInDay: index }) : null; })}</ol>
        {day.scheduleBlockIds.length === 0 && <div className={`m-2 min-h-14 rounded-md border border-dashed flex items-center justify-center text-[10px] ${mutedText} ${isLight ? 'border-slate-300' : 'border-slate-700'}`}>Drag scene strips or banners into this shooting day</div>}
        <div className={`h-8 px-3 flex items-center justify-between border-t text-[9px] font-black uppercase tracking-wide ${isLight ? 'bg-slate-100 border-slate-300 text-slate-600' : 'bg-slate-950 border-slate-700 text-slate-300'}`}><span>End of day {dayIndex + 1} of {days.length}</span><span className="font-mono">{shootableCount} shoot items · {formatMinutes(summary.totalEstimatedMinutes)} · {day.date || 'date TBD'}</span></div>
      </section>
    );
  };

  const hasIssues = conflicts.length > 0 || danglingRefs.length > 0;
  const selectedCallSheetDay = days.find((day) => day.id === selectedCallSheetDayId) ?? days[0];
  const selectedCallSheet = selectedCallSheetDay ? buildCallSheet(selectedCallSheetDay) : null;

  return (
    <div className={`h-full overflow-hidden flex flex-col ${isLight ? 'bg-[#f3f5f7]' : 'bg-slate-950'}`}>
      <header className={`shrink-0 border-b ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
        <div className="h-12 px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0"><div className="w-7 h-7 rounded-md bg-cyan-500 text-slate-950 flex items-center justify-center"><CalendarDays className="w-4 h-4" /></div><div className="min-w-0"><h2 className="text-sm font-black tracking-tight">Production Schedule</h2><p className={`text-[9px] truncate ${mutedText}`}>{days.length} shoot days · {days.reduce((sum, day) => sum + day.scheduleBlockIds.length, 0)} scheduled strips · {pooledBlockIds.length + unscheduledScenes.length + unscheduledSetups.length + unscheduledShots.length} available items</p></div></div>
          <div className="flex items-center gap-2">
            <div className={`flex h-8 rounded-md border p-0.5 ${isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
              {([['stripboard', LayoutList, 'Board'], ['calendar', CalendarRange, 'Timeline'], ['callsheets', FileCheck2, 'Call sheets'], ['coverage', Users, 'Coverage']] as const).map(([view, Icon, label]) => <button key={view} onClick={() => setWorkspaceView(view)} className={`px-2.5 rounded text-[9px] font-black flex items-center gap-1.5 transition-colors ${workspaceView === view ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-950 shadow-sm' : mutedText}`}><Icon className="w-3.5 h-3.5" />{label}</button>)}
            </div>
            <button
              onClick={handlePrintCurrent}
              disabled={workspaceView === 'callsheets' && !selectedCallSheetDay}
              title={
                workspaceView === 'stripboard' ? 'Print the stripboard (all shooting days)'
                  : workspaceView === 'calendar' ? 'Print the production calendar'
                    : workspaceView === 'callsheets' ? 'Print the selected call sheet'
                      : 'Print the coverage matrix'
              }
              className={`h-8 px-2.5 rounded-md border text-[9px] font-black flex items-center gap-1.5 transition-colors disabled:opacity-40 ${isLight ? 'bg-white border-slate-300 hover:border-cyan-500 hover:text-cyan-700' : 'bg-slate-950 border-slate-800 hover:border-cyan-500 hover:text-cyan-400'}`}
            >
              <Printer className="w-3.5 h-3.5" />Print
            </button>
          </div>
        </div>
      </header>

      {hasIssues && <div className="shrink-0 px-3 py-1.5 bg-amber-50 border-b border-amber-200 text-[9px] font-bold text-amber-900 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5" />{conflicts.length + danglingRefs.length} schedule integrity warning{conflicts.length + danglingRefs.length === 1 ? '' : 's'} need attention.</div>}

      {workspaceView === 'stripboard' && <div className="flex-1 min-h-0 flex overflow-hidden">
        <aside onDragOver={allowDrop('pool')} onDrop={handleDrop(null)} className={`w-[205px] shrink-0 border-r flex flex-col min-h-0 ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
          <div className="p-2.5 border-b border-inherit"><div className="flex items-center justify-between"><h3 className="text-[9px] font-black uppercase tracking-[0.14em] flex items-center gap-1.5"><Inbox className="w-3.5 h-3.5 text-cyan-600" />Unscheduled</h3><span className="text-[9px] font-mono font-bold text-slate-500">{pooledBlockIds.length + unscheduledScenes.length + unscheduledSetups.length + unscheduledShots.length}</span></div><div className="relative mt-2"><Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" /><input value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} placeholder="Search scenes, setups, shots" className={`${inputClass} !min-h-8 !pl-7 !text-[10px]`} /></div></div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
            {selectedShotIds.size > 0 && <div className={`sticky top-0 z-10 rounded-md border p-1.5 flex items-center gap-1.5 shadow-sm ${isLight ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-white text-slate-950'}`}><span className="flex-1 text-[9px] font-black">{selectedShotIds.size} shots selected</span><button type="button" disabled={!days.length} onClick={() => days[0] && scheduleShots([...selectedShotIds], days[0].id)} className="h-6 px-2 rounded bg-cyan-500 text-slate-950 text-[8px] font-black disabled:opacity-40">Add to day 1</button><button type="button" onClick={() => setSelectedShotIds(new Set())} className="w-6 h-6 text-sm opacity-70">×</button></div>}
            {unscheduledScenes.map((scene) => <div key={scene.id} draggable onDragStart={handleDragStart(`scene:${scene.id}`)} onDragEnd={handleDragEnd} className={`border rounded-md overflow-hidden cursor-grab ${isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-950/20 border-amber-800/50'}`}><div className="flex"><div className="w-7 bg-amber-400 text-amber-950 flex items-center justify-center font-mono text-[10px] font-black">{scene.sceneNumber}</div><div className="min-w-0 flex-1 px-2 py-2"><div className="text-[9px] font-black truncate">{scene.heading}</div><div className={`mt-0.5 text-[8px] font-bold uppercase ${mutedText}`}>{scene.intExt?.replace('_', '/') ?? 'SCENE'} · {scene.timeOfDay ?? 'TBD'} · {scene.pageLengthEighths ?? '—'}/8</div></div><button type="button" disabled={!days.length} onClick={() => days[0] && scheduleScene(scene.id, days[0].id)} title="Add to first shooting day" className="w-7 shrink-0 flex items-center justify-center text-amber-800 hover:bg-amber-200 disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button></div></div>)}
            {unscheduledSetups.map((setup) => <div key={setup.id} draggable onDragStart={handleDragStart(`setup:${setup.id}`)} onDragEnd={handleDragEnd} className={`border rounded-md overflow-hidden cursor-grab ${isLight ? 'bg-cyan-50 border-cyan-200' : 'bg-cyan-950/20 border-cyan-800/50'}`}><div className="flex"><div className="w-7 bg-cyan-500 text-slate-950 flex items-center justify-center font-mono text-[9px] font-black">SET</div><div className="min-w-0 flex-1 px-2 py-2"><div className="text-[9px] font-black truncate">{setup.name}</div><div className={`mt-0.5 text-[8px] font-bold uppercase truncate ${mutedText}`}>{setup.sceneNumber || 'No scene'} · {setup.location || 'Location TBD'} · {setup.shots.length} shots</div></div><button type="button" disabled={!days.length} onClick={() => days[0] && scheduleSetup(setup.id, days[0].id)} title="Add to first shooting day" className="w-7 shrink-0 flex items-center justify-center text-cyan-800 hover:bg-cyan-200 disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button></div></div>)}
            {unscheduledShots.map(({ shot, setup }) => { const selected = selectedShotIds.has(shot.id); const dragIds = selected ? [...selectedShotIds] : [shot.id]; return <div key={shot.id} draggable onDragStart={handleDragStart(`shots:${dragIds.join(',')}`)} onDragEnd={handleDragEnd} className={`border rounded-md overflow-hidden cursor-grab transition-colors ${selected ? 'ring-2 ring-violet-500 border-violet-500' : isLight ? 'bg-violet-50 border-violet-200' : 'bg-violet-950/20 border-violet-800/50'}`}><div className="flex items-stretch"><label className="w-7 shrink-0 flex items-center justify-center bg-violet-500/15"><input type="checkbox" checked={selected} onChange={() => toggleShotSelection(shot.id)} aria-label={`Select shot ${shot.shotNumber}`} className="accent-violet-600" /></label><div className="min-w-0 flex-1 px-2 py-1.5"><div className="text-[9px] font-black truncate">{shot.shotNumber} · {shot.name}</div><div className={`mt-0.5 text-[8px] font-bold uppercase truncate ${mutedText}`}>{shot.cameraLabel} · {shot.shotSize} · {shot.lensMm}mm · {setup.name}</div></div><button type="button" disabled={!days.length} onClick={() => days[0] && scheduleShots([shot.id], days[0].id)} title={`Add shot ${shot.shotNumber} to first shooting day`} className="w-7 shrink-0 flex items-center justify-center text-violet-700 hover:bg-violet-200 disabled:opacity-30"><ChevronRight className="w-3.5 h-3.5" /></button></div></div>; })}
            {pooledBlockIds.map((block) => renderBlockRow(block))}
            {!unscheduledScenes.length && !unscheduledSetups.length && !unscheduledShots.length && !pooledBlockIds.length && <div className={`py-8 text-center text-[9px] ${mutedText}`}>Everything is scheduled.</div>}
          </div>
          <div className="p-2 border-t border-inherit space-y-1.5"><div className="flex gap-1"><select value={newBlockType} onChange={(event) => setNewBlockType(event.target.value as ManualType)} className={`${inputClass} !min-h-8 !w-[74px] !text-[9px]`}>{MANUAL_TYPES.map((type) => <option key={type} value={type}>{MANUAL_TYPE_LABELS[type]}</option>)}</select><input value={newBlockLabel} onChange={(event) => setNewBlockLabel(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addManualBlock()} placeholder="Banner label" className={`${inputClass} !min-h-8 !text-[9px]`} /><button onClick={addManualBlock} className="w-8 h-8 rounded-md bg-slate-900 text-white dark:bg-white dark:text-slate-950 flex items-center justify-center shrink-0"><Plus className="w-3.5 h-3.5" /></button></div><button onClick={addDay} className="w-full h-8 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" />Add shooting day</button></div>
        </aside>
        <main className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-3 space-y-3">{days.map(renderDayBoard)}{!days.length && <div className={`h-40 rounded-lg border border-dashed flex flex-col items-center justify-center gap-2 ${mutedText} ${isLight ? 'bg-white border-slate-300' : 'bg-slate-900 border-slate-700'}`}><CalendarDays className="w-6 h-6" /><p className="text-[10px] font-bold">Add your first shooting day, then drag scenes onto the board.</p></div>}</main>
      </div>}

      {workspaceView === 'calendar' && <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className={`flex p-0.5 rounded-md border ${isLight ? 'border-slate-200 bg-white' : 'border-slate-700 bg-slate-950/60'}`}>
            {(['timeline', 'month'] as const).map((mode) => (
              <button key={mode} onClick={() => setCalendarMode(mode)} className={`px-2.5 py-1 rounded text-[10px] font-bold transition-colors ${calendarMode === mode ? 'bg-sky-600 text-white' : mutedText}`}>
                {mode === 'timeline' ? 'Timeline' : 'Month'}
              </button>
            ))}
          </div>
          <span className={`text-[9px] ${mutedText}`}>{calendarEvents.length} event{calendarEvents.length === 1 ? '' : 's'} · {days.filter((day) => day.date).length} dated shooting day{days.filter((day) => day.date).length === 1 ? '' : 's'}</span>
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
        {calendarMode === 'month' && (
          <MonthCalendar
            yearMonth={calendarMonth}
            onChangeMonth={setCalendarMonth}
            events={calendarEvents}
            days={days}
            tasks={project.tasks ?? []}
            selectedEventId={selectedEventId}
            onSelectEvent={setSelectedEventId}
            onCreateEvent={addCalendarEventOn}
            isLight={isLight}
          />
        )}
        {calendarMode === 'timeline' && <>
        <div className={`rounded-lg border p-2.5 grid grid-cols-[1fr_130px_130px_auto] gap-2 items-end ${cardClass}`}>
          <label className="text-[8px] font-black uppercase tracking-wider text-slate-500">Event or milestone
            <input value={newEventTitle} onChange={(event) => setNewEventTitle(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addCalendarEvent()} placeholder="Tech scout, principal photography, picture lock…" className={`${inputClass} mt-1 !min-h-8`} />
          </label>
          <label className="text-[8px] font-black uppercase tracking-wider text-slate-500">Start (optional)
            <input type="date" value={newEventStart} onChange={(event) => setNewEventStart(event.target.value)} className={`${inputClass} mt-1 !min-h-8`} />
          </label>
          <label className="text-[8px] font-black uppercase tracking-wider text-slate-500">End (optional)
            <input type="date" value={newEventEnd} onChange={(event) => setNewEventEnd(event.target.value)} className={`${inputClass} mt-1 !min-h-8`} />
          </label>
          <button onClick={addCalendarEvent} disabled={!newEventTitle.trim()} title="New lines default to the first production day — drag them into place on the timeline." className="h-8 px-3 rounded-md bg-cyan-600 text-white text-[9px] font-black disabled:opacity-40">Add line</button>
        </div>
        <TimelineCalendar
          events={calendarEvents}
          days={days}
          isLight={isLight}
          onUpdateEvent={updateCalendarEvent}
          onDeleteEvent={deleteCalendarEvent}
          onUpdateDay={updateDay}
        />
        <p className={`text-[9px] ${mutedText}`}>Drag a clip to move it between days · drag its edges to resize the period · shooting-day clips re-date their day. New lines start on the first production day. Switch to Month to edit category, status, assignees and notes.</p>
        </>}
      </div>}

      {workspaceView === 'callsheets' && <div className="flex-1 min-h-0"><CallSheetWorkspace days={days} selectedDayId={selectedCallSheetDay?.id ?? null} onSelectDay={setSelectedCallSheetDayId} sheet={selectedCallSheet} updateDay={updateDay} onPrint={requestCallSheetPrint} isLight={isLight} /></div>}
      {workspaceView === 'coverage' && <div className="flex-1 min-h-0"><CoverageMatrixEditor /></div>}

      {printSheet && createPortal(<div className="call-sheet-print-host"><CallSheetPrintView sheet={printSheet} /></div>, document.body)}
      {printView === 'stripboard' && createPortal(
        <div className="schedule-print-host">
          <StripboardPrintView productionTitle={project.title} company={project.productionCompany} logo={project.logo} days={printableBoardDays} />
        </div>,
        document.body
      )}
      {printView === 'calendar' && createPortal(
        <div className="schedule-print-host">
          <ScheduleCalendarPrintView productionTitle={project.title} company={project.productionCompany} logo={project.logo} events={printableCalendarEvents} days={printableCalendarDays} />
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
