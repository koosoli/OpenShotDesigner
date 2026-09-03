import React from 'react';
import { ProjectImage } from '../common/ProjectImage';
import {
  POWER_DISCLAIMER,
  calculatePowerLoad,
  circuitHeadroom,
  derivePlanConsumers,
  phaseBalance,
  sourceLoad,
  type PlanPowerConsumer,
  type PowerEstimateSource,
} from '../../domain/power';
import type { LightElement, Project } from '../../types';
import type { FixtureProfile } from '../../domain/fixtures';

export interface PrintablePowerConsumer {
  name: string;
  quantity: number;
  /** Total watts for the quantity; null when the fixture's draw is unknown. */
  watts: number | null;
  /** Where the number came from, so a catalogue figure is not mistaken for a typed one. */
  wattsSource: PowerEstimateSource;
  circuitName?: string;
  trussLabel?: string;
  distroZone?: string;
}

export interface PrintablePowerCircuit {
  name: string;
  sourceName?: string;
  maxAmperesA?: number;
  phaseLeg?: 1 | 2 | 3;
  powerFactor: number;
  watts: number;
  usedA: number | null;
  headroomA: number | null;
  overloaded: boolean | null;
}

export interface PrintablePowerSource {
  name: string;
  kind: string;
  voltageV?: number;
  ampsPerPhaseA?: number;
  phases?: 1 | 3;
  knownWatts: number;
  apparentVA: number | null;
  capacityVA: number | null;
  overCapacity: boolean | null;
  legs: Array<{ leg: 1 | 2 | 3; watts: number; ampsA: number | null }>;
}

export interface PowerPrintViewProps {
  productionTitle: string;
  company?: string;
  logo?: string;
  sceneName?: string;
  consumers: PrintablePowerConsumer[];
  circuits: PrintablePowerCircuit[];
  sources: PrintablePowerSource[];
  /** Null when the domain could not total anything at all — never printed as 0. */
  totalKnownWatts: number | null;
  unknownConsumerCount: number;
}

const formatWatts = (watts: number | null): string =>
  watts === null ? '—' : `${Math.round(watts).toLocaleString()} W`;

const formatAmps = (amps: number | null): string =>
  amps === null ? '—' : `${amps.toFixed(1)} A`;

const formatVA = (va: number | null): string =>
  va === null ? '—' : `${Math.round(va).toLocaleString()} VA`;

/**
 * Self-contained printable power plan — the distro sheet a gaffer or a sparks
 * takes to the floor, where there is no laptop.
 *
 * Render inside a `.power-print-host` container: off-screen on screen, the
 * only visible document in print media.
 *
 * Unknowns print as "—" and are counted, never quietly rendered as 0. A sheet
 * that says "3 fixtures with no wattage" is useful; one that silently totals
 * them as nothing is dangerous, because the number it prints looks complete.
 */
export const PowerPrintView: React.FC<PowerPrintViewProps> = ({
  productionTitle,
  company,
  logo,
  sceneName,
  consumers,
  circuits,
  sources,
  totalKnownWatts,
  unknownConsumerCount,
}) => {
  const generatedAt = new Intl.DateTimeFormat('en-CA').format(new Date());

  return (
    <>
      <style>{`
        .power-print-host {
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
          .power-print-host { position: static !important; left: 0 !important; width: auto !important; }
        }
        .pw-doc { padding: 6mm 4mm; color: #0f172a; background: #fff; font-size: 10.5px; line-height: 1.35; }
        .pw-doc * { box-sizing: border-box; }
        .pw-masthead { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: stretch; border-bottom: 3px solid #0f172a; padding-bottom: 8px; margin-bottom: 4px; }
        .pw-kicker { font-size: 9px; letter-spacing: 2.5px; text-transform: uppercase; color: #b45309; font-weight: 700; margin: 0 0 3px; }
        .pw-title { font-size: 24px; font-weight: 900; text-transform: uppercase; margin: 0; line-height: 1.05; letter-spacing: -0.3px; }
        .pw-company { font-size: 9px; color: #475569; margin: 4px 0 0; }
        .pw-meta { text-align: right; font-size: 9px; color: #64748b; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
        .pw-logo { max-width: 42mm; max-height: 16mm; object-fit: contain; margin-bottom: 4px; }
        .pw-head { background: #0f172a; color: #fff; padding: 5px 8px; margin: 14px 0 0; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.8px; page-break-after: avoid; break-after: avoid; }
        .pw-table { width: 100%; border-collapse: collapse; font-size: 10px; }
        .pw-table th, .pw-table td { border: 1px solid #cbd5e1; padding: 3.5px 6px; text-align: left; vertical-align: top; }
        .pw-table th { background: #f1f5f9; text-transform: uppercase; font-size: 8px; letter-spacing: 0.8px; color: #475569; }
        .pw-table td.num, .pw-table th.num { text-align: right; white-space: nowrap; font-family: 'Courier New', monospace; }
        .pw-over { color: #b91c1c; font-weight: 900; }
        .pw-unknown { color: #92400e; font-weight: 700; }
        .pw-note { font-size: 8.5px; color: #475569; margin: 5px 0 0; }
        .pw-footer { margin-top: 14px; border-top: 1px solid #94a3b8; padding-top: 5px; font-size: 8.5px; color: #475569; }
        .pw-footer p { margin: 0 0 2px; }
      `}</style>
      <div className="pw-doc">
        <header className="pw-masthead">
          <div>
            <p className="pw-kicker">{company ? `${company} · ` : ''}Power &amp; distribution</p>
            <h1 className="pw-title">{productionTitle}</h1>
            <p className="pw-company">
              {sceneName ? `${sceneName} · ` : ''}
              {consumers.length} consumer{consumers.length === 1 ? '' : 's'} · generated {generatedAt}
            </p>
          </div>
          <div className="pw-meta">
            {logo && <ProjectImage imageRef={logo} alt="Production logo" className="pw-logo" />}
            <div>Known load</div>
            <div style={{ fontSize: 20, color: '#0f172a', fontFamily: "'Courier New', monospace" }}>
              {formatWatts(totalKnownWatts)}
            </div>
            {unknownConsumerCount > 0 && (
              <div className="pw-unknown">
                + {unknownConsumerCount} unknown
              </div>
            )}
          </div>
        </header>

        <div className="pw-head">Supplies</div>
        <table className="pw-table">
          <thead>
            <tr>
              <th>Supply</th>
              <th>Type</th>
              <th className="num">Service</th>
              <th className="num">Known load</th>
              <th className="num">Apparent</th>
              <th className="num">Rating</th>
              <th>Phase legs</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source, index) => (
              <tr key={`${source.name}-${index}`}>
                <td>{source.name}</td>
                <td>{source.kind}</td>
                <td className="num">
                  {source.voltageV === undefined ? '—' : `${source.voltageV} V`}
                  {source.ampsPerPhaseA !== undefined ? ` · ${source.ampsPerPhaseA} A` : ''}
                  {source.phases !== undefined ? ` · ${source.phases}Ø` : ''}
                </td>
                <td className="num">{formatWatts(source.knownWatts)}</td>
                <td className="num">{formatVA(source.apparentVA)}</td>
                <td className={`num ${source.overCapacity ? 'pw-over' : ''}`}>
                  {formatVA(source.capacityVA)}
                  {source.overCapacity ? ' OVER' : ''}
                </td>
                <td>
                  {source.legs.length === 0
                    ? '—'
                    : source.legs
                        .map((leg) => `L${leg.leg} ${formatAmps(leg.ampsA)}`)
                        .join(' · ')}
                </td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr>
                <td colSpan={7}>No supplies recorded.</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="pw-head">Circuits</div>
        <table className="pw-table">
          <thead>
            <tr>
              <th>Circuit</th>
              <th>Supply</th>
              <th className="num">Leg</th>
              <th className="num">pf</th>
              <th className="num">Load</th>
              <th className="num">Draw</th>
              <th className="num">Rating</th>
              <th className="num">Headroom</th>
            </tr>
          </thead>
          <tbody>
            {circuits.map((circuit, index) => (
              <tr key={`${circuit.name}-${index}`}>
                <td>{circuit.name}</td>
                <td>{circuit.sourceName ?? '—'}</td>
                <td className="num">{circuit.phaseLeg ? `L${circuit.phaseLeg}` : '—'}</td>
                <td className="num">{circuit.powerFactor === 1 ? '—' : circuit.powerFactor}</td>
                <td className="num">{formatWatts(circuit.watts)}</td>
                <td className="num">{formatAmps(circuit.usedA)}</td>
                <td className="num">
                  {circuit.maxAmperesA === undefined ? '—' : `${circuit.maxAmperesA} A`}
                </td>
                <td className={`num ${circuit.overloaded ? 'pw-over' : ''}`}>
                  {circuit.overloaded ? 'OVERLOAD' : formatAmps(circuit.headroomA)}
                </td>
              </tr>
            ))}
            {circuits.length === 0 && (
              <tr>
                <td colSpan={8}>No circuits recorded.</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="pw-head">Consumers</div>
        <table className="pw-table">
          <thead>
            <tr>
              <th>Fixture</th>
              <th className="num">Qty</th>
              <th className="num">Load</th>
              <th>Wattage from</th>
              <th>Circuit</th>
              <th>Truss</th>
              <th>Distro zone</th>
            </tr>
          </thead>
          <tbody>
            {consumers.map((consumer, index) => (
              <tr key={`${consumer.name}-${index}`}>
                <td>{consumer.name}</td>
                <td className="num">{consumer.quantity}</td>
                <td className={`num ${consumer.watts === null ? 'pw-unknown' : ''}`}>
                  {formatWatts(consumer.watts)}
                </td>
                <td className={consumer.wattsSource === 'unknown' ? 'pw-unknown' : ''}>
                  {consumer.wattsSource === 'override'
                    ? 'Entered'
                    : consumer.wattsSource === 'profile'
                    ? 'Catalogue'
                    : consumer.wattsSource === 'fallback'
                    ? 'Curated table'
                    : 'Unknown'}
                </td>
                <td>{consumer.circuitName ?? 'Unassigned'}</td>
                <td>{consumer.trussLabel ?? '—'}</td>
                <td>{consumer.distroZone ?? '—'}</td>
              </tr>
            ))}
            {consumers.length === 0 && (
              <tr>
                <td colSpan={7}>No consumers — no lights on the plan and none added by hand.</td>
              </tr>
            )}
          </tbody>
        </table>

        {unknownConsumerCount > 0 && (
          <p className="pw-note">
            {unknownConsumerCount} consumer{unknownConsumerCount === 1 ? ' has' : 's have'} no known
            wattage and {unknownConsumerCount === 1 ? 'is' : 'are'} NOT included in any total on this
            sheet.
          </p>
        )}

        <div className="pw-footer">
          <p>{POWER_DISCLAIMER}</p>
          <p>Generated {generatedAt} · {productionTitle}</p>
        </div>
      </div>
    </>
  );
};

/**
 * Map a project (and the scene whose lights are on the plan) to the sheet.
 *
 * The consumer list is derived the same way the panel derives it, so the paper
 * and the screen cannot disagree — a printed distro sheet that omits a fixture
 * standing on the plan is exactly the failure this is here to prevent.
 */
export const buildPowerPrintModel = (
  project: Project,
  options: {
    /** Lights on the plan for the scene being printed. */
    planLights?: readonly LightElement[];
    /** Live fixture catalogue, for resolving a fixture's rated draw. */
    profiles?: readonly FixtureProfile[];
    sceneName?: string;
  } = {},
): PowerPrintViewProps => {
  const plan = project.powerPlan ?? { sources: [], circuits: [], consumers: [] };
  const planLights = options.planLights ?? [];
  const byProfileId = new Map((options.profiles ?? []).map((profile) => [profile.id, profile]));
  const profileWatts = (id: string): number | undefined => byProfileId.get(id)?.powerWatts;

  const consumers = derivePlanConsumers(
    planLights.map((light) => ({
      id: light.id,
      name: light.name,
      fixtureType: light.fixtureType,
      brand: light.brand,
      fixtureModel: light.fixtureModel,
      fixtureProfileId: light.fixtureProfileId,
    })),
    (plan.consumers ?? []) as PlanPowerConsumer[],
  );

  const load = calculatePowerLoad(consumers, profileWatts);
  const wattsById = new Map(load.perConsumer.map((entry) => [entry.consumerId, entry]));
  const circuitById = new Map(plan.circuits.map((circuit) => [circuit.id, circuit]));
  const sourceById = new Map(plan.sources.map((source) => [source.id, source]));
  const trussById = new Map((project.trussElements ?? []).map((truss, index) => [
    truss.id,
    truss.label?.trim() || `Truss ${index + 1}`,
  ]));

  const wattsPerCircuit = (circuitId: string): number =>
    consumers
      .filter((consumer) => consumer.circuitId === circuitId)
      .reduce((sum, consumer) => sum + (wattsById.get(consumer.id)?.watts ?? 0), 0);

  const circuits: PrintablePowerCircuit[] = plan.circuits.map((circuit) => {
    const source = sourceById.get(circuit.sourceId);
    const watts = wattsPerCircuit(circuit.id);
    const headroom = circuitHeadroom(circuit, watts, { voltageV: source?.voltageV });
    return {
      name: circuit.name,
      sourceName: source?.name,
      maxAmperesA: circuit.maxAmperesA,
      phaseLeg: circuit.phaseLeg,
      powerFactor: headroom.powerFactor,
      watts,
      usedA: headroom.usedA,
      headroomA: headroom.headroomA,
      overloaded: headroom.overloaded,
    };
  });

  const sources: PrintablePowerSource[] = plan.sources.map((source) => {
    const owned = plan.circuits
      .filter((circuit) => circuit.sourceId === source.id)
      .map((circuit) => ({ circuit, watts: wattsPerCircuit(circuit.id) }));
    const totals = sourceLoad(source, owned);
    const balance =
      source.phases === 3 ? phaseBalance(owned, { voltageV: source.voltageV }) : undefined;
    return {
      name: source.name,
      kind: source.kind,
      voltageV: source.voltageV,
      ampsPerPhaseA: source.ampsPerPhaseA,
      phases: source.phases,
      knownWatts: totals.knownWatts,
      apparentVA: totals.apparentVA,
      capacityVA: totals.capacityVA,
      overCapacity: totals.overCapacity,
      legs: balance ? balance.legs.map((leg) => ({ leg: leg.leg, watts: leg.watts, ampsA: leg.ampsA })) : [],
    };
  });

  return {
    productionTitle: project.title || 'Untitled production',
    company: project.productionCompany,
    logo: project.logo,
    sceneName: options.sceneName,
    consumers: consumers.map((consumer) => ({
      name: consumer.name,
      quantity: consumer.quantity,
      watts: wattsById.get(consumer.id)?.watts ?? null,
      wattsSource: wattsById.get(consumer.id)?.source ?? 'unknown',
      circuitName: consumer.circuitId ? circuitById.get(consumer.circuitId)?.name : undefined,
      trussLabel: consumer.trussElementId
        ? trussById.get(consumer.trussElementId) ?? 'Truss no longer on the rig'
        : undefined,
      distroZone: consumer.distroZone,
    })),
    circuits,
    sources,
    totalKnownWatts: load.totalWatts,
    unknownConsumerCount: load.unknownConsumerCount,
  };
};
