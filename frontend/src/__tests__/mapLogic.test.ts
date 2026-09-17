import { describe, expect, it } from "vitest";
import { shortMedicineName } from "../api/format";
import type { Facility, MedicineDayRow, SimulationEvent } from "../api/types";
import {
  distanceKm,
  eventsForDay,
  filterFacilities,
  groupRoutineOrders,
  manufacturerActivityForDay,
  rankByDistance,
  statusesByMedicine,
  statusesForDay,
  transferLinesForDay,
} from "../components/map/mapLogic";
import type { MapFilters } from "../state/store";

function facility(overrides: Partial<Facility> & { id: string }): Facility {
  return {
    display_label: overrides.id,
    facility_type: "clinic",
    ownership: "private",
    lat: 15.42,
    lon: 75.63,
    beds: null,
    in_network: true,
    verified: false,
    review_flags: [],
    source_ids: ["osm_overpass"],
    retrieved: "2026-09-16",
    provenance: { lat: "real", lon: "real", facility_type: "derived", ownership: "derived" },
    location_precision: "exact",
    medicine_list: "phc",
    level_unconfirmed: false,
    ...overrides,
  } as Facility;
}

const ALL_ON: MapFilters = {
  layers: { government: true, private: true, pharmacy: true },
  networkOnly: false,
  verifiedOnly: false,
  radiusKm: null,
};

describe("distanceKm", () => {
  it("measures a degree of latitude at about 111 km", () => {
    expect(distanceKm({ lat: 15, lon: 75 }, { lat: 16, lon: 75 })).toBeGreaterThan(110);
    expect(distanceKm({ lat: 15, lon: 75 }, { lat: 16, lon: 75 })).toBeLessThan(112);
  });

  it("is zero for the same point", () => {
    expect(distanceKm({ lat: 15.4, lon: 75.6 }, { lat: 15.4, lon: 75.6 })).toBe(0);
  });
});

describe("filterFacilities", () => {
  const facilities = [
    facility({ id: "phc-01", facility_type: "phc", ownership: "government" }),
    facility({ id: "priv-01", facility_type: "private_hospital" }),
    facility({ id: "pharm-01", facility_type: "pharmacy" }),
  ];

  it("shows everything when all layers are on", () => {
    expect(filterFacilities(facilities, ALL_ON)).toHaveLength(3);
  });

  it("hides government facilities when that layer is off", () => {
    const filters = { ...ALL_ON, layers: { ...ALL_ON.layers, government: false } };
    expect(filterFacilities(facilities, filters).map((f) => f.id)).toEqual([
      "priv-01",
      "pharm-01",
    ]);
  });

  it("does not hide pharmacies when both government and private are off", () => {
    // A pharmacy is neither, so it must answer only to its own toggle.
    const filters = {
      ...ALL_ON,
      layers: { government: false, private: false, pharmacy: true },
    };
    expect(filterFacilities(facilities, filters).map((f) => f.id)).toEqual(["pharm-01"]);
  });

  it("filters to verified facilities only", () => {
    const mixed = [facility({ id: "v", verified: true }), facility({ id: "u", verified: false })];
    const filters = { ...ALL_ON, verifiedOnly: true };
    expect(filterFacilities(mixed, filters).map((f) => f.id)).toEqual(["v"]);
  });

  it("filters to network members only", () => {
    const mixed = [
      facility({ id: "in", in_network: true }),
      facility({ id: "out", in_network: false }),
    ];
    const filters = { ...ALL_ON, networkOnly: true };
    expect(filterFacilities(mixed, filters).map((f) => f.id)).toEqual(["in"]);
  });

  it("filters by radius around an origin", () => {
    const near = facility({ id: "near", lat: 15.42, lon: 75.63 });
    const far = facility({ id: "far", lat: 15.62, lon: 75.85 });
    const filters = { ...ALL_ON, radiusKm: 10 };
    const result = filterFacilities([near, far], filters, { lat: 15.42, lon: 75.63 });
    expect(result.map((f) => f.id)).toEqual(["near"]);
  });
});

describe("statusesForDay", () => {
  const timeline = [
    { day: 0, status: { a: "green" as const } },
    { day: 1, status: { a: "red" as const } },
  ];

  it("returns the statuses for the requested day", () => {
    expect(statusesForDay(timeline, 1)).toEqual({ a: "red" });
  });

  it("clamps past the end rather than returning nothing", () => {
    expect(statusesForDay(timeline, 99)).toEqual({ a: "red" });
  });

  it("returns an empty map when there is no run", () => {
    expect(statusesForDay(undefined, 0)).toEqual({});
  });
});

describe("medicine search", () => {
  const facilities = [
    facility({ id: "a", display_label: "PHC 1", lat: 15.42, lon: 75.63 }),
    facility({ id: "b", display_label: "PHC 2", lat: 15.52, lon: 75.63 }),
    facility({ id: "c", display_label: "PHC 3", lat: 15.62, lon: 75.63 }),
  ];
  const rows: MedicineDayRow[] = [
    { facility_id: "c", display_label: "PHC 3", on_hand: 5, in_stock: true, provenance: "estimated", days_of_cover: 2, next_expiry_day: null, status: "green" },
    { facility_id: "a", display_label: "PHC 1", on_hand: 0, in_stock: false, provenance: "estimated", days_of_cover: 0, next_expiry_day: null, status: "red" },
    { facility_id: "b", display_label: "PHC 2", on_hand: 9, in_stock: true, provenance: "estimated", days_of_cover: 4, next_expiry_day: null, status: "green" },
  ];

  it("sorts nearest first from the chosen origin", () => {
    const ranked = rankByDistance(rows, facilities, "a");
    expect(ranked.map((r) => r.facility_id)).toEqual(["a", "b", "c"]);
    expect(ranked[0].distanceKm).toBe(0);
  });

  it("keeps out-of-stock facilities, because a shortage is the point", () => {
    const ranked = rankByDistance(rows, facilities, "a");
    expect(ranked.find((r) => r.facility_id === "a")?.on_hand).toBe(0);
  });

  it("can restrict to facilities that hold stock", () => {
    const ranked = rankByDistance(rows, facilities, "a", { inStockOnly: true });
    expect(ranked.map((r) => r.facility_id)).toEqual(["b", "c"]);
  });

  it("applies a radius filter", () => {
    const ranked = rankByDistance(rows, facilities, "a", { radiusKm: 15 });
    expect(ranked.map((r) => r.facility_id)).toEqual(["a", "b"]);
  });

  it("falls back to stock order when there is no origin", () => {
    const ranked = rankByDistance(rows, facilities, null);
    expect(ranked.map((r) => r.on_hand)).toEqual([9, 5, 0]);
  });

  it("ranks availability-only rows, which have no quantity, by in/out of stock", () => {
    const availabilityOnly: MedicineDayRow[] = rows.map((r) => ({ ...r, on_hand: null }));
    const ranked = rankByDistance(availabilityOnly, facilities, null, { inStockOnly: true });
    expect(ranked.map((r) => r.facility_id).sort()).toEqual(["b", "c"]);
  });

  it("recolours markers by the selected medicine", () => {
    expect(statusesByMedicine(rows)).toEqual({ a: "red", b: "green", c: "green" });
  });
});

describe("transfer lines", () => {
  const facilities = [
    facility({ id: "a", lat: 15.4, lon: 75.6 }),
    facility({ id: "b", lat: 15.5, lon: 75.7 }),
  ];
  const event = (overrides: Partial<SimulationEvent>): SimulationEvent => ({
    day: 5,
    type: "relief_transfer",
    medicine_id: "D001",
    message: "Moved 40 units",
    facility_id: null,
    from_facility_id: "a",
    to_facility_id: "b",
    quantity: 40,
    value: null,
    distance_km: 12,
    ...overrides,
  });

  it("draws a transfer on the day it happens", () => {
    expect(transferLinesForDay([event({})], facilities, 5)).toHaveLength(1);
  });

  it("keeps it visible briefly afterwards so playback does not flicker past it", () => {
    expect(transferLinesForDay([event({})], facilities, 6)).toHaveLength(1);
    expect(transferLinesForDay([event({})], facilities, 9)).toHaveLength(0);
  });

  it("does not draw transfers from the future", () => {
    expect(transferLinesForDay([event({ day: 20 })], facilities, 5)).toHaveLength(0);
  });

  it("ignores events that are not transfers", () => {
    const order = event({ type: "manufacturer_order", from_facility_id: null });
    expect(transferLinesForDay([order], facilities, 5)).toHaveLength(0);
  });

  it("distinguishes relief from rebalancing", () => {
    const rebalance = event({ type: "rebalance_transfer" });
    expect(transferLinesForDay([rebalance], facilities, 5)[0].kind).toBe("rebalance");
  });

  it("draws one line per route even when several medicines move together", () => {
    const lines = transferLinesForDay(
      [event({ medicine_id: "D001" }), event({ medicine_id: "D002", quantity: 10 })],
      facilities,
      5,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(50);
    expect(new Set(lines.map((l) => l.id)).size).toBe(lines.length);
  });

  it("summarises routine manufacturer orders and draws arrows only for express ones", () => {
    const base = { from_facility_id: null, to_facility_id: null, facility_id: "a" };
    const activity = manufacturerActivityForDay(
      [
        event({ ...base, type: "manufacturer_order", medicine_id: "D001" }),
        event({ ...base, type: "manufacturer_order", medicine_id: "D002" }),
        event({ ...base, type: "express_order", medicine_id: "D001" }),
        event({ ...base, type: "express_order", medicine_id: "D001" }),
      ],
      facilities,
      5,
    );
    expect(activity.routineOrders).toBe(2);
    expect(activity.routineFacilities).toBe(1);
    expect(activity.express).toHaveLength(1);
    expect(activity.express[0].orders).toBe(2);
  });
});

describe("groupRoutineOrders", () => {
  const order = (medicine: string, day = 1, facility = "a"): SimulationEvent => ({
    day, type: "manufacturer_order", medicine_id: medicine,
    message: "PHC 1 ordered 10 units of X from Manufacturer A, arriving day 21.",
    facility_id: facility, from_facility_id: null, to_facility_id: null,
    quantity: 10, value: null, distance_km: null,
  });

  it("collapses a facility's routine orders on one day into a single line", () => {
    const grouped = groupRoutineOrders([order("D1"), order("D2"), order("D3")]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].message).toContain("3 routine orders");
    expect(grouped[0].quantity).toBe(30);
  });

  it("keeps different facilities and days apart, and never groups other events", () => {
    const transfer = { ...order("D1"), type: "relief_transfer" };
    const grouped = groupRoutineOrders([order("D1"), order("D2", 2), order("D3", 1, "b"), transfer]);
    expect(grouped).toHaveLength(4);
  });

  it("does not modify the events it was given", () => {
    const events = [order("D1"), order("D2")];
    groupRoutineOrders(events);
    expect(events[0].message).toContain("ordered 10 units");
  });
});

describe("eventsForDay", () => {
  const events: SimulationEvent[] = [0, 1, 2, 3].map((day) => ({
    day,
    type: "stockout",
    medicine_id: "D001",
    message: `day ${day}`,
    facility_id: "a",
    from_facility_id: null,
    to_facility_id: null,
    quantity: 1,
    value: null,
    distance_km: null,
  }));

  it("shows only what has happened by now, newest first", () => {
    expect(eventsForDay(events, 2).map((e) => e.day)).toEqual([2, 1, 0]);
  });

  it("puts transfers ahead of routine orders on the same day", () => {
    const routine = { ...events[0], day: 5, type: "manufacturer_order", facility_id: "a" };
    const transfer = { ...events[0], day: 5, type: "relief_transfer" };
    expect(eventsForDay([routine, transfer], 5).map((e) => e.type)).toEqual([
      "relief_transfer",
      "manufacturer_order",
    ]);
  });

  it("returns nothing when there is no run", () => {
    expect(eventsForDay(undefined, 5)).toEqual([]);
  });
});

describe("shortMedicineName", () => {
  it("cuts the indent's compositional prose", () => {
    expect(
      shortMedicineName(
        "Theophylline and Etophylline Tablet Each Tablet Contains: Theophylline 23 mg",
      ),
    ).toBe("Theophylline and Etophylline Tablet");
  });

  it("drops a trailing pack size", () => {
    expect(shortMedicineName("Atenolol Tablet IP 50 mg 1x1")).toBe("Atenolol Tablet IP 50 mg");
  });

  it("truncates anything still too long", () => {
    const result = shortMedicineName("A".repeat(80));
    expect(result.length).toBeLessThanOrEqual(46);
    expect(result.endsWith("\u2026")).toBe(true);
  });

  it("never returns an empty label", () => {
    expect(shortMedicineName("Each tablet contains something")).toBeTruthy();
  });
});
