/**
 * The one real transfer the Home page shows: the first relief transfer into a PHC that
 * was within two days of running out on the day it was sent. Chosen from the run, never
 * written by hand, so the picture changes with the data.
 *
 * Whether the PHC was nearly out is read from its own shelf that day (transfers arrive
 * the next day, so the shelf that day is before the help arrives).
 */
import { daysLeft } from "../../api/stock";
import type { Facility, FacilityRunResponse, SimulationEvent } from "../../api/types";

export const HERO_DAYS_LEFT = 2;

/** Relief transfers into PHCs, earliest first, largest first within a day. */
export function heroCandidates(
  events: SimulationEvent[] | undefined,
  facilities: Facility[],
): SimulationEvent[] {
  const phcs = new Set(facilities.filter((f) => f.facility_type === "phc").map((f) => f.id));
  return (events ?? [])
    .filter(
      (e) =>
        e.type === "relief_transfer" &&
        e.to_facility_id != null &&
        e.from_facility_id != null &&
        phcs.has(e.to_facility_id),
    )
    .sort((a, b) => a.day - b.day || b.quantity - a.quantity);
}

/** The receiving shelves to look at: one per (PHC, day), in candidate order. */
export function shelvesToCheck(candidates: SimulationEvent[], limit = 4) {
  const seen = new Set<string>();
  const out: Array<{ facilityId: string; day: number }> = [];
  for (const c of candidates) {
    const key = `${c.to_facility_id}:${c.day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ facilityId: c.to_facility_id!, day: c.day });
    if (out.length === limit) break;
  }
  return out;
}

export interface HeroTransfer {
  event: SimulationEvent;
  /** Days of stock the PHC had left that day; 0 means it had run out. */
  daysLeft: number | null;
}

export function pickHeroTransfer(
  candidates: SimulationEvent[],
  shelves: Map<string, FacilityRunResponse>,
): HeroTransfer | null {
  let fallback: HeroTransfer | null = null;
  for (const event of candidates) {
    const shelf = shelves.get(`${event.to_facility_id}:${event.day}`);
    if (!shelf) continue;
    const row = shelf.medicines.find((m) => m.medicine_id === event.medicine_id);
    if (!row) continue;
    const left = daysLeft(row.on_hand, row.forecast);
    const pick = { event, daysLeft: left };
    if (left != null && left <= HERO_DAYS_LEFT) return pick;
    fallback ??= pick;
  }
  return fallback;
}
