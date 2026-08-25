/**
 * Logistics / transport domain types (plan §24).
 *
 * Canonical units: mm / kg / liters (rule 14). Missing technical data stays
 * `undefined`/`null` — never silently substituted with 0 (rule 13).
 */

export type LogisticsContainerKind = 'case' | 'rack' | 'cart' | 'pallet' | 'van' | 'truck';

/**
 * Where a container is on its journey, as the transport captain marks it:
 * packed at the warehouse, loaded on the vehicle, delivered on set, returned
 * to the warehouse after wrap.
 *
 * The stages are a cycle across days — yesterday's "returned" is tomorrow's
 * "packed" again once the case is refilled — so there is no implicit ordering
 * here beyond the label, and nothing derives one stage from another. Absent
 * means nobody has marked it, which is a different thing from "packed": a
 * report that assumed packed would hide exactly the case everyone forgot.
 */
export type LogisticsJourneyStage = 'packed' | 'loaded' | 'delivered' | 'returned';

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
  /**
   * The shoot day this container travels on (`ProductionDay.id`). Optional and
   * absent-safe: gear gets packed long before the schedule is locked, and a
   * project saved before this field existed simply has no day on any
   * container, which reads as "not routed yet" rather than as an error.
   * A nested container inherits its parent's day — a case inside the truck
   * goes wherever the truck goes.
   */
  productionDayId?: string;
  /**
   * Where the container is going (`Location.id`). Optional on the same terms
   * as `productionDayId`, and inherited from the parent container in the same
   * way.
   */
  locationId?: string;
  /**
   * The transport captain's mark of where this container physically is.
   * Optional and absent-safe: a project saved before this field existed has
   * simply never been marked, which reads as "not marked" rather than as any
   * particular stage. NOT inherited from the parent container — two cases in
   * one truck can be marked at different times, and the whole value of the
   * mark is that it was made by someone looking at that case.
   */
  journey?: LogisticsJourneyStage;
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
  /**
   * The equipment-manifest row this item was generated from, as
   * `equipmentKey` writes it (category:brand:model). Present only on items the
   * "pack equipment" action created; absent on everything a user typed. That
   * is what lets the action be re-run after the manifest changes — it rewrites
   * its own rows and leaves hand-packed gear alone.
   */
  sourceEquipmentKey?: string;
}

export interface ContainerLoadResult {
  /**
   * Tare + known item weights; null only when ANY item weight is unknown.
   * Tare is treated as 0 when absent but reported via `tareUnknown`.
   */
  totalWeightKg: number | null;
  tareUnknown: boolean;
  unknownItemCount: number;
  /**
   * Tare plus everything packed in this container AND in every container
   * nested inside it, at any depth — the figure a driver needs before quoting
   * an axle load. null as soon as a single weight anywhere in that tree is
   * unknown, because a partial sum of a truck is more dangerous than no sum.
   * Equal to `totalWeightKg` when nothing is nested inside.
   */
  rolledUpWeightKg: number | null;
  /** Items without a weight in the whole nested tree, this container included. */
  rolledUpUnknownItemCount: number;
  /** True when this container's tare or any nested container's tare is unknown. */
  rolledUpTareUnknown: boolean;
  /** Containers nested inside this one, at any depth. */
  nestedContainerCount: number;
  /**
   * `rolledUpWeightKg` against `maxPayloadKg`. This is the utilization that
   * decides whether a vehicle is overloaded; `payloadUtilization` only ever
   * describes what was thrown in loose.
   */
  rolledUpPayloadUtilization: number | null;
  /** null when any packed volume unknown. */
  usedVolumeLiters: number | null;
  volumeIsEstimate: boolean;
  /**
   * `totalWeightKg` against `maxPayloadKg`, so it covers the direct contents
   * only; null when either side is unknown. Use `rolledUpPayloadUtilization`
   * to judge a vehicle.
   */
  payloadUtilization: number | null;
  /** null when usableVolumeLiters unknown. */
  volumeUtilization: number | null;
}
