import { describe, expect, it } from "vitest";
import type { Facility, FacilityRunResponse, SimulationEvent } from "../api/types";
import {
  heroCandidates,
  pickHeroTransfer,
  shelvesToCheck,
} from "../components/home/heroTransfer";

// Synthetic on purpose: small enough to check by hand.

const FACILITIES = [
  { id: "phc-a", facility_type: "phc" },
  { id: "phc-b", facility_type: "phc" },
  { id: "clinic", facility_type: "clinic" },
] as Facility[];

function transfer(day: number, to: string, medicine: string, quantity = 10): SimulationEvent {
  return {
    day,
    type: "relief_transfer",
    medicine_id: medicine,
    message: "",
    facility_id: null,
    from_facility_id: "clinic",
    to_facility_id: to,
    quantity,
    value: null,
    distance_km: 2,
  };
}

function shelf(rows: Array<[string, number, number]>): FacilityRunResponse {
  return {
    medicines: rows.map(([medicine_id, on_hand, forecast]) => ({ medicine_id, on_hand, forecast })),
  } as FacilityRunResponse;
}

describe("heroCandidates", () => {
  it("keeps relief transfers into PHCs, earliest first, largest first within a day", () => {
    const events = [
      transfer(3, "phc-a", "m1"),
      transfer(1, "phc-b", "m2", 5),
      transfer(1, "phc-a", "m3", 50),
      transfer(0, "clinic", "m4"),
    ];
    expect(heroCandidates(events, FACILITIES).map((e) => e.medicine_id)).toEqual([
      "m3",
      "m2",
      "m1",
    ]);
  });
});

describe("shelvesToCheck", () => {
  it("asks for each receiving PHC's shelf once per day", () => {
    const candidates = [
      transfer(1, "phc-a", "m1"),
      transfer(1, "phc-a", "m2"),
      transfer(2, "phc-b", "m3"),
    ];
    expect(shelvesToCheck(candidates)).toEqual([
      { facilityId: "phc-a", day: 1 },
      { facilityId: "phc-b", day: 2 },
    ]);
  });
});

describe("pickHeroTransfer", () => {
  it("picks the first transfer into a PHC within two days of running out", () => {
    const candidates = [transfer(1, "phc-a", "plenty"), transfer(1, "phc-a", "nearly-out")];
    const shelves = new Map([
      [
        "phc-a:1",
        shelf([
          ["plenty", 100, 2],
          ["nearly-out", 3, 2],
        ]),
      ],
    ]);
    expect(pickHeroTransfer(candidates, shelves)).toEqual({ event: candidates[1], daysLeft: 1 });
  });

  it("falls back to the first transfer it can describe, with its real days left", () => {
    const candidates = [transfer(1, "phc-a", "m1")];
    const shelves = new Map([["phc-a:1", shelf([["m1", 50, 5]])]]);
    expect(pickHeroTransfer(candidates, shelves)).toEqual({ event: candidates[0], daysLeft: 10 });
  });

  it("waits until a shelf has loaded", () => {
    expect(pickHeroTransfer([transfer(1, "phc-a", "m1")], new Map())).toBeNull();
  });
});
