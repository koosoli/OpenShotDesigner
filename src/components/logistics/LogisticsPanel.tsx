/**
 * Logistics / transport planning panel (plan §24).
 *
 * Pure planning aid — all calculations come from `src/domain/logistics`
 * (rule 4); missing data stays explicitly "unknown", never 0 (rule 13);
 * canonical units kg / liters (rule 14). "Pack equipment" fills the list from
 * the derived equipment manifest rather than asking anyone to type the gear a
 * second time; the weights come from the fixture catalogue where it has them.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, Box, Package, Plus, Printer, Trash2, Truck, Wand2 } from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { createId } from '../../domain/ids';
import {
  SAFETY_NOTE,
  calculateContainerLoad,
  catalogueUnitWeightKg,
  containerBelongsToDay,
  listContainerContents,
  packEquipmentIntoContainer,
  resolveContainerAssignments,
  type LogisticsContainer,
  type LogisticsContainerKind,
  type PackableEquipment,
  type PackedItem,
} from '../../domain/logistics';
import { deriveAllScenesEquipment, deriveSceneEquipment } from '../../utils/equipmentList';
import { useFixtureCatalog } from '../inspector/useFixtureCatalog';

const CONTAINER_KINDS: LogisticsContainerKind[] = ['case', 'rack', 'cart', 'pallet', 'van', 'truck'];
const KIND_LABELS: Record<LogisticsContainerKind, string> = {
  case: 'Case',
  rack: 'Rack',
  cart: 'Cart',
  pallet: 'Pallet',
  van: 'Van',
  truck: 'Truck',
};

/**
 * Virtual "Unassigned" pool sentinel for `PackedItem.containerId` — items not
 * (yet) packed into a real container, incl. items whose container was deleted.
 */
export const UNASSIGNED_CONTAINER_ID = 'unassigned';

/** Parse a number input; empty string → undefined (unknown, never 0 — rule 13). */
const parseOptionalNumber = (raw: string): number | undefined => {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

const formatKg = (kg: number): string => `${Number(kg.toFixed(2))} kg`;
const formatLiters = (l: number): string => `${Number(l.toFixed(1))} L`;
const formatPercent = (fraction: number): string => `${Math.round(fraction * 100)}%`;

interface ItemDraft {
  label: string;
  quantity: string;
  unitWeightRaw: string;
  volumeRaw: string;
  volumeIsEstimate: boolean;
}

const EMPTY_ITEM_DRAFT: ItemDraft = {
  label: '',
  quantity: '1',
  unitWeightRaw: '',
  volumeRaw: '',
  volumeIsEstimate: false,
};

/** Scope the "pack equipment" action works over. */
type PackScope = 'scene' | 'production';

export const LogisticsPanel: React.FC = () => {
  const { project, activeSetup, theme, updateProjectMeta, openExportModal } = useFloorPlan();
  const isLight = theme === 'light';
  const catalog = useFixtureCatalog();

  const containers = useMemo(
    () => project.logisticsContainers ?? [],
    [project.logisticsContainers]
  );
  const items = useMemo(() => project.packedItems ?? [], [project.packedItems]);
  const productionDays = useMemo(() => project.productionDays ?? [], [project.productionDays]);
  const locations = useMemo(() => project.locations ?? [], [project.locations]);

  /** Day / destination per container, inherited from parents (domain — rule 4). */
  const assignments = useMemo(() => resolveContainerAssignments(containers), [containers]);

  // The day scope lives on the project so the printed sheet can be built from
  // the project alone; a filter pointing at a deleted day means "everything".
  const dayFilterId =
    project.logisticsDayFilterId && productionDays.some((d) => d.id === project.logisticsDayFilterId)
      ? project.logisticsDayFilterId
      : undefined;

  const dayLabel = (id: string | undefined): string | undefined => {
    const day = id ? productionDays.find((candidate) => candidate.id === id) : undefined;
    if (!day) return undefined;
    return day.date ? `${day.name} · ${day.date}` : day.name;
  };
  const locationLabel = (id: string | undefined): string | undefined =>
    id ? locations.find((candidate) => candidate.id === id)?.name : undefined;

  // --- Mutations (all immutable via updateProjectMeta) ---

  const mutateContainers = (fn: (prev: LogisticsContainer[]) => LogisticsContainer[]) =>
    updateProjectMeta({ logisticsContainers: fn(project.logisticsContainers ?? []) });
  const mutateItems = (fn: (prev: PackedItem[]) => PackedItem[]) =>
    updateProjectMeta({ packedItems: fn(project.packedItems ?? []) });

  const addContainer = (kind: LogisticsContainerKind, name: string, parentContainerId?: string) => {
    const container: LogisticsContainer = {
      id: createId('container'),
      kind,
      name: name.trim() || KIND_LABELS[kind],
      parentContainerId: parentContainerId || undefined,
    };
    mutateContainers((prev) => [...prev, container]);
  };

  const updateContainer = (id: string, updates: Partial<LogisticsContainer>) => {
    mutateContainers((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  /**
   * Delete a container: child containers keep existing but are re-parented to
   * top level (parentId cleared); its packed items move to the Unassigned
   * virtual pool — nothing is silently dropped.
   */
  const removeContainer = (id: string) => {
    mutateContainers((prev) =>
      prev
        .filter((c) => c.id !== id)
        .map((c) =>
          c.parentContainerId === id ? { ...c, parentContainerId: undefined } : c
        )
    );
    mutateItems((prev) =>
      prev.map((i) => (i.containerId === id ? { ...i, containerId: UNASSIGNED_CONTAINER_ID } : i))
    );
  };

  const addItem = (containerId: string, draft: ItemDraft) => {
    const item: PackedItem = {
      id: createId('packed'),
      containerId,
      label: draft.label.trim() || 'Untitled item',
      quantity: Math.max(1, Math.round(Number(draft.quantity) || 1)),
      unitWeightKg: parseOptionalNumber(draft.unitWeightRaw),
      packedVolumeLiters: parseOptionalNumber(draft.volumeRaw),
      volumeIsEstimate: draft.volumeIsEstimate || undefined,
    };
    mutateItems((prev) => [...prev, item]);
  };

  const updateItem = (itemId: string, updates: Partial<PackedItem>) => {
    mutateItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...updates } : i)));
  };

  const removeItem = (itemId: string) => {
    mutateItems((prev) => prev.filter((i) => i.id !== itemId));
  };

  // --- Derived data (pure domain logic only — rule 4) ---

  /** containerId → load result, computed once per render pass. */
  const loadByContainer = useMemo(() => {
    const map = new Map<string, ReturnType<typeof calculateContainerLoad>>();
    for (const c of containers) map.set(c.id, calculateContainerLoad(c, items, containers));
    return map;
  }, [containers, items]);

  // Fleet summary across TOP-LEVEL containers (no parent), on the rolled-up
  // figures: what a vehicle weighs includes the cases inside it.
  const fleet = useMemo(() => {
    const topLevel = containers.filter((c) => !c.parentContainerId);
    let knownWeightKg = 0;
    let topLevelWithUnknownWeight = 0;
    for (const c of topLevel) {
      const load = loadByContainer.get(c.id);
      if (!load) continue;
      if (load.rolledUpWeightKg !== null) knownWeightKg += load.rolledUpWeightKg;
      else topLevelWithUnknownWeight += 1;
    }
    const unknownWeightItemCount = items.filter(
      (i) => i.unitWeightKg === undefined || i.unitWeightKg === null
    ).length;
    return { containerCount: containers.length, knownWeightKg, topLevelWithUnknownWeight, unknownWeightItemCount };
  }, [containers, items, loadByContainer]);

  const unassignedItems = useMemo(
    () => items.filter((i) => !containers.some((c) => c.id === i.containerId)),
    [items, containers]
  );

  // Per-container add-item drafts (session-only UI state — rule 38).
  const [itemDrafts, setItemDrafts] = useState<Record<string, ItemDraft>>({});
  const draftFor = (containerId: string): ItemDraft =>
    itemDrafts[containerId] ?? EMPTY_ITEM_DRAFT;
  const patchDraft = (containerId: string, patch: Partial<ItemDraft>) =>
    setItemDrafts((prev) => ({
      ...prev,
      [containerId]: { ...(prev[containerId] ?? EMPTY_ITEM_DRAFT), ...patch },
    }));

  // New-container form state.
  const [newKind, setNewKind] = useState<LogisticsContainerKind>('case');
  const [newName, setNewName] = useState('');
  const [newParentId, setNewParentId] = useState('');

  // --- Pack equipment (manifest → load list) ---

  const [packScope, setPackScope] = useState<PackScope>('scene');
  const [packTargetId, setPackTargetId] = useState('');
  /** What the last run did, so the user can see the unknown weights it left. */
  const [packReport, setPackReport] = useState<string | null>(null);

  /**
   * The manifest rows for the chosen scope. A whole production is packed at
   * its PEAK concurrent quantity: three scenes each needing one SkyPanel need
   * one SkyPanel on the truck, not three.
   */
  const packSource = useMemo((): PackableEquipment[] => {
    if (packScope === 'scene') return deriveSceneEquipment(activeSetup);
    return deriveAllScenesEquipment(project.setups).map((item) => ({
      category: item.category,
      name: item.name,
      brand: item.brand,
      model: item.model,
      quantity: item.maxConcurrentQuantity,
    }));
  }, [packScope, activeSetup, project.setups]);

  const packEquipment = () => {
    const target = packTargetId || UNASSIGNED_CONTAINER_ID;
    const result = packEquipmentIntoContainer({
      equipment: packSource,
      containerId: target,
      existingItems: items,
      unitWeightKg: (item) => catalogueUnitWeightKg(catalog.profiles, item),
      newId: () => createId('packed'),
    });
    updateProjectMeta({ packedItems: result.items });
    setPackReport(
      `${result.added} added, ${result.updated} updated · ${result.unknownWeightCount} without a known weight`,
    );
  };

  // --- Shared styles (PowerPanel/RiggingPanel conventions) ---

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
  const estimateChipClass = `px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
    isLight ? 'bg-amber-100 text-amber-800' : 'bg-amber-950/60 text-amber-300'
  }`;
  const unknownText = 'text-amber-500 italic';

  const sectionHeading = (icon: React.ReactNode, title: string, count?: number) => (
    <h3 className={`text-xs font-bold flex items-center gap-1.5 ${headingText}`}>
      {icon}
      {title}
      {count !== undefined && <span className={chipClass}>{count}</span>}
    </h3>
  );

  const containerLabel = (c: LogisticsContainer): string =>
    `${KIND_LABELS[c.kind]} · ${c.name}`;

  /** Items directly inside a container (full records for inline editing). */
  const directItems = (containerId: string): PackedItem[] =>
    items.filter((i) => i.containerId === containerId);

  /** Render a packed-item row with inline edit + move + delete. */
  const renderItemRow = (item: PackedItem, ownerLabel: string) => (
    <li key={item.id} className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 flex-wrap">
        <input
          value={item.label}
          onChange={(e) => updateItem(item.id, { label: e.target.value })}
          placeholder="Item label"
          aria-label={`Label for item in ${ownerLabel}`}
          className={`${inputClass} flex-1 min-w-[110px]`}
        />
        <input
          type="number"
          min={1}
          value={item.quantity}
          onChange={(e) =>
            updateItem(item.id, {
              quantity: Math.max(1, Math.round(Number(e.target.value) || 1)),
            })
          }
          aria-label={`Quantity for ${item.label} in ${ownerLabel}`}
          className={`${inputClass} !w-14`}
        />
        <input
          type="number"
          min={0}
          step="0.1"
          value={item.unitWeightKg ?? ''}
          onChange={(e) =>
            updateItem(item.id, { unitWeightKg: parseOptionalNumber(e.target.value) })
          }
          placeholder="kg each"
          aria-label={`Unit weight in kg for ${item.label}; blank means unknown`}
          className={`${inputClass} !w-24`}
        />
        <input
          type="number"
          min={0}
          step="0.5"
          value={item.packedVolumeLiters ?? ''}
          onChange={(e) =>
            updateItem(item.id, { packedVolumeLiters: parseOptionalNumber(e.target.value) })
          }
          placeholder="L each"
          aria-label={`Packed volume in liters for ${item.label}; blank means unknown`}
          className={`${inputClass} !w-20`}
        />
        <select
          value={item.containerId}
          onChange={(e) => updateItem(item.id, { containerId: e.target.value })}
          aria-label={`Move ${item.label} to another container`}
          className={`${inputClass} !w-auto max-w-[150px]`}
        >
          <option value={UNASSIGNED_CONTAINER_ID}>Unassigned</option>
          {containers.map((c) => (
            <option key={c.id} value={c.id}>
              {containerLabel(c)}
            </option>
          ))}
        </select>
        <button
          onClick={() => removeItem(item.id)}
          title="Remove item"
          aria-label={`Remove ${item.label} from ${ownerLabel}`}
          className={`${iconBtnClass} hover:!text-red-500`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <label
        className={`flex items-center gap-1.5 min-h-[36px] px-1 text-[10px] cursor-pointer ${
          isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800/60'
        } rounded`}
      >
        <input
          type="checkbox"
          checked={item.volumeIsEstimate ?? false}
          onChange={(e) =>
            updateItem(item.id, { volumeIsEstimate: e.target.checked || undefined })
          }
          className="accent-sky-500"
        />
        Volume is an estimate (from physical dims)
      </label>
    </li>
  );

  /** Add-item form for a container / the unassigned pool. */
  const renderAddItemForm = (containerId: string, ownerLabel: string) => {
    const draft = draftFor(containerId);
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <input
            value={draft.label}
            onChange={(e) => patchDraft(containerId, { label: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addItem(containerId, draft);
            }}
            placeholder="New item label"
            aria-label={`New item label for ${ownerLabel}`}
            className={`${inputClass} flex-1 min-w-[120px]`}
          />
          <input
            type="number"
            min={1}
            value={draft.quantity}
            onChange={(e) => patchDraft(containerId, { quantity: e.target.value })}
            placeholder="Qty"
            aria-label={`Quantity for new item in ${ownerLabel}`}
            className={`${inputClass} !w-14`}
          />
          <input
            type="number"
            min={0}
            step="0.1"
            value={draft.unitWeightRaw}
            onChange={(e) => patchDraft(containerId, { unitWeightRaw: e.target.value })}
            placeholder="kg each"
            aria-label={`Unit weight in kg for new item in ${ownerLabel}; blank means unknown`}
            className={`${inputClass} !w-24`}
          />
          <input
            type="number"
            min={0}
            step="0.5"
            value={draft.volumeRaw}
            onChange={(e) => patchDraft(containerId, { volumeRaw: e.target.value })}
            placeholder="L each"
            aria-label={`Packed volume in liters for new item in ${ownerLabel}; blank means unknown`}
            className={`${inputClass} !w-20`}
          />
          <button
            onClick={() => addItem(containerId, draft)}
            title={`Add packed item to ${ownerLabel}`}
            aria-label={`Add packed item to ${ownerLabel}`}
            className={secondaryBtnClass}
          >
            <Plus className="w-3 h-3" />
            Item
          </button>
        </div>
        <label
          className={`flex items-center gap-1.5 min-h-[36px] px-1 text-[10px] cursor-pointer ${
            isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-800/60'
          } rounded w-fit`}
        >
          <input
            type="checkbox"
            checked={draft.volumeIsEstimate}
            onChange={(e) => patchDraft(containerId, { volumeIsEstimate: e.target.checked })}
            className="accent-sky-500"
          />
          Volume is an estimate (from physical dims)
        </label>
      </div>
    );
  };

  /** Load card for one container via calculateContainerLoad. */
  const renderLoadCard = (container: LogisticsContainer) => {
    const load = loadByContainer.get(container.id);
    if (!load) return null;
    return (
      <div className={`rounded-lg border p-2 flex flex-col gap-1 ${subCardClass}`}>
        <h4 className={`text-[11px] font-bold flex items-center gap-1.5 ${headingText}`}>
          <Truck className="w-3.5 h-3.5" />
          Load
          {load.volumeIsEstimate && (
            <span className={estimateChipClass} title="Some volumes derived from physical dims">
              est.
            </span>
          )}
        </h4>
        <dl className="text-[11px] flex flex-col gap-0.5">
          <div className="flex justify-between gap-2">
            <dt className={mutedText}>Total weight</dt>
            <dd className="font-mono">
              {load.totalWeightKg !== null ? (
                <>
                  {formatKg(load.totalWeightKg)}
                  {load.tareUnknown && (
                    <span className={`${mutedText}`}> (tare unknown)</span>
                  )}
                </>
              ) : (
                <span className={unknownText}>
                  unknown — {load.unknownItemCount}{' '}
                  {load.unknownItemCount === 1 ? 'item' : 'items'} without weight — not counted
                </span>
              )}
            </dd>
          </div>
          {/* Only meaningful once something is nested inside — otherwise it
              repeats the line above. */}
          {load.nestedContainerCount > 0 && (
            <div className="flex justify-between gap-2">
              <dt className={mutedText}>
                Incl. {load.nestedContainerCount} nested{' '}
                {load.nestedContainerCount === 1 ? 'container' : 'containers'}
              </dt>
              <dd className="font-mono">
                {load.rolledUpWeightKg !== null ? (
                  <>
                    {formatKg(load.rolledUpWeightKg)}
                    {load.rolledUpTareUnknown && <span className={mutedText}> (a tare unknown)</span>}
                  </>
                ) : (
                  <span className={unknownText}>
                    unknown — {load.rolledUpUnknownItemCount}{' '}
                    {load.rolledUpUnknownItemCount === 1 ? 'item' : 'items'} without weight in here
                  </span>
                )}
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className={mutedText}>Used volume</dt>
            <dd className="font-mono flex items-center gap-1">
              {load.usedVolumeLiters !== null ? (
                formatLiters(load.usedVolumeLiters)
              ) : (
                <span className={unknownText}>unknown</span>
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            {/* Judged on the rolled-up weight: a truck goes over its payload
                because of what is in the cases. */}
            <dt className={mutedText}>
              Payload utilization{load.nestedContainerCount > 0 ? ' (incl. nested)' : ''}
            </dt>
            <dd className="font-mono">
              {load.rolledUpPayloadUtilization !== null ? (
                formatPercent(load.rolledUpPayloadUtilization)
              ) : (
                <span className={unknownText}>
                  {container.maxPayloadKg !== undefined && load.rolledUpWeightKg === null
                    ? 'total weight unknown'
                    : 'payload limit unknown'}
                </span>
              )}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className={mutedText}>Volume utilization</dt>
            <dd className="font-mono flex items-center gap-1">
              {load.volumeUtilization !== null ? (
                formatPercent(load.volumeUtilization)
              ) : (
                <span className={unknownText}>
                  {container.usableVolumeLiters !== undefined && load.usedVolumeLiters === null
                    ? 'item volumes unknown'
                    : 'usable volume unknown'}
                </span>
              )}
            </dd>
          </div>
        </dl>
      </div>
    );
  };

  /**
   * One container card: inline-editable header/specs, contents, load card.
   * Child containers nest below (via listContainerContents), guarded against
   * reference cycles by `visited`.
   */
  const renderContainerCard = (container: LogisticsContainer, depth: number, visited: Set<string>) => {
    const { childContainers } = listContainerContents(container.id, items, containers);
    const ownItems = directItems(container.id);
    const ownerLabel = containerLabel(container);
    // Shown in the empty option so "blank" reads as what it actually means
    // here: this box travels with the one it is packed inside.
    const assignment = assignments.get(container.id);
    const inheritedDay = assignment?.dayInherited ? dayLabel(assignment.productionDayId) : undefined;
    const inheritedLocation = assignment?.locationInherited
      ? locationLabel(assignment.locationId)
      : undefined;
    return (
      <div key={container.id} className="flex flex-col gap-2" style={{ marginLeft: depth > 0 ? 12 : 0 }}>
        <div className={`rounded-lg border p-2 flex flex-col gap-2 ${cardClass}`}>
          {/* Header row */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Box className={`w-3.5 h-3.5 flex-shrink-0 ${mutedText}`} />
            <input
              value={container.name}
              onChange={(e) => updateContainer(container.id, { name: e.target.value })}
              placeholder="Container name"
              aria-label={`Name for container ${container.name || container.id}`}
              className={`${inputClass} font-semibold flex-1 min-w-[120px]`}
            />
            <select
              value={container.kind}
              onChange={(e) =>
                updateContainer(container.id, { kind: e.target.value as LogisticsContainerKind })
              }
              aria-label={`Kind for container ${container.name}`}
              className={`${inputClass} !w-auto`}
            >
              {CONTAINER_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <select
              value={container.parentContainerId ?? ''}
              onChange={(e) =>
                updateContainer(container.id, {
                  parentContainerId: e.target.value || undefined,
                })
              }
              aria-label={`Parent container for ${container.name}`}
              className={`${inputClass} !w-auto max-w-[170px]`}
            >
              <option value="">Top level</option>
              {containers
                .filter((c) => c.id !== container.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    In: {containerLabel(c)}
                  </option>
                ))}
            </select>
            <button
              onClick={() => removeContainer(container.id)}
              title="Delete container (children move to top level; items move to Unassigned)"
              aria-label={`Delete container ${container.name}`}
              className={`${iconBtnClass} hover:!text-red-500`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Routing — which shoot day it travels on and where it is going.
              Both optional; blank inherits from the container it sits in. */}
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex flex-col gap-0.5">
              <span className={`text-[10px] ${mutedText}`}>Shoot day</span>
              <select
                value={container.productionDayId ?? ''}
                onChange={(e) =>
                  updateContainer(container.id, { productionDayId: e.target.value || undefined })
                }
                aria-label={`Shoot day for ${container.name}`}
                className={inputClass}
              >
                <option value="">
                  {inheritedDay ? `Inherited: ${inheritedDay}` : 'Not routed'}
                </option>
                {productionDays.map((day) => (
                  <option key={day.id} value={day.id}>
                    {dayLabel(day.id)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className={`text-[10px] ${mutedText}`}>Going to</span>
              <select
                value={container.locationId ?? ''}
                onChange={(e) =>
                  updateContainer(container.id, { locationId: e.target.value || undefined })
                }
                aria-label={`Destination location for ${container.name}`}
                className={inputClass}
              >
                <option value="">
                  {inheritedLocation ? `Inherited: ${inheritedLocation}` : 'Not set'}
                </option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Specs grid — all optional; blank stays unknown (rule 13) */}
          <div className="grid grid-cols-3 gap-1.5">
            <label className="flex flex-col gap-0.5">
              <span className={`text-[10px] ${mutedText}`}>Tare weight kg</span>
              <input
                type="number"
                min={0}
                step="0.5"
                value={container.tareWeightKg ?? ''}
                onChange={(e) =>
                  updateContainer(container.id, { tareWeightKg: parseOptionalNumber(e.target.value) })
                }
                placeholder="unknown"
                aria-label={`Tare weight in kg for ${container.name}; blank means unknown`}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className={`text-[10px] ${mutedText}`}>Usable volume L</span>
              <input
                type="number"
                min={0}
                step="1"
                value={container.usableVolumeLiters ?? ''}
                onChange={(e) =>
                  updateContainer(container.id, {
                    usableVolumeLiters: parseOptionalNumber(e.target.value),
                  })
                }
                placeholder="unknown"
                aria-label={`Usable volume in liters for ${container.name}; blank means unknown`}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className={`text-[10px] ${mutedText}`}>Max payload kg</span>
              <input
                type="number"
                min={0}
                step="1"
                value={container.maxPayloadKg ?? ''}
                onChange={(e) =>
                  updateContainer(container.id, {
                    maxPayloadKg: parseOptionalNumber(e.target.value),
                  })
                }
                placeholder="unknown"
                aria-label={`Maximum payload in kg for ${container.name}; blank means unknown`}
                className={inputClass}
              />
            </label>
          </div>

          {/* Contents */}
          <div className={`rounded-lg border p-2 flex flex-col gap-1.5 ${subCardClass}`}>
            <h4 className={`text-[11px] font-bold ${headingText}`}>
              Packed items
              <span className={`${chipClass} ml-1.5`}>{ownItems.length}</span>
            </h4>
            {ownItems.length === 0 && (
              <p className={`text-[10px] ${mutedText}`}>
                Nothing packed yet. Blank weights/volumes count as unknown.
              </p>
            )}
            {ownItems.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {ownItems.map((item) => renderItemRow(item, ownerLabel))}
              </ul>
            )}
            {renderAddItemForm(container.id, ownerLabel)}
          </div>

          {/* Load card */}
          {renderLoadCard(container)}
        </div>

        {/* Nested child containers (one branch per child, cycle-guarded) */}
        {childContainers.map((child) => {
          if (visited.has(child.id)) return null;
          return renderContainerCard(child, depth + 1, new Set([...visited, child.id]));
        })}
      </div>
    );
  };

  // Roots: no parent, or parent reference missing (orphans stay visible),
  // then narrowed to the chosen shoot day. Containers routed to no day at all
  // stay on every day's list — unrouted gear must not vanish.
  const rootContainers = containers.filter(
    (c) =>
      (!c.parentContainerId || !containers.some((p) => p.id === c.parentContainerId)) &&
      containerBelongsToDay(assignments.get(c.id), dayFilterId)
  );
  const hiddenByDayFilter = dayFilterId
    ? containers.filter((c) => !containerBelongsToDay(assignments.get(c.id), dayFilterId)).length
    : 0;

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-3">
      {/* Fleet summary strip — totals across top-level containers */}
      <section className={`rounded-xl border p-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 ${surfaceClass}`}>
        {sectionHeading(<Truck className="w-3.5 h-3.5" />, 'Fleet')}
        {/* Day scope: what the panel shows and what the print button prints. */}
        <label className="flex items-center gap-1.5">
          <span className={`text-[11px] ${mutedText}`}>Day</span>
          <select
            value={dayFilterId ?? ''}
            onChange={(e) => updateProjectMeta({ logisticsDayFilterId: e.target.value || undefined })}
            aria-label="Show the load for one shoot day"
            className={`${inputClass} !w-auto max-w-[180px]`}
          >
            <option value="">Whole production</option>
            {productionDays.map((day) => (
              <option key={day.id} value={day.id}>
                {dayLabel(day.id)}
              </option>
            ))}
          </select>
        </label>
        {/* The load list is worked from paper at the truck. */}
        <button
          onClick={() => openExportModal('logistics')}
          title="Printable load list with a tick box per item"
          className={`${secondaryBtnClass} ml-auto`}
        >
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
        <span className={`text-[11px] ${mutedText}`}>
          Containers <span className={`font-mono ${headingText}`}>{fleet.containerCount}</span>
        </span>
        <span className={`text-[11px] ${mutedText}`}>
          Known weight incl. nested (top level){' '}
          <span className={`font-mono ${headingText}`}>{formatKg(fleet.knownWeightKg)}</span>
          {fleet.topLevelWithUnknownWeight > 0 && (
            <span className={`${unknownText}`}>
              {' '}
              ({fleet.topLevelWithUnknownWeight} top-level{' '}
              {fleet.topLevelWithUnknownWeight === 1 ? 'container' : 'containers'} with unknown weights excluded)
            </span>
          )}
        </span>
        <span className={`text-[11px] ${mutedText}`}>
          Items without weight{' '}
          <span className={`font-mono ${headingText}`}>{fleet.unknownWeightItemCount}</span>
        </span>
      </section>

      {/* Pack equipment — the manifest is already derived; nobody types it twice */}
      <section className={`rounded-xl border p-2.5 flex flex-col gap-2 ${surfaceClass}`}>
        {sectionHeading(<Wand2 className="w-3.5 h-3.5" />, 'Pack equipment', packSource.length)}
        <p className={`text-[10px] ${mutedText}`}>
          Creates a packed item per line of the equipment list, with the weight the fixture
          catalogue knows. Gear it has no weight for is packed with none, so the container total
          says "unknown" instead of quietly reading light. Re-run it after the scene changes: it
          rewrites the rows it made and never touches anything you packed by hand.
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={packScope}
            onChange={(e) => setPackScope(e.target.value as PackScope)}
            aria-label="Equipment scope to pack"
            className={`${inputClass} !w-auto`}
          >
            <option value="scene">This scene ({activeSetup.name})</option>
            <option value="production">Whole production (peak quantities)</option>
          </select>
          <select
            value={packTargetId}
            onChange={(e) => setPackTargetId(e.target.value)}
            aria-label="Container the packed equipment goes into"
            className={`${inputClass} !w-auto max-w-[180px]`}
          >
            <option value="">Into: Unassigned</option>
            {containers.map((c) => (
              <option key={c.id} value={c.id}>
                Into: {containerLabel(c)}
              </option>
            ))}
          </select>
          <button
            onClick={packEquipment}
            disabled={packSource.length === 0}
            title="Create packed items from the derived equipment list"
            aria-label="Pack equipment from the derived equipment list"
            className={primaryBtnClass}
          >
            <Wand2 className="w-3.5 h-3.5" />
            Pack
          </button>
        </div>
        {packReport && <p className={`text-[10px] ${mutedText}`}>{packReport}</p>}
      </section>

      {/* Containers */}
      <section className={`rounded-xl border p-2.5 flex flex-col gap-2 ${surfaceClass}`}>
        {sectionHeading(<Package className="w-3.5 h-3.5" />, 'Containers', containers.length)}
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                addContainer(newKind, newName, newParentId || undefined);
                setNewName('');
                setNewParentId('');
              }
            }}
            placeholder={`New container name (default "${KIND_LABELS[newKind]}")`}
            aria-label="New container name"
            className={`${inputClass} flex-1 min-w-[140px]`}
          />
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as LogisticsContainerKind)}
            aria-label="New container kind"
            className={`${inputClass} !w-auto`}
          >
            {CONTAINER_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <select
            value={newParentId}
            onChange={(e) => setNewParentId(e.target.value)}
            aria-label="Parent container for new container"
            className={`${inputClass} !w-auto max-w-[180px]`}
          >
            <option value="">Top level</option>
            {containers.map((c) => (
              <option key={c.id} value={c.id}>
                In: {containerLabel(c)}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              addContainer(newKind, newName, newParentId || undefined);
              setNewName('');
              setNewParentId('');
            }}
            title="Add container"
            aria-label="Add container"
            className={primaryBtnClass}
          >
            <Plus className="w-3.5 h-3.5" />
            Container
          </button>
        </div>
        {containers.length === 0 && (
          <p className={`text-[11px] ${mutedText}`}>
            No containers yet — add cases, carts or vehicles above.
          </p>
        )}
        {hiddenByDayFilter > 0 && (
          <p className={`text-[10px] ${mutedText}`}>
            Showing {dayLabel(dayFilterId)} — {hiddenByDayFilter}{' '}
            {hiddenByDayFilter === 1 ? 'container is' : 'containers are'} routed to another day and
            hidden. Containers with no day set stay listed.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {rootContainers.map((c) => renderContainerCard(c, 0, new Set([c.id])))}
        </div>
      </section>

      {/* Unassigned pool — items not inside any known container */}
      <section className={`rounded-xl border p-2.5 flex flex-col gap-2 ${surfaceClass}`}>
        {sectionHeading(<Box className="w-3.5 h-3.5" />, 'Unassigned items', unassignedItems.length)}
        <p className={`text-[10px] ${mutedText}`}>
          Gear not packed into any container (or whose container was deleted). Assign a
          container via the dropdown on each row.
        </p>
        {unassignedItems.length === 0 && (
          <p className={`text-[11px] ${mutedText}`}>Everything is packed.</p>
        )}
        {unassignedItems.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {unassignedItems.map((item) => renderItemRow(item, 'unassigned pool'))}
          </ul>
        )}
        {renderAddItemForm(UNASSIGNED_CONTAINER_ID, 'unassigned pool')}
      </section>

      {/* Safety note (plan §24) — rendered exactly once at the bottom */}
      <div
        className={`rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed flex items-start gap-2 ${
          isLight ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-950/40 border-amber-800 text-amber-200'
        }`}
      >
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <p>{SAFETY_NOTE}</p>
      </div>
    </div>
  );
};
