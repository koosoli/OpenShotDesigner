import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Gauge,
  Info,
  Lightbulb,
  Plug,
  Plus,
  Trash2,
  Zap,
} from 'lucide-react';
import { useFloorPlan } from '../../context/FloorPlanContext';
import { useFixtureCatalog } from '../inspector/useFixtureCatalog';
import { createId } from '../../domain/ids';
import { removePowerCircuit, removePowerSource } from '../../domain';
import type { LightElement } from '../../types';
import {
  POWER_DISCLAIMER,
  calculatePowerLoad,
  circuitHeadroom,
  phaseBalance,
  powerLoadByGroup,
  type PowerCircuit,
  type PowerConsumer,
  type PowerSource,
  type PowerSourceKind,
} from '../../domain/power';
import {
  SOURCE_KIND_ORDER,
  SOURCE_KIND_PRESETS,
  formatAmps,
  formatWatts,
  getPowerPlan,
  type PowerPanelPlan,
  type ScenePowerConsumer,
} from './powerPresets';

/** Parse a number input; empty string → undefined (unknown, never 0 — rule 13). */
const parseOptionalNumber = (raw: string): number | undefined => {
  if (raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

export const PowerPanel: React.FC = () => {
  const { project, theme, updateProjectMeta, activeSetup } = useFloorPlan();
  // Re-render when the fixture catalog changes: the bundled snapshot arrives
  // asynchronously and an online refresh can replace it, and both change the
  // wattage and specs derived below.
  useFixtureCatalog();
  const isLight = theme === 'light';

  const plan = getPowerPlan(project);
  const sources = plan.sources;
  const circuits = plan.circuits;
  // Memoised: a fresh `?? []` each render defeated the load report's memo.
  const consumers: ScenePowerConsumer[] = useMemo(
    () => (plan.consumers ?? []) as ScenePowerConsumer[],
    [plan.consumers],
  );

  // Inline add-form state
  const [newCircuitName, setNewCircuitName] = useState('');
  const [newCircuitSourceId, setNewCircuitSourceId] = useState('');
  const [newCircuitMaxA, setNewCircuitMaxA] = useState('');
  const [newConsumerName, setNewConsumerName] = useState('');
  const [newConsumerQty, setNewConsumerQty] = useState('1');

  /** Every mutation persists immutably through powerPlan. */
  const commit = (next: PowerPanelPlan) => {
    updateProjectMeta({ powerPlan: next });
  };

  // --- Derived report (pure domain logic; profiles arrive later) ---

  const report = useMemo(() => {
    const load = calculatePowerLoad(consumers, () => undefined);
    const wattsByConsumerId = new Map(
      load.perConsumer.map((p) => [p.consumerId, p.watts])
    );
    const circuitRows = circuits.map((circuit) => {
      const watts = consumers
        .filter((c) => c.circuitId === circuit.id)
        .reduce((sum, c) => sum + (wattsByConsumerId.get(c.id) ?? 0), 0);
      const source = sources.find((s) => s.id === circuit.sourceId);
      const headroom = circuitHeadroom(circuit, watts, { voltageV: source?.voltageV });
      return { circuit, watts, headroom };
    });
    const sourceRows = sources.map((source) => {
      const watts = circuitRows
        .filter((r) => r.circuit.sourceId === source.id)
        .reduce((sum, r) => sum + r.watts, 0);
      const { voltageV, ampsPerPhaseA, phases } = source;
      const capacityWatts =
        voltageV !== undefined && ampsPerPhaseA !== undefined && phases !== undefined
          ? voltageV * ampsPerPhaseA * phases
          : null;
      return { source, watts, capacityWatts };
    });
    // Load per truss run and per distribution zone: the same estimation path
    // as the flat total, only regrouped (domain does the maths, rule 4).
    const trussLoads = powerLoadByGroup(consumers, () => undefined, (c) => c.trussElementId);
    const zoneLoads = powerLoadByGroup(consumers, () => undefined, (c) => c.distroZone?.trim() || undefined);

    // Phase balance is only meaningful on a 3-phase supply, and only for the
    // circuits fed by that supply.
    const phaseRows = sources
      .filter((source) => source.phases === 3)
      .map((source) => ({
        source,
        balance: phaseBalance(
          circuitRows
            .filter((row) => row.circuit.sourceId === source.id)
            .map(({ circuit, watts }) => ({ circuit, watts })),
          { voltageV: source.voltageV },
        ),
      }));

    return { load, circuitRows, sourceRows, trussLoads, zoneLoads, phaseRows };
  }, [consumers, circuits, sources]);

  const trussElements = project.trussElements ?? [];
  const trussLabel = (trussId: string): string => {
    const truss = trussElements.find((element) => element.id === trussId);
    if (!truss) return 'Truss no longer on the rig';
    return truss.label?.trim() || `Truss ${trussElements.indexOf(truss) + 1}`;
  };

  const sceneLights = useMemo(
    () => activeSetup.elements.filter((e): e is LightElement => e.type === 'light'),
    [activeSetup.elements]
  );

  // --- Source mutations ---

  const addSource = () => {
    const source: PowerSource = {
      id: createId('psrc'),
      name: `Source ${sources.length + 1}`,
      kind: 'custom',
    };
    commit({ ...plan, sources: [...sources, source] });
  };

  const updateSource = (sourceId: string, updates: Partial<PowerSource>) => {
    commit({
      ...plan,
      sources: sources.map((s) => (s.id === sourceId ? { ...s, ...updates } : s)),
    });
  };

  const changeSourceKind = (sourceId: string, kind: PowerSourceKind) => {
    const preset = SOURCE_KIND_PRESETS[kind];
    // Mains presets auto-fill their typical service; generator/battery/custom
    // leave the fields editable as-is.
    if (preset.voltageV !== undefined) {
      updateSource(sourceId, {
        kind,
        voltageV: preset.voltageV,
        ampsPerPhaseA: preset.ampsPerPhaseA,
        phases: preset.phases,
      });
    } else {
      updateSource(sourceId, { kind });
    }
  };

  const removeSource = (sourceId: string) => {
    commit(removePowerSource({ powerPlan: plan }, sourceId).powerPlan as PowerPanelPlan);
  };

  // --- Circuit mutations ---

  const addCircuit = () => {
    const sourceId = newCircuitSourceId || sources[0]?.id;
    if (!sourceId) return;
    const circuit: PowerCircuit = {
      id: createId('pcirc'),
      name: newCircuitName.trim() || `Circuit ${circuits.length + 1}`,
      sourceId,
      maxAmperesA: parseOptionalNumber(newCircuitMaxA),
      consumerIds: [],
    };
    commit({ ...plan, circuits: [...circuits, circuit] });
    setNewCircuitName('');
    setNewCircuitMaxA('');
  };

  const updateCircuit = (circuitId: string, updates: Partial<PowerCircuit>) => {
    commit({
      ...plan,
      circuits: circuits.map((c) => (c.id === circuitId ? { ...c, ...updates } : c)),
    });
  };

  const removeCircuit = (circuitId: string) => {
    commit(removePowerCircuit({ powerPlan: plan }, circuitId).powerPlan as PowerPanelPlan);
  };

  // --- Consumer mutations ---

  const addAllSceneLights = () => {
    const alreadyAdded = new Set(
      consumers
        .map((c) => c.sourceElementId)
        .filter((id): id is string => id !== undefined)
    );
    const fresh: ScenePowerConsumer[] = sceneLights
      .filter((light) => !alreadyAdded.has(light.id))
      .map((light) => ({
        id: createId('pcons'),
        name: light.name || light.fixtureType,
        quantity: 1,
        sourceElementId: light.id,
      }));
    if (fresh.length === 0) return;
    commit({ ...plan, consumers: [...consumers, ...fresh] });
  };

  const addManualConsumer = () => {
    const consumer: ScenePowerConsumer = {
      id: createId('pcons'),
      name: newConsumerName.trim() || 'Consumer',
      quantity: Math.max(1, Math.round(Number(newConsumerQty) || 1)),
    };
    commit({ ...plan, consumers: [...consumers, consumer] });
    setNewConsumerName('');
    setNewConsumerQty('1');
  };

  const updateConsumer = (consumerId: string, updates: Partial<PowerConsumer>) => {
    commit({
      ...plan,
      consumers: consumers.map((c) => (c.id === consumerId ? { ...c, ...updates } : c)),
    });
  };

  const removeConsumer = (consumerId: string) => {
    commit({
      ...plan,
      consumers: consumers.filter((c) => c.id !== consumerId),
    });
  };

  // --- Shared styles (SchedulePanel conventions) ---

  const surfaceClass = isLight
    ? 'bg-slate-50 border-slate-200'
    : 'bg-slate-950/60 border-slate-800';
  const cardClass = isLight
    ? 'bg-white border-slate-200'
    : 'bg-slate-900 border-slate-700';
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

  const sectionHeading = (icon: React.ReactNode, title: string, count?: number) => (
    <h3 className={`text-xs font-bold flex items-center gap-1.5 ${headingText}`}>
      {icon}
      {title}
      {count !== undefined && <span className={chipClass}>{count}</span>}
    </h3>
  );

  const { load, circuitRows, sourceRows, trussLoads, zoneLoads, phaseRows } = report;

  return (
    <div className="h-full overflow-y-auto p-3 flex flex-col gap-3">
      {/* Assumptions box (plan rules 13–15) */}
      <div
        className={`rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed flex items-start gap-2 ${
          isLight ? 'bg-sky-50 border-sky-200 text-sky-900' : 'bg-sky-950/50 border-sky-800 text-sky-200'
        }`}
      >
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <p>
          {POWER_DISCLAIMER} Unknown wattages are excluded from totals — never counted as 0;
          confirm fixture draw against manufacturer data.
        </p>
      </div>

      {/* Derived report strip */}
      <section className={`rounded-xl border p-2.5 flex flex-col gap-2 ${surfaceClass}`}>
        {sectionHeading(<Gauge className="w-3.5 h-3.5" />, 'Estimated Load')}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="font-semibold">
            Total known:{' '}
            <span className="font-mono">{formatWatts(load.knownWatts)}</span>
          </span>
          {load.unknownConsumerCount > 0 && (
            <span className="text-amber-500 font-medium" role="status">
              ⚠ {load.unknownConsumerCount} unknown — not counted
            </span>
          )}
        </div>

        {circuitRows.length > 0 && (
          <ul className="flex flex-col gap-1">
            {circuitRows.map(({ circuit, watts, headroom }) => (
              <li key={circuit.id} className="flex items-center gap-2 text-[11px] flex-wrap">
                <span className="font-medium truncate max-w-[45%]">{circuit.name}</span>
                <span className={`font-mono ${mutedText}`}>{formatWatts(watts)}</span>
                {headroom.usedA !== null && headroom.headroomA !== null ? (
                  <span
                    className={`font-mono ${
                      headroom.overloaded
                        ? 'text-red-500 font-bold'
                        : isLight ? 'text-emerald-600' : 'text-emerald-400'
                    }`}
                  >
                    {formatAmps(headroom.usedA)} / {circuit.maxAmperesA} A ·{' '}
                    {headroom.overloaded
                      ? 'OVERLOAD'
                      : `${formatAmps(headroom.headroomA)} free`}
                  </span>
                ) : (
                  <span className={`${mutedText} italic`}>
                    {circuit.maxAmperesA === undefined
                      ? 'circuit rating unknown'
                      : 'source voltage unknown'}
                  </span>
                )}
                {headroom.overloaded && (
                  <AlertTriangle className="w-3 h-3 text-red-500 flex-shrink-0" />
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Load per truss run: what each rigged position actually draws, so a
            distro can be sized per truss rather than for the whole rig. */}
        {(trussLoads.groups.length > 0 || zoneLoads.groups.length > 0) && (
          <div
            className={`flex flex-col gap-1 pt-1 border-t border-dashed ${
              isLight ? 'border-slate-200' : 'border-slate-800'
            }`}
          >
            {trussLoads.groups.length > 0 && (
              <>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${mutedText}`}>Load per truss</p>
                <ul className="flex flex-col gap-1">
                  {trussLoads.groups.map((group) => (
                    <li key={group.key} className="flex items-center gap-2 text-[11px] flex-wrap">
                      <span className="font-medium truncate max-w-[45%]">{trussLabel(group.key)}</span>
                      <span className={`font-mono ${mutedText}`}>{formatWatts(group.knownWatts)}</span>
                      <span className={chipClass}>{group.consumerIds.length} fixtures</span>
                      {group.unknownConsumerCount > 0 && (
                        <span className="text-amber-500 font-medium">
                          ⚠ {group.unknownConsumerCount} unknown
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {zoneLoads.groups.length > 0 && (
              <>
                <p className={`text-[10px] font-bold uppercase tracking-wider mt-1 ${mutedText}`}>
                  Load per distro zone
                </p>
                <ul className="flex flex-col gap-1">
                  {zoneLoads.groups.map((group) => (
                    <li key={group.key} className="flex items-center gap-2 text-[11px] flex-wrap">
                      <span className="font-medium truncate max-w-[45%]">{group.key}</span>
                      <span className={`font-mono ${mutedText}`}>{formatWatts(group.knownWatts)}</span>
                      <span className={chipClass}>{group.consumerIds.length} items</span>
                      {group.unknownConsumerCount > 0 && (
                        <span className="text-amber-500 font-medium">
                          ⚠ {group.unknownConsumerCount} unknown
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {trussLoads.ungrouped.consumerIds.length > 0 && (
              <p className={`text-[10px] ${mutedText}`}>
                {trussLoads.ungrouped.consumerIds.length} consumer
                {trussLoads.ungrouped.consumerIds.length === 1 ? '' : 's'} not assigned to a truss
                ({formatWatts(trussLoads.ungrouped.knownWatts)}).
              </p>
            )}
          </div>
        )}

        {/* Phase balance per 3-phase supply. */}
        {phaseRows.length > 0 && (
          <div
            className={`flex flex-col gap-1 pt-1 border-t border-dashed ${
              isLight ? 'border-slate-200' : 'border-slate-800'
            }`}
          >
            <p className={`text-[10px] font-bold uppercase tracking-wider ${mutedText}`}>Phase balance</p>
            {phaseRows.map(({ source, balance }) => (
              <div key={source.id} className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-medium truncate max-w-[35%]">{source.name}</span>
                {balance.legs.map((leg) => (
                  <span
                    key={leg.leg}
                    className={`font-mono ${
                      balance.busiestLeg === leg.leg && (balance.imbalanceRatio ?? 0) > 0.2
                        ? 'text-amber-500 font-bold'
                        : mutedText
                    }`}
                  >
                    L{leg.leg} {formatWatts(leg.watts)}
                    {leg.ampsA !== null ? ` · ${formatAmps(leg.ampsA)}` : ''}
                  </span>
                ))}
                {balance.imbalanceRatio === null ? (
                  <span className={`${mutedText} italic`}>no legs assigned yet</span>
                ) : (
                  <span className={balance.imbalanceRatio > 0.2 ? 'text-amber-500 font-medium' : mutedText}>
                    {Math.round(balance.imbalanceRatio * 100)}% spread
                  </span>
                )}
                {balance.unassignedWatts > 0 && (
                  <span className={`${mutedText} italic`}>
                    {formatWatts(balance.unassignedWatts)} on circuits with no leg set
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {sourceRows.length > 0 && (
          <ul
            className={`flex flex-col gap-1 pt-1 border-t border-dashed ${
              isLight ? 'border-slate-200' : 'border-slate-800'
            }`}
          >
            {sourceRows.map(({ source, watts, capacityWatts }) => (
              <li key={source.id} className="flex items-center gap-2 text-[11px] flex-wrap">
                <Zap className="w-3 h-3 flex-shrink-0 text-amber-500" />
                <span className="font-medium truncate max-w-[45%]">{source.name}</span>
                <span className={`font-mono ${mutedText}`}>{formatWatts(watts)}</span>
                {capacityWatts !== null ? (
                  <span className={`font-mono ${mutedText}`}>
                    of ~{formatWatts(capacityWatts)} supply
                  </span>
                ) : (
                  <span className={`${mutedText} italic`}>supply capacity unknown</span>
                )}
              </li>
            ))}
          </ul>
        )}

        {sources.length === 0 && circuits.length === 0 && consumers.length === 0 && (
          <p className={`text-[11px] ${mutedText}`}>
            Add a source, then circuits and consumers to see loads.
          </p>
        )}
      </section>

      {/* Sources */}
      <section className={`rounded-xl border p-2.5 flex flex-col gap-2 ${surfaceClass}`}>
        <div className="flex items-center justify-between gap-2">
          {sectionHeading(<Plug className="w-3.5 h-3.5" />, 'Power Sources', sources.length)}
          <button onClick={addSource} title="Add power source" className={secondaryBtnClass}>
            <Plus className="w-3.5 h-3.5" />
            Source
          </button>
        </div>
        {sources.length === 0 && (
          <p className={`text-[11px] ${mutedText}`}>No sources yet.</p>
        )}
        <ul className="flex flex-col gap-1.5">
          {sources.map((source) => {
            const preset = SOURCE_KIND_PRESETS[source.kind];
            const fieldsEditable =
              source.kind === 'generator' ||
              source.kind === 'battery' ||
              source.kind === 'custom' ||
              preset.voltageV === undefined;
            return (
              <li key={source.id} className={`rounded-lg border p-2 flex flex-col gap-1.5 ${cardClass}`}>
                <div className="flex items-center gap-1.5">
                  <input
                    value={source.name}
                    onChange={(e) => updateSource(source.id, { name: e.target.value })}
                    placeholder="Source name"
                    aria-label={`Name for ${source.name}`}
                    className={`${inputClass} font-semibold`}
                  />
                  <select
                    value={source.kind}
                    onChange={(e) => changeSourceKind(source.id, e.target.value as PowerSourceKind)}
                    aria-label={`Kind for ${source.name}`}
                    className={`${inputClass} !w-auto flex-shrink-0`}
                  >
                    {SOURCE_KIND_ORDER.map((kind) => (
                      <option key={kind} value={kind}>
                        {SOURCE_KIND_PRESETS[kind].label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeSource(source.id)}
                    title="Remove source (its circuits are deleted)"
                    aria-label={`Remove ${source.name}`}
                    className={`${iconBtnClass} hover:!text-red-500`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <label className="flex flex-col gap-0.5">
                    <span className={`text-[10px] ${mutedText}`}>Volts</span>
                    <input
                      type="number"
                      min={0}
                      value={source.voltageV ?? ''}
                      onChange={(e) =>
                        updateSource(source.id, { voltageV: parseOptionalNumber(e.target.value) })
                      }
                      placeholder="—"
                      aria-label={`Voltage for ${source.name}`}
                      className={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className={`text-[10px] ${mutedText}`}>A / phase</span>
                    <input
                      type="number"
                      min={0}
                      value={source.ampsPerPhaseA ?? ''}
                      onChange={(e) =>
                        updateSource(source.id, { ampsPerPhaseA: parseOptionalNumber(e.target.value) })
                      }
                      placeholder="—"
                      aria-label={`Amps per phase for ${source.name}`}
                      className={inputClass}
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className={`text-[10px] ${mutedText}`}>Phases</span>
                    <select
                      value={source.phases ?? ''}
                      onChange={(e) =>
                        updateSource(source.id, {
                          phases: e.target.value === '' ? undefined : ((Number(e.target.value) === 3 ? 3 : 1) as 1 | 3),
                        })
                      }
                      aria-label={`Phases for ${source.name}`}
                      className={inputClass}
                    >
                      <option value="">—</option>
                      <option value="1">1φ</option>
                      <option value="3">3φ</option>
                    </select>
                  </label>
                </div>
                {!fieldsEditable && (
                  <p className={`text-[10px] ${mutedText}`}>
                    Typical values auto-filled from the preset — adjust if your service differs.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Circuits */}
      <section className={`rounded-xl border p-2.5 flex flex-col gap-2 ${surfaceClass}`}>
        {sectionHeading(<Zap className="w-3.5 h-3.5" />, 'Circuits', circuits.length)}
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={newCircuitName}
            onChange={(e) => setNewCircuitName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addCircuit();
            }}
            placeholder="New circuit name"
            aria-label="New circuit name"
            className={`${inputClass} flex-1 min-w-[120px]`}
          />
          <select
            value={newCircuitSourceId}
            onChange={(e) => setNewCircuitSourceId(e.target.value)}
            aria-label="New circuit source"
            className={`${inputClass} !w-auto`}
          >
            {sources.length === 0 && <option value="">No sources</option>}
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={0}
            value={newCircuitMaxA}
            onChange={(e) => setNewCircuitMaxA(e.target.value)}
            placeholder="Max A"
            aria-label="New circuit maximum amperes"
            className={`${inputClass} !w-20`}
          />
          <button
            onClick={addCircuit}
            disabled={sources.length === 0}
            title={sources.length === 0 ? 'Add a power source first' : 'Add circuit'}
            className={primaryBtnClass}
          >
            <Plus className="w-3.5 h-3.5" />
            Circuit
          </button>
        </div>
        <ul className="flex flex-col gap-1.5">
          {circuits.map((circuit) => (
            <li key={circuit.id} className={`rounded-lg border p-2 flex items-center gap-1.5 ${cardClass}`}>
              <input
                value={circuit.name}
                onChange={(e) => updateCircuit(circuit.id, { name: e.target.value })}
                placeholder="Circuit name"
                aria-label={`Name for ${circuit.name}`}
                className={`${inputClass} font-semibold flex-1 min-w-[90px]`}
              />
              <select
                value={circuit.sourceId}
                onChange={(e) => updateCircuit(circuit.id, { sourceId: e.target.value })}
                aria-label={`Source for ${circuit.name}`}
                className={`${inputClass} !w-auto max-w-[130px]`}
              >
                {sources.some((s) => s.id === circuit.sourceId) ? (
                  sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))
                ) : (
                  <option value={circuit.sourceId}>Missing source</option>
                )}
              </select>
              <input
                type="number"
                min={0}
                value={circuit.maxAmperesA ?? ''}
                onChange={(e) =>
                  updateCircuit(circuit.id, { maxAmperesA: parseOptionalNumber(e.target.value) })
                }
                placeholder="Max A"
                aria-label={`Maximum amperes for ${circuit.name}`}
                className={`${inputClass} !w-20`}
              />
              {/* Only a 3-phase supply has legs to pick from; leaving it unset
                  keeps the circuit out of the balance report rather than
                  loading it onto L1 by default. */}
              {sources.find((s) => s.id === circuit.sourceId)?.phases === 3 && (
                <select
                  value={circuit.phaseLeg ?? ''}
                  onChange={(e) =>
                    updateCircuit(circuit.id, {
                      phaseLeg: e.target.value === '' ? undefined : (Number(e.target.value) as 1 | 2 | 3),
                    })
                  }
                  aria-label={`Phase leg for ${circuit.name}`}
                  title="Which leg of the 3-phase supply feeds this circuit"
                  className={`${inputClass} !w-20`}
                >
                  <option value="">L?</option>
                  <option value="1">L1</option>
                  <option value="2">L2</option>
                  <option value="3">L3</option>
                </select>
              )}
              <button
                onClick={() => removeCircuit(circuit.id)}
                title="Delete circuit (consumers become unassigned)"
                aria-label={`Delete ${circuit.name}`}
                className={`${iconBtnClass} hover:!text-red-500`}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
          {circuits.length === 0 && (
            <li className={`text-[11px] ${mutedText}`}>
              No circuits yet{sources.length === 0 ? ' — add a source first.' : '.'}
            </li>
          )}
        </ul>
      </section>

      {/* Consumers */}
      <section className={`rounded-xl border p-2.5 flex flex-col gap-2 ${surfaceClass}`}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {sectionHeading(<Lightbulb className="w-3.5 h-3.5" />, 'Consumers', consumers.length)}
          <button
            onClick={addAllSceneLights}
            disabled={sceneLights.length === 0}
            title={
              sceneLights.length === 0
                ? 'No lights in the current scene'
                : 'Create one consumer per light in the current scene'
            }
            className={secondaryBtnClass}
          >
            <Lightbulb className="w-3.5 h-3.5" />
            Add all lights from current scene ({sceneLights.length})
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={newConsumerName}
            onChange={(e) => setNewConsumerName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addManualConsumer();
            }}
            placeholder="New consumer name (e.g. Fog machine)"
            aria-label="New consumer name"
            className={`${inputClass} flex-1 min-w-[140px]`}
          />
          <input
            type="number"
            min={1}
            value={newConsumerQty}
            onChange={(e) => setNewConsumerQty(e.target.value)}
            aria-label="New consumer quantity"
            className={`${inputClass} !w-16`}
          />
          <button onClick={addManualConsumer} title="Add consumer" className={primaryBtnClass}>
            <Plus className="w-3.5 h-3.5" />
            Consumer
          </button>
        </div>
        <ul className="flex flex-col gap-1.5">
          {consumers.map((consumer) => {
            const perConsumer = load.perConsumer.find((p) => p.consumerId === consumer.id);
            const watts = perConsumer?.watts ?? null;
            return (
              <li key={consumer.id} className={`rounded-lg border p-2 flex flex-col gap-1.5 ${cardClass}`}>
                <div className="flex items-center gap-1.5">
                  <input
                    value={consumer.name}
                    onChange={(e) => updateConsumer(consumer.id, { name: e.target.value })}
                    placeholder="Consumer name"
                    aria-label={`Name for ${consumer.name}`}
                    className={`${inputClass} font-semibold flex-1 min-w-[100px]`}
                  />
                  <input
                    type="number"
                    min={1}
                    value={consumer.quantity}
                    onChange={(e) =>
                      updateConsumer(consumer.id, {
                        quantity: Math.max(1, Math.round(Number(e.target.value) || 1)),
                      })
                    }
                    aria-label={`Quantity for ${consumer.name}`}
                    title="Quantity"
                    className={`${inputClass} !w-16`}
                  />
                  <label className="flex items-center gap-1 flex-shrink-0">
                    <span className={`text-[10px] ${mutedText}`}>W</span>
                    <input
                      type="number"
                      min={0}
                      value={consumer.powerWattsOverride ?? ''}
                      onChange={(e) =>
                        updateConsumer(consumer.id, {
                          powerWattsOverride: parseOptionalNumber(e.target.value),
                        })
                      }
                      placeholder="?"
                      aria-label={`Wattage override for ${consumer.name}`}
                      title="Wattage override — leave empty if unknown"
                      className={`${inputClass} !w-20`}
                    />
                  </label>
                  <select
                    value={consumer.circuitId ?? ''}
                    onChange={(e) =>
                      updateConsumer(consumer.id, {
                        circuitId: e.target.value === '' ? undefined : e.target.value,
                      })
                    }
                    aria-label={`Circuit for ${consumer.name}`}
                    className={`${inputClass} !w-auto max-w-[130px]`}
                  >
                    <option value="">Unassigned</option>
                    {circuits.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => removeConsumer(consumer.id)}
                    title="Delete consumer"
                    aria-label={`Delete ${consumer.name}`}
                    className={`${iconBtnClass} hover:!text-red-500`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* Where this load physically hangs / is distributed from.
                    Both are optional: a plan with no rig still totals fine. */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <select
                    value={consumer.trussElementId ?? ''}
                    onChange={(e) =>
                      updateConsumer(consumer.id, {
                        trussElementId: e.target.value === '' ? undefined : e.target.value,
                      })
                    }
                    aria-label={`Truss for ${consumer.name}`}
                    title="Truss run this fixture hangs on"
                    className={`${inputClass} !w-auto max-w-[150px]`}
                  >
                    <option value="">No truss</option>
                    {trussElements.map((truss, index) => (
                      <option key={truss.id} value={truss.id}>
                        {truss.label?.trim() || `Truss ${index + 1}`}
                      </option>
                    ))}
                  </select>
                  <input
                    value={consumer.distroZone ?? ''}
                    onChange={(e) =>
                      updateConsumer(consumer.id, {
                        distroZone: e.target.value.trim() === '' ? undefined : e.target.value,
                      })
                    }
                    placeholder="Distro zone"
                    aria-label={`Distro zone for ${consumer.name}`}
                    title="Free-form distribution zone, e.g. 'Stage-left distro'"
                    className={`${inputClass} !w-auto max-w-[150px]`}
                  />
                </div>
                <p className={`text-[10px] font-mono ${mutedText}`}>
                  {watts !== null
                    ? `${formatWatts(watts)} counted`
                    : 'wattage unknown — excluded from totals'}
                </p>
              </li>
            );
          })}
          {consumers.length === 0 && (
            <li className={`text-[11px] ${mutedText}`}>
              No consumers yet — pull in the scene's lights or add one manually.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
};
