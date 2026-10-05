/**
 * The Facility page's shelf: which medicines to list, in what order, and the chart of
 * one of them. Pure, so the ordering and the chart's labels can be tested directly.
 */
import { daysLeft, facilityRowState, type StockState } from "../../api/stock";
import type {
  AvailabilityOnlyRow,
  FacilityMedicineRow,
  MedicineSeries,
  SimulationEvent,
} from "../../api/types";

/** Stock within this many days of expiry is "near expiry", as the backend's rule. */
export const NEAR_EXPIRY_DAYS = 90;

export type ShelfFilter = "problems" | "out" | "low" | "near" | "ok" | "survey";

export type ShelfItem =
  | {
      kind: "modelled";
      id: string;
      row: FacilityMedicineRow;
      state: StockState;
      nearExpiry: boolean;
      rank: number;
    }
  | { kind: "survey"; id: string; item: AvailabilityOnlyRow; rank: number };

export function isNearExpiry(row: FacilityMedicineRow, day: number): boolean {
  return (
    row.on_hand > 0 &&
    row.next_expiry_day != null &&
    row.next_expiry_day - day <= NEAR_EXPIRY_DAYS
  );
}

/** Out, then under a week, then near expiry, then the rest; survey-only items last. */
function rankOf(state: StockState, nearExpiry: boolean): number {
  if (state === "out") return 0;
  if (state === "low") return 1;
  if (nearExpiry) return 2;
  return 3;
}

export function shelfItems({
  rows,
  availability,
  day,
  filter,
  group,
}: {
  rows: FacilityMedicineRow[];
  availability: AvailabilityOnlyRow[];
  day: number;
  filter: ShelfFilter;
  /** A therapeutic group, or "" for all. Survey-only items have no group. */
  group: string;
}): ShelfItem[] {
  const modelled: ShelfItem[] = rows
    .filter((row) => !group || row.therapeutic_group === group)
    .map((row) => {
      const state = facilityRowState(row);
      const nearExpiry = isNearExpiry(row, day);
      return {
        kind: "modelled",
        id: row.medicine_id,
        row,
        state,
        nearExpiry,
        rank: rankOf(state, nearExpiry),
      };
    });
  const survey: ShelfItem[] = group
    ? []
    : availability.map((item) => ({ kind: "survey", id: item.medicine_id, item, rank: 4 }));

  const keep = (item: ShelfItem) => {
    switch (filter) {
      case "out":
        return item.kind === "modelled" ? item.state === "out" : !item.item.in_stock;
      case "low":
        return item.kind === "modelled" && item.state === "low";
      case "near":
        return item.kind === "modelled" && item.rank === 2;
      case "ok":
        return item.kind === "modelled" && item.rank === 3;
      case "survey":
        return item.kind === "survey";
      default:
        return true;
    }
  };

  const days = (item: ShelfItem) =>
    item.kind === "modelled"
      ? (daysLeft(item.row.on_hand, item.row.forecast) ?? Infinity)
      : Infinity;
  const name = (item: ShelfItem) => (item.kind === "modelled" ? item.row.name : item.item.name);

  return [...modelled, ...survey]
    .filter(keep)
    .sort((a, b) => a.rank - b.rank || days(a) - days(b) || name(a).localeCompare(name(b)));
}

export interface ChartPoint {
  /** 1-based, as shown. */
  day: number;
  shelf: number;
  /** Shelf plus everything still on its way (orders and transfers). */
  withIncoming: number | null;
  reorderPoint: number | null;
}

export function chartPoints(series: MedicineSeries): ChartPoint[] {
  return series.days.map((d, i) => ({
    day: d + 1,
    shelf: series.on_hand[i],
    withIncoming: series.on_the_way ? series.on_hand[i] + series.on_the_way[i] : null,
    reorderPoint: series.reorder_point ? series.reorder_point[i] : null,
  }));
}

export interface TransferMark {
  /** 1-based day the stock reaches the shelf (transfers take a day). */
  day: number;
  shelf: number;
  label: string;
}

/**
 * The largest transfers into the facility, labelled where they land on the shelf line.
 * Transfers arriving the same day are one step on the line, so they share one label
 * ("+56 from 3 facilities") rather than printing over each other.
 */
export function transferMarks(
  events: SimulationEvent[],
  facilityId: string,
  series: MedicineSeries,
  labels: Map<string, string>,
  limit = 3,
): TransferMark[] {
  const byArrival = new Map<number, { units: number; sources: string[] }>();
  for (const e of events) {
    if (e.medicine_id !== series.medicine_id || e.to_facility_id !== facilityId) continue;
    if (e.type !== "relief_transfer" && e.type !== "rebalance_transfer") continue;
    const arrival = e.day + 1; // transfers take a day
    if (arrival >= series.days.length) continue;
    const step = byArrival.get(arrival) ?? { units: 0, sources: [] };
    step.units += e.quantity;
    step.sources.push(labels.get(e.from_facility_id ?? "") ?? "a neighbour");
    byArrival.set(arrival, step);
  }
  return [...byArrival.entries()]
    .sort((a, b) => b[1].units - a[1].units || a[0] - b[0])
    .slice(0, limit)
    .map(([arrival, step]) => ({
      day: arrival + 1,
      shelf: series.on_hand[arrival],
      label: `+${step.units.toLocaleString()} from ${
        step.sources.length === 1 ? step.sources[0] : `${step.sources.length} facilities`
      }`,
    }));
}
