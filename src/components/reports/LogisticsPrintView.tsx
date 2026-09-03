import React from 'react';
import { ProjectImage } from '../common/ProjectImage';
import {
  SAFETY_NOTE,
  calculateContainerLoad,
  containerBelongsToDay,
  resolveContainerAssignments,
  type ContainerLoadResult,
  type LogisticsContainer,
} from '../../domain/logistics';
import type { Project } from '../../types';

export interface PrintablePackedItem {
  label: string;
  quantity: number;
  /** Per-unit weight; undefined stays unknown and prints as "—" (rule 13). */
  unitWeightKg?: number;
  /** Combined weight for the row; undefined whenever the unit weight is. */
  lineWeightKg?: number;
  packedVolumeLiters?: number;
  volumeIsEstimate: boolean;
}

export interface PrintableContainer {
  id: string;
  name: string;
  kindLabel: string;
  /** Nesting depth inside its top-level container; 0 for the container itself. */
  depth: number;
  /** Set for nested containers, so a loader knows what to open first. */
  parentName?: string;
  tareWeightKg?: number;
  usableVolumeLiters?: number;
  maxPayloadKg?: number;
  /** "1200 × 800 × 600 mm" when the external dimensions are known. */
  dimensionsLabel?: string;
  notes?: string;
  load: ContainerLoadResult;
  items: PrintablePackedItem[];
  /** Shoot day this container travels on; absent when nothing routes it yet. */
  dayLabel?: string;
  /** Where it is going. */
  locationLabel?: string;
  /** True when the day or location was inherited from the container it sits in. */
  routingInherited: boolean;
}

/** One top-level container and everything nested inside it — a load list per vehicle or case. */
export interface PrintableLoadGroup {
  id: string;
  title: string;
  containers: PrintableContainer[];
}

export interface LogisticsPrintViewProps {
  productionTitle: string;
  company?: string;
  /** Production logo (data URL or asset id) shown top-right of the masthead. */
  logo?: string;
  groups: PrintableLoadGroup[];
  /** Gear packed into nothing yet — it still has to get on a vehicle. */
  unassignedItems: PrintablePackedItem[];
  /**
   * Set when the sheet covers a single shoot day, e.g. "Day 3 · Warehouse".
   * Absent means the whole production is on the paper.
   */
  scopeLabel?: string;
  fleet: {
    containerCount: number;
    itemCount: number;
    /**
     * Rolled-up weight of the top-level containers on the sheet — vehicles and
     * everything nested inside them. Containers whose rolled-up weight is
     * unknown are left out entirely and counted in
     * `topLevelWithUnknownWeight`, so this figure is never a partial sum
     * dressed up as a fleet weight.
     */
    knownWeightKg: number;
    topLevelWithUnknownWeight: number;
    unknownWeightItemCount: number;
  };
}

const KIND_LABELS: Record<string, string> = {
  case: 'Case',
  rack: 'Rack',
  cart: 'Cart',
  pallet: 'Pallet',
  van: 'Van',
  truck: 'Truck',
};

/** "12.5 kg" / "—" for anything unknown. A blank cell is never printed as 0. */
const formatKg = (kg: number | null | undefined): string =>
  kg === null || kg === undefined ? '—' : `${Number(kg.toFixed(2))} kg`;

const formatLiters = (liters: number | null | undefined): string =>
  liters === null || liters === undefined ? '—' : `${Number(liters.toFixed(1))} L`;

const formatPercent = (fraction: number | null): string =>
  fraction === null ? '—' : `${Math.round(fraction * 100)}%`;

/**
 * Self-contained printable load list: every container with what is packed in
 * it, its weight and volume against the limits, and the gear still unpacked.
 * Render inside a `.logistics-print-host` container: off-screen on screen, the
 * only visible document in print media.
 *
 * Unknown figures print as "—" throughout. A driver checking an axle load must
 * be able to tell "nobody weighed this" from "this weighs nothing", so nothing
 * here rounds an absent value down to zero (rule 13).
 */
export const LogisticsPrintView: React.FC<LogisticsPrintViewProps> = ({
  productionTitle,
  company,
  logo,
  groups,
  unassignedItems,
  scopeLabel,
  fleet,
}) => {
  const generatedAt = new Intl.DateTimeFormat('en-CA').format(new Date());
  // Judged on the rolled-up weight: a truck goes over its payload because of
  // what is in the cases, not because of what was thrown in loose beside them.
  const overloaded = groups
    .flatMap((group) => group.containers)
    .filter(
      (container) =>
        container.load.rolledUpPayloadUtilization !== null &&
        container.load.rolledUpPayloadUtilization > 1,
    );

  return (
    <>
      <style>{`
        .logistics-print-host {
          position: absolute;
          left: -10000px;
          top: 0;
          width: 190mm;
          background: #ffffff;
          color: #0f172a;
          font-family: Arial, Helvetica, sans-serif;
        }
        @media print {
          body #app-root { display: none !important; }
          .logistics-print-host { position: static !important; left: 0 !important; width: auto !important; }
        }
        .lg-doc { padding: 6mm 4mm; color: #0f172a; background: #fff; font-size: 10.5px; line-height: 1.35; }
        .lg-doc * { box-sizing: border-box; }
        .lg-masthead { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: stretch; border-bottom: 3px solid #0f172a; padding-bottom: 8px; margin-bottom: 4px; }
        .lg-kicker { font-size: 9px; letter-spacing: 2.5px; text-transform: uppercase; color: #0e7490; font-weight: 700; margin: 0 0 3px; }
        .lg-title { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; line-height: 1.05; letter-spacing: -0.3px; }
        .lg-company { font-size: 9px; color: #475569; margin: 4px 0 0; }
        .lg-meta { text-align: right; font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
        .lg-logo { max-width: 42mm; max-height: 16mm; object-fit: contain; margin-bottom: 4px; }
        .lg-summary { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 9.5px; color: #334155; margin: 6px 0 0; }
        .lg-summary span b { font-family: 'Courier New', monospace; }
        .lg-group-head { display: flex; justify-content: space-between; gap: 10px; background: #0f172a; color: #fff; padding: 5px 8px; margin: 14px 0 0; page-break-after: avoid; break-after: avoid; }
        .lg-group-name { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; }
        .lg-group-facts { font-size: 9px; font-family: 'Courier New', monospace; font-weight: 700; }
        .lg-container { margin-top: 8px; page-break-inside: avoid; break-inside: avoid; }
        .lg-container-head { display: flex; justify-content: space-between; gap: 10px; border-bottom: 1.5px solid #0f172a; padding-bottom: 2px; margin-bottom: 3px; page-break-after: avoid; break-after: avoid; }
        .lg-container-name { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.6px; }
        .lg-container-specs { font-size: 9px; color: #475569; font-family: 'Courier New', monospace; }
        .lg-routing { font-size: 9px; color: #334155; margin: 0 0 3px; }
        .lg-table { width: 100%; border-collapse: collapse; font-size: 10px; }
        .lg-table th, .lg-table td { border: 1px solid #cbd5e1; padding: 3.5px 6px; text-align: left; vertical-align: top; }
        .lg-table th { background: #f1f5f9; text-transform: uppercase; font-size: 8px; letter-spacing: 0.8px; color: #475569; }
        .lg-table td.num, .lg-table th.num { text-align: right; white-space: nowrap; font-family: 'Courier New', monospace; }
        .lg-table td.tick { width: 8mm; text-align: center; font-family: 'Courier New', monospace; color: #94a3b8; }
        .lg-total-row td { font-weight: 700; background: #f8fafc; }
        .lg-est { font-size: 7.5px; letter-spacing: 0.5px; text-transform: uppercase; font-weight: 700; color: #b45309; }
        .lg-verdict { margin-top: 4px; padding: 4px 8px; font-size: 10px; font-weight: 700; border: 1.5px solid #94a3b8; background: #f8fafc; }
        .lg-verdict.over { border-color: #b91c1c; background: #fee2e2; color: #7f1d1d; }
        .lg-verdict.unknown { border-color: #b45309; background: #fffbeb; color: #7c2d12; }
        .lg-note { border: 1.5px solid #b45309; background: #fffbeb; padding: 6px 10px; font-size: 10px; margin-top: 12px; page-break-inside: avoid; break-inside: avoid; }
        .lg-note p { margin: 0 0 3px; }
        .lg-note p:last-child { margin-bottom: 0; }
        .lg-footer { margin-top: 14px; border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 8.5px; color: #475569; display: flex; justify-content: space-between; gap: 10px; }
        .lg-footer p { margin: 0; }
      `}</style>
      <div className="lg-doc">
        <header className="lg-masthead">
          <div>
            <p className="lg-kicker">
              {company ? `${company} · ` : ''}Logistics · Load list
              {scopeLabel ? ` · ${scopeLabel}` : ''}
            </p>
            <h1 className="lg-title">{productionTitle}</h1>
            <p className="lg-company">
              {scopeLabel ? `${scopeLabel} · ` : ''}
              {fleet.containerCount} container{fleet.containerCount === 1 ? '' : 's'} ·{' '}
              {fleet.itemCount} packed item{fleet.itemCount === 1 ? '' : 's'} · generated {generatedAt}
            </p>
            <div className="lg-summary">
              <span>
                Known weight incl. nested (top level) <b>{formatKg(fleet.knownWeightKg)}</b>
              </span>
              <span>
                Items without a weight <b>{fleet.unknownWeightItemCount}</b>
              </span>
              <span>
                Top-level containers with unknown weight <b>{fleet.topLevelWithUnknownWeight}</b>
              </span>
            </div>
          </div>
          <div className="lg-meta">
            {logo && <ProjectImage imageRef={logo} alt="Production logo" className="lg-logo" />}
            <div>Over payload</div>
            <div style={{ fontSize: 20, color: overloaded.length > 0 ? '#b91c1c' : '#0f172a', fontFamily: "'Courier New', monospace" }}>
              {overloaded.length}
            </div>
          </div>
        </header>

        {groups.length === 0 && <p>No containers packed yet.</p>}

        {groups.map((group) => (
          <section key={group.id}>
            <div className="lg-group-head">
              <span className="lg-group-name">{group.title}</span>
              <span className="lg-group-facts">
                {group.containers.length} CONTAINER{group.containers.length === 1 ? '' : 'S'}
              </span>
            </div>
            {group.containers.map((container) => (
              <div
                key={container.id}
                className="lg-container"
                style={{ marginLeft: container.depth * 6 }}
              >
                <div className="lg-container-head">
                  <span className="lg-container-name">
                    {container.kindLabel} · {container.name}
                    {container.parentName ? ` (in ${container.parentName})` : ''}
                  </span>
                  <span className="lg-container-specs">
                    TARE {formatKg(container.tareWeightKg)} · MAX {formatKg(container.maxPayloadKg)} ·{' '}
                    {formatLiters(container.usableVolumeLiters)}
                    {container.dimensionsLabel ? ` · ${container.dimensionsLabel}` : ''}
                  </span>
                </div>
                {/* Where this box is going — the two facts a driver reads first. */}
                <p className="lg-routing">
                  Day: <b>{container.dayLabel ?? 'not routed'}</b> · To:{' '}
                  <b>{container.locationLabel ?? 'not set'}</b>
                  {container.routingInherited && container.parentName
                    ? ` (travels with ${container.parentName})`
                    : ''}
                </p>
                <table className="lg-table">
                  <thead>
                    <tr>
                      <th className="tick" />
                      <th>Item</th>
                      <th className="num" style={{ width: '12mm' }}>Qty</th>
                      <th className="num" style={{ width: '20mm' }}>Unit</th>
                      <th className="num" style={{ width: '20mm' }}>Line</th>
                      <th className="num" style={{ width: '22mm' }}>Volume</th>
                    </tr>
                  </thead>
                  <tbody>
                    {container.items.length === 0 && (
                      <tr>
                        <td className="tick" />
                        <td colSpan={5}>Nothing packed in here yet.</td>
                      </tr>
                    )}
                    {container.items.map((item, i) => (
                      <tr key={`item-${i}`}>
                        <td className="tick">☐</td>
                        <td>{item.label.trim() || 'Untitled item'}</td>
                        <td className="num">{item.quantity}</td>
                        <td className="num">{formatKg(item.unitWeightKg)}</td>
                        <td className="num">{formatKg(item.lineWeightKg)}</td>
                        <td className="num">
                          {formatLiters(item.packedVolumeLiters)}
                          {item.volumeIsEstimate && item.packedVolumeLiters !== undefined && (
                            <span className="lg-est"> est.</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    <tr className="lg-total-row">
                      <td className="tick" />
                      <td colSpan={3}>
                        Total incl. tare
                        {container.load.tareUnknown ? ' (tare unknown)' : ''}
                        {container.load.unknownItemCount > 0
                          ? ` · ${container.load.unknownItemCount} item${
                              container.load.unknownItemCount === 1 ? '' : 's'
                            } without a weight`
                          : ''}
                      </td>
                      <td className="num">{formatKg(container.load.totalWeightKg)}</td>
                      <td className="num">
                        {formatLiters(container.load.usedVolumeLiters)}
                        {container.load.volumeIsEstimate && container.load.usedVolumeLiters !== null && (
                          <span className="lg-est"> est.</span>
                        )}
                      </td>
                    </tr>
                    {/* Only worth a line when something is actually nested inside. */}
                    {container.load.nestedContainerCount > 0 && (
                      <tr className="lg-total-row">
                        <td className="tick" />
                        <td colSpan={3}>
                          Total incl. {container.load.nestedContainerCount} nested container
                          {container.load.nestedContainerCount === 1 ? '' : 's'}
                          {container.load.rolledUpTareUnknown ? ' (a tare is unknown)' : ''}
                          {container.load.rolledUpUnknownItemCount > 0
                            ? ` · ${container.load.rolledUpUnknownItemCount} item${
                                container.load.rolledUpUnknownItemCount === 1 ? '' : 's'
                              } without a weight`
                            : ''}
                        </td>
                        <td className="num">{formatKg(container.load.rolledUpWeightKg)}</td>
                        <td className="num">—</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <p
                  className={`lg-verdict ${
                    container.load.rolledUpPayloadUtilization === null
                      ? 'unknown'
                      : container.load.rolledUpPayloadUtilization > 1
                        ? 'over'
                        : ''
                  }`}
                >
                  {container.load.rolledUpPayloadUtilization === null
                    ? 'Payload not checked — weight or payload limit unknown'
                    : `${
                        container.load.rolledUpPayloadUtilization > 1 ? 'OVER PAYLOAD' : 'Within payload'
                      } — ${formatPercent(container.load.rolledUpPayloadUtilization)} of ${formatKg(
                        container.maxPayloadKg,
                      )}${container.load.nestedContainerCount > 0 ? ' incl. nested' : ''}`}
                  {' · Volume '}
                  {container.load.volumeUtilization === null
                    ? 'not checked'
                    : formatPercent(container.load.volumeUtilization)}
                </p>
              </div>
            ))}
          </section>
        ))}

        {unassignedItems.length > 0 && (
          <section>
            <div className="lg-group-head">
              <span className="lg-group-name">Not packed yet</span>
              <span className="lg-group-facts">
                {unassignedItems.length} ITEM{unassignedItems.length === 1 ? '' : 'S'}
              </span>
            </div>
            <table className="lg-table">
              <thead>
                <tr>
                  <th className="tick" />
                  <th>Item</th>
                  <th className="num" style={{ width: '12mm' }}>Qty</th>
                  <th className="num" style={{ width: '20mm' }}>Unit</th>
                  <th className="num" style={{ width: '20mm' }}>Line</th>
                  <th className="num" style={{ width: '22mm' }}>Volume</th>
                </tr>
              </thead>
              <tbody>
                {unassignedItems.map((item, i) => (
                  <tr key={`loose-${i}`}>
                    <td className="tick">☐</td>
                    <td>{item.label.trim() || 'Untitled item'}</td>
                    <td className="num">{item.quantity}</td>
                    <td className="num">{formatKg(item.unitWeightKg)}</td>
                    <td className="num">{formatKg(item.lineWeightKg)}</td>
                    <td className="num">{formatLiters(item.packedVolumeLiters)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <div className="lg-note">
          <p>{SAFETY_NOTE}</p>
          <p>
            Payload and volume checks only appear where both the load and the container limit are
            known; anything else prints as "not checked" rather than as a pass.
          </p>
          <p>
            Where a container holds others, the first total is what is packed directly into it and
            the second is that plus everything nested inside, at any depth. The payload verdict uses
            the second. One unweighed item anywhere in a vehicle leaves its rolled-up total unknown
            rather than short.
          </p>
        </div>

        <footer className="lg-footer">
          <p>Generated from project data · {generatedAt}</p>
          <p>Unknown values print as "—" and are never counted as zero.</p>
        </footer>
      </div>
    </>
  );
};

/** "1200 × 800 × 600 mm", or undefined when no dimension is recorded. */
const dimensionsLabel = (container: LogisticsContainer): string | undefined => {
  const dims = container.externalDimensions;
  if (!dims) return undefined;
  const { widthMm, heightMm, depthMm } = dims;
  if (widthMm === undefined && heightMm === undefined && depthMm === undefined) return undefined;
  const part = (mm: number | undefined) => (mm === undefined ? '—' : String(Math.round(mm)));
  return `${part(widthMm)} × ${part(heightMm)} × ${part(depthMm)} mm`;
};

/**
 * Map a project onto the printable load list, so a caller only ever writes
 * `<LogisticsPrintView {...buildLogisticsPrintModel(project)} />`.
 *
 * Weights and volumes come from `calculateContainerLoad` rather than being
 * recomputed here (rule 4), which is what keeps the paper and the panel
 * telling the same story.
 */
export const buildLogisticsPrintModel = (
  project: Project,
  options: { productionDayId?: string } = {},
): LogisticsPrintViewProps => {
  const allContainers = project.logisticsContainers ?? [];
  const items = project.packedItems ?? [];
  const assignments = resolveContainerAssignments(allContainers);

  // The day comes from the caller when one is given, otherwise from the scope
  // the user set in the panel — printing what is on screen is the whole point.
  const dayId = options.productionDayId ?? project.logisticsDayFilterId;
  const day = dayId ? project.productionDays?.find((candidate) => candidate.id === dayId) : undefined;
  // A filter pointing at a day that has since been deleted must not silently
  // print the whole production as if it were that day; with no day found the
  // scope falls away and the sheet says so by carrying no scope label.
  const scopeDayId = day ? day.id : undefined;

  const containers = allContainers.filter((container) =>
    containerBelongsToDay(assignments.get(container.id), scopeDayId),
  );

  const dayName = (id: string | undefined): string | undefined => {
    const found = id ? project.productionDays?.find((candidate) => candidate.id === id) : undefined;
    if (!found) return undefined;
    return found.date ? `${found.name} · ${found.date}` : found.name;
  };
  const locationName = (id: string | undefined): string | undefined =>
    id ? project.locations?.find((candidate) => candidate.id === id)?.name : undefined;

  const toItem = (item: (typeof items)[number]): PrintablePackedItem => ({
    label: item.label,
    quantity: item.quantity,
    unitWeightKg: item.unitWeightKg,
    lineWeightKg:
      item.unitWeightKg === undefined ? undefined : item.unitWeightKg * Math.max(0, item.quantity),
    packedVolumeLiters:
      item.packedVolumeLiters === undefined
        ? undefined
        : item.packedVolumeLiters * Math.max(0, item.quantity),
    volumeIsEstimate: item.volumeIsEstimate ?? false,
  });

  const toContainer = (container: LogisticsContainer, depth: number): PrintableContainer => {
    const parent = allContainers.find((c) => c.id === container.parentContainerId);
    const assignment = assignments.get(container.id);
    return {
      id: container.id,
      name: container.name,
      kindLabel: KIND_LABELS[container.kind] ?? container.kind,
      depth,
      parentName: parent ? `${KIND_LABELS[parent.kind] ?? parent.kind} · ${parent.name}` : undefined,
      tareWeightKg: container.tareWeightKg,
      usableVolumeLiters: container.usableVolumeLiters,
      maxPayloadKg: container.maxPayloadKg,
      dimensionsLabel: dimensionsLabel(container),
      notes: container.notes,
      // Rolled up over every container in the project, not just the ones on
      // this sheet: a day filter changes what is printed, never what a truck
      // physically weighs.
      load: calculateContainerLoad(container, items, allContainers),
      items: items.filter((item) => item.containerId === container.id).map(toItem),
      dayLabel: dayName(assignment?.productionDayId),
      locationLabel: locationName(assignment?.locationId),
      routingInherited: (assignment?.dayInherited ?? false) || (assignment?.locationInherited ?? false),
    };
  };

  /**
   * Depth-first so the paper reads in the order gear is loaded: the vehicle,
   * then the cases inside it. `visited` guards the same reference cycle the
   * panel guards — a container that somehow ends up its own ancestor must not
   * hang the export.
   */
  const flatten = (
    container: LogisticsContainer,
    depth: number,
    visited: Set<string>,
  ): PrintableContainer[] => {
    const rows = [toContainer(container, depth)];
    for (const child of containers.filter((c) => c.parentContainerId === container.id)) {
      if (visited.has(child.id)) continue;
      rows.push(...flatten(child, depth + 1, new Set([...visited, child.id])));
    }
    return rows;
  };

  // Roots: no parent, or a parent that no longer exists — an orphaned case
  // still has to be loaded, so it gets its own group rather than disappearing.
  const roots = containers.filter(
    (c) => !c.parentContainerId || !containers.some((p) => p.id === c.parentContainerId),
  );

  const groups: PrintableLoadGroup[] = roots.map((root) => ({
    id: root.id,
    title: `${KIND_LABELS[root.kind] ?? root.kind} · ${root.name}`,
    containers: flatten(root, 0, new Set([root.id])),
  }));

  const rootLoads = roots.map((root) => calculateContainerLoad(root, items, allContainers));
  const knownWeightKg = rootLoads.reduce(
    (sum, load) => (load.rolledUpWeightKg === null ? sum : sum + load.rolledUpWeightKg),
    0,
  );

  // Items on this sheet: everything when unscoped, otherwise only what sits in
  // a container that made the cut, plus the gear in no container at all.
  const printedItems = items.filter(
    (item) => !allContainers.some((c) => c.id === item.containerId) || containers.some((c) => c.id === item.containerId),
  );

  // Name the destination in the masthead when the day has one; several
  // destinations get counted rather than listed, so the line stays readable.
  const scopeLocations = [
    ...new Set(
      containers
        .map((container) => locationName(assignments.get(container.id)?.locationId))
        .filter((name): name is string => Boolean(name)),
    ),
  ];
  const scopeLabel = day
    ? [
        dayName(day.id),
        scopeLocations.length > 2 ? `${scopeLocations.length} locations` : scopeLocations.join(' · '),
      ]
        .filter(Boolean)
        .join(' · ')
    : undefined;

  return {
    productionTitle: project.title,
    company: project.productionCompany,
    logo: project.logo,
    groups,
    unassignedItems: items
      .filter((item) => !allContainers.some((c) => c.id === item.containerId))
      .map(toItem),
    scopeLabel,
    fleet: {
      containerCount: containers.length,
      itemCount: printedItems.length,
      knownWeightKg,
      topLevelWithUnknownWeight: rootLoads.filter((load) => load.rolledUpWeightKg === null).length,
      unknownWeightItemCount: printedItems.filter(
        (item) => item.unitWeightKg === undefined || item.unitWeightKg === null,
      ).length,
    },
  };
};
