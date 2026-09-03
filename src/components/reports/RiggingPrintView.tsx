import React from 'react';
import { ProjectImage } from '../common/ProjectImage';
import {
  SAFETY_DISCLAIMER,
  calculateTrussLoad,
  evaluateTrussCapacity,
  resolveSuspendedLoadWeights,
  riggingLoadOptions,
  type RiggingAssumptions,
  type TrussCapacityVerdict,
} from '../../domain/rigging';
import { getFixtureCatalog } from '../../domain/fixtures';
import type { FixtureProfile } from '../../domain/fixtures';
import type { Project } from '../../types';

export interface PrintableSuspendedLoad {
  label: string;
  quantity: number;
  /** Per-unit weight; undefined stays unknown and prints as "—" (rule 13). */
  weightKg?: number;
  /** Combined weight for the row; undefined whenever the unit weight is. */
  lineWeightKg?: number;
  /** Where the weight came from — a rigger checks manual figures differently. */
  sourceLabel: string;
}

export interface PrintableRiggingHardware {
  kindLabel: string;
  label?: string;
  /** Distance along the run from its origin, in mm. */
  positionMm?: number;
  /** Rated capacity for motors and hang points. */
  capacityKg?: number;
  notes?: string;
}

export interface PrintableTrussRun {
  id: string;
  /** Element label, falling back to the profile name, then a generic one. */
  name: string;
  profileLabel: string;
  geometryLabel?: string;
  /** Length override when set, otherwise the profile length. */
  lengthMm?: number;
  /** True when the length shown is the profile's rather than an override. */
  lengthFromProfile: boolean;
  selfWeightKg: number | null;
  loadsKg: number;
  unknownLoadCount: number;
  /** Clamp + safety hardware at the project's assumed per-item weights. */
  clampsKg: number;
  clampCount: number;
  safetyCount: number;
  /** The flat cable allowance on this run; undefined when none is set. */
  cableAllowanceKg?: number;
  totalKg: number | null;
  capacity: TrussCapacityVerdict;
  loads: PrintableSuspendedLoad[];
  hardware: PrintableRiggingHardware[];
}

export interface RiggingPrintViewProps {
  productionTitle: string;
  company?: string;
  /** Production logo (data URL or asset id) shown top-right of the masthead. */
  logo?: string;
  runs: PrintableTrussRun[];
  /** Hardware attached to no truss run — it still has to be packed and hung. */
  unassignedHardware: PrintableRiggingHardware[];
  /**
   * The hardware weights the totals were built on. Printed in full: a rigger
   * who disagrees with 0.5 kg a clamp has to be able to see that figure, not
   * infer it from a total.
   */
  assumptions: RiggingAssumptions;
}

const KIND_LABELS: Record<string, string> = {
  motor: 'Motor',
  hang_point: 'Hang point',
  drop: 'Drop',
  clamp: 'Clamp',
  safety: 'Safety',
  bridle: 'Bridle',
  note: 'Note',
};

const GEOMETRY_LABELS: Record<string, string> = {
  box: 'Box',
  triangle: 'Triangle',
  ladder: 'Ladder',
  other: 'Other',
};

const SOURCE_LABELS: Record<string, string> = {
  // "Profile" was ambiguous next to the truss profile column; a weight that
  // came out of the fixture database is a catalogue figure.
  profile: 'Catalogue',
  manual: 'Manual',
  unknown: 'Unknown',
};

/** "12.5 kg" / "—" for anything unknown. A blank cell is never printed as 0. */
const formatKg = (kg: number | null | undefined): string =>
  kg === null || kg === undefined ? '—' : `${Number(kg.toFixed(2))} kg`;

const formatMm = (mm: number | undefined): string =>
  mm === undefined ? '—' : `${Math.round(mm)} mm`;

const formatPercent = (fraction: number | null): string =>
  fraction === null ? '—' : `${Math.round(fraction * 100)}%`;

/** The one line a rigger reads first, so it says why a verdict is missing. */
const verdictText = (capacity: TrussCapacityVerdict): string => {
  if (capacity.verdict === 'over') {
    return `OVER CAPACITY — ${formatPercent(capacity.utilization)} of ${formatKg(capacity.capacityKg)}`;
  }
  if (capacity.verdict === 'within') {
    return `Within capacity — ${formatPercent(capacity.utilization)} of ${formatKg(capacity.capacityKg)}`;
  }
  if (capacity.pointCount === 0) return 'No verdict — no motors or hang points recorded';
  if (capacity.unknownCapacityPointCount > 0) {
    return `No verdict — ${capacity.unknownCapacityPointCount} of ${capacity.pointCount} rigging points have no rated capacity`;
  }
  return 'No verdict — planned load unknown (truss self-weight missing)';
};

/**
 * Self-contained printable rigging plot: every truss run with its suspended
 * loads, its hardware, and the load/capacity verdict from the rigging domain.
 * Render inside a `.rigging-print-host` container: off-screen on screen, the
 * only visible document in print media.
 *
 * Unknown figures print as "—" throughout. A rigger reading this on a ladder
 * must be able to tell "nobody entered this" from "this weighs nothing", so
 * nothing here rounds an absent value down to zero (rule 13).
 */
export const RiggingPrintView: React.FC<RiggingPrintViewProps> = ({
  productionTitle,
  company,
  logo,
  runs,
  unassignedHardware,
  assumptions,
}) => {
  const generatedAt = new Intl.DateTimeFormat('en-CA').format(new Date());
  const overCount = runs.filter((run) => run.capacity.verdict === 'over').length;
  const unknownCount = runs.filter((run) => run.capacity.verdict === 'unknown').length;

  return (
    <>
      <style>{`
        .rigging-print-host {
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
          .rigging-print-host { position: static !important; left: 0 !important; width: auto !important; }
        }
        .rg-doc { padding: 6mm 4mm; color: #0f172a; background: #fff; font-size: 10.5px; line-height: 1.35; }
        .rg-doc * { box-sizing: border-box; }
        .rg-masthead { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: stretch; border-bottom: 3px solid #0f172a; padding-bottom: 8px; margin-bottom: 4px; }
        .rg-kicker { font-size: 9px; letter-spacing: 2.5px; text-transform: uppercase; color: #0e7490; font-weight: 700; margin: 0 0 3px; }
        .rg-title { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; line-height: 1.05; letter-spacing: -0.3px; }
        .rg-company { font-size: 9px; color: #475569; margin: 4px 0 0; }
        .rg-meta { text-align: right; font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
        .rg-logo { max-width: 42mm; max-height: 16mm; object-fit: contain; margin-bottom: 4px; }
        .rg-run { margin-top: 14px; page-break-inside: avoid; break-inside: avoid; }
        .rg-run-head { display: flex; justify-content: space-between; gap: 10px; background: #0f172a; color: #fff; padding: 5px 8px; page-break-after: avoid; break-after: avoid; }
        .rg-run-name { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; }
        .rg-run-facts { font-size: 9px; font-family: 'Courier New', monospace; font-weight: 700; }
        .rg-sub { font-size: 9px; letter-spacing: 1.2px; text-transform: uppercase; color: #475569; font-weight: 700; margin: 8px 0 3px; page-break-after: avoid; break-after: avoid; }
        .rg-table { width: 100%; border-collapse: collapse; font-size: 10px; }
        .rg-table th, .rg-table td { border: 1px solid #cbd5e1; padding: 3.5px 6px; text-align: left; vertical-align: top; }
        .rg-table th { background: #f1f5f9; text-transform: uppercase; font-size: 8px; letter-spacing: 0.8px; color: #475569; }
        .rg-table td.num, .rg-table th.num { text-align: right; white-space: nowrap; font-family: 'Courier New', monospace; }
        .rg-total-row td { font-weight: 700; background: #f8fafc; }
        .rg-verdict { margin-top: 5px; padding: 4px 8px; font-size: 10px; font-weight: 700; border: 1.5px solid #94a3b8; background: #f8fafc; }
        .rg-verdict.over { border-color: #b91c1c; background: #fee2e2; color: #7f1d1d; }
        .rg-verdict.unknown { border-color: #b45309; background: #fffbeb; color: #7c2d12; }
        .rg-note { border: 1.5px solid #b45309; background: #fffbeb; padding: 6px 10px; font-size: 10px; margin-top: 12px; page-break-inside: avoid; break-inside: avoid; }
        .rg-note p { margin: 0 0 3px; }
        .rg-note p:last-child { margin-bottom: 0; }
        .rg-footer { margin-top: 14px; border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 8.5px; color: #475569; display: flex; justify-content: space-between; gap: 10px; }
        .rg-footer p { margin: 0; }
      `}</style>
      <div className="rg-doc">
        <header className="rg-masthead">
          <div>
            <p className="rg-kicker">{company ? `${company} · ` : ''}Rigging plot · Truss loads</p>
            <h1 className="rg-title">{productionTitle}</h1>
            <p className="rg-company">
              {runs.length} truss run{runs.length === 1 ? '' : 's'} · generated {generatedAt}
            </p>
          </div>
          <div className="rg-meta">
            {logo && <ProjectImage imageRef={logo} alt="Production logo" className="rg-logo" />}
            <div>Runs over capacity</div>
            <div style={{ fontSize: 20, color: overCount > 0 ? '#b91c1c' : '#0f172a', fontFamily: "'Courier New', monospace" }}>
              {overCount}
            </div>
            <div>{unknownCount} without a verdict</div>
          </div>
        </header>

        {runs.length === 0 && <p>No truss runs planned yet.</p>}

        {runs.map((run) => (
          <section key={run.id} className="rg-run">
            <div className="rg-run-head">
              <span className="rg-run-name">{run.name}</span>
              <span className="rg-run-facts">
                {run.profileLabel}
                {run.geometryLabel ? ` · ${run.geometryLabel}` : ''} · {formatMm(run.lengthMm)}
                {run.lengthFromProfile && run.lengthMm !== undefined ? ' (profile)' : ''}
              </span>
            </div>

            <p className="rg-sub">Suspended loads</p>
            <table className="rg-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num" style={{ width: '12mm' }}>Qty</th>
                  <th className="num" style={{ width: '22mm' }}>Unit</th>
                  <th className="num" style={{ width: '22mm' }}>Line</th>
                  <th style={{ width: '20mm' }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {run.loads.length === 0 && (
                  <tr>
                    <td colSpan={5}>No loads recorded on this run.</td>
                  </tr>
                )}
                {run.loads.map((load, i) => (
                  <tr key={`load-${i}`}>
                    <td>{load.label.trim() || 'Unnamed load'}</td>
                    <td className="num">{load.quantity}</td>
                    <td className="num">{formatKg(load.weightKg)}</td>
                    <td className="num">{formatKg(load.lineWeightKg)}</td>
                    <td>{load.sourceLabel}</td>
                  </tr>
                ))}
                <tr className="rg-total-row">
                  <td colSpan={3}>
                    Known loads
                    {run.unknownLoadCount > 0
                      ? ` (${run.unknownLoadCount} without a weight — not counted)`
                      : ''}
                  </td>
                  <td className="num">{formatKg(run.loadsKg)}</td>
                  <td />
                </tr>
                <tr className="rg-total-row">
                  <td colSpan={3}>Truss self-weight</td>
                  <td className="num">{formatKg(run.selfWeightKg)}</td>
                  <td />
                </tr>
                <tr className="rg-total-row">
                  <td colSpan={3}>
                    Clamps ({run.clampCount}) + safeties ({run.safetyCount}) at assumed weights
                  </td>
                  <td className="num">{formatKg(run.clampsKg)}</td>
                  <td />
                </tr>
                <tr className="rg-total-row">
                  <td colSpan={3}>Cable allowance</td>
                  <td className="num">{formatKg(run.cableAllowanceKg)}</td>
                  <td />
                </tr>
                <tr className="rg-total-row">
                  <td colSpan={3}>Planned total on the run</td>
                  <td className="num">{formatKg(run.totalKg)}</td>
                  <td />
                </tr>
              </tbody>
            </table>

            <p className="rg-sub">Rigging hardware</p>
            <table className="rg-table">
              <thead>
                <tr>
                  <th style={{ width: '22mm' }}>Kind</th>
                  <th>Label / note</th>
                  <th className="num" style={{ width: '22mm' }}>Position</th>
                  <th className="num" style={{ width: '24mm' }}>Rated</th>
                </tr>
              </thead>
              <tbody>
                {run.hardware.length === 0 && (
                  <tr>
                    <td colSpan={4}>No hardware recorded on this run.</td>
                  </tr>
                )}
                {run.hardware.map((item, i) => (
                  <tr key={`hw-${i}`}>
                    <td>{item.kindLabel}</td>
                    <td>{[item.label, item.notes].filter(Boolean).join(' — ') || '—'}</td>
                    <td className="num">{formatMm(item.positionMm)}</td>
                    <td className="num">{formatKg(item.capacityKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <p className={`rg-verdict ${run.capacity.verdict === 'within' ? '' : run.capacity.verdict}`}>
              {verdictText(run.capacity)}
            </p>
          </section>
        ))}

        {unassignedHardware.length > 0 && (
          <section className="rg-run">
            <div className="rg-run-head">
              <span className="rg-run-name">Hardware not on a run</span>
              <span className="rg-run-facts">{unassignedHardware.length} ITEM{unassignedHardware.length === 1 ? '' : 'S'}</span>
            </div>
            <table className="rg-table">
              <thead>
                <tr>
                  <th style={{ width: '22mm' }}>Kind</th>
                  <th>Label / note</th>
                  <th className="num" style={{ width: '24mm' }}>Rated</th>
                </tr>
              </thead>
              <tbody>
                {unassignedHardware.map((item, i) => (
                  <tr key={`loose-${i}`}>
                    <td>{item.kindLabel}</td>
                    <td>{[item.label, item.notes].filter(Boolean).join(' — ') || '—'}</td>
                    <td className="num">{formatKg(item.capacityKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <div className="rg-note">
          <p>{SAFETY_DISCLAIMER}</p>
          <p>
            <strong>What the planned total contains:</strong> truss self-weight, the suspended
            loads listed above, the clamp and safety hardware on the run, and the cable allowance —
            each shown as its own row so the sum can be checked. Earlier versions of this sheet
            excluded the hardware and cable figures, so a total here reads higher than the same run
            did before.
          </p>
          <p>
            Hardware weights are assumptions set in the Rigging panel and stored with the project:
            clamp {formatKg(assumptions.clampWeightKg)}, safety {formatKg(assumptions.safetyWeightKg)},
            cable allowance {formatKg(assumptions.cableAllowanceKg)} per run. Verify them against
            the actual hardware; a blank one counts nothing rather than guessing.
          </p>
          <p>
            Capacity verdicts compare the planned total against the combined rating of the motors
            and hang points on the run. They assume nothing about how the load is shared between
            points, bridle angles or dynamic factors — a rigger judges those on site.
          </p>
        </div>

        <footer className="rg-footer">
          <p>Generated from project data · {generatedAt}</p>
          <p>Unknown values print as "—" and are never counted as zero.</p>
        </footer>
      </div>
    </>
  );
};

/**
 * Map a project onto the printable rigging plot, so a caller only ever writes
 * `<RiggingPrintView {...buildRiggingPrintModel(project)} />`.
 *
 * The load figures come from `calculateTrussLoad` and `evaluateTrussCapacity`
 * rather than being recomputed here (rule 4), which is what keeps the paper
 * and the panel telling the same story. For the same reason the sheet reads
 * the catalogue weight of a profile-linked load and the project's hardware
 * assumptions: anything the panel counts, the paper counts.
 *
 * The fixture catalogue defaults to the live one so the single call site needs
 * no plumbing; a test (or a future caller with its own snapshot) can pass one.
 */
export const buildRiggingPrintModel = (
  project: Project,
  options: { fixtureProfiles?: readonly FixtureProfile[] } = {},
): RiggingPrintViewProps => {
  const profiles = project.trussProfiles ?? [];
  const elements = project.trussElements ?? [];
  const items = project.riggingItems ?? [];
  const assumptions = riggingLoadOptions(project.riggingAssumptions);

  const fixtureProfiles = options.fixtureProfiles ?? getFixtureCatalog().profiles;
  const fixtureById = new Map(fixtureProfiles.map((profile) => [profile.id, profile]));
  const loads = resolveSuspendedLoadWeights(project.suspendedLoads ?? [], (id) =>
    fixtureById.get(id),
  );

  const profileLabel = (profileId: string | undefined): string => {
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return 'Unknown profile';
    const bits = [profile.manufacturer, profile.model].filter(Boolean);
    return bits.length > 0 ? bits.join(' ') : 'Unnamed profile';
  };

  const toHardware = (kind: string, label?: string, positionMm?: number, capacityKg?: number, notes?: string): PrintableRiggingHardware => ({
    kindLabel: KIND_LABELS[kind] ?? kind,
    label,
    positionMm,
    capacityKg,
    notes,
  });

  const runs: PrintableTrussRun[] = elements.map((element) => {
    const profile = profiles.find((p) => p.id === element.profileId);
    const breakdown = calculateTrussLoad(element, profile, loads, items, assumptions);
    const capacity = evaluateTrussCapacity(breakdown, items);
    const lengthMm = element.lengthOverrideMm ?? profile?.lengthMm;

    return {
      id: element.id,
      name: element.label?.trim() || profileLabel(element.profileId) || 'Truss section',
      profileLabel: profileLabel(element.profileId),
      geometryLabel: profile ? GEOMETRY_LABELS[profile.geometry] ?? profile.geometry : undefined,
      lengthMm,
      lengthFromProfile: element.lengthOverrideMm === undefined,
      selfWeightKg: breakdown.trussSelfWeightKg,
      loadsKg: breakdown.loadsKg,
      unknownLoadCount: breakdown.unknownLoadCount,
      clampsKg: breakdown.clampsKg,
      clampCount: breakdown.clampCount,
      safetyCount: breakdown.safetyCount,
      cableAllowanceKg: breakdown.cableAllowanceKg,
      totalKg: breakdown.totalKg,
      capacity,
      loads: loads
        .filter((load) => load.trussElementId === element.id)
        .map((load) => ({
          label: load.label,
          quantity: load.quantity,
          weightKg: load.weightKg,
          lineWeightKg:
            load.weightKg === undefined ? undefined : load.weightKg * Math.max(0, load.quantity),
          sourceLabel: SOURCE_LABELS[load.source ?? 'manual'] ?? 'Manual',
        })),
      hardware: items
        .filter((item) => item.trussElementId === element.id)
        .map((item) => toHardware(item.kind, item.label, item.positionMm, item.capacityKg, item.notes)),
    };
  });

  // Hardware whose truss reference is missing would otherwise vanish from the
  // paperwork entirely; it still has to be accounted for on the truck.
  const unassignedHardware = items
    .filter((item) => !elements.some((element) => element.id === item.trussElementId))
    .map((item) => toHardware(item.kind, item.label, item.positionMm, item.capacityKg, item.notes));

  return {
    productionTitle: project.title,
    company: project.productionCompany,
    logo: project.logo,
    runs,
    unassignedHardware,
    assumptions,
  };
};
