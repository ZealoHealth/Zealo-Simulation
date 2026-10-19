/**
 * The guided story, drawn over the live map.
 *
 * Each chapter moves the map to its day (and plays through a range of days when it
 * has one), spotlights the facilities it is about, and narrates with numbers from
 * the run. Arrow keys and presentation clickers (Page Up / Page Down) step through
 * it; Escape leaves it. Moving forward waits until the chapter's camera flight and
 * playback have finished, so a fast click never skips the moment being told.
 */
import { useEffect, useState } from "react";
import type { SimulateResponse } from "../../api/types";
import { useViewStore } from "../../state/store";
import { Button } from "../../ui";
import { CAMERA_FLIGHT_MS, prefersReducedMotion } from "../../ui/motion";
import { ProvenanceBadge } from "../Provenance";
import {
  chapterAnimationMs,
  pct,
  PLAY_DELAY_MS,
  PLAY_STEP_MS,
  redOn,
  type Chapter,
} from "./storyLogic";

const TONE: Record<string, string> = {
  zealo: "text-scrub",
  alone: "text-ink-2",
  neutral: "text-ink",
};

export function StoryTour({ chapters, run }: { chapters: Chapter[]; run: SimulateResponse }) {
  const index = useViewStore((s) => s.storyChapter);
  const setChapter = useViewStore((s) => s.setStoryChapter);
  const setDay = useViewStore((s) => s.setDay);
  const day = useViewStore((s) => s.day);

  const current = index == null ? null : Math.min(index, chapters.length - 1);
  const chapter = current == null ? null : chapters[current];
  const last = chapters.length - 1;

  // Open each chapter on its day, then play through its range, if it has one.
  const chapterDay = chapter?.day;
  const playTo = chapter?.playTo;
  useEffect(() => {
    if (chapterDay == null) return;
    setDay(chapterDay);
    if (playTo == null || playTo <= chapterDay) return;
    if (prefersReducedMotion()) {
      setDay(playTo);
      return;
    }
    let interval = 0;
    const start = window.setTimeout(() => {
      interval = window.setInterval(() => {
        const state = useViewStore.getState();
        if (state.day >= playTo) window.clearInterval(interval);
        else state.stepDay(1);
      }, PLAY_STEP_MS);
    }, PLAY_DELAY_MS);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(interval);
    };
  }, [current, chapterDay, playTo, setDay]);

  // Forward is locked until the camera has landed and the playback reached its last day.
  const reducedMotion = prefersReducedMotion();
  const [landedChapter, setLandedChapter] = useState<number | null>(null);
  useEffect(() => {
    if (current == null) return;
    const timer = window.setTimeout(
      () => setLandedChapter(current),
      reducedMotion ? 0 : CAMERA_FLIGHT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [current, reducedMotion]);
  const playEnd = playTo == null ? null : Math.min(playTo, run.days - 1);
  const stillPlaying = playEnd != null && chapterDay != null && playEnd > chapterDay && day < playEnd;
  const locked = landedChapter !== current || stillPlaying;

  useEffect(() => {
    if (current == null) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.("input, select, textarea")) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        if (!locked) setChapter(Math.min(current + 1, last));
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setChapter(Math.max(current - 1, 0));
      } else if (event.key === "Escape") {
        setChapter(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, last, locked, setChapter]);

  if (!chapter || current == null) return null;

  return (
    <>
      <Scoreboard run={run} day={day} />

      {/* A side panel rather than a bottom card: the taluk is taller than it is wide,
          and a bottom card cost the map a whole zoom level. */}
      <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] w-[420px] max-w-[calc(100%-2rem)]">
        <article
          key={chapter.id}
          aria-live="polite"
          aria-label={`Story chapter ${current + 1} of ${chapters.length}`}
          className="rise pointer-events-auto rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-lift)]"
        >
          <header className="flex items-start justify-between gap-3">
            <p className="pt-2.5 text-sm font-bold text-scrub">{chapter.kicker}</p>
            <Button variant="ghost" onClick={() => setChapter(null)} aria-label="Leave the story">
              Exit
            </Button>
          </header>

          <h2 className="mt-1 text-[22px] font-bold leading-snug tracking-[-0.01em] text-ink">
            {chapter.title}
          </h2>
          <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink-2">
            {chapter.body.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>

          {chapter.stats.length > 0 && (
            <div className="mt-4 grid grid-cols-2 border-t border-line-soft">
              {chapter.stats.map((stat) => (
                <dl key={stat.label} className="flex flex-col-reverse justify-end pt-3">
                  <dt className="text-sm text-ink-2">{stat.label}</dt>
                  <dd className={`tabular text-[26px] font-bold leading-tight ${TONE[stat.tone]}`}>
                    {stat.value}
                  </dd>
                </dl>
              ))}
            </div>
          )}

          <footer className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex items-center" role="tablist" aria-label="Story chapters">
              {chapters.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={i === current}
                  aria-label={`Chapter ${i + 1}: ${c.kicker}`}
                  onClick={() => setChapter(i)}
                  disabled={locked && i > current}
                  className="flex h-11 w-6 items-center justify-center disabled:cursor-not-allowed"
                >
                  <span
                    className={`block h-2 rounded-full transition-all ${
                      i === current ? "w-5 bg-scrub" : "w-2 bg-line hover:bg-muted"
                    }`}
                  />
                </button>
              ))}
            </div>
            <span className="ml-auto flex items-center gap-1.5 text-sm text-muted">
              Simulated <ProvenanceBadge provenance="estimated" />
            </span>
            <div className="flex w-full justify-between gap-2">
              <Button onClick={() => setChapter(current - 1)} disabled={current === 0}>
                Back
              </Button>
              {current < last ? (
                <Button
                  variant="primary"
                  onClick={() => setChapter(current + 1)}
                  disabled={locked}
                  aria-busy={locked}
                  className="relative overflow-hidden"
                >
                  Next
                  {locked && (
                    // Fills while the chapter animates, so a disabled Next reads as "wait".
                    <span
                      key={chapter.id}
                      aria-hidden="true"
                      className="next-progress"
                      style={{
                        animationDuration: `${chapterAnimationMs(chapter, CAMERA_FLIGHT_MS)}ms`,
                      }}
                    />
                  )}
                </Button>
              ) : (
                <Button variant="primary" onClick={() => setChapter(null)}>
                  Explore the map
                </Button>
              )}
            </div>
          </footer>
        </article>
      </div>
    </>
  );
}

/** The two worlds side by side on the day the map shows. */
function Scoreboard({ run, day }: { run: SimulateResponse; day: number }) {
  const rows = [
    { label: "With Zealo", timeline: run.timeline.with_zealo, accent: "bg-scrub" },
    { label: "On their own", timeline: run.timeline.without_zealo, accent: "bg-stone" },
  ];
  const total = Object.keys(run.timeline.with_zealo?.[0]?.status ?? {}).length;

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-[1000] w-[280px] rounded-[10px] border border-line bg-surface p-4 shadow-[var(--shadow-float)]">
      <p className="tabular text-[15px] font-bold text-ink">
        Day {day + 1} of {run.days}
      </p>
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b-2 border-ink text-[13px] text-muted">
            <th className="pb-1 text-left font-bold">
              <span className="sr-only">Network</span>
            </th>
            <th className="pb-1 text-right font-bold">In the red</th>
            <th className="pb-1 text-right font-bold">In stock</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const red = redOn(row.timeline, day).length;
            const rate = row.timeline?.[day]?.availability_rate ?? 0;
            return (
              <tr key={row.label} className="border-b border-line-soft last:border-b-0">
                <td className="py-1.5 font-bold text-ink">
                  <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${row.accent}`} />
                  {row.label}
                </td>
                <td
                  className={`tabular py-1.5 text-right font-bold ${
                    red > 0 ? "text-out-text" : "text-scrub"
                  }`}
                >
                  {red} of {total}
                </td>
                <td className="tabular py-1.5 text-right font-bold text-ink">{pct(rate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[13px] leading-snug text-muted">
        Same facilities, demand and opening stock. Only the network differs.
      </p>
    </div>
  );
}
