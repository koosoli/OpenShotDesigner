/**
 * Presets + local persistence shape for the PowerPanel (plan §22).
 *
 * Pure data only — no React, no business logic beyond label/typical-value
 * lookup (rules 4 & 11: shared presets, not one-off symbols in components).
 */
import type { PlanPowerConsumer, PowerConsumer, PowerPlan, PowerSourceKind } from '../../domain/power';
import { formatQuantity } from '../../domain/documentFormat';

export interface PowerSourcePreset {
  label: string;
  /** Typical values auto-filled when the kind is selected; undefined = editable, unknown. */
  voltageV?: number;
  ampsPerPhaseA?: number;
  phases?: 1 | 3;
}

/** Typical service presets; generator/battery/custom leave all fields editable. */
export const SOURCE_KIND_PRESETS: Record<PowerSourceKind, PowerSourcePreset> = {
  mains_120v_20a: { label: 'Mains 120 V / 20 A · 1φ', voltageV: 120, ampsPerPhaseA: 20, phases: 1 },
  mains_230v_16a: { label: 'Mains 230 V / 16 A · 1φ', voltageV: 230, ampsPerPhaseA: 16, phases: 1 },
  mains_230v_32a: { label: 'Mains 230 V / 32 A · 1φ', voltageV: 230, ampsPerPhaseA: 32, phases: 1 },
  three_phase_400v_16a: { label: '3-Phase 400 V / 16 A', voltageV: 400, ampsPerPhaseA: 16, phases: 3 },
  three_phase_400v_32a: { label: '3-Phase 400 V / 32 A', voltageV: 400, ampsPerPhaseA: 32, phases: 3 },
  three_phase_400v_63a: { label: '3-Phase 400 V / 63 A', voltageV: 400, ampsPerPhaseA: 63, phases: 3 },
  three_phase_400v_125a: { label: '3-Phase 400 V / 125 A', voltageV: 400, ampsPerPhaseA: 125, phases: 3 },
  generator: { label: 'Generator' },
  battery: { label: 'Battery' },
  custom: { label: 'Custom' },
};

export const SOURCE_KIND_ORDER: PowerSourceKind[] = [
  'mains_120v_20a',
  'mains_230v_16a',
  'mains_230v_32a',
  'three_phase_400v_16a',
  'three_phase_400v_32a',
  'three_phase_400v_63a',
  'three_phase_400v_125a',
  'generator',
  'battery',
  'custom',
];

/**
 * Consumers are persisted inside `project.powerPlan` next to sources and
 * circuits. The extra optional `consumers` key is additive: older builds
 * ignore it, and the v4→v5 migration backfills the base
 * `{ sources: [], circuits: [] }` shape, so existing projects keep loading
 * unchanged. A dedicated schema bump will formalize this when the domain
 * type gains the field (rule 6 tracked at the domain level).
 */
export interface PowerPanelPlan extends PowerPlan {
  consumers?: PowerConsumer[];
}

/** Consumer created from a scene light; keeps provenance for de-duplication. */
/**
 * A consumer as the power panel works with it. `sourceElementId` links it to
 * the floor-plan light it stands for; the two derivation markers are working
 * state added by `derivePlanConsumers` and stripped before saving.
 */
export type ScenePowerConsumer = PlanPowerConsumer;

export const EMPTY_PLAN: PowerPanelPlan = { sources: [], circuits: [], consumers: [] };

export const getPowerPlan = (project: { powerPlan?: PowerPlan }): PowerPanelPlan =>
  (project.powerPlan ?? EMPTY_PLAN) as PowerPanelPlan;

/** "1,200 W" — display-only formatting; stored values stay canonical W. */
export const formatWatts = (watts: number): string => `${formatQuantity(Math.round(watts))} W`;

/** "5.2 A" / "16 A" — display-only; stored values stay canonical A. */
export const formatAmps = (amps: number): string =>
  `${Number.isInteger(amps) ? amps : amps.toFixed(1)} A`;
