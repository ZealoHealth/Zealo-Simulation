/**
 * What the network has moved so far, derived from the run's event log.
 *
 * The event log arrives once with the run and is what the map's feed and transfer
 * lines are drawn from. Computing the Network page's movement figures from the same
 * log means the two views agree at every point in playback, and a new day costs no
 * request -- only the per-day surplus/shortage positions come from the server.
 */
import type { SimulationEvent } from "../../api/types";

export interface CumulativePoint {
  /** 1-based, as shown on screen; 0 is the start, before anything has moved. */
  day: number;
  /** Null after the selected day, so the chart grows with playback. */
  units: number | null;
  transfers: number | null;
}

export interface MedicineMovement {
  medicineId: string;
  relief: number;
  rebalance: number;
}

export interface NetworkActivity {
  transfers: number;
  units: number;
  distanceKm: number;
  expiredUnits: number;
  cumulative: CumulativePoint[];
  topMedicines: MedicineMovement[];
}

const isTransfer = (e: SimulationEvent) =>
  e.type === "relief_transfer" || e.type === "rebalance_transfer";

/** Transfers, units, distance and expiry up to and including `day` (0-based). */
export function networkActivity(
  events: SimulationEvent[] | undefined,
  day: number,
  totalDays: number,
  topN = 8,
): NetworkActivity {
  const perDay = Array.from({ length: Math.max(totalDays, 0) }, () => ({ transfers: 0, units: 0 }));
  const byMedicine = new Map<string, MedicineMovement>();
  let transfers = 0;
  let units = 0;
  let distanceKm = 0;
  let expiredUnits = 0;

  for (const event of events ?? []) {
    if (event.day > day) continue;
    if (event.type === "expired") {
      expiredUnits += event.quantity;
      continue;
    }
    if (!isTransfer(event)) continue;
    transfers += 1;
    units += event.quantity;
    distanceKm += event.distance_km ?? 0;
    if (perDay[event.day]) {
      perDay[event.day].transfers += 1;
      perDay[event.day].units += event.quantity;
    }
    const row = byMedicine.get(event.medicine_id) ?? {
      medicineId: event.medicine_id,
      relief: 0,
      rebalance: 0,
    };
    if (event.type === "relief_transfer") row.relief += event.quantity;
    else row.rebalance += event.quantity;
    byMedicine.set(event.medicine_id, row);
  }

  // A zero at the start, or on day 1 the chart would be a single point and draw
  // nothing, although most rebalancing happens as the network first sees its stock.
  let runningUnits = 0;
  let runningTransfers = 0;
  const cumulative: CumulativePoint[] = perDay.length ? [{ day: 0, units: 0, transfers: 0 }] : [];
  perDay.forEach((point, index) => {
    if (index > day) {
      cumulative.push({ day: index + 1, units: null, transfers: null });
      return;
    }
    runningUnits += point.units;
    runningTransfers += point.transfers;
    cumulative.push({ day: index + 1, units: runningUnits, transfers: runningTransfers });
  });

  const topMedicines = [...byMedicine.values()]
    .sort(
      (a, b) =>
        b.relief + b.rebalance - (a.relief + a.rebalance) ||
        a.medicineId.localeCompare(b.medicineId),
    )
    .slice(0, topN);

  return {
    transfers,
    units,
    distanceKm: Math.round(distanceKm * 10) / 10,
    expiredUnits,
    cumulative,
    topMedicines,
  };
}
