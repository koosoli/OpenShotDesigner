/**
 * Rigging planning panel (plan §11 truss builder, §23 rigging loads).
 *
 * Pure planning aid — every calculation comes from `src/domain/rigging`
 * (rule 4); missing data stays explicitly "unknown", never 0 (rule 13);
 * canonical units mm/kg (rule 14). Canvas drawing integration for truss
 * elements is out of scope here (placement fields stay at plan defaults).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Anchor,
  Info,
  Plus,
  Ruler,
  Trash2,
  Weight,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useFixtureCatalog } from '../inspector/useFixtureCatalog';
import { createId } from '../../domain/ids';
import { removeTrussElement } from '../../domain';
import { searchFixtureProfiles } from '../../domain/fixtures';
import type { LightElement } from '../../types';
import {
  SAFETY_DISCLAIMER,
  calculateTrussLoad,
  detachLoadFromProfile,
  evaluateTrussCapacity,
  fixtureProfileLabel,
  planLightIsOnRun,
  planLightLoadLabel,
  resolveSuspendedLoadWeights,
  riggingLoadOptions,
  suspendedLoadFromFixtureProfile,
  suspendedLoadFromPlanLight,
  type RiggingAssumptions,
  type RiggingItem,
  type RiggingItemKind,
  type SuspendedLoad,
  type TrussCapacityVerdict,
  type TrussElement,
  type TrussProfile,
} from '../../domain/rigging';
import { useWorkspaceUI } from '../../context/WorkspaceUIContext';
import { PdfExportButton } from '../common/PdfExportButton';

const GEOMETRY_ORDER = ['box', 'triangle', 'ladder', 'other'] as const;
type TrussGeometry = (typeof GEOMETRY_ORDER)[number];
const GEOMETRY_LABELS: Record<TrussGeometry, string> = {
  box: 'Box',
  triangle: 'Triangle',
  ladder: 'Ladder',
  other: 'Other',
};

const RIGGING_KIND_ORDER: RiggingItemKind[] = [
  'motor',
  'hang_point',
  'drop',
  'clamp',
  'safety',
  'bridle',
  'note',
];
const RIGGING_KIND_LABELS: Record<RiggingItemKind, string> = {
  motor: 'Motor',
  hang_point: 'Hang point',
  drop: 'Drop',
  clamp: 'Clamp',
  safety: 'Safety',
  bridle: 'Bridle',
  note: 'Note',
};

/**
 * The two sources an operator can claim for a weight they typed. `'profile'`
 * is deliberately absent: it means "read from the fixture catalogue", and the
 * only way to earn it is to add the load from a fixture, not to tick a box
 * beside a hand-typed figure.
 */
const LOAD_SOURCE_ORDER = ['manual', 'unknown'] as const;

/** A long catalogue is filtered, not scrolled; the list says when it is truncated. */
const CATALOGUE_OPTION_LIMIT = 40;

/**
 * The kinds a rated capacity is quoted for. Everything else on a run is
 * hardware that hangs from those points rather than carrying the run, so
 * asking for its capacity would only invite a meaningless number.
 */
const CAPACITY_BEARING_KINDS: ReadonlySet<RiggingItemKind> = new Set(['motor', 'hang_point']);

/** Parse a number input; empty string → undefined (unknown, never 0 — rule 13). */
const parseOptionalNumber = (raw: string): number | undefined => {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

const formatKg = (kg: number): string => `${Number(kg.toFixed(2))} kg`;

/** Why there is no verdict matters as much as the verdict, so it is spelled out. */
const capacityText = (capacity: TrussCapacityVerdict): string => {
  const percent =
    capacity.utilization === null ? '—' : `${Math.round(capacity.utilization * 100)}%`;
  const rated = capacity.capacityKg === null ? '—' : formatKg(capacity.capacityKg);
  if (capacity.verdict === 'over') {
    return `Over capacity — ${percent} of ${rated} rated`;
  }
  if (capacity.verdict === 'within') {
    return `Within capacity — ${percent} of ${rated} rated`;
  }
  if (capacity.pointCount === 0) return 'No capacity check — no motors or hang points on this run';
  if (capacity.unknownCapacityPointCount > 0) {
    return `No capacity check — ${capacity.unknownCapacityPointCount} of ${capacity.pointCount} rigging points unrated`;
  }
  if (capacity.verdict === 'unknown') return 'No capacity check — one or more planned load weights are unknown';
  return 'No capacity check — planned load unknown';
};

/** Two built-in starter profiles, clearly labeled generic (plan §11.3). */
const makeStarterProfiles = (): TrussProfile[] => [
  {
    id: createId('trussprof'),
    manufacturer: 'Generic',
    model: 'Generic box 500mm ~1.5kg',
    geometry: 'box',
    lengthMm: 500,
    selfWeightKg: 1.5,
  },
  {
    id: createId('trussprof'),
    manufacturer: 'Generic',
    model: 'Generic tri 500mm ~1.2kg',
    geometry: 'triangle',
    lengthMm: 500,
    selfWeightKg: 1.2,
  },
];

export const RiggingPanel: React.FC = () => {
  const { project, updateProjectMeta, activeSetup } = useFloorPlan();
  const { theme, openExportModal } = useWorkspaceUI();
  // The bundled fixture snapshot arrives asynchronously and an online refresh
  // can replace it; both change the weights resolved below, so the panel has
  // to re-render when the catalogue does.
  const catalog = useFixtureCatalog();
  const isLight = theme === 'light';

  const profiles = useMemo(() => project.trussProfiles ?? [], [project.trussProfiles]);
  const elements = useMemo(() => project.trussElements ?? [], [project.trussElements]);
  const items = useMemo(() => project.riggingItems ?? [], [project.riggingItems]);

  /** Catalogue weight for a fixture profile — the whole point of a `'profile'` load. */
  const fixtureLookup = useMemo(() => {
    const byId = new Map(catalog.profiles.map((profile) => [profile.id, profile]));
    return (profileId: string) => byId.get(profileId);
  }, [catalog.profiles]);

  const storedLoads = useMemo(() => project.suspendedLoads ?? [], [project.suspendedLoads]);
  /**
   * What the panel calculates on: the stored loads with every catalogue-linked
   * weight filled in from the live catalogue. The figure is never written back
   * — the project stores the link, the catalogue stores the kilograms, and a
   * corrected profile reaches this page without anyone re-typing it.
   */
  const loads = useMemo(
    () => resolveSuspendedLoadWeights(storedLoads, fixtureLookup),
    [storedLoads, fixtureLookup],
  );

  /** Lights standing on the plan for the scene being planned — candidates to hang. */
  const sceneLights = useMemo(
    () => activeSetup.elements.filter((e): e is LightElement => e.type === 'light'),
    [activeSetup.elements],
  );

  // Seed the two generic starter profiles exactly once — only while the
  // collection has never existed. An explicitly emptied list is respected.
  useEffect(() => {
    if (project.trussProfiles === undefined) {
      updateProjectMeta({ trussProfiles: makeStarterProfiles() });
    }
  }, [project.trussProfiles, updateProjectMeta]);

  /**
   * Hardware weight assumptions, stored on the project.
   *
   * They used to be `useState`, which meant they vanished on reload and the
   * printed sheet had to disown them in a footnote. They are assumptions, but
   * they are this production's assumptions, so they are saved and they count
   * towards every total on screen and on paper.
   */
  const loadOptions = useMemo(
    () => riggingLoadOptions(project.riggingAssumptions),
    [project.riggingAssumptions],
  );

  /**
   * Write one assumption, materialising the defaults for the others on the
   * first edit — so a project that inherits 0.5 kg a clamp keeps inheriting it
   * after the operator changes only the cable allowance.
   */
  const setAssumption = (field: keyof RiggingAssumptions, raw: string) => {
    updateProjectMeta({
      riggingAssumptions: { ...loadOptions, [field]: parseOptionalNumber(raw) },
    });
  };

  // New-element form state
  const [newElementProfileId, setNewElementProfileId] = useState('');
  const [newElementLabel, setNewElementLabel] = useState('');
  const [newElementLength, setNewElementLength] = useState('');
  // Catalogue filter per truss run: each run hangs different gear, so one
  // shared search box would fight itself as the operator works down the rig.
  const [catalogueQuery, setCatalogueQuery] = useState<Record<string, string>>({});

  // --- Mutations (all immutable via updateProjectMeta) ---

  const mutateProfiles = (fn: (prev: TrussProfile[]) => TrussProfile[]) =>
    updateProjectMeta((prev) => ({ trussProfiles: fn(prev.trussProfiles ?? []) }));
  const mutateElements = (fn: (prev: TrussElement[]) => TrussElement[]) =>
    updateProjectMeta((prev) => ({ trussElements: fn(prev.trussElements ?? []) }));
  const mutateLoads = (fn: (prev: SuspendedLoad[]) => SuspendedLoad[]) =>
    updateProjectMeta((prev) => ({ suspendedLoads: fn(prev.suspendedLoads ?? []) }));
  const mutateItems = (fn: (prev: RiggingItem[]) => RiggingItem[]) =>
    updateProjectMeta((prev) => ({ riggingItems: fn(prev.riggingItems ?? []) }));

  const addProfile = () => {
    mutateProfiles((prev) => [
      ...prev,
      {
        id: createId('trussprof'),
        geometry: 'box',
      },
    ]);
  };

  const seedStarterProfiles = () => {
    mutateProfiles(() => makeStarterProfiles());
  };

  const updateProfile = (profileId: string, updates: Partial<TrussProfile>) => {
    mutateProfiles((prev) =>
      prev.map((p) => (p.id === profileId ? { ...p, ...updates } : p))
    );
  };

  const removeProfile = (profileId: string) => {
    mutateProfiles((prev) => prev.filter((p) => p.id !== profileId));
  };

  const addElement = () => {
    const profileId = newElementProfileId || profiles[0]?.id;
    if (!profileId) return;
    const element: TrussElement = {
      id: createId('trussel'),
      profileId,
      label: newElementLabel.trim() || undefined,
      x: 0,
      y: 0,
      rotation: 0,
      setupId: activeSetup.id,
      lengthOverrideMm: parseOptionalNumber(newElementLength),
    };
    mutateElements((prev) => [...prev, element]);
    setNewElementLabel('');
    setNewElementLength('');
  };

  const updateElement = (elementId: string, updates: Partial<TrussElement>) => {
    mutateElements((prev) =>
      prev.map((e) => (e.id === elementId ? { ...e, ...updates } : e))
    );
  };

  const removeElement = (elementId: string) => {
    // Referential integrity in one shot (domain/integrity.ts): the run, its
    // loads, its rigging hardware, and the truss reference on any power
    // consumer that was hanging on it.
    const next = removeTrussElement(
      {
        trussElements: project.trussElements ?? [],
        suspendedLoads: project.suspendedLoads ?? [],
        riggingItems: project.riggingItems ?? [],
        powerPlan: project.powerPlan,
      },
      elementId,
    );
    updateProjectMeta({
      trussElements: next.trussElements,
      suspendedLoads: next.suspendedLoads,
      riggingItems: next.riggingItems,
      ...(next.powerPlan ? { powerPlan: next.powerPlan } : {}),
    });
  };

  const addLoad = (trussElementId: string) => {
    mutateLoads((prev) => [
      ...prev,
      {
        id: createId('load'),
        trussElementId,
        label: '',
        quantity: 1,
        source: 'manual',
      },
    ]);
  };

  /** Hang a light that is already standing on the plan (see `suspendedLoadFromPlanLight`). */
  const addLoadFromPlanLight = (trussElementId: string, light: LightElement) => {
    mutateLoads((prev) => [
      ...prev,
      suspendedLoadFromPlanLight(light, trussElementId, createId('load')),
    ]);
  };

  /** Hang a catalogue fixture that nobody has drawn on the plan yet. */
  const addLoadFromCatalogue = (trussElementId: string, profileId: string) => {
    const profile = fixtureLookup(profileId);
    if (!profile) return;
    mutateLoads((prev) => [
      ...prev,
      suspendedLoadFromFixtureProfile(profile, trussElementId, createId('load')),
    ]);
  };

  const updateLoad = (loadId: string, updates: Partial<SuspendedLoad>) => {
    mutateLoads((prev) =>
      prev.map((l) => (l.id === loadId ? { ...l, ...updates } : l))
    );
  };

  /**
   * Take a load off the catalogue and let the operator type the weight — the
   * yoke, the frame and the bag of sand the catalogue never heard about.
   */
  const overrideLoadWeight = (loadId: string) => {
    mutateLoads((prev) =>
      prev.map((l) => (l.id === loadId ? detachLoadFromProfile(l, fixtureLookup) : l)),
    );
  };

  const removeLoad = (loadId: string) => {
    mutateLoads((prev) => prev.filter((l) => l.id !== loadId));
  };

  const addItem = (trussElementId: string) => {
    mutateItems((prev) => [
      ...prev,
      {
        id: createId('rigitem'),
        trussElementId,
        kind: 'clamp',
      },
    ]);
  };

  const updateItem = (itemId: string, updates: Partial<RiggingItem>) => {
    mutateItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, ...updates } : i))
    );
  };

  const removeItem = (itemId: string) => {
    mutateItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  // --- Shared styles (PowerPanel/SchedulePanel conventions) ---

  const surfaceClass = isLight
    ? 'bg-slate-50 border-slate-200'
    : 'bg-slate-950/60 border-slate-800';
  const cardClass = isLight
    ? 'bg-white border-slate-200'
    : 'bg-slate-900 border-slate-700';
  const subCardClass = isLight
    ? 'bg-slate-50 border-slate-200'
    : 'bg-slate-950/60 border-slate-800';
  const mutedText = isLight ? 'text-slate-500' : 'text-slate-400';
  const headingText = isLight ? 'text-slate-700' : 'text-slate-300';
  const inputClass = `min-h-[36px] px-2 py-1 rounded-lg border text-xs w-full transition-colors ${
    isLight
      ? 'bg-white border-slate-300 text-slate-800 focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500'
      : 'bg-slate-950 border-slate-700 text-slate-100 focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500'
  }`;
  const iconBtnClass = `flex items-center justify-center min-w-[36px] min-h-[36px] rounded-lg transition-colors flex-shrink-0 ${
    isLight ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/70' : 'text-slate-400 hover:text-white hover:bg-slate-800'
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
  const disclaimerClass = `text-[10px] italic leading-relaxed ${
    isLight ? 'text-slate-500' : 'text-slate-500'
  }`;

  const sectionHeading = (icon: React.ReactNode, title: string, count?: number) => (
    <h3 className={`text-xs font-bold flex items-center gap-1.5 ${headingText}`}>
      {icon}
      {title}
      {count !== undefined && <span className={chipClass}>{count}</span>}
    </h3>
  );

  const profileLabel = (profile: TrussProfile | undefined): string => {
    if (!profile) return 'Unknown profile';
    const bits = [profile.manufacturer, profile.model].filter(Boolean);
    return bits.length > 0 ? bits.join(' ') : 'Unnamed profile';
  };

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-3">
      {/* Global safety disclaimer (rule 15) — rendered once here and under every load card */}
      <div
        className={`rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed flex items-start gap-2 ${
          isLight ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-950/40 border-amber-800 text-amber-200'
        }`}
      >
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <p>{SAFETY_DISCLAIMER}</p>
      </div>

      {/* Hardware weight assumptions (rule 13: blank stays unknown, never 0) */}
      <details className={`group rounded-xl border p-2.5 ${surfaceClass}`}>
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center gap-2">
          {sectionHeading(<Info className="w-3.5 h-3.5" />, 'Weight Assumptions')}
          <span className="ml-auto transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="pt-2 flex justify-end">
          <PdfExportButton onClick={() => openExportModal('rigging')} title="Rigging-Plot als PDF exportieren" />
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <label className="flex flex-col gap-0.5">
            <span className={`text-[10px] ${mutedText}`}>Clamp kg (assumption)</span>
            <input
              type="number"
              min={0}
              step="0.05"
              value={loadOptions.clampWeightKg ?? ''}
              onChange={(e) => setAssumption('clampWeightKg', e.target.value)}
              placeholder="—"
              aria-label="Assumed clamp weight in kg"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className={`text-[10px] ${mutedText}`}>Safety kg (assumption)</span>
            <input
              type="number"
              min={0}
              step="0.05"
              value={loadOptions.safetyWeightKg ?? ''}
              onChange={(e) => setAssumption('safetyWeightKg', e.target.value)}
              placeholder="—"
              aria-label="Assumed safety weight in kg"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className={`text-[10px] ${mutedText}`}>Cable allowance kg</span>
            <input
              type="number"
              min={0}
              step="0.5"
              value={loadOptions.cableAllowanceKg ?? ''}
              onChange={(e) => setAssumption('cableAllowanceKg', e.target.value)}
              placeholder="—"
              aria-label="Cable allowance in kg per truss run"
              className={inputClass}
            />
          </label>
        </div>
        <p className={`text-[10px] ${mutedText}`}>
          Per-clamp / per-safety weights are assumptions applied to the clamp and safety
          item counts below — verify against actual hardware. They are saved with the project
          and counted in every planned total, here and on the printed plot; a box left blank
          counts nothing rather than guessing.
        </p>
      </details>

      {/* Truss profiles */}
      <details className={`group rounded-xl border p-2.5 ${surfaceClass}`}>
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center gap-2">
          {sectionHeading(<Ruler className="w-3.5 h-3.5" />, 'Truss Profiles', profiles.length)}
          <span className="ml-auto transition-transform group-open:rotate-90">›</span>
        </summary>
          <div className="pt-2 flex items-center justify-end gap-1.5">
            {profiles.length === 0 && (
              <button onClick={seedStarterProfiles} title="Add the two generic starter profiles" className={secondaryBtnClass}>
                <Plus className="w-3.5 h-3.5" />
                Starter generic profiles
              </button>
            )}
            <button onClick={addProfile} title="Add truss profile" className={secondaryBtnClass}>
              <Plus className="w-3.5 h-3.5" />
              Profile
            </button>
          </div>
        {profiles.length === 0 && (
          <p className={`text-[11px] ${mutedText}`}>No profiles yet.</p>
        )}
        <ul className="flex flex-col gap-1.5">
          {profiles.map((profile) => (
            <li key={profile.id} className={`rounded-lg border p-2 flex flex-col gap-1.5 ${cardClass}`}>
              <div className="flex items-center gap-1.5">
                <input
                  value={profile.model ?? ''}
                  onChange={(e) => updateProfile(profile.id, { model: e.target.value })}
                  placeholder="Model (e.g. Generic box 500mm ~1.5kg)"
                  aria-label={`Model for profile ${profile.model || profile.id}`}
                  className={`${inputClass} font-semibold flex-1 min-w-[100px]`}
                />
                <input
                  value={profile.manufacturer ?? ''}
                  onChange={(e) => updateProfile(profile.id, { manufacturer: e.target.value })}
                  placeholder="Manufacturer"
                  aria-label={`Manufacturer for profile ${profile.model || profile.id}`}
                  className={`${inputClass} !w-28 flex-shrink-0`}
                />
                <button
                  onClick={() => removeProfile(profile.id)}
                  title="Remove profile (elements keep working with unknown self-weight)"
                  aria-label={`Remove profile ${profile.model || profile.id}`}
                  className={`${iconBtnClass} hover:!text-red-500`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <label className="flex flex-col gap-0.5">
                  <span className={`text-[10px] ${mutedText}`}>Geometry</span>
                  <select
                    value={profile.geometry}
                    onChange={(e) =>
                      updateProfile(profile.id, { geometry: e.target.value as TrussGeometry })
                    }
                    aria-label={`Geometry for profile ${profile.model || profile.id}`}
                    className={inputClass}
                  >
                    {GEOMETRY_ORDER.map((g) => (
                      <option key={g} value={g}>
                        {GEOMETRY_LABELS[g]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className={`text-[10px] ${mutedText}`}>Length mm</span>
                  <input
                    type="number"
                    min={0}
                    value={profile.lengthMm ?? ''}
                    onChange={(e) =>
                      updateProfile(profile.id, { lengthMm: parseOptionalNumber(e.target.value) })
                    }
                    placeholder="—"
                    aria-label={`Length in mm for profile ${profile.model || profile.id}`}
                    className={inputClass}
                  />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className={`text-[10px] ${mutedText}`}>Self-weight kg</span>
                  <input
                    type="number"
                    min={0}
                    step="0.05"
                    value={profile.selfWeightKg ?? ''}
                    onChange={(e) =>
                      updateProfile(profile.id, { selfWeightKg: parseOptionalNumber(e.target.value) })
                    }
                    placeholder="unknown"
                    aria-label={`Self-weight in kg for profile ${profile.model || profile.id}`}
                    className={inputClass}
                  />
                </label>
              </div>
              {profile.selfWeightKg === undefined && (
                <p className={`text-[10px] text-amber-500`}>
                  Self-weight unknown — totals for elements on this profile stay unknown.
                </p>
              )}
            </li>
          ))}
        </ul>
      </details>

      {/* Truss elements */}
      <details className={`group rounded-xl border p-2.5 ${surfaceClass}`}>
        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden flex items-center gap-2">
          {sectionHeading(<Anchor className="w-3.5 h-3.5" />, 'Truss Elements', elements.length)}
          <span className="ml-auto transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="pt-2" />
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={newElementLabel}
            onChange={(e) => setNewElementLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addElement();
            }}
            placeholder="New element label (e.g. Upstage overhead)"
            aria-label="New truss element label"
            className={`${inputClass} flex-1 min-w-[140px]`}
          />
          <select
            value={newElementProfileId}
            onChange={(e) => setNewElementProfileId(e.target.value)}
            aria-label="New truss element profile"
            className={`${inputClass} !w-auto max-w-[180px]`}
          >
            {profiles.length === 0 && <option value="">No profiles</option>}
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {profileLabel(p)}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            value={newElementLength}
            onChange={(e) => setNewElementLength(e.target.value)}
            placeholder="Length mm override"
            aria-label="New truss element length override in mm"
            className={`${inputClass} !w-32`}
          />
          <button
            onClick={addElement}
            disabled={profiles.length === 0}
            title={profiles.length === 0 ? 'Add a truss profile first' : 'Add truss element'}
            className={primaryBtnClass}
          >
            <Plus className="w-3.5 h-3.5" />
            Element
          </button>
        </div>
        <p className={`text-[10px] ${mutedText}`}>
          Each element is a planned truss section. Canvas placement/drawing for truss is
          not wired yet — position stays at plan defaults.
        </p>
        {elements.length === 0 && (
          <p className={`text-[11px] ${mutedText}`}>No truss elements yet.</p>
        )}
        <ul className="flex flex-col gap-2">
          {elements.map((element) => {
            const profile = profiles.find((p) => p.id === element.profileId);
            const elementLoads = loads.filter((l) => l.trussElementId === element.id);
            const elementItems = items.filter((i) => i.trussElementId === element.id);
            const breakdown = calculateTrussLoad(
              element,
              profile,
              loads,
              items,
              loadOptions
            );
            const capacity = evaluateTrussCapacity(breakdown, items);
            const displayName =
              element.label?.trim() ||
              (profile ? profileLabel(profile) : 'Truss section');
            const availableLights = sceneLights.filter(
              (light) => !planLightIsOnRun(loads, light.id, element.id),
            );
            const catalogueHits = searchFixtureProfiles(
              catalog.profiles,
              catalogueQuery[element.id] ?? '',
            );
            const catalogueTotal = catalogueHits.length;
            const catalogueMatches = catalogueHits.slice(0, CATALOGUE_OPTION_LIMIT);
            return (
              <li key={element.id} className={`rounded-lg border p-2 flex flex-col gap-2 ${cardClass}`}>
                {/* Element header */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <input
                    value={element.label ?? ''}
                    onChange={(e) => updateElement(element.id, { label: e.target.value })}
                    placeholder="Element label"
                    aria-label={`Label for truss element ${displayName}`}
                    className={`${inputClass} font-semibold flex-1 min-w-[120px]`}
                  />
                  <select
                    value={element.profileId ?? ''}
                    onChange={(e) => updateElement(element.id, { profileId: e.target.value || undefined })}
                    aria-label={`Profile for truss element ${displayName}`}
                    className={`${inputClass} !w-auto max-w-[170px]`}
                  >
                    {!profile && <option value="">Unknown profile</option>}
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {profileLabel(p)}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={element.lengthOverrideMm ?? ''}
                    onChange={(e) =>
                      updateElement(element.id, { lengthOverrideMm: parseOptionalNumber(e.target.value) })
                    }
                    placeholder="Length mm"
                    aria-label={`Length override in mm for truss element ${displayName}`}
                    className={`${inputClass} !w-28`}
                  />
                  <button
                    onClick={() => removeElement(element.id)}
                    title="Delete element (its loads and rigging items are removed)"
                    aria-label={`Delete truss element ${displayName}`}
                    className={`${iconBtnClass} hover:!text-red-500`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Suspended loads */}
                <div className={`rounded-lg border p-2 flex flex-col gap-1.5 ${subCardClass}`}>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className={`text-[11px] font-bold ${headingText}`}>
                      Suspended loads
                      <span className={`${chipClass} ml-1.5`}>{elementLoads.length}</span>
                    </h4>
                    <button
                      onClick={() => addLoad(element.id)}
                      title="Add suspended load"
                      aria-label={`Add suspended load to ${displayName}`}
                      className={secondaryBtnClass}
                    >
                      <Plus className="w-3 h-3" />
                      Load
                    </button>
                  </div>
                  {/*
                    Adding a load from a fixture the app already knows: the
                    weight then comes from the catalogue instead of being
                    re-typed from the same spec sheet the catalogue was built
                    from. A light already hanging on this run is left out of
                    the list rather than silently duplicated.
                  */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <select
                      value=""
                      onChange={(e) => {
                        const light = sceneLights.find((l) => l.id === e.target.value);
                        if (light) addLoadFromPlanLight(element.id, light);
                      }}
                      disabled={availableLights.length === 0}
                      aria-label={`Add a light from the plan as a load on ${displayName}`}
                      className={`${inputClass} !w-auto flex-1 min-w-[150px]`}
                    >
                      <option value="">
                        {sceneLights.length === 0
                          ? 'No lights on this plan'
                          : availableLights.length === 0
                            ? 'Every plan light is already on this run'
                            : `Add light from plan (${availableLights.length})`}
                      </option>
                      {availableLights.map((light) => (
                        <option key={light.id} value={light.id}>
                          {planLightLoadLabel(light)}
                          {light.fixtureProfileId ? '' : ' — no catalogue fixture'}
                        </option>
                      ))}
                    </select>
                    <input
                      value={catalogueQuery[element.id] ?? ''}
                      onChange={(e) =>
                        setCatalogueQuery((prev) => ({ ...prev, [element.id]: e.target.value }))
                      }
                      placeholder="Filter catalogue"
                      aria-label={`Filter the fixture catalogue for ${displayName}`}
                      className={`${inputClass} !w-32 flex-shrink-0`}
                    />
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) addLoadFromCatalogue(element.id, e.target.value);
                      }}
                      disabled={catalogueMatches.length === 0}
                      aria-label={`Add a catalogue fixture as a load on ${displayName}`}
                      className={`${inputClass} !w-auto flex-1 min-w-[150px]`}
                    >
                      <option value="">
                        {catalogueMatches.length === 0
                          ? 'No catalogue match'
                          : `Add from catalogue (${catalogueTotal})`}
                      </option>
                      {catalogueMatches.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {fixtureProfileLabel(profile)}
                          {profile.weightKg === undefined
                            ? ' — no weight'
                            : ` — ${profile.weightKg} kg`}
                        </option>
                      ))}
                    </select>
                  </div>
                  {catalogueTotal > catalogueMatches.length && (
                    <p className={`text-[10px] ${mutedText}`}>
                      Showing the first {catalogueMatches.length} of {catalogueTotal} catalogue
                      matches — narrow the filter to reach the rest.
                    </p>
                  )}
                  {elementLoads.length === 0 && (
                    <p className={`text-[10px] ${mutedText}`}>
                      No loads attached. Weight left blank counts as unknown.
                    </p>
                  )}
                  <ul className="flex flex-col gap-1.5">
                    {elementLoads.map((load) => {
                      const fromCatalogue = load.source === 'profile' && !!load.fixtureProfileId;
                      const catalogueProfile = load.fixtureProfileId
                        ? fixtureLookup(load.fixtureProfileId)
                        : undefined;
                      return (
                      <li key={load.id} className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <input
                            value={load.label}
                            onChange={(e) => updateLoad(load.id, { label: e.target.value })}
                            placeholder="Fixture / equipment name"
                            aria-label={`Label for load on ${displayName}`}
                            className={`${inputClass} flex-1 min-w-[120px]`}
                          />
                          <input
                            type="number"
                            min={1}
                            value={load.quantity}
                            onChange={(e) =>
                              updateLoad(load.id, {
                                quantity: Math.max(1, Math.round(Number(e.target.value) || 1)),
                              })
                            }
                            placeholder="Qty"
                            aria-label={`Quantity for load on ${displayName}`}
                            className={`${inputClass} !w-16`}
                          />
                          {fromCatalogue ? (
                            /*
                              The catalogue owns this figure, so it is shown
                              rather than offered for editing — overriding it is
                              a deliberate act on the button below, which is
                              what keeps "Catalogue" on the sheet truthful.
                            */
                            <span
                              className={`min-h-[36px] px-2 py-1 !w-36 flex items-center justify-end font-mono text-xs ${
                                load.weightKg === undefined ? 'text-amber-500' : ''
                              }`}
                              aria-label={`Catalogue weight for load on ${displayName}`}
                            >
                              {load.weightKg === undefined ? 'no catalogue kg' : formatKg(load.weightKg)}
                            </span>
                          ) : (
                            <input
                              type="number"
                              min={0}
                              step="0.1"
                              value={load.weightKg ?? ''}
                              onChange={(e) =>
                                updateLoad(load.id, { weightKg: parseOptionalNumber(e.target.value) })
                              }
                              placeholder="kg (blank = unknown)"
                              aria-label={`Weight in kg for load on ${displayName}; blank means unknown`}
                              className={`${inputClass} !w-36`}
                            />
                          )}
                          <button
                            onClick={() => removeLoad(load.id)}
                            title="Remove load"
                            aria-label={`Remove load from ${displayName}`}
                            className={`${iconBtnClass} hover:!text-red-500`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        {fromCatalogue ? (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={chipClass}>
                              Catalogue ·{' '}
                              {catalogueProfile
                                ? fixtureProfileLabel(catalogueProfile)
                                : 'profile no longer in the catalogue'}
                            </span>
                            {load.sourceElementId && (
                              <span className={chipClass}>from the plan</span>
                            )}
                            <button
                              onClick={() => overrideLoadWeight(load.id)}
                              title="Stop reading the weight from the catalogue and enter it by hand"
                              aria-label={`Enter the weight by hand for load on ${displayName}`}
                              className={`${secondaryBtnClass} !min-h-[28px] !text-[10px] !px-2`}
                            >
                              Enter by hand
                            </button>
                          </div>
                        ) : (
                          <div
                            className="flex items-center gap-1 flex-wrap"
                            role="radiogroup"
                            aria-label={`Weight source for load on ${displayName}`}
                          >
                            {LOAD_SOURCE_ORDER.map((source) => (
                              <label
                                key={source}
                                className={`flex items-center gap-1 min-h-[36px] px-1.5 rounded text-[10px] capitalize cursor-pointer ${
                                  isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800/60'
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`load-source-${load.id}`}
                                  checked={(load.source ?? 'manual') === source}
                                  onChange={() => updateLoad(load.id, { source })}
                                  className="accent-sky-500"
                                />
                                {source}
                              </label>
                            ))}
                          </div>
                        )}
                      </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Rigging items */}
                <div className={`rounded-lg border p-2 flex flex-col gap-1.5 ${subCardClass}`}>
                  <div className="flex items-center justify-between gap-2">
                    <h4 className={`text-[11px] font-bold ${headingText}`}>
                      Rigging items
                      <span className={`${chipClass} ml-1.5`}>{elementItems.length}</span>
                    </h4>
                    <button
                      onClick={() => addItem(element.id)}
                      title="Add rigging item"
                      aria-label={`Add rigging item to ${displayName}`}
                      className={secondaryBtnClass}
                    >
                      <Plus className="w-3 h-3" />
                      Item
                    </button>
                  </div>
                  {elementItems.length === 0 && (
                    <p className={`text-[10px] ${mutedText}`}>
                      No rigging items. Clamp/safety counts feed the load card below.
                    </p>
                  )}
                  <ul className="flex flex-col gap-1.5">
                    {elementItems.map((item) => (
                      <li key={item.id} className="flex items-center gap-1.5 flex-wrap">
                        <select
                          value={item.kind}
                          onChange={(e) =>
                            updateItem(item.id, { kind: e.target.value as RiggingItemKind })
                          }
                          aria-label={`Kind for rigging item on ${displayName}`}
                          className={`${inputClass} !w-auto flex-1 min-w-[110px]`}
                        >
                          {RIGGING_KIND_ORDER.map((kind) => (
                            <option key={kind} value={kind}>
                              {RIGGING_KIND_LABELS[kind]}
                            </option>
                          ))}
                        </select>
                        <input
                          value={item.label ?? ''}
                          onChange={(e) => updateItem(item.id, { label: e.target.value })}
                          placeholder="Label / note (optional)"
                          aria-label={`Label for rigging item on ${displayName}`}
                          className={`${inputClass} flex-1 min-w-[100px]`}
                        />
                        <input
                          type="number"
                          min={0}
                          value={item.positionMm ?? ''}
                          onChange={(e) =>
                            updateItem(item.id, { positionMm: parseOptionalNumber(e.target.value) })
                          }
                          placeholder="Pos mm"
                          aria-label={`Position along the run in mm for rigging item on ${displayName}; blank means unknown`}
                          className={`${inputClass} !w-24`}
                        />
                        {CAPACITY_BEARING_KINDS.has(item.kind) && (
                          <input
                            type="number"
                            min={0}
                            step="1"
                            value={item.capacityKg ?? ''}
                            onChange={(e) =>
                              updateItem(item.id, { capacityKg: parseOptionalNumber(e.target.value) })
                            }
                            placeholder="Rated kg"
                            aria-label={`Rated capacity in kg for rigging item on ${displayName}; blank means unknown`}
                            className={`${inputClass} !w-28`}
                          />
                        )}
                        <button
                          onClick={() => removeItem(item.id)}
                          title="Remove rigging item"
                          aria-label={`Remove rigging item from ${displayName}`}
                          className={`${iconBtnClass} hover:!text-red-500`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Per-truss load breakdown (pure domain logic, plan §23) */}
                <div className={`rounded-lg border p-2 flex flex-col gap-1 ${subCardClass}`}>
                  <h4 className={`text-[11px] font-bold flex items-center gap-1.5 ${headingText}`}>
                    <Weight className="w-3.5 h-3.5" />
                    Planned load
                  </h4>
                  <dl className="text-[11px] flex flex-col gap-0.5">
                    <div className="flex justify-between gap-2">
                      <dt className={mutedText}>Truss self-weight</dt>
                      <dd className="font-mono">
                        {breakdown.trussSelfWeightKg !== null
                          ? formatKg(breakdown.trussSelfWeightKg)
                          : <span className="text-amber-500 italic">unknown</span>}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className={mutedText}>Known loads</dt>
                      <dd className="font-mono">{formatKg(breakdown.loadsKg)}</dd>
                    </div>
                    {breakdown.unknownLoadCount > 0 && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-amber-500">Unknown loads</dt>
                        <dd className="font-mono text-amber-500">
                          {breakdown.unknownLoadCount} — not counted
                        </dd>
                      </div>
                    )}
                    {breakdown.unknownHardwareWeightCount > 0 && (
                      <div className="flex justify-between gap-2">
                        <dt className="text-amber-500">Unknown hardware weights</dt>
                        <dd className="font-mono text-amber-500">{breakdown.unknownHardwareWeightCount} — not counted</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-2">
                      <dt className={mutedText}>
                        Clamps ({breakdown.clampCount}) + safeties ({breakdown.safetyCount})
                      </dt>
                      <dd className="font-mono">{formatKg(breakdown.clampsKg)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className={mutedText}>Cable allowance</dt>
                      <dd className="font-mono">
                        {loadOptions.cableAllowanceKg !== undefined
                          ? formatKg(loadOptions.cableAllowanceKg)
                          : <span className={mutedText}>—</span>}
                      </dd>
                    </div>
                    <div
                      className={`flex justify-between gap-2 mt-1 pt-1 border-t border-dashed ${
                        isLight ? 'border-slate-200' : 'border-slate-800'
                      }`}
                    >
                      <dt className="font-bold">Total (incl. hardware + cable)</dt>
                      <dd className="font-mono font-bold">
                        {breakdown.totalKg !== null
                          ? formatKg(breakdown.totalKg)
                          : <span className="text-amber-500">unknown (missing load data)</span>}
                      </dd>
                    </div>
                  </dl>
                  {/* Planned load against what the motors and hang points are rated for. */}
                  <div
                    className={`text-[10px] font-semibold rounded px-2 py-1 ${
                      capacity.verdict === 'over'
                        ? isLight ? 'bg-red-100 text-red-800' : 'bg-red-950/60 text-red-300'
                        : capacity.verdict === 'within'
                          ? isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-950/60 text-emerald-300'
                          : isLight ? 'bg-amber-100 text-amber-800' : 'bg-amber-950/60 text-amber-300'
                    }`}
                  >
                    {capacityText(capacity)}
                  </div>
                  <p className={disclaimerClass}>{SAFETY_DISCLAIMER}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
};
