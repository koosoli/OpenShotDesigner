/**
 * Continuity log & shooting-day checklist (plan §25).
 *
 * One page doing two jobs, because on a set they are one job: the script
 * supervisor's take log, and the list the 1st AD ticks off to see what is still
 * missing at wrap. The checklist is derived from the takes — nothing here
 * stores "this shot is done", so the two halves cannot disagree.
 *
 * All derivation lives in `src/domain/continuity` (rule 4). Unknown values stay
 * blank rather than being filled with something plausible (rule 13): a
 * continuity report is read months later by someone who was not there.
 *
 * Two interaction decisions worth knowing before editing this file:
 *
 *  - **Logging is take-first.** The file name is NOT typed here. On set nobody
 *    knows it — clip counters restart per card and an aborted take still burns
 *    a number — so it is filled afterwards in the reconcile pass, where a
 *    drifting log becomes visible instead of silently attaching every row to
 *    the wrong clip in Resolve.
 *  - **A new take inherits the last one.** `seedNextTake` decides what carries;
 *    inherited values are badged, because inherited-but-wrong metadata is worse
 *    than blank metadata.
 */
import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ClipboardList,
  Film,
  FileDown,
  Link2,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { createId } from '../../domain/ids';
import {
  applyReconciliation,
  buildResolveRows,
  dayChecklist,
  productionChecklist,
  orphanedTakes,
  nextTakeNumber,
  parseCardListing,
  reconcileFileNames,
  seedNextTake,
  taggedShotNumber,
  takesForDay,
  type ChecklistShot,
  type ReconciliationResult,
  type ResolveMetadataRow,
  type Take,
  type TakeCameraOverrides,
  type TakeSlateOverrides,
} from '../../domain/continuity';
import { keyCrewMember } from '../../domain/people';
import { insertedShotNumber, nextShotNumberAfter, takenShotNumbers } from '../../domain/shots/numbering';
import { ContinuityBinder } from './ContinuityBinder';
import {
  continuitySourcesFrom,
  exportContinuityAle,
  exportContinuityCsv,
} from '../../utils/exportContinuityCsv';
import type { Shot } from '../../types';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';
import { PdfExportButton } from '../common/PdfExportButton';
import { logTakeCommand } from '../../domain/commands';

/** Parse a number input; empty string → undefined (unknown, never 0 — rule 13). */
const parseOptionalNumber = (raw: string): number | undefined => {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * Label a shot as "scene / shot", without doubling the scene.
 *
 * This app writes shot numbers as `scene/index` ("1/2"), so prefixing the
 * scene again reads "1 / 1/2". Scenes lettered as "1A" carry no scene part and
 * do want the prefix.
 */
const numberLabel = (sceneNumber: string | undefined, shotNumber: string | undefined): string => {
  const shot = (shotNumber ?? '').trim();
  if (!shot) return sceneNumber?.trim() || '—';
  if (shot.includes('/') || !sceneNumber?.trim()) return shot;
  return `${sceneNumber.trim()} / ${shot}`;
};

export const ContinuityPanel: React.FC = () => {
  const { project, updateProjectMeta, runCommand } = useFloorPlan();
  const { theme, openExportModal } = useWorkspaceUI();
  const isLight = theme === 'light';

  const takes = useMemo(() => project.takes ?? [], [project.takes]);
  const productionDays = useMemo(() => project.productionDays ?? [], [project.productionDays]);
  const setups = useMemo(() => project.setups ?? [], [project.setups]);

  const [view, setView] = useState<'log' | 'binder'>('log');
  const [reconcileText, setReconcileText] = useState('');
  /** Takes whose full column editor is open. */
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  /**
   * Raw text of the keywords field while it is being typed, per take.
   *
   * The stored value is a string array, but the input is one comma-separated
   * line — and round-tripping array→text on every keystroke ate the separator:
   * typing "Laptop," split to ["Laptop"], rejoined to "Laptop", and the comma
   * vanished as fast as it was typed. So the text the user is typing is held
   * as-is until they leave the field, and only the parsed array is persisted.
   */
  const [keywordDrafts, setKeywordDrafts] = useState<Record<string, string>>({});
  const [reconcilePreview, setReconcilePreview] = useState<ReconciliationResult | null>(null);

  // The day scope lives on the project so the printed report can be built from
  // the project alone; a filter pointing at a deleted day means "everything".
  const dayId =
    project.continuityDayFilterId &&
    productionDays.some((day) => day.id === project.continuityDayFilterId)
      ? project.continuityDayFilterId
      : undefined;
  const day = dayId ? productionDays.find((candidate) => candidate.id === dayId) : undefined;
  const dayLabel = day ? (day.date ? `${day.name} · ${day.date}` : day.name) : undefined;

  const sources = useMemo(
    () => ({ setups, scriptScenes: project.scriptScenes }),
    [setups, project.scriptScenes],
  );

  /** The log on screen: one day when scoped, otherwise everything. */
  const visibleTakes = useMemo(
    () => (day ? takesForDay(takes, day.id) : takes),
    [takes, day],
  );

  /**
   * One day's checklist, or the whole production's. "Whole production" used to
   * render no checklist at all — an option that showed strictly less than any
   * single day, which is backwards for the widest scope on the page.
   */
  const checklist = useMemo(
    () =>
      day
        ? dayChecklist(
            day.scheduleBlockIds ?? [],
            project.scheduleBlocks ?? [],
            sources,
            takes,
            day.id,
          )
        : productionChecklist(sources, takes),
    [day, project.scheduleBlocks, sources, takes],
  );

  const orphans = useMemo(() => orphanedTakes(takes, sources), [takes, sources]);

  /**
   * What each visible take would export if it overrode nothing — the plan's
   * answer for every column. Shown as the placeholder under each field, so
   * the user sees what the app already knows and types only what was actually
   * different on the day. The typed value is what exports; the plan is never
   * copied into the take.
   */
  const planned = useMemo<Map<string, ResolveMetadataRow>>(() => {
    const stripped = visibleTakes.map((take) => ({
      ...take,
      cameraOverrides: undefined,
      slateOverrides: undefined,
    }));
    const rows = buildResolveRows(stripped, continuitySourcesFrom(project));
    return new Map(stripped.map((take, index) => [take.id, rows[index]] as const));
  }, [visibleTakes, project]);

  /** Who the crew list says holds a production role; locks the field when someone does. */
  const crewHolder = (roleKey: string) => keyCrewMember(project.people ?? [], roleKey);

  /** Shot lookup for labelling the log. */
  const shotIndex = useMemo(() => {
    const index = new Map<string, { shot: Shot; setupId: string; sceneNumber?: string }>();
    for (const setup of setups) {
      for (const shot of setup.shots ?? []) {
        index.set(shot.id, { shot, setupId: setup.id, sceneNumber: setup.sceneNumber });
      }
    }
    return index;
  }, [setups]);

  // --- Mutations (all immutable via updateProjectMeta) ---

  // Functional form throughout: two take mutations can land in one tick (add
  // an unplanned shot, then log its first take), and reading `project.takes`
  // off this render would silently drop the first of them.
  const mutateTakes = (fn: (prev: Take[]) => Take[]) =>
    updateProjectMeta((prev) => ({ takes: fn(prev.takes ?? []) }));

  const updateTake = (id: string, patch: Partial<Take>) =>
    mutateTakes((prev) => prev.map((take) => (take.id === id ? { ...take, ...patch } : take)));

  const deleteTake = (id: string) => mutateTakes((prev) => prev.filter((take) => take.id !== id));

  /**
   * Set one camera/slate override, dropping the key when cleared so the field
   * falls back to the plan again. An empty override object is removed
   * entirely, which is what lets `seedNextTake` tell "nothing overridden" from
   * "overridden with nothing".
   */
  const setCameraOverride = <K extends keyof TakeCameraOverrides>(
    id: string,
    key: K,
    value: TakeCameraOverrides[K] | undefined,
  ) =>
    mutateTakes((prev) =>
      prev.map((take) => {
        if (take.id !== id) return take;
        const next: TakeCameraOverrides = { ...take.cameraOverrides };
        if (value === undefined || value === '') delete next[key];
        else next[key] = value;
        return { ...take, cameraOverrides: Object.keys(next).length ? next : undefined };
      }),
    );
  const setSlateOverride = <K extends keyof TakeSlateOverrides>(
    id: string,
    key: K,
    value: TakeSlateOverrides[K] | undefined,
  ) =>
    mutateTakes((prev) =>
      prev.map((take) => {
        if (take.id !== id) return take;
        const next: TakeSlateOverrides = { ...take.slateOverrides };
        if (value === undefined || value === '') delete next[key];
        else next[key] = value;
        return { ...take, slateOverrides: Object.keys(next).length ? next : undefined };
      }),
    );

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * Log a take on a shot. The previous take is the last one logged on this day
   * whatever shot it was on — that is what makes "the scene moved and the
   * location changed with it" a one-field edit rather than a whole new row.
   */
  const logTake = (shotId: string, slateTag?: Take['slateTag']) => {
    const previous = visibleTakes[visibleTakes.length - 1];
    // The day-scoped `previous` is passed explicitly: `logTakeCommand` used to
    // pick the last take in the whole project, which on any day but the newest
    // seeds the row from a take the user is not looking at.
    runCommand(
      logTakeCommand,
      {
        shotId,
        ...(slateTag !== undefined ? { slateTag } : {}),
        ...(day?.id ? { productionDayId: day.id } : {}),
        ...(previous ? { previousTakeId: previous.id } : {}),
      },
      { domain: 'shots' },
    );
  };

  /**
   * Add a distinct shot nobody planned, and log its first take.
   *
   * The number comes from the scene's existing shots via the same letter
   * algorithm locked scene numbers use, so nothing already on a slate moves:
   * 1A–1F planned means the new insert is 1G. Provenance is the `unplanned` flag,
   * never part of the number — the Shot column exported to Resolve has to read
   * exactly what was on the slate.
   */
  const addUnplannedShot = (setupId: string, afterShotId?: string) => {
    const setup = setups.find((candidate) => candidate.id === setupId);
    if (!setup) return;
    const existingShots = setup.shots ?? [];
    const afterIndex = afterShotId
      ? existingShots.findIndex((candidate) => candidate.id === afterShotId)
      : -1;
    const shotNumber = afterIndex >= 0
      ? insertedShotNumber(
          existingShots[afterIndex]?.shotNumber,
          existingShots[afterIndex + 1]?.shotNumber,
          takenShotNumbers(existingShots),
          setup.sceneNumber,
        )
      : nextShotNumberAfter(existingShots, setup.sceneNumber);
    const shot: Shot = {
      id: createId('shot'),
      sceneNumber: setup.sceneNumber,
      shotNumber,
      name: 'Unplanned',
      cameraId: '',
      cameraLabel: '',
      shotSize: 'MS',
      lensMm: 35,
      cameraAngle: 'Eye Level',
      movement: 'Static',
      aspectRatio: '16:9',
      frameRate: 25,
      subjectActorIds: [],
      framingDescription: '',
      status: 'planned',
      takesCount: 0,
      estDurationSeconds: 0,
      order: afterIndex >= 0 ? afterIndex + 1 : existingShots.length,
      unplanned: true,
    };
    // One update, not two: adding the shot and logging its first take are a
    // single user action, and splitting them would leave a half-state on the
    // undo stack — an unplanned shot with no take, or worse, undone to a take whose
    // shot is gone.
    const previous = visibleTakes[visibleTakes.length - 1];
    updateProjectMeta((prev) => {
      const { take } = seedNextTake(prev.takes ?? [], {
        id: createId('take'),
        shotId: shot.id,
        productionDayId: day?.id,
        loggedAt: new Date().toISOString(),
        previous,
      });
      return {
        setups: (prev.setups ?? []).map((candidate) => {
          if (candidate.id !== setupId) return candidate;
          const current = candidate.shots ?? [];
          const currentAfterIndex = afterShotId
            ? current.findIndex((entry) => entry.id === afterShotId)
            : -1;
          const insertionIndex = currentAfterIndex >= 0 ? currentAfterIndex + 1 : current.length;
          const next = [...current];
          next.splice(insertionIndex, 0, shot);
          return { ...candidate, shots: next.map((entry, order) => ({ ...entry, order })) };
        }),
        takes: [...(prev.takes ?? []), take],
      };
    });
  };

  const runReconcile = () => {
    const fileNames = parseCardListing(reconcileText);
    setReconcilePreview(reconcileFileNames(visibleTakes, fileNames));
  };

  const applyReconcile = () => {
    if (!reconcilePreview) return;
    const updated = applyReconciliation(visibleTakes, reconcilePreview);
    const byId = new Map(updated.map((take) => [take.id, take] as const));
    mutateTakes((prev) => prev.map((take) => byId.get(take.id) ?? take));
    setReconcilePreview(null);
    setReconcileText('');
  };

  // --- Styling, matching the other production panels ---

  const surfaceClass = isLight
    ? 'bg-slate-50 border-slate-200'
    : 'bg-slate-950/60 border-slate-800';
  const cardClass = isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-700';
  const mutedText = isLight ? 'text-slate-500' : 'text-slate-400';
  const headingText = isLight ? 'text-slate-700' : 'text-slate-300';
  const inputClass = `min-h-[36px] px-2 py-1 rounded-lg border text-xs w-full transition-colors ${
    isLight
      ? 'bg-white border-slate-300 text-slate-800 focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500'
      : 'bg-slate-950 border-slate-700 text-slate-100 focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500'
  }`;
  const iconBtnClass = `flex items-center justify-center min-w-[36px] min-h-[36px] rounded-lg transition-colors flex-shrink-0 ${
    isLight
      ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/70'
      : 'text-slate-400 hover:text-white hover:bg-slate-800'
  }`;
  const primaryBtnClass = `flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg text-xs font-semibold transition-colors flex-shrink-0 disabled:opacity-40 ${
    isLight ? 'bg-sky-600 text-white hover:bg-sky-700' : 'bg-sky-600 text-white hover:bg-sky-500'
  }`;
  const secondaryBtnClass = `flex items-center gap-1.5 px-3 min-h-[36px] rounded-lg text-xs font-semibold border transition-colors flex-shrink-0 disabled:opacity-40 ${
    isLight
      ? 'border-slate-300 text-slate-700 hover:bg-slate-200/70'
      : 'border-slate-700 text-slate-300 hover:bg-slate-800'
  }`;
  const chipClass = `px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
    isLight ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-slate-300'
  }`;
  const unplannedChipClass = `px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
    isLight ? 'bg-amber-100 text-amber-800' : 'bg-amber-950/60 text-amber-300'
  }`;

  const sectionHeading = (icon: React.ReactNode, title: string, count?: number) => (
    <h3 className={`text-xs font-bold flex items-center gap-1.5 ${headingText}`}>
      {icon}
      {title}
      {count !== undefined && <span className={chipClass}>{count}</span>}
    </h3>
  );

  const shotLabel = (shotId: string, slateTag?: Take['slateTag']): string => {
    const found = shotIndex.get(shotId);
    if (!found) return 'Deleted shot';
    return taggedShotNumber(numberLabel(found.sceneNumber, found.shot.shotNumber), slateTag);
  };

  const checklistRow = (entry: ChecklistShot) => (
    <div
      key={entry.shotId}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border ${cardClass}`}
    >
      {entry.covered ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
      ) : (
        <Circle className={`w-4 h-4 flex-shrink-0 ${entry.takeCount > 0 ? 'text-amber-500' : mutedText}`} />
      )}
      <span className={`font-mono text-xs ${headingText}`}>
        {numberLabel(entry.sceneNumber, entry.shotNumber)}
      </span>
      {entry.unplanned && <span className={unplannedChipClass}>unplanned</span>}
      <span className={`text-xs truncate flex-1 ${mutedText}`}>{entry.name || ''}</span>
      <span className={chipClass}>
        {entry.takeCount} take{entry.takeCount === 1 ? '' : 's'}
      </span>
      <button
        onClick={() => logTake(entry.shotId)}
        title="Log a take on this shot"
        className={secondaryBtnClass}
      >
        <Plus className="w-3.5 h-3.5" /> Take
      </button>
      <button
        onClick={() => logTake(entry.shotId, 'PU')}
        title={`Log pickup take on ${numberLabel(entry.sceneNumber, entry.shotNumber)} (same shot)`}
        className={secondaryBtnClass}
      >
        <Plus className="w-3.5 h-3.5" /> PU
      </button>
      {!entry.unplanned && (
        <button
          onClick={() => addUnplannedShot(entry.setupId, entry.shotId)}
          title={`Add a separate unplanned shot after ${numberLabel(entry.sceneNumber, entry.shotNumber)}`}
          className={secondaryBtnClass}
        >
          <Plus className="w-3.5 h-3.5" /> Shot
        </button>
      )}
    </div>
  );

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-3">
      {/* Scope + exports */}
      <div className={`flex flex-wrap items-center gap-2 p-2 rounded-xl border ${surfaceClass}`}>
        <label className={`text-[11px] font-semibold ${headingText}`}>
          Shooting day
          <select
            value={dayId ?? ''}
            onChange={(event) =>
              updateProjectMeta({ continuityDayFilterId: event.target.value || undefined })
            }
            className={`${inputClass} !w-auto ml-2`}
          >
            <option value="">Whole production</option>
            {productionDays.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.date ? `${candidate.name} · ${candidate.date}` : candidate.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => exportContinuityCsv(project, visibleTakes, dayLabel)}
          title="CSV for DaVinci Resolve: Media Pool → right-click → Import Metadata…"
          className={`${primaryBtnClass} ml-auto`}
          disabled={visibleTakes.length === 0}
        >
          <FileDown className="w-3.5 h-3.5" /> Resolve CSV
        </button>
        {/* The same log for the other half of the editorial world. Beside the
            CSV rather than behind a format dropdown: which one you need is
            decided by which suite the edit is in, not by a preference. */}
        <button
          onClick={() => exportContinuityAle(project, visibleTakes, dayLabel)}
          title="ALE for Avid Media Composer: bin → File → Import…"
          className={secondaryBtnClass}
          disabled={visibleTakes.length === 0}
        >
          <FileDown className="w-3.5 h-3.5" /> Avid ALE
        </button>
        {/* The checklist is worked from paper at wrap. */}
        <PdfExportButton onClick={() => openExportModal('continuity')} title="Continuity-Report als PDF exportieren" />
      </div>

      {/*
        Two jobs, one person, two documents. The log records what was SHOT; the
        binder records what it LOOKED LIKE. Tabs rather than one scroll because
        they are used at different moments — the log during the take, the
        binder between setups — and stacking them means whichever is second is
        never reached.
      */}
      <div role="tablist" aria-label="Continuity view" className="flex items-center gap-1">
        {(['log', 'binder'] as const).map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={view === value}
            onClick={() => setView(value)}
            className={`px-3 min-h-[32px] rounded-lg text-xs font-semibold transition-colors ${
              view === value
                ? 'bg-sky-600 text-white'
                : isLight
                  ? 'bg-slate-100 text-slate-600 hover:text-slate-900'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            {value === 'log' ? 'Take log' : 'Binder'}
          </button>
        ))}
      </div>

      {view === 'binder' && <ContinuityBinder isLight={isLight} />}

      {view === 'log' && (
        <>
      {/*
        Production-level columns. Each field writes to its real home on the
        project — title, company, director, DOP — so nothing is stored twice
        and the rest of the app sees the same value. Director and DOP lock to
        the crew list when someone is assigned there (the crew list wins, rule
        37); Sound Mixer and Script Supervisor have no project field, so the
        typed name is a fallback the crew list overrides the moment it fills.
      */}
      <div className={`flex flex-col gap-2 p-2 rounded-xl border ${surfaceClass}`}>
        {sectionHeading(<ClipboardList className="w-3.5 h-3.5" />, 'Production')}
        <div className="grid grid-cols-2 gap-1.5">
          <label className={`text-[10px] font-semibold ${mutedText}`}>
            Production company
            <input
              value={project.productionCompany ?? ''}
              onChange={(event) =>
                updateProjectMeta({ productionCompany: event.target.value || undefined })
              }
              placeholder="Not set"
              className={`${inputClass} mt-0.5`}
            />
          </label>
          <label className={`text-[10px] font-semibold ${mutedText}`}>
            Production name
            <input
              value={project.title}
              onChange={(event) => updateProjectMeta({ title: event.target.value })}
              placeholder="Not set"
              className={`${inputClass} mt-0.5`}
            />
          </label>
          {(
            [
              ['director', 'Director', 'director'],
              ['cinematographer', 'DOP', 'cinematographer'],
            ] as const
          ).map(([roleKey, label, field]) => {
            const holder = crewHolder(roleKey);
            return (
              <label key={roleKey} className={`text-[10px] font-semibold ${mutedText}`}>
                {label}
                {holder ? (
                  <input
                    value={holder.displayName}
                    readOnly
                    title="Assigned on the crew list; change it there"
                    className={`${inputClass} mt-0.5 opacity-70`}
                  />
                ) : (
                  <input
                    value={project[field] ?? ''}
                    onChange={(event) => updateProjectMeta({ [field]: event.target.value })}
                    placeholder="Nobody on the crew list; type a name"
                    className={`${inputClass} mt-0.5`}
                  />
                )}
              </label>
            );
          })}
          {(
            [
              ['sound_mixer', 'Sound mixer', 'soundMixer'],
              ['script_supervisor', 'Script supervisor', 'scriptSupervisor'],
            ] as const
          ).map(([roleKey, label, field]) => {
            const holder = crewHolder(roleKey);
            return (
              <label key={roleKey} className={`text-[10px] font-semibold ${mutedText}`}>
                {label}
                {holder ? (
                  <input
                    value={holder.displayName}
                    readOnly
                    title="Assigned on the crew list; change it there"
                    className={`${inputClass} mt-0.5 opacity-70`}
                  />
                ) : (
                  <input
                    value={project.continuityCrew?.[field] ?? ''}
                    onChange={(event) =>
                      updateProjectMeta((prev) => ({
                        continuityCrew: {
                          ...prev.continuityCrew,
                          [field]: event.target.value || undefined,
                        },
                      }))
                    }
                    placeholder="Nobody on the crew list; type a name"
                    className={`${inputClass} mt-0.5`}
                  />
                )}
              </label>
            );
          })}
        </div>
      </div>

      {/* Checklist half */}
      {(
        <div className={`flex flex-col gap-2 p-2 rounded-xl border ${surfaceClass}`}>
          {sectionHeading(
            <ClipboardList className="w-3.5 h-3.5" />,
            day ? 'Shooting-day checklist' : 'Whole-production checklist',
            checklist?.planned.length ?? 0,
          )}
          {checklist && checklist.planned.length === 0 ? (
            <p className={`text-[11px] ${mutedText}`}>
              {day
                ? 'Nothing scheduled for this day yet — schedule scenes, setups or shots and they appear here.'
                : 'No shots in this production yet — add shots to a scene and they appear here.'}
            </p>
          ) : (
            <div className="flex flex-col gap-1">{checklist?.planned.map(checklistRow)}</div>
          )}

          {checklist && (checklist.notShot.length > 0 || checklist.noGoodTake.length > 0) && (
            <div className="text-[11px] text-amber-500 flex items-start gap-1.5">
              <TriangleAlert className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>
                {checklist.notShot.length > 0 && (
                  <>
                    Not shot: {checklist.notShot.map((entry) => entry.shotNumber || '—').join(', ')}.{' '}
                  </>
                )}
                {checklist.noGoodTake.length > 0 && (
                  <>
                    No good base take:{' '}
                    {checklist.noGoodTake.map((entry) => entry.shotNumber || '—').join(', ')}.
                  </>
                )}
              </span>
            </div>
          )}

          {/*
            Unplanned work is listed apart from the plan on purpose: folding it
            in would hide the shot it did not replace.
          */}
          {checklist && checklist.unscheduled.length > 0 && (
            <>
              {sectionHeading(
                <Film className="w-3.5 h-3.5" />,
                'Shot but not planned',
                checklist.unscheduled.length,
              )}
              <div className="flex flex-col gap-1">{checklist.unscheduled.map(checklistRow)}</div>
            </>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[11px] ${mutedText}`}>Add unplanned shot at end of scene</span>
            {setups.map((setup) => (
              <button
                key={setup.id}
                onClick={() => addUnplannedShot(setup.id)}
                title={`Add an unplanned shot to scene ${setup.sceneNumber || setup.name}`}
                className={secondaryBtnClass}
              >
                <Plus className="w-3.5 h-3.5" /> {setup.sceneNumber || setup.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The log */}
      <div className={`flex flex-col gap-2 p-2 rounded-xl border ${surfaceClass}`}>
        {sectionHeading(<Film className="w-3.5 h-3.5" />, 'Continuity log', visibleTakes.length)}
        {visibleTakes.length === 0 ? (
          <p className={`text-[11px] ${mutedText}`}>
            No takes logged yet. Use “Take” on a shot in the checklist above.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {visibleTakes.map((take) => {
              const plan = planned.get(take.id) ?? {};
              const cam = take.cameraOverrides ?? {};
              const slate = take.slateOverrides ?? {};
              const open = expanded.has(take.id);
              /**
               * A text field for one exported column: the plan's value as the
               * placeholder, the take's own value on top. Blank means "as
               * planned", which is what the placeholder then shows.
               */
              const field = (
                label: string,
                value: string | number | undefined,
                plannedValue: string | undefined,
                onChange: (raw: string) => void,
                extra: { numeric?: boolean; wide?: boolean; title?: string } = {},
              ) => (
                <label
                  key={label}
                  className={`text-[10px] font-semibold ${mutedText} ${extra.wide ? 'col-span-2' : ''}`}
                  title={extra.title}
                >
                  {label}
                  <input
                    value={value ?? ''}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={plannedValue || '\u2014'}
                    inputMode={extra.numeric ? 'decimal' : undefined}
                    className={`${inputClass} mt-0.5 ${value === undefined || value === '' ? '' : 'font-semibold'}`}
                  />
                </label>
              );
              return (
                <div key={take.id} className={`flex flex-col gap-1.5 p-2 rounded-lg border ${cardClass}`}>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleExpanded(take.id)}
                      title={open ? 'Hide camera and slate details' : 'Edit every column for this take'}
                      className={iconBtnClass}
                    >
                      {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                    <span className={`font-mono text-xs ${headingText}`}>{shotLabel(take.shotId, take.slateTag)}</span>
                    {take.slateTag && <span className={unplannedChipClass}>{take.slateTag}</span>}
                    <span className={chipClass}>T{take.takeNumber}</span>
                    {/*
                      Three states, not two: undefined means "not judged yet",
                      which is not the same as NG and must not export as one.
                    */}
                    <button
                      onClick={() =>
                        updateTake(take.id, { isGoodTake: take.isGoodTake === true ? undefined : true })
                      }
                      title="Mark as a good take"
                      className={iconBtnClass}
                    >
                      <CheckCircle2 className={`w-4 h-4 ${take.isGoodTake === true ? 'text-emerald-500' : ''}`} />
                    </button>
                    <button
                      onClick={() =>
                        updateTake(take.id, { isGoodTake: take.isGoodTake === false ? undefined : false })
                      }
                      title="Mark as NG"
                      className={iconBtnClass}
                    >
                      <Circle className={`w-4 h-4 ${take.isGoodTake === false ? 'text-rose-500' : ''}`} />
                    </button>
                    <input
                      value={take.rollCard ?? ''}
                      onChange={(event) => updateTake(take.id, { rollCard: event.target.value || undefined })}
                      placeholder="Card"
                      className={`${inputClass} !w-20`}
                    />
                    <span className={`text-[11px] font-mono flex-1 truncate ${mutedText}`}>
                      {take.fileName ?? ''}
                    </span>
                    <button onClick={() => deleteTake(take.id)} title="Delete take" className={iconBtnClass}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <input
                      value={take.comments ?? ''}
                      onChange={(event) => updateTake(take.id, { comments: event.target.value || undefined })}
                      placeholder="What happened in this take"
                      className={`${inputClass} flex-1 min-w-[160px]`}
                    />
                    <input
                      value={keywordDrafts[take.id] ?? (take.keywords ?? []).join(', ')}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setKeywordDrafts((prev) => ({ ...prev, [take.id]: raw }));
                        updateTake(take.id, {
                          keywords: raw
                            .split(',')
                            .map((keyword) => keyword.trim())
                            .filter((keyword) => keyword.length > 0),
                        });
                      }}
                      onBlur={() =>
                        setKeywordDrafts((prev) => {
                          const next = { ...prev };
                          delete next[take.id];
                          return next;
                        })
                      }
                      placeholder="Keywords, comma separated"
                      title="Comma separated, e.g. Laptop, John, Gimbal"
                      className={`${inputClass} !w-40`}
                    />
                  </div>
                  {open && (
                    <>
                      <p className={`text-[10px] ${mutedText}`}>
                        Every column of the Resolve CSV. Grey is what the app already knows; type over
                        it with what was actually shot, and that is what exports. Clear a field to
                        go back to the app's value.
                      </p>
                      <div className="grid grid-cols-2 gap-1.5">
                        <label
                          className={`text-[10px] font-semibold ${mutedText} col-span-2`}
                          title="The camera's file name on the card, extension included. Resolve matches on this exactly."
                        >
                          File Name
                          <input
                            value={take.fileName ?? ''}
                            onChange={(event) =>
                              updateTake(take.id, { fileName: event.target.value || undefined })
                            }
                            placeholder="Type it, or paste the card listing in Reconcile below"
                            className={`${inputClass} mt-0.5 font-mono`}
                          />
                        </label>
                        {/*
                          Sound. Its own roll and its own file name, because
                          sound rolls over on its own schedule: a day can burn
                          three camera cards against one sound roll, and one
                          field standing for both would make the camera report
                          and the sound report print the same number.
                        */}
                        <label
                          className={`text-[10px] font-semibold ${mutedText}`}
                          title="The sound roll this take landed on. Separate from the camera card."
                        >
                          Sound Roll
                          <input
                            value={take.soundRoll ?? ''}
                            onChange={(event) =>
                              updateTake(take.id, { soundRoll: event.target.value || undefined })
                            }
                            placeholder="S01"
                            className={`${inputClass} mt-0.5 font-mono`}
                          />
                        </label>
                        <label
                          className={`text-[10px] font-semibold ${mutedText}`}
                          title="The audio file on the recorder's card, where it is known."
                        >
                          Audio File
                          <input
                            value={take.soundFileName ?? ''}
                            onChange={(event) =>
                              updateTake(take.id, { soundFileName: event.target.value || undefined })
                            }
                            placeholder="—"
                            className={`${inputClass} mt-0.5 font-mono`}
                          />
                        </label>
                        <label
                          className={`text-[10px] font-semibold ${mutedText} col-span-2`}
                          title="The mixer's note on this take, kept apart from the script supervisor's."
                        >
                          Sound Notes
                          <input
                            value={take.soundNotes ?? ''}
                            onChange={(event) =>
                              updateTake(take.id, { soundNotes: event.target.value || undefined })
                            }
                            placeholder="Aircraft over the last third"
                            className={`${inputClass} mt-0.5`}
                          />
                        </label>
                        <div className="col-span-2 flex items-center gap-3 text-[11px]">
                          {/*
                            MOS and wild track are mutually exclusive by
                            meaning — picture with no sound, sound with no
                            picture — so setting one clears the other rather
                            than allowing a take that claims both.
                          */}
                          <label className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={take.mos === true}
                              onChange={(event) =>
                                updateTake(take.id, {
                                  mos: event.target.checked ? true : undefined,
                                  ...(event.target.checked ? { wildTrack: undefined } : {}),
                                })
                              }
                            />
                            <span className={mutedText}>MOS — no sound recorded</span>
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={take.wildTrack === true}
                              onChange={(event) =>
                                updateTake(take.id, {
                                  wildTrack: event.target.checked ? true : undefined,
                                  ...(event.target.checked ? { mos: undefined } : {}),
                                })
                              }
                            />
                            <span className={mutedText}>Wild track — sound, no picture</span>
                          </label>
                        </div>
                        {field('Date Recorded', slate.dateRecorded, plan['Date Recorded'], (raw) =>
                          setSlateOverride(take.id, 'dateRecorded', raw || undefined),
                          { title: 'YYYY_MM_DD, as Resolve wants it' },
                        )}
                        {field('Scene', slate.sceneNumber, plan.Scene, (raw) =>
                          setSlateOverride(take.id, 'sceneNumber', raw || undefined),
                        )}
                        {field('Shot', slate.shotNumber, plan.Shot, (raw) =>
                          setSlateOverride(take.id, 'shotNumber', raw || undefined),
                          { title: 'What the slate said, when it differs from the shot list' },
                        )}
                        <label className={`text-[10px] font-semibold ${mutedText}`}>
                          Take
                          <input
                            value={take.takeNumber}
                            onChange={(event) => {
                              const n = Number(event.target.value);
                              if (Number.isInteger(n) && n > 0) updateTake(take.id, { takeNumber: n });
                            }}
                            inputMode="numeric"
                            className={`${inputClass} mt-0.5`}
                          />
                        </label>
                        <label className={`text-[10px] font-semibold ${mutedText}`}>
                          Slate tag
                          <select
                            aria-label="Slate tag"
                            value={take.slateTag ?? ''}
                            onChange={(event) => {
                              const slateTag = (event.target.value || undefined) as Take['slateTag'];
                              mutateTakes((previous) => {
                                const others = previous.filter((entry) => entry.id !== take.id);
                                const takeNumber = nextTakeNumber(others, take.shotId, slateTag);
                                return previous.map((entry) =>
                                  entry.id === take.id ? { ...entry, slateTag, takeNumber } : entry,
                                );
                              });
                            }}
                            className={`${inputClass} mt-0.5`}
                          >
                            <option value="">Regular</option>
                            <option value="PU">PU · Pickup</option>
                            <option value="RTK">RTK · Retake</option>
                          </select>
                        </label>
                        {field('Location', slate.location, plan.Location, (raw) =>
                          setSlateOverride(take.id, 'location', raw || undefined),
                        )}
                        <label className={`text-[10px] font-semibold ${mutedText}`}>
                          Environment
                          <select
                            value={slate.environment ?? ''}
                            onChange={(event) =>
                              setSlateOverride(
                                take.id,
                                'environment',
                                (event.target.value || undefined) as TakeSlateOverrides['environment'],
                              )
                            }
                            className={`${inputClass} mt-0.5`}
                          >
                            <option value="">{plan.Environment ? `As planned (${plan.Environment})` : '\u2014'}</option>
                            <option value="INT">INT</option>
                            <option value="EXT">EXT</option>
                          </select>
                        </label>
                        <label className={`text-[10px] font-semibold ${mutedText}`}>
                          Day / Night
                          <select
                            value={slate.dayNight ?? ''}
                            onChange={(event) =>
                              setSlateOverride(
                                take.id,
                                'dayNight',
                                (event.target.value || undefined) as TakeSlateOverrides['dayNight'],
                              )
                            }
                            className={`${inputClass} mt-0.5`}
                          >
                            <option value="">{plan['Day / Night'] ? `As planned (${plan['Day / Night']})` : '\u2014'}</option>
                            <option value="DAY">DAY</option>
                            <option value="NIGHT">NIGHT</option>
                          </select>
                        </label>
                        {field('Description', slate.description, plan.Description, (raw) =>
                          setSlateOverride(take.id, 'description', raw || undefined), { wide: true },
                        )}
                        {field('Camera #', cam.cameraLabel, plan['Camera #'], (raw) =>
                          setCameraOverride(take.id, 'cameraLabel', raw || undefined),
                        )}
                        {field('Camera Type', cam.cameraType, plan['Camera Type'], (raw) =>
                          setCameraOverride(take.id, 'cameraType', raw || undefined),
                        )}
                        {field('Camera FPS', cam.cameraFps, plan['Camera FPS'], (raw) =>
                          setCameraOverride(take.id, 'cameraFps', parseOptionalNumber(raw)), { numeric: true },
                        )}
                        {field('Shutter Speed', cam.shutterSpeed, plan['Shutter Speed'], (raw) =>
                          setCameraOverride(take.id, 'shutterSpeed', raw || undefined), { title: 'As written on the report, e.g. 1/50' },
                        )}
                        {field('ISO', cam.iso, plan.ISO, (raw) =>
                          setCameraOverride(take.id, 'iso', parseOptionalNumber(raw)), { numeric: true },
                        )}
                        {field('White Point (Kelvin)', cam.whitePointKelvin, plan['White Point (Kelvin)'], (raw) =>
                          setCameraOverride(take.id, 'whitePointKelvin', parseOptionalNumber(raw)),
                          { numeric: true, title: 'The one camera value the floor plan does not model' },
                        )}
                        {field('Focal Point (mm)', cam.focalMm, plan['Focal Point (mm)'], (raw) =>
                          setCameraOverride(take.id, 'focalMm', parseOptionalNumber(raw)), { numeric: true },
                        )}
                        {field('Filter', cam.filter, plan.Filter, (raw) =>
                          setCameraOverride(take.id, 'filter', raw || undefined),
                        )}
                        {field('Camera Aperture', cam.aperture, plan['Camera Aperture'], (raw) =>
                          setCameraOverride(take.id, 'aperture', raw || undefined),
                        )}
                        {field('Camera Notes', cam.cameraNotes, plan['Camera Notes'], (raw) =>
                          setCameraOverride(take.id, 'cameraNotes', raw || undefined), { wide: true },
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reconciliation pass */}
      <div className={`flex flex-col gap-2 p-2 rounded-xl border ${surfaceClass}`}>
        {sectionHeading(<Link2 className="w-3.5 h-3.5" />, 'Reconcile file names')}
        <p className={`text-[11px] ${mutedText}`}>
          Paste the card’s file listing, one name per line, in the order it was shot. Resolve matches
          clips by file name, so a log that drifts by one clip attaches every later row to the wrong
          shot — this pass makes that visible before it leaves the app.
        </p>
        <textarea
          value={reconcileText}
          onChange={(event) => setReconcileText(event.target.value)}
          rows={4}
          placeholder={'A001C001_230815_R1AB.mov\nA001C002_230815_R1AB.mov'}
          className={`${inputClass} font-mono !min-h-[80px]`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={runReconcile}
            className={secondaryBtnClass}
            disabled={reconcileText.trim() === '' || visibleTakes.length === 0}
          >
            <Link2 className="w-3.5 h-3.5" /> Match
          </button>
          {reconcilePreview && (
            <>
              <span className={`text-[11px] ${mutedText}`}>
                {reconcilePreview.matchedCount} matched
              </span>
              {reconcilePreview.hasDrift && (
                <span className="text-[11px] text-amber-500 flex items-center gap-1">
                  <TriangleAlert className="w-3.5 h-3.5" />
                  {
                    reconcilePreview.entries.filter((entry) => entry.status === 'take-without-file')
                      .length
                  }{' '}
                  take(s) without a file,{' '}
                  {
                    reconcilePreview.entries.filter((entry) => entry.status === 'file-without-take')
                      .length
                  }{' '}
                  file(s) without a take
                </span>
              )}
              {reconcilePreview.entries.some((entry) => entry.replaces) && (
                <span className="text-[11px] text-amber-500">
                  {reconcilePreview.entries.filter((entry) => entry.replaces).length} existing name(s)
                  would be replaced
                </span>
              )}
              <button onClick={applyReconcile} className={primaryBtnClass}>
                Apply to {reconcilePreview.matchedCount} take(s)
              </button>
            </>
          )}
        </div>
      </div>

      {/*
        Takes whose shot was deleted some other way — an older build, an import.
        Surfaced rather than dropped: the footage exists on a card somewhere.
      */}
      {orphans.length > 0 && (
        <div className={`flex items-start gap-1.5 p-2 rounded-xl border text-[11px] text-amber-500 ${surfaceClass}`}>
          <TriangleAlert className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            {orphans.length} take{orphans.length === 1 ? '' : 's'} point at a shot that no longer
            exists. They still export, with their slate columns blank.
          </span>
        </div>
      )}
        </>
      )}
    </div>
  );
};
