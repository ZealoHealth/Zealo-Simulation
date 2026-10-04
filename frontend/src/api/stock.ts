/**
 * How much of one medicine a facility has, in words.
 *
 * The backend's row status (green / amber / red) folds two different things into
 * amber: under a week of cover, and stock within 90 days of expiry. The map and the
 * shelf lists need "under a week" on its own, so the stock state is derived here from
 * the same quantities, with the same rule for cover: deliveries due within the week
 * count, as they do for the map colours.
 */
import type { FacilityMedicineRow, MedicineDayRow } from "./types";

/** Under this many days of cover (including deliveries due this week) is "under a week". */
export const LOW_COVER_DAYS = 7;
/** Over this many days is spare, the Network page's surplus rule. */
export const SPARE_DAYS = 30;

export type StockState = "spare" | "ok" | "low" | "out";

export function stockState(onHand: number, incoming: number, forecast: number | null): StockState {
  if (onHand <= 0) return "out";
  if (forecast == null || forecast <= 0) return "ok";
  const cover = (onHand + incoming) / forecast;
  if (cover < LOW_COVER_DAYS) return "low";
  if (cover > SPARE_DAYS) return "spare";
  return "ok";
}

/** Days of stock on the shelf alone, rounded down, as people say it. */
export function daysLeft(onHand: number, forecast: number | null): number | null {
  if (forecast == null || forecast <= 0) return null;
  return Math.floor(onHand / forecast);
}

export function facilityRowState(row: FacilityMedicineRow): StockState {
  return stockState(row.on_hand, row.incoming_7d, row.forecast);
}

/**
 * The medicine view's rows carry cover rather than the forecast; the forecast is
 * on_hand / cover. Availability-only items have no quantities: in or out only.
 */
export function medicineRowForecast(row: MedicineDayRow): number | null {
  if (row.on_hand == null || row.days_of_cover == null || row.days_of_cover <= 0) return null;
  return row.on_hand / row.days_of_cover;
}

export function medicineRowState(row: MedicineDayRow): StockState {
  if (row.on_hand == null) return row.in_stock ? "ok" : "out";
  return stockState(row.on_hand, row.incoming_7d ?? 0, medicineRowForecast(row));
}

export interface ShelfCounts {
  carried: number;
  inStock: number;
  underAWeek: number;
  out: number;
}

/** "47 medicines carried. 43 in stock, 3 under a week, 1 out." */
export function shelfCounts(rows: FacilityMedicineRow[]): ShelfCounts {
  const counts: ShelfCounts = { carried: rows.length, inStock: 0, underAWeek: 0, out: 0 };
  for (const row of rows) {
    const state = facilityRowState(row);
    if (state === "out") counts.out += 1;
    else if (state === "low") counts.underAWeek += 1;
    else counts.inStock += 1;
  }
  return counts;
}
