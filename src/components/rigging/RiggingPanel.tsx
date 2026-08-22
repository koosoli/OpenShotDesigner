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
import { createId } from '../../domain/ids';
import { removeTrussElement } from '../../domain';
import {
  SAFETY_DISCLAIMER,
  calculateTrussLoad,
  type RiggingItem,
  type RiggingItemKind,
  type SuspendedLoad,
  type TrussElement,
  type TrussProfile,
} from '../../domain/rigging';

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

const LOAD_SOURCE_ORDER = ['manual', 'profile', 'unknown'] as const;

/** Parse a number input; empty string → undefined (unknown, never 0 — rule 13). */
const parseOptionalNumber = (raw: string): number | undefined => {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

const formatKg = (kg: number): string => `${Number(kg.toFixed(2))} kg`;

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
  const { project, theme, updateProjectMeta } = useFloorPlan();
  const isLight = theme === 'light';

  const profiles = useMemo(() => project.trussProfiles ?? [], [project.trussProfiles]);
  const elements = useMemo(() => project.trussElements ?? [], [project.trussElements]);
  const loads = useMemo(() => project.suspendedLoads ?? [], [project.suspendedLoads]);
  const items = useMemo(() => project.riggingItems ?? [], [project.riggingItems]);

  // Seed the two generic starter profiles exactly once — only while the
  // collection has never existed. An explicitly emptied list is respected.
  useEffect(() => {
    if (project.trussProfiles === undefined) {
      updateProjectMeta({ trussProfiles: makeStarterProfiles() });
    }
  }, [project.trussProfiles, updateProjectMeta]);

  // Hardware weight assumptions (session-only UI state — rule 38). They feed
  // calculateTrussLoad options and are labeled as assumptions in the UI.
  const [clampWeightRaw, setClampWeightRaw] = useState('0.5');
  const [safetyWeightRaw, setSafetyWeightRaw] = useState('0.15');
  const [cableAllowanceRaw, setCableAllowanceRaw] = useState('');

  const loadOptions = useMemo(
    () => ({
      clampWeightKg: parseOptionalNumber(clampWeightRaw),
      safetyWeightKg: parseOptionalNumber(safetyWeightRaw),
      cableAllowanceKg: parseOptionalNumber(cableAllowanceRaw),
    }),
    [clampWeightRaw, safetyWeightRaw, cableAllowanceRaw]
  );

  // New-element form state
  const [newElementProfileId, setNewElementProfileId] = useState('');
  const [newElementLabel, setNewElementLabel] = useState('');
  const [newElementLength, setNewElementLength] = useState('');

  // --- Mutations (all immutable via updateProjectMeta) ---

  const mutateProfiles = (fn: (prev: TrussProfile[]) => TrussProfile[]) =>
    updateProjectMeta({ trussProfiles: fn(project.trussProfiles ?? []) });
  const mutateElements = (fn: (prev: TrussElement[]) => TrussElement[]) =>
    updateProjectMeta({ trussElements: fn(project.trussElements ?? []) });
  const mutateLoads = (fn: (prev: SuspendedLoad[]) => SuspendedLoad[]) =>
    updateProjectMeta({ suspendedLoads: fn(project.suspendedLoads ?? []) });
  const mutateItems = (fn: (prev: RiggingItem[]) => RiggingItem[]) =>
    updateProjectMeta({ riggingItems: fn(project.riggingItems ?? []) });

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

  const updateLoad = (loadId: string, updates: Partial<SuspendedLoad>) => {
    mutateLoads((prev) =>
      prev.map((l) => (l.id === loadId ? { ...l, ...updates } : l))
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

  const clampCountFor = (trussElementId: string) =>
    items.filter((i) => i.trussElementId === trussElementId && i.kind === 'clamp').length;
  const safetyCountFor = (trussElementId: string) =>
    items.filter((i) => i.trussElementId === trussElementId && i.kind === 'safety').length;

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
      <section className={`rounded-xl border p-2.5 flex flex-col gap-2 ${surfaceClass}`}>
        {sectionHeading(<Info className="w-3.5 h-3.5" />, 'Weight Assumptions')}
        <div className="grid grid-cols-3 gap-1.5">
          <label className="flex flex-col gap-0.5">
            <span className={`text-[10px] ${mutedText}`}>Clamp kg (assumption)</span>
            <input
              type="number"
              min={0}
              step="0.05"
              value={clampWeightRaw}
              onChange={(e) => setClampWeightRaw(e.target.value)}
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
              value={safetyWeightRaw}
              onChange={(e) => setSafetyWeightRaw(e.target.value)}
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
              value={cableAllowanceRaw}
              onChange={(e) => setCableAllowanceRaw(e.target.value)}
              placeholder="—"
              aria-label="Cable allowance in kg per truss run"
              className={inputClass}
            />
          </label>
        </div>
        <p className={`text-[10px] ${mutedText}`}>
          Per-clamp / per-safety weights are assumptions applied to the clamp and safety
          item counts below — verify against actual hardware.
        </p>
      </section>

      {/* Truss profiles */}
      <section className={`rounded-xl border p-2.5 flex flex-col gap-2 ${surfaceClass}`}>
        <div className="flex items-center justify-between gap-2">
          {sectionHeading(<Ruler className="w-3.5 h-3.5" />, 'Truss Profiles', profiles.length)}
          <div className="flex items-center gap-1.5">
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
      </section>

      {/* Truss elements */}
      <section className={`rounded-xl border p-2.5 flex flex-col gap-2 ${surfaceClass}`}>
        {sectionHeading(<Anchor className="w-3.5 h-3.5" />, 'Truss Elements', elements.length)}
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
            const displayName =
              element.label?.trim() ||
              (profile ? profileLabel(profile) : 'Truss section');
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
                  {elementLoads.length === 0 && (
                    <p className={`text-[10px] ${mutedText}`}>
                      No loads attached. Weight left blank counts as unknown.
                    </p>
                  )}
                  <ul className="flex flex-col gap-1.5">
                    {elementLoads.map((load) => (
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
                          <button
                            onClick={() => removeLoad(load.id)}
                            title="Remove load"
                            aria-label={`Remove load from ${displayName}`}
                            className={`${iconBtnClass} hover:!text-red-500`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
                      </li>
                    ))}
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
                      <li key={item.id} className="flex items-center gap-1.5">
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
                    <div className="flex justify-between gap-2">
                      <dt className={mutedText}>
                        Clamps ({clampCountFor(element.id)}) + safeties ({safetyCountFor(element.id)})
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
                      <dt className="font-bold">Total</dt>
                      <dd className="font-mono font-bold">
                        {breakdown.totalKg !== null
                          ? formatKg(breakdown.totalKg)
                          : <span className="text-amber-500">unknown (missing truss self-weight)</span>}
                      </dd>
                    </div>
                  </dl>
                  <p className={disclaimerClass}>{SAFETY_DISCLAIMER}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};
