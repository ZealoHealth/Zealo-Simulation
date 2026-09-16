import { describe, expect, it } from "vitest";
import type { Facility, MedicineDayRow, SimulationEvent } from "../api/types";
import {
  distanceKm,
  eventsForDay,
  filterFacilities,
  manufacturerArrowsForDay,
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
    ...overrides,
  } as Facility;
}

const ALL_ON: MapFilters = {
  layers: { government: true, private: true, pharmacy: true },
  networkOnly: false,
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
    { facility_id: "c", display_label: "PHC 3", on_hand: 5, days_of_cover: 2, next_expiry_day: null, status: "green" },
    { facility_id: "a", display_label: "PHC 1", on_hand: 0, days_of_cover: 0, next_expiry_day: null, status: "red" },
    { facility_id: "b", display_label: "PHC 2", on_hand: 9, days_of_cover: 4, next_expiry_day: null, status: "green" },
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

  it("draws manufacturer orders as off-map arrows", () => {
    const order = event({
      type: "manufacturer_order",
      facility_id: "a",
      from_facility_id: null,
      to_facility_id: null,
    });
    const arrows = manufacturerArrowsForDay([order], facilities, 5);
    expect(arrows).toHaveLength(1);
    expect(arrows[0].express).toBe(false);
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

  it("returns nothing when there is no run", () => {
    expect(eventsForDay(undefined, 5)).toEqual([]);
  });
});
