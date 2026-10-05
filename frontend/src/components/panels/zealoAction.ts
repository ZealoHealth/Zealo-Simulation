/**
 * "What Zealo is doing" about one medicine at one facility, in words, read from the
 * facility's own events. Shared by the map's facility rail and the shelf table.
 *
 * Transfers take a day, so a transfer placed today "arrives tomorrow" and one placed
 * yesterday "arrived today". Nothing is said about a healthy item.
 */
import type { StockState } from "../../api/stock";
import type { FacilityMedicineRow, SimulationEvent } from "../../api/types";

const TRANSFER_TYPES = new Set(["relief_transfer", "rebalance_transfer"]);

export interface ZealoAction {
  text: string;
  /** A transfer: drawn in the movement colour. */
  move: boolean;
}

export function zealoAction({
  row,
  state,
  nearExpiry,
  events,
  facilityId,
  day,
  labels,
}: {
  row: FacilityMedicineRow;
  state: StockState;
  nearExpiry: boolean;
  events: SimulationEvent[];
  facilityId: string;
  day: number;
  labels: Map<string, string>;
}): ZealoAction | null {
  const recent = events.filter(
    (e) => e.medicine_id === row.medicine_id && (e.day === day || e.day === day - 1),
  );
  const label = (id: string | null) => labels.get(id ?? "") ?? "a neighbour";

  const incoming = recent.find(
    (e) => TRANSFER_TYPES.has(e.type) && e.to_facility_id === facilityId,
  );
  if (incoming) {
    const when = incoming.day === day ? "arrives tomorrow" : "arrived today";
    return {
      text: `Transfer of ${incoming.quantity.toLocaleString()} from ${label(incoming.from_facility_id)}, ${when}`,
      move: true,
    };
  }
  const outgoing = recent.find(
    (e) => e.type === "rebalance_transfer" && e.from_facility_id === facilityId && e.day === day,
  );
  if (outgoing) {
    return {
      text: `Sending ${outgoing.quantity.toLocaleString()} to ${label(outgoing.to_facility_id)} before it expires`,
      move: true,
    };
  }
  const express = recent.some(
    (e) => e.type === "express_order" && e.facility_id === facilityId && e.day === day,
  );
  if (express) return { text: "Express order placed with Manufacturer A", move: false };

  if (state !== "out" && state !== "low" && !nearExpiry) return null;
  if (row.incoming_7d > 0) {
    return { text: `${row.incoming_7d.toLocaleString()} units due this week`, move: false };
  }
  if (state === "out" || state === "low") return { text: "No delivery due this week", move: false };
  return null;
}
