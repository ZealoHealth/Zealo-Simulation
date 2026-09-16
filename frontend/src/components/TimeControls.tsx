/**
 * Playback controls.
 *
 * Playback runs entirely in the browser from the timeline returned by one
 * /simulate call -- there is no per-day request. The interval is driven off the
 * speed setting and cleans itself up, so leaving the tab does not leak timers.
 */
import { useEffect } from "react";
import { useViewStore } from "../state/store";

const SPEEDS = [1, 2, 4, 8, 16];

export function TimeControls({ disabled }: { disabled: boolean }) {
  const { day, totalDays, playing, speed, setDay, stepDay, togglePlay, pause, setSpeed, reset } =
    useViewStore();

  useEffect(() => {
    if (!playing || disabled || totalDays <= 0) return;
    const interval = window.setInterval(() => {
      const state = useViewStore.getState();
      if (state.day >= state.totalDays - 1) {
        state.pause();
        return;
      }
      state.stepDay(1);
    }, 1000 / speed);
    return () => window.clearInterval(interval);
  }, [playing, speed, disabled, totalDays]);

  useEffect(() => {
    if (disabled) pause();
  }, [disabled, pause]);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-white/95 px-3 py-2 shadow ring-1 ring-navy/10">
      <button
        type="button"
        onClick={togglePlay}
        disabled={disabled}
        aria-label={playing ? "Pause playback" : "Play playback"}
        className="rounded bg-purple px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        {playing ? "Pause" : "Play"}
      </button>

      <button
        type="button"
        onClick={() => stepDay(-1)}
        disabled={disabled || day === 0}
        aria-label="Previous day"
        className="rounded border border-navy/20 px-2 py-1 text-sm disabled:opacity-40"
      >
        &larr;
      </button>
      <button
        type="button"
        onClick={() => stepDay(1)}
        disabled={disabled || day >= totalDays - 1}
        aria-label="Next day"
        className="rounded border border-navy/20 px-2 py-1 text-sm disabled:opacity-40"
      >
        &rarr;
      </button>

      <label className="flex flex-1 items-center gap-2 text-xs text-navy/70">
        <span className="whitespace-nowrap font-medium">
          Day {totalDays ? day + 1 : 0} / {totalDays}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(0, totalDays - 1)}
          value={day}
          disabled={disabled}
          aria-label="Simulation day"
          onChange={(e) => setDay(Number(e.target.value))}
          className="w-full accent-purple"
        />
      </label>

      <label className="flex items-center gap-1 text-xs text-navy/70">
        Speed
        <select
          value={speed}
          disabled={disabled}
          aria-label="Playback speed"
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="rounded border border-navy/20 bg-white px-1 py-1 text-xs"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}&times;
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={reset}
        className="rounded border border-navy/20 px-2 py-1 text-xs text-navy/70"
      >
        Reset
      </button>
    </div>
  );
}
