import { describe, expect, it } from "vitest";
import { keepWhileOnlyDayChanges } from "../api/placeholder";
import type { SimulationEvent } from "../api/types";
import { networkActivity } from "../components/network/networkLogic";

function event(overrides: Partial<SimulationEvent> & { day: number; type: string }): SimulationEvent {
  return {
    medicine_id: "D00001",
    message: "",
    facility_id: null,
    from_facility_id: "phc-01",
    to_facility_id: "phc-02",
    quantity: 10,
    value: null,
    distance_km: 5,
    ...overrides,
  };
}

const EVENTS: SimulationEvent[] = [
  event({ day: 0, type: "relief_transfer", quantity: 20, distance_km: 4 }),
  event({ day: 0, type: "manufacturer_order", quantity: 500, distance_km: null }),
  event({ day: 2, type: "rebalance_transfer", medicine_id: "D00002", quantity: 8, distance_km: 6.25 }),
  event({ day: 3, type: "expired", quantity: 3, distance_km: null }),
  event({ day: 5, type: "relief_transfer", quantity: 5 }),
];

describe("networkActivity", () => {
  it("counts only what has happened up to the selected day", () => {
    const early = networkActivity(EVENTS, 1, 7);
    expect(early).toMatchObject({ transfers: 1, units: 20, distanceKm: 4, expiredUnits: 0 });

    const later = networkActivity(EVENTS, 3, 7);
    expect(later).toMatchObject({ transfers: 2, units: 28, distanceKm: 10.3, expiredUnits: 3 });
  });

  it("matches the run totals on the last day", () => {
    const last = networkActivity(EVENTS, 6, 7);
    expect(last.transfers).toBe(3);
    expect(last.units).toBe(33);
  });

  it("ignores routine manufacturer orders", () => {
    expect(networkActivity(EVENTS, 0, 7).units).toBe(20);
  });

  it("grows the chart with playback and leaves later days empty", () => {
    const { cumulative } = networkActivity(EVENTS, 2, 7);
    expect(cumulative).toHaveLength(8);
    // Starts from zero, so day 1 alone still draws a line.
    expect(cumulative.map((p) => p.units)).toEqual([0, 20, 20, 28, null, null, null, null]);
    expect(cumulative.map((p) => p.day)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("ranks medicines by units moved so far, split by reason", () => {
    const { topMedicines } = networkActivity(EVENTS, 6, 7);
    expect(topMedicines[0]).toEqual({ medicineId: "D00001", relief: 25, rebalance: 0 });
    expect(topMedicines[1]).toEqual({ medicineId: "D00002", relief: 0, rebalance: 8 });
  });

  it("is empty before a run exists", () => {
    const none = networkActivity(undefined, 0, 0);
    expect(none).toMatchObject({ transfers: 0, units: 0, cumulative: [], topMedicines: [] });
  });
});

describe("keepWhileOnlyDayChanges", () => {
  const previous = { rows: ["day 4"] };

  it("keeps the previous day's data so the page does not blank", () => {
    const next = keepWhileOnlyDayChanges(["redistribution", "run1", "with_zealo", 5, null], 3);
    expect(
      next(previous, { queryKey: ["redistribution", "run1", "with_zealo", 4, null] }),
    ).toBe(previous);
  });

  it("drops it when anything but the day changed", () => {
    const next = keepWhileOnlyDayChanges(["facility-run", "run1", "phc-02", "with_zealo", 5, null], 4);
    expect(
      next(previous, { queryKey: ["facility-run", "run1", "phc-01", "with_zealo", 4, null] }),
    ).toBeUndefined();
    expect(
      next(previous, { queryKey: ["facility-run", "run0", "phc-02", "with_zealo", 4, null] }),
    ).toBeUndefined();
  });

  it("has nothing to keep on the first load", () => {
    const next = keepWhileOnlyDayChanges(["redistribution", "run1", "with_zealo", 0, null], 3);
    expect(next(undefined, undefined)).toBeUndefined();
  });
});
