import { describe, expect, it } from "vitest";
import { daysLeft, medicineRowState, shelfCounts, stockState } from "../api/stock";
import type { Facility, FacilityMedicineRow, MedicineDayRow } from "../api/types";
import { pinHtml, pinStatusForFacility } from "../components/map/icons";
import {
  bearingDeg,
  edgePoint,
  labelledFacilityIds,
  pinStatusesForMedicine,
} from "../components/map/mapLogic";

// Synthetic on purpose: small enough to check by hand.

describe("stockState", () => {
  it("is out with nothing on the shelf, whatever is on its way", () => {
    expect(stockState(0, 500, 10)).toBe("out");
  });

  it("counts deliveries due this week, as the map colours do", () => {
    // 30 on hand at 10 a day is 3 days; 50 more due makes it 8.
    expect(stockState(30, 0, 10)).toBe("low");
    expect(stockState(30, 50, 10)).toBe("ok");
  });

  it("calls over a month of stock spare", () => {
    expect(stockState(310, 0, 10)).toBe("spare");
    expect(stockState(300, 0, 10)).toBe("ok");
  });

  it("does not call stock low when nothing is being used", () => {
    expect(stockState(3, 0, 0)).toBe("ok");
  });
});

describe("daysLeft", () => {
  it("rounds down, as people say it", () => {
    expect(daysLeft(39, 10)).toBe(3);
    expect(daysLeft(5, 0)).toBeNull();
  });
});

function medRow(partial: Partial<MedicineDayRow>): MedicineDayRow {
  return {
    facility_id: "a",
    display_label: "PHC 1",
    on_hand: 100,
    in_stock: true,
    provenance: "estimated",
    days_of_cover: 10,
    next_expiry_day: null,
    status: "green",
    incoming_7d: 0,
    ...partial,
  };
}

describe("medicineRowState", () => {
  it("recovers the forecast from cover to apply the same rule", () => {
    // 60 units covering 6 days: 10 a day. 20 due this week makes 8 days.
    expect(medicineRowState(medRow({ on_hand: 60, days_of_cover: 6 }))).toBe("low");
    expect(medicineRowState(medRow({ on_hand: 60, days_of_cover: 6, incoming_7d: 20 }))).toBe(
      "ok",
    );
  });

  it("treats availability-only items as simply in or out", () => {
    const item = { on_hand: null, days_of_cover: null };
    expect(medicineRowState(medRow({ ...item, in_stock: false }))).toBe("out");
    expect(medicineRowState(medRow({ ...item, in_stock: true }))).toBe("ok");
  });
});

describe("shelfCounts", () => {
  it("splits the shelf into in stock, under a week and out", () => {
    const row = (on_hand: number, forecast: number, incoming_7d = 0) =>
      ({ on_hand, forecast, incoming_7d }) as FacilityMedicineRow;
    expect(shelfCounts([row(100, 1), row(5, 1), row(0, 1), row(5, 1, 10)])).toEqual({
      carried: 4,
      inStock: 2,
      underAWeek: 1,
      out: 1,
    });
  });
});

describe("pinHtml", () => {
  it("draws the shape for the facility type", () => {
    expect(pinHtml("phc", "ok")).toContain('data-pin="health-centre"');
    expect(pinHtml("district_hospital", "ok")).toContain('data-pin="hospital"');
    expect(pinHtml("private_hospital", "ok")).toContain('data-pin="hospital"');
    expect(pinHtml("pharmacy", "ok")).toContain('data-pin="pharmacy"');
    expect(pinHtml("other_government", "ok")).toContain("dashed");
  });

  it("repeats the stock state as a glyph, so it reads without colour", () => {
    expect(pinHtml("clinic", "low")).toContain('data-glyph="dot"');
    expect(pinHtml("clinic", "out")).toContain('data-glyph="bar"');
    expect(pinHtml("clinic", "ok")).not.toContain("data-glyph");
  });

  it("uses the design tokens rather than hex fills", () => {
    expect(pinHtml("clinic", "ok")).toContain("var(--color-scrub)");
    expect(pinHtml("clinic", "none")).toContain("var(--color-stone)");
  });

  it("rings the selected facility and dims those outside a spotlight", () => {
    expect(pinHtml("clinic", "ok", { selected: true })).toContain("data-selected");
    expect(pinHtml("clinic", "ok", { dimmed: true })).toContain("opacity:0.3");
  });
});

describe("pin statuses", () => {
  it("maps the facility colours onto pins", () => {
    expect(pinStatusForFacility("green")).toBe("ok");
    expect(pinStatusForFacility("amber")).toBe("low");
    expect(pinStatusForFacility("red")).toBe("out");
    expect(pinStatusForFacility(undefined)).toBe("unknown");
  });

  it("marks facilities that do not carry the medicine", () => {
    const facilities = [{ id: "a" }, { id: "b" }] as Facility[];
    const rows = [medRow({ facility_id: "a", on_hand: 0, in_stock: false })];
    expect(pinStatusesForMedicine(rows, facilities)).toEqual({ a: "out", b: "none" });
  });
});

describe("labelledFacilityIds", () => {
  it("labels the selection, then the busiest route's ends, then those out of stock", () => {
    const routes = [
      { fromId: "c", toId: "d", quantity: 5 },
      { fromId: "e", toId: "f", quantity: 50 },
    ];
    const pins = { a: "ok", b: "out", z: "out" } as const;
    expect(labelledFacilityIds("a", routes, pins, 6)).toEqual(["a", "f", "e", "d", "c", "b"]);
  });

  it("never labels more than the limit", () => {
    const pins = { a: "out", b: "out", c: "out", d: "out" } as const;
    expect(labelledFacilityIds(null, [], pins, 2)).toEqual(["a", "b"]);
  });
});

describe("map geometry", () => {
  it("gives compass bearings for arrowheads", () => {
    expect(bearingDeg([15, 75], [15.1, 75])).toBeCloseTo(0);
    expect(bearingDeg([15, 75], [15, 75.1])).toBeCloseTo(90);
    expect(bearingDeg([15, 75], [14.9, 75])).toBeCloseTo(180);
    expect(bearingDeg([15, 75], [15, 74.9])).toBeCloseTo(270);
  });

  it("brings manufacturer lines in from the nearest edge", () => {
    const bounds: [[number, number], [number, number]] = [
      [15, 75],
      [16, 76],
    ];
    expect(edgePoint([15.9, 75.5], bounds)).toEqual([16, 75.5]);
    expect(edgePoint([15.5, 75.05], bounds)).toEqual([15.5, 75]);
  });
});
