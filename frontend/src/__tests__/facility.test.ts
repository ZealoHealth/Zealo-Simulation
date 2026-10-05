import { describe, expect, it } from "vitest";
import type {
  AvailabilityOnlyRow,
  FacilityMedicineRow,
  MedicineSeries,
  SimulationEvent,
} from "../api/types";
import {
  chartPoints,
  isNearExpiry,
  shelfItems,
  transferMarks,
  type ShelfFilter,
} from "../components/facility/shelfLogic";
import { zealoAction } from "../components/panels/zealoAction";

// Synthetic on purpose: small enough to check by hand.

function row(partial: Partial<FacilityMedicineRow>): FacilityMedicineRow {
  return {
    medicine_id: "m",
    name: "Medicine",
    therapeutic_group: "Group A",
    on_hand: 100,
    demand: 0,
    dispensed: 0,
    unmet: 0,
    forecast: 1,
    days_of_cover: 100,
    incoming_7d: 0,
    next_expiry_day: 400,
    status: "green",
    ...partial,
  };
}

function event(
  partial: Partial<SimulationEvent> & Pick<SimulationEvent, "day" | "type">,
): SimulationEvent {
  return {
    medicine_id: "m",
    message: "",
    facility_id: null,
    from_facility_id: null,
    to_facility_id: null,
    quantity: 0,
    value: null,
    distance_km: null,
    ...partial,
  };
}

const ROWS = [
  row({ medicine_id: "healthy", name: "Healthy" }),
  row({ medicine_id: "near", name: "Near", next_expiry_day: 50 }),
  row({ medicine_id: "out", name: "Out", on_hand: 0 }),
  row({ medicine_id: "low3", name: "Low three", on_hand: 3 }),
  row({ medicine_id: "low1", name: "Low one", on_hand: 1, therapeutic_group: "Group B" }),
];
const SURVEY: AvailabilityOnlyRow[] = [
  {
    medicine_id: "s",
    name: "Survey item",
    survey_sl_no: 1,
    in_stock: false,
    provenance: "derived",
  },
];

const ids = (filter: ShelfFilter, group = "") =>
  shelfItems({ rows: ROWS, availability: SURVEY, day: 0, filter, group }).map((i) => i.id);

describe("shelfItems", () => {
  it("puts problems first: out, under a week (fewest days first), near expiry, the rest", () => {
    expect(ids("problems")).toEqual(["out", "low1", "low3", "near", "healthy", "s"]);
  });

  it("filters by status", () => {
    expect(ids("low")).toEqual(["low1", "low3"]);
    expect(ids("near")).toEqual(["near"]);
    expect(ids("out")).toEqual(["out", "s"]);
    expect(ids("survey")).toEqual(["s"]);
  });

  it("filters by group, leaving out survey items, which have none", () => {
    expect(ids("problems", "Group B")).toEqual(["low1"]);
  });

  it("only calls stock near expiry when there is stock to expire", () => {
    expect(isNearExpiry(row({ next_expiry_day: 80 }), 0)).toBe(true);
    expect(isNearExpiry(row({ next_expiry_day: 200 }), 0)).toBe(false);
    expect(isNearExpiry(row({ next_expiry_day: 80, on_hand: 0 }), 0)).toBe(false);
  });
});

const SERIES: MedicineSeries = {
  medicine_id: "m",
  name: "Medicine",
  days: [0, 1, 2, 3],
  on_hand: [10, 4, 64, 60],
  demand: [0, 0, 0, 0],
  dispensed: [0, 0, 0, 0],
  unmet: [0, 0, 0, 0],
  forecast: [2, 2, 2, 2],
  on_the_way: [0, 60, 0, 0],
  reorder_point: [56, 56, 56, 56],
};

describe("chart", () => {
  it("draws shelf plus everything on its way", () => {
    expect(chartPoints(SERIES)[1]).toEqual({
      day: 2,
      shelf: 4,
      withIncoming: 64,
      reorderPoint: 56,
    });
  });

  it("labels a transfer where it lands on the shelf, a day after it is sent", () => {
    const events = [
      event({
        day: 1,
        type: "relief_transfer",
        from_facility_id: "b",
        to_facility_id: "a",
        quantity: 60,
      }),
      event({
        day: 1,
        type: "relief_transfer",
        from_facility_id: "a",
        to_facility_id: "b",
        quantity: 9,
      }),
    ];
    const labels = new Map([["b", "PHC 7"]]);
    expect(transferMarks(events, "a", SERIES, labels)).toEqual([
      { day: 3, shelf: 64, label: "+60 from PHC 7" },
    ]);
  });

  it("gives transfers landing on the same day one label, not overlapping ones", () => {
    const events = ["b", "c", "d"].map((from, i) =>
      event({
        day: 1,
        type: "relief_transfer",
        from_facility_id: from,
        to_facility_id: "a",
        quantity: 10 + i,
      }),
    );
    expect(transferMarks(events, "a", SERIES, new Map())).toEqual([
      { day: 3, shelf: 64, label: "+33 from 3 facilities" },
    ]);
  });
});

describe("zealoAction", () => {
  const labels = new Map([
    ["b", "PHC 7"],
    ["c", "Clinic 2"],
  ]);
  const base = { facilityId: "a", day: 5, labels, nearExpiry: false };
  const transferIn = event({
    day: 5,
    type: "relief_transfer",
    from_facility_id: "b",
    to_facility_id: "a",
    quantity: 60,
  });

  it("says when a transfer in arrives", () => {
    expect(
      zealoAction({ ...base, row: row({ on_hand: 0 }), state: "out", events: [transferIn] }),
    ).toEqual({ text: "Transfer of 60 from PHC 7, arrives tomorrow", move: true });
    expect(
      zealoAction({ ...base, day: 6, row: row({}), state: "low", events: [transferIn] })?.text,
    ).toBe("Transfer of 60 from PHC 7, arrived today");
  });

  it("says when near-expiry stock is sent on", () => {
    const sent = event({
      day: 5,
      type: "rebalance_transfer",
      from_facility_id: "a",
      to_facility_id: "c",
      quantity: 12,
    });
    expect(
      zealoAction({ ...base, nearExpiry: true, row: row({}), state: "ok", events: [sent] })?.text,
    ).toBe("Sending 12 to Clinic 2 before it expires");
  });

  it("falls back to what is due, and says nothing about a healthy item", () => {
    expect(
      zealoAction({ ...base, row: row({ incoming_7d: 40 }), state: "low", events: [] })?.text,
    ).toBe("40 units due this week");
    expect(zealoAction({ ...base, row: row({}), state: "low", events: [] })?.text).toBe(
      "No delivery due this week",
    );
    expect(zealoAction({ ...base, row: row({}), state: "ok", events: [] })).toBeNull();
  });
});
