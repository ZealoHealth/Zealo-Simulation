/**
 * The guided story, drawn over the live map.
 *
 * Each chapter moves the map to its day (and plays through a range of days when it
 * has one), spotlights the facilities it is about, and narrates with numbers from
 * the run. Arrow keys and presentation clickers (Page Up / Page Down) step through
 * it; Escape leaves it.
 */
import { useEffect } from "react";
import type { SimulateResponse } from "../../api/types";
import { useViewStore } from "../../state/store";
import { Button } from "../../ui";
import { prefersReducedMotion } from "../../ui/motion";
import { ProvenanceBadge } from "../Provenance";
import { pct, redOn, type Chapter } from "./storyLogic";

const PLAY_DELAY_MS = 1200;
const PLAY_STEP_MS = 650;

const TONE: Record<string, string> = {
  zealo: "text-purple",
  alone: "text-ink-muted",
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

  useEffect(() => {
    if (current == null) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement | null)?.closest?.("input, select, textarea")) return;
      if (event.key === "ArrowRight" || event.key === "PageDown") {
        event.preventDefault();
        setChapter(Math.min(current + 1, last));
      } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
        event.preventDefault();
        setChapter(Math.max(current - 1, 0));
      } else if (event.key === "Escape") {
        setChapter(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, last, setChapter]);

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
          className="rise pointer-events-auto rounded-2xl bg-surface p-5 shadow-raised"
        >
          <header className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-coral">
              {chapter.kicker}
            </p>
            <button
              type="button"
              onClick={() => setChapter(null)}
              aria-label="Leave the story"
              className="-mr-1 -mt-1 rounded-md px-2 py-0.5 text-xs font-semibold text-ink-subtle hover:bg-surface-sunken hover:text-ink"
            >
              Exit &times;
            </button>
          </header>

          <h2 className="mt-1.5 text-xl font-extrabold leading-snug tracking-tight text-ink">
            {chapter.title}
          </h2>
          <div className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-muted">
            {chapter.body.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>

          {chapter.stats.length > 0 && (
            <dl className="mt-3 flex flex-wrap gap-2">
              {chapter.stats.map((stat) => (
                <div key={stat.label} className="rounded-lg bg-surface-sunken px-3 py-1.5">
                  <dt className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
                    {stat.label}
                  </dt>
                  <dd className={`tabular text-base font-bold ${TONE[stat.tone]}`}>{stat.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <footer className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-3">
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Story chapters">
              {chapters.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={i === current}
                  aria-label={`Chapter ${i + 1}: ${c.kicker}`}
                  onClick={() => setChapter(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === current ? "w-6 bg-purple" : "w-2 bg-hairline hover:bg-ink-subtle"
                  }`}
                />
              ))}
            </div>
            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-ink-subtle">
              Simulated <ProvenanceBadge provenance="estimated" />
            </span>
            <div className="flex w-full justify-between gap-2">
              <Button onClick={() => setChapter(current - 1)} disabled={current === 0}>
                &larr; Back
              </Button>
              {current < last ? (
                <Button variant="primary" onClick={() => setChapter(current + 1)}>
                  Next &rarr;
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
    { label: "With Zealo", timeline: run.timeline.with_zealo, accent: "bg-purple" },
    { label: "On their own", timeline: run.timeline.without_zealo, accent: "bg-ink-subtle" },
  ];
  const total = Object.keys(run.timeline.with_zealo?.[0]?.status ?? {}).length;

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-[1000] w-[260px] rounded-xl bg-surface/95 p-3 shadow-raised">
      <p className="tabular text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
        Day {day + 1} of {run.days}
      </p>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-wide text-ink-subtle">
            <th className="pb-1 text-left font-medium" />
            <th className="pb-1 text-right font-medium">In red</th>
            <th className="pb-1 text-right font-medium">In stock</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const red = redOn(row.timeline, day).length;
            const rate = row.timeline?.[day]?.availability_rate ?? 0;
            return (
              <tr key={row.label}>
                <td className="py-1 font-semibold text-ink">
                  <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${row.accent}`} />
                  {row.label}
                </td>
                <td
                  className={`tabular py-1 text-right font-bold ${
                    red > 0 ? "text-status-red" : "text-status-green"
                  }`}
                >
                  {red} / {total}
                </td>
                <td className="tabular py-1 text-right font-bold text-ink">{pct(rate)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1.5 text-[10px] leading-snug text-ink-subtle">
        Same facilities, demand and opening stock. Only the network differs.
      </p>
    </div>
  );
}

/** Starts the story from the map, for presenters who open the map first. */
export function StoryLauncher() {
  const setChapter = useViewStore((s) => s.setStoryChapter);
  return (
    <Button variant="danger" size="lg" onClick={() => setChapter(0)} className="shadow-raised">
      &#9654; Play the story
    </Button>
  );
}
