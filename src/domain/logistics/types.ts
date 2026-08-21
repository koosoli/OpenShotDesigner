/**
 * Logistics / transport domain types (plan §24).
 *
 * Canonical units: mm / kg / liters (rule 14). Missing technical data stays
 * `undefined`/`null` — never silently substituted with 0 (rule 13).
 */

export type LogisticsContainerKind = 'case' | 'rack' | 'cart' | 'pallet' | 'van' | 'truck';

export interface LogisticsContainer {
  id: string;
  kind: LogisticsContainerKind;
  name: string;
  /** Nesting: truck contains cases. */
  parentContainerId?: string;
  tareWeightKg?: number;
  externalDimensions?: {
    widthMm?: number;
    heightMm?: number;
    depthMm?: number;
  };
  usableVolumeLiters?: number;
  maxPayloadKg?: number;
  notes?: string;
}

export interface PackedItem {
  id: string;
  containerId: string;
  label: string;
  quantity: number;
  /** Unknown stays undefined. */
  unitWeightKg?: number;
  /**
   * Packed volume per unit in liters when known (distinct from physical
   * bounding volume, plan §24).
   */
  packedVolumeLiters?: number;
  /** True when derived from physical dims rather than packed dims. */
  volumeIsEstimate?: boolean;
}

export interface ContainerLoadResult {
  /**
   * Tare + known item weights; null only when ANY item weight is unknown.
   * Tare is treated as 0 when absent but reported via `tareUnknown`.
   */
  totalWeightKg: number | null;
  tareUnknown: boolean;
  unknownItemCount: number;
  /** null when any packed volume unknown. */
  usedVolumeLiters: number | null;
  volumeIsEstimate: boolean;
  /** Fraction 0..1; null when maxPayloadKg unknown. */
  payloadUtilization: number | null;
  /** null when usableVolumeLiters unknown. */
  volumeUtilization: number | null;
}
