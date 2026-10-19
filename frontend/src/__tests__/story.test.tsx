import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DayStatus, FacilityStatus, SimulateResponse, SimulationEvent } from "../api/types";
import { StoryTour } from "../components/story/StoryTour";
import {
  buildChapters,
  chapterAnimationMs,
  chapterEvents,
  PLAY_DELAY_MS,
  PLAY_STEP_MS,
  reduction,
  storyFacts,
  type StoryNames,
} from "../components/story/storyLogic";
import { useViewStore } from "../state/store";
import { CAMERA_FLIGHT_MS } from "../ui/motion";

// Synthetic on purpose: three facilities over six days, small enough to check by hand.
function day(index: number, status: Record<string, FacilityStatus>, rate: number): DayStatus {
  return { day: index, status, availability_rate: rate };
}

function event(
  partial: Partial<SimulationEvent> & Pick<SimulationEvent, "day" | "type">,
): SimulationEvent {
  return {
    medicine_id: "m1",
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

function makeRun(): SimulateResponse {
  const zealo = [
    day(0, { a: "red", b: "red", c: "green" }, 0.7),
    day(1, { a: "amber", b: "red", c: "green" }, 0.85),
    day(2, { a: "green", b: "amber", c: "green" }, 0.95),
    day(3, { a: "green", b: "green", c: "green" }, 0.99),
    day(4, { a: "green", b: "green", c: "green" }, 0.99),
    day(5, { a: "green", b: "green", c: "green" }, 0.99),
  ];
  const alone = [
    day(0, { a: "red", b: "red", c: "green" }, 0.7),
    day(1, { a: "red", b: "red", c: "green" }, 0.7),
    day(2, { a: "red", b: "red", c: "green" }, 0.7),
    day(3, { a: "red", b: "red", c: "green" }, 0.72),
    day(4, { a: "amber", b: "green", c: "green" }, 0.9),
    day(5, { a: "green", b: "green", c: "green" }, 0.95),
  ];
  return {
    run_id: "r",
    days: 6,
    seed: 1,
    context: null,
    summaries: [
      {
        mode: "with_zealo",
        metrics: { availability_rate: 0.98, stockout_item_days: 20, unmet_units: 50 },
      },
      {
        mode: "without_zealo",
        metrics: { availability_rate: 0.9, stockout_item_days: 100, unmet_units: 400 },
      },
    ],
    timeline: { with_zealo: zealo, without_zealo: alone },
    events: {
      with_zealo: [
        event({
          day: 0,
          type: "relief_transfer",
          from_facility_id: "c",
          to_facility_id: "a",
          quantity: 30,
          distance_km: 4.2,
        }),
        event({
          day: 0,
          type: "relief_transfer",
          medicine_id: "m2",
          from_facility_id: "c",
          to_facility_id: "b",
          quantity: 12,
          distance_km: 1.5,
        }),
        event({ day: 0, type: "manufacturer_order", facility_id: "a", quantity: 500 }),
        event({ day: 2, type: "express_order", facility_id: "b", quantity: 40 }),
        event({
          day: 3,
          type: "relief_transfer",
          from_facility_id: "a",
          to_facility_id: "b",
          quantity: 8,
          distance_km: 3,
        }),
      ],
      without_zealo: [],
    },
    disclaimer: "",
    caveats: [],
  };
}

const NAMES: StoryNames = {
  facility: (id) => `Facility ${id.toUpperCase()}`,
  medicine: (id) => `Medicine ${id}`,
};

describe("storyFacts", () => {
  it("takes every figure from the run", () => {
    const facts = storyFacts(makeRun());
    expect(facts.facilityCount).toBe(3);
    expect(facts.openingRed).toEqual(["a", "b"]);
    expect(facts.openingAvailability).toBe(0.7);
    expect(facts.allClear).toEqual({ zealo: 2, alone: 4 }); // amber is not red
    expect(facts.express.count).toBe(1);
    expect(facts.transfers).toEqual({ count: 3, units: 50 });
    expect(facts.stockoutDays).toEqual({ zealo: 20, alone: 100 });
  });

  it("counts only transfers on day 1, not manufacturer orders", () => {
    expect(storyFacts(makeRun()).firstDay).toEqual({ transfers: 2, units: 42, distanceKm: 6 });
  });

  it("picks the shortest day-1 relief move as the example", () => {
    const example = storyFacts(makeRun()).example;
    expect(example).toMatchObject({ fromId: "c", toId: "b", medicineId: "m2", distanceKm: 1.5 });
  });

  it("skips co-located facilities and moves into facilities that are not red", () => {
    const run = makeRun();
    run.events.with_zealo.unshift(
      // Next door: closer, but the two markers would overlap.
      event({
        day: 0,
        type: "relief_transfer",
        from_facility_id: "c",
        to_facility_id: "a",
        quantity: 5,
        distance_km: 0.05,
      }),
      // Into a facility that was not red.
      event({
        day: 0,
        type: "relief_transfer",
        from_facility_id: "a",
        to_facility_id: "c",
        quantity: 9,
        distance_km: 0.9,
      }),
    );
    expect(storyFacts(run).example).toMatchObject({ fromId: "c", toId: "b", distanceKm: 1.5 });
  });

  it("falls back to the shortest move when none qualifies", () => {
    const run = makeRun();
    run.events.with_zealo = [
      event({
        day: 0,
        type: "relief_transfer",
        from_facility_id: "a",
        to_facility_id: "c",
        quantity: 9,
        distance_km: 0.2,
      }),
    ];
    expect(storyFacts(run).example).toMatchObject({ fromId: "a", toId: "c" });
  });

  it("reports never when a mode keeps a red facility all run", () => {
    const run = makeRun();
    run.timeline.without_zealo = run.timeline.without_zealo.map((d) =>
      day(d.day, { ...d.status, a: "red" }, d.availability_rate),
    );
    expect(storyFacts(run).allClear.alone).toBeNull();
  });
});

describe("reduction", () => {
  it("is the rounded percentage cut", () => {
    expect(reduction(6275, 1249)).toBe(80);
    expect(reduction(100, 100)).toBe(0);
  });

  it("is undefined without a baseline", () => {
    expect(reduction(0, 0)).toBeNull();
  });
});

describe("buildChapters", () => {
  it("tells the story in order, with the run's numbers", () => {
    const chapters = buildChapters(storyFacts(makeRun()), NAMES, 74.2);
    expect(chapters.map((c) => c.id)).toEqual([
      "problem",
      "nearby",
      "connect",
      "express",
      "recover",
      "results",
      "join",
    ]);
    expect(chapters[0].title).toBe("2 of 3 facilities start in the red");
    expect(chapters[0].body[0]).toContain("74.2%");
    expect(chapters[1].title).toContain("Facility B has run short. Facility C, 1.5 km away");
    expect(chapters[4]).toMatchObject({ day: 0, playTo: 2, title: "No facility is red by day 3" });
    expect(chapters[4].body[0]).toContain("until day 5");
    expect(chapters[5].body[1]).toContain("80% fewer days");
    expect(chapters[5].body[1]).toContain("88% fewer units");
  });

  it("leaves out moments that did not happen in the run", () => {
    const run = makeRun();
    run.events.with_zealo = [];
    const ids = buildChapters(storyFacts(run), NAMES, null).map((c) => c.id);
    expect(ids).not.toContain("nearby");
    expect(ids).not.toContain("connect");
    expect(ids).not.toContain("express");
    expect(ids).toContain("results");
  });

  it("does not quote a survey figure it was not given", () => {
    const [problem] = buildChapters(storyFacts(makeRun()), NAMES, null);
    expect(problem.body[0]).not.toMatch(/\d+\.\d%/);
  });

  it("draws no movement on the problem chapter and only the example's route on the next", () => {
    const run = makeRun();
    const chapters = buildChapters(storyFacts(run), NAMES, 74.2);
    const events = run.events.with_zealo;
    expect(chapterEvents(chapters[0], events)).toEqual([]);
    const route = chapterEvents(chapters[1], events)!;
    expect(route).toHaveLength(1);
    expect(route[0]).toMatchObject({ from_facility_id: "c", to_facility_id: "b" });
    expect(chapterEvents(chapters[2], events)).toBe(events);
  });

  it("zooms only to chapters about particular facilities", () => {
    const chapters = buildChapters(storyFacts(makeRun()), NAMES, 74.2);
    const nearby = chapters.find((c) => c.id === "nearby")!;
    expect(nearby.zoom).toBe(true);
    expect(nearby.highlight).toEqual(["c", "b"]);
    expect(chapters.find((c) => c.id === "results")!.zoom).toBe(false);
  });
});

describe("story tour", () => {
  const run = makeRun();
  const chapters = buildChapters(storyFacts(run), NAMES, 74.2);

  beforeEach(() => {
    act(() => {
      useViewStore.getState().reset();
      useViewStore.getState().setTotalDays(run.days);
      useViewStore.getState().setStoryChapter(0);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens on the first chapter and steps with arrow keys and clicker keys", () => {
    vi.useFakeTimers();
    render(<StoryTour chapters={chapters} run={run} />);
    expect(screen.getByText("2 of 3 facilities start in the red")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(CAMERA_FLIGHT_MS);
    });
    act(() => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
    expect(useViewStore.getState().storyChapter).toBe(1);

    act(() => {
      fireEvent.keyDown(window, { key: "PageUp" });
    });
    expect(useViewStore.getState().storyChapter).toBe(0);
  });

  it("holds Next until the camera has landed", () => {
    vi.useFakeTimers();
    render(<StoryTour chapters={chapters} run={run} />);
    const next = screen.getByRole("button", { name: "Next" });
    expect(next).toBeDisabled();

    act(() => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });
    expect(useViewStore.getState().storyChapter).toBe(0);

    act(() => {
      vi.advanceTimersByTime(CAMERA_FLIGHT_MS);
    });
    expect(next).toBeEnabled();
  });

  it("holds Next until a playback chapter reaches its last day", () => {
    vi.useFakeTimers();
    const playing = chapters.findIndex((c) => c.playTo != null);
    const chapter = chapters[playing];
    act(() => useViewStore.getState().setStoryChapter(playing));
    render(<StoryTour chapters={chapters} run={run} />);

    act(() => {
      vi.advanceTimersByTime(CAMERA_FLIGHT_MS);
    });
    expect(useViewStore.getState().day).toBeLessThan(chapter.playTo!);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(chapterAnimationMs(chapter, CAMERA_FLIGHT_MS));
    });
    expect(useViewStore.getState().day).toBe(chapter.playTo);
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("times a chapter as its camera flight plus its playback", () => {
    expect(chapterAnimationMs({ day: 0 }, 1200)).toBe(1200);
    expect(chapterAnimationMs({ day: 3, playTo: 5 }, 1200)).toBe(PLAY_DELAY_MS + 2 * PLAY_STEP_MS);
    expect(chapterAnimationMs({ day: 3, playTo: 5 }, 1200, true)).toBe(0);
  });

  it("moves the map to each chapter's day", () => {
    render(<StoryTour chapters={chapters} run={run} />);
    act(() =>
      useViewStore.getState().setStoryChapter(chapters.findIndex((c) => c.id === "results")),
    );
    expect(useViewStore.getState().day).toBe(run.days - 1);
  });

  it("shows both worlds on the scoreboard", () => {
    render(<StoryTour chapters={chapters} run={run} />);
    expect(screen.getByText("With Zealo")).toBeInTheDocument();
    expect(screen.getByText("On their own")).toBeInTheDocument();
  });

  it("leaves the story on Escape", () => {
    render(<StoryTour chapters={chapters} run={run} />);
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(useViewStore.getState().storyChapter).toBeNull();
  });

  it("always opens on the Zealo network's run", () => {
    act(() => {
      useViewStore.getState().setMode("without_zealo");
      useViewStore.getState().setStoryChapter(0);
    });
    expect(useViewStore.getState().mode).toBe("with_zealo");
  });
});
