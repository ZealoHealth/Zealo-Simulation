/**
 * The demo's storyline, computed from the run rather than written by hand.
 *
 * Every number a chapter quotes comes from the simulation the page is showing, so
 * the story cannot drift from the map when the data, the settings or the seed
 * change. Nothing here is invented: a chapter whose moment did not happen in the
 * run (no express order, say) is left out instead of being described anyway.
 *
 * The contrast uses the baseline the backend always runs ("on their own"): the same
 * facilities, the same demand and the same opening stock, each managing its stock
 * alone. The mode toggle and Compare page stay hidden; only the story quotes it.
 */
import type { DayStatus, SimulateResponse, SimulationEvent } from "../../api/types";

export interface ExampleTransfer {
  day: number;
  medicineId: string;
  fromId: string;
  toId: string;
  quantity: number;
  distanceKm: number;
}

export interface StoryFacts {
  totalDays: number;
  facilityCount: number;
  /** Facilities red on day 1. Day 1 is the same in both modes: one opening stock. */
  openingRed: string[];
  openingAvailability: number;
  /** A day-1 shortage at a red facility covered by a nearby member. */
  example: ExampleTransfer | null;
  firstDay: { transfers: number; units: number; distanceKm: number };
  /** First day (0-based) with no red facility, or null if it never happens. */
  allClear: { zealo: number | null; alone: number | null };
  express: { count: number; first: SimulationEvent | null };
  transfers: { count: number; units: number };
  /** Share of facility-medicine-days in stock over the whole run. */
  availability: { zealo: number; alone: number };
  stockoutDays: { zealo: number; alone: number };
  unmetUnits: { zealo: number; alone: number };
}

/**
 * Several facilities share a site (under 100 m apart), and their markers overlap.
 * The worked example skips those so the move is visible on the map.
 */
export const MIN_EXAMPLE_DISTANCE_KM = 0.5;

const isTransfer = (e: SimulationEvent) =>
  e.type === "relief_transfer" || e.type === "rebalance_transfer";

export function redOn(timeline: DayStatus[] | undefined, day: number): string[] {
  const status = timeline?.[day]?.status ?? {};
  return Object.keys(status)
    .filter((id) => status[id] === "red")
    .sort();
}

function firstAllClear(timeline: DayStatus[] | undefined): number | null {
  if (!timeline) return null;
  const index = timeline.findIndex((d) => !Object.values(d.status).includes("red"));
  return index === -1 ? null : index;
}

function metric(run: SimulateResponse, mode: "with_zealo" | "without_zealo", key: string): number {
  const value = run.summaries.find((s) => s.mode === mode)?.metrics[key];
  return typeof value === "number" ? value : 0;
}

/** The facts the story quotes, all taken from one run. */
export function storyFacts(run: SimulateResponse): StoryFacts {
  const zealo = run.timeline.with_zealo;
  const alone = run.timeline.without_zealo;
  const events = run.events.with_zealo ?? [];
  const transfers = events.filter(isTransfer);

  const dayOne = transfers.filter((e) => e.day === 0);
  const openingRed = redOn(zealo, 0);
  const relief = dayOne
    .filter((e) => e.type === "relief_transfer" && e.from_facility_id && e.to_facility_id)
    .sort(
      (a, b) =>
        (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity) ||
        b.quantity - a.quantity ||
        a.medicine_id.localeCompare(b.medicine_id),
    );
  // The example follows on from the "problem" chapter: help reaching a facility in
  // the red, from somewhere far enough away to be a different place on the map.
  const best =
    relief.find(
      (e) =>
        openingRed.includes(e.to_facility_id!) && (e.distance_km ?? 0) >= MIN_EXAMPLE_DISTANCE_KM,
    ) ?? relief[0];
  const expressOrders = events.filter((e) => e.type === "express_order");

  return {
    totalDays: run.days,
    facilityCount: Object.keys(zealo?.[0]?.status ?? {}).length,
    openingRed,
    openingAvailability: zealo?.[0]?.availability_rate ?? 0,
    example: best
      ? {
          day: best.day,
          medicineId: best.medicine_id,
          fromId: best.from_facility_id!,
          toId: best.to_facility_id!,
          quantity: best.quantity,
          distanceKm: best.distance_km ?? 0,
        }
      : null,
    firstDay: {
      transfers: dayOne.length,
      units: dayOne.reduce((sum, e) => sum + e.quantity, 0),
      distanceKm: Math.round(dayOne.reduce((sum, e) => sum + (e.distance_km ?? 0), 0)),
    },
    allClear: { zealo: firstAllClear(zealo), alone: firstAllClear(alone) },
    express: { count: expressOrders.length, first: expressOrders[0] ?? null },
    transfers: {
      count: transfers.length,
      units: transfers.reduce((sum, e) => sum + e.quantity, 0),
    },
    availability: {
      zealo: metric(run, "with_zealo", "availability_rate"),
      alone: metric(run, "without_zealo", "availability_rate"),
    },
    stockoutDays: {
      zealo: metric(run, "with_zealo", "stockout_item_days"),
      alone: metric(run, "without_zealo", "stockout_item_days"),
    },
    unmetUnits: {
      zealo: metric(run, "with_zealo", "unmet_units"),
      alone: metric(run, "without_zealo", "unmet_units"),
    },
  };
}

/** Percentage reduction from `before` to `after`, rounded; null when undefined. */
export function reduction(before: number, after: number): number | null {
  if (before <= 0) return null;
  return Math.round(((before - after) / before) * 100);
}

export const pct = (rate: number, digits = 1) => `${(rate * 100).toFixed(digits)}%`;

export interface ChapterStat {
  label: string;
  value: string;
  /** "zealo" figures are drawn in the brand colour, "alone" ones muted. */
  tone: "zealo" | "alone" | "neutral";
}

export interface Chapter {
  id: string;
  kicker: string;
  title: string;
  body: string[];
  /** The day (0-based) the map shows when the chapter opens. */
  day: number;
  /** If set, the map plays from `day` to this day while the chapter is open. */
  playTo?: number;
  /** Facilities to spotlight; the rest are dimmed. Null spotlights nobody. */
  highlight: string[] | null;
  /** Zoom the map to the highlighted facilities instead of the whole taluk. */
  zoom: boolean;
  /**
   * Which of the day's movements the map draws. "none" keeps the problem chapter
   * from showing the solution before it is told; a route draws only that move.
   */
  movement: "none" | "all" | { fromId: string; toId: string; medicineId: string };
  stats: ChapterStat[];
}

/** The events the map should draw for a chapter. */
export function chapterEvents(
  chapter: Chapter,
  events: SimulationEvent[] | undefined,
): SimulationEvent[] | undefined {
  if (chapter.movement === "all") return events;
  if (chapter.movement === "none") return NO_EVENTS;
  const { fromId, toId, medicineId } = chapter.movement;
  return (events ?? []).filter(
    (e) =>
      e.day === chapter.day &&
      e.from_facility_id === fromId &&
      e.to_facility_id === toId &&
      e.medicine_id === medicineId,
  );
}

const NO_EVENTS: SimulationEvent[] = [];

export interface StoryNames {
  facility: (id: string) => string;
  medicine: (id: string) => string;
}

const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;

/**
 * The chapters, in order. `surveyAvailability` is the published PHC figure (real);
 * everything else is from the run.
 */
export function buildChapters(
  facts: StoryFacts,
  names: StoryNames,
  surveyAvailability: number | null,
): Chapter[] {
  const chapters: Chapter[] = [];
  const red = facts.openingRed.length;
  const last = Math.max(facts.totalDays - 1, 0);

  chapters.push({
    id: "problem",
    kicker: "Day 1 · The problem",
    title: `${red} of ${facts.facilityCount} facilities start in the red`,
    body: [
      surveyAvailability != null
        ? `A 2021–22 survey of Gadag's 15 PHCs found only ${surveyAvailability.toFixed(1)}% of essential medicines in stock. The simulation opens from those real patterns.`
        : "The simulation opens from the stock patterns a published survey of Gadag's PHCs recorded.",
      "Red means under 80% of medicines in stock, the WHO / HAI availability benchmark.",
    ],
    day: 0,
    highlight: facts.openingRed,
    zoom: false,
    movement: "none",
    stats: [
      { label: "Medicines in stock", value: pct(facts.openingAvailability), tone: "neutral" },
      { label: "Facilities in the red", value: `${red} / ${facts.facilityCount}`, tone: "alone" },
    ],
  });

  if (facts.example) {
    const ex = facts.example;
    const from = names.facility(ex.fromId);
    const to = names.facility(ex.toId);
    chapters.push({
      id: "nearby",
      kicker: "Day 1 · The medicine is already nearby",
      title: `${to} has run short. ${from}, ${ex.distanceKm.toFixed(1)} km away, has spare.`,
      body: [
        `${names.medicine(ex.medicineId)}: ${to} cannot cover its demand, while ${from} holds more than it needs.`,
        "On their own, neither can see the other's shelves, so the shortage waits for a manufacturer order.",
      ],
      day: ex.day,
      highlight: [ex.fromId, ex.toId],
      zoom: true,
      movement: { fromId: ex.fromId, toId: ex.toId, medicineId: ex.medicineId },
      stats: [
        { label: "Distance", value: `${ex.distanceKm.toFixed(1)} km`, tone: "neutral" },
        { label: "Units Zealo moves", value: ex.quantity.toLocaleString(), tone: "zealo" },
      ],
    });
  }

  if (facts.firstDay.transfers > 0) {
    chapters.push({
      id: "connect",
      kicker: "Day 1 · Zealo connects them",
      title: `${plural(facts.firstDay.transfers, "transfer")} between neighbours on the first day`,
      body: [
        "Zealo sees every member's stock at once and moves surplus to where it is short, before anyone runs out.",
        "Stock goes facility to facility. There is no warehouse and no distributor in between.",
      ],
      day: 0,
      highlight: null,
      zoom: false,
      movement: "all",
      stats: [
        { label: "Units moved", value: facts.firstDay.units.toLocaleString(), tone: "zealo" },
        { label: "Distance", value: `${facts.firstDay.distanceKm.toLocaleString()} km`, tone: "neutral" },
      ],
    });
  }

  if (facts.express.first) {
    const first = facts.express.first;
    chapters.push({
      id: "express",
      kicker: `Day ${first.day + 1} · When no neighbour can help`,
      title: "Only then does Zealo place an express order",
      body: [
        `${names.facility(first.facility_id ?? "")} needs ${names.medicine(first.medicine_id)} and no member has spare. Zealo orders it directly from the manufacturer on a short lead time.`,
        `That happened ${plural(facts.express.count, "time")} in ${facts.totalDays} days. Everything else was covered by a neighbour or a routine refill.`,
      ],
      day: first.day,
      highlight: first.facility_id ? [first.facility_id] : null,
      zoom: Boolean(first.facility_id),
      movement: "all",
      stats: [
        { label: "Express orders", value: facts.express.count.toLocaleString(), tone: "zealo" },
        { label: "Transfers in the run", value: facts.transfers.count.toLocaleString(), tone: "zealo" },
      ],
    });
  }

  const zealoClear = facts.allClear.zealo;
  const aloneClear = facts.allClear.alone;
  if (zealoClear != null && zealoClear > 0) {
    chapters.push({
      id: "recover",
      kicker: `Days 1–${zealoClear + 1} · The map turns green`,
      title: `No facility is red by day ${zealoClear + 1}`,
      body: [
        aloneClear != null
          ? `On their own, the same facilities stay red until day ${aloneClear + 1}, waiting for refills ordered on day 1 to arrive from the manufacturer.`
          : "On their own, some facilities stay red for the whole run.",
        "Same demand, same opening stock. The only difference is the network.",
      ],
      day: 0,
      playTo: zealoClear,
      highlight: facts.openingRed,
      zoom: false,
      movement: "all",
      stats: [
        { label: "All clear, with Zealo", value: `day ${zealoClear + 1}`, tone: "zealo" },
        {
          label: "All clear, on their own",
          value: aloneClear != null ? `day ${aloneClear + 1}` : "never",
          tone: "alone",
        },
      ],
    });
  }

  const stockoutCut = reduction(facts.stockoutDays.alone, facts.stockoutDays.zealo);
  const unmetCut = reduction(facts.unmetUnits.alone, facts.unmetUnits.zealo);
  chapters.push({
    id: "results",
    kicker: `Day ${last + 1} · Six months later`,
    title: `Medicines in stock ${pct(facts.availability.zealo)} of the time`,
    body: [
      `On their own, the same facilities manage ${pct(facts.availability.alone)}.`,
      stockoutCut != null && unmetCut != null
        ? `${stockoutCut}% fewer days with a medicine out of stock, and ${unmetCut}% fewer units that patients asked for and could not get.`
        : "Fewer days out of stock, and fewer units patients could not get.",
    ],
    day: last,
    highlight: null,
    zoom: false,
    movement: "all",
    stats: [
      {
        label: "Stockout days",
        value: `${facts.stockoutDays.zealo.toLocaleString()} vs ${facts.stockoutDays.alone.toLocaleString()}`,
        tone: "zealo",
      },
      {
        label: "Units not supplied",
        value: `${facts.unmetUnits.zealo.toLocaleString()} vs ${facts.unmetUnits.alone.toLocaleString()}`,
        tone: "zealo",
      },
    ],
  });

  chapters.push({
    id: "join",
    kicker: "For your hospital",
    title: "Join once. Zealo watches your shelves every day.",
    body: [
      "Set your stock targets and an approval limit once. Zealo checks every day, where a facility on its own reviews weekly, and asks you before ordering above your limit.",
      "Your shortages are covered by neighbours first. Your surplus helps them, but never takes you below your own reorder point.",
    ],
    day: last,
    highlight: null,
    zoom: false,
    movement: "all",
    stats: [],
  });

  return chapters;
}
