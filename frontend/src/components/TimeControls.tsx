/**
 * Playback controls.
 *
 * Playback runs entirely in the browser from the timeline returned by one
 * /simulate call -- there is no per-day request. The interval is driven off the
 * speed setting and cleans itself up, so leaving the tab does not leak timers.
 */
import { useEffect } from "react";
import { useViewStore } from "../state/store";
import { Button } from "../ui";

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
    <div className="flex flex-wrap items-center gap-2.5">
      <Button
        variant="primary"
        onClick={togglePlay}
        disabled={disabled}
        aria-label={playing ? "Pause playback" : "Play playback"}
        className="w-16"
      >
        {playing ? "Pause" : "Play"}
      </Button>

      <Button onClick={() => stepDay(-1)} disabled={disabled || day === 0} aria-label="Previous day">
        &larr;
      </Button>
      <Button
        onClick={() => stepDay(1)}
        disabled={disabled || day >= totalDays - 1}
        aria-label="Next day"
      >
        &rarr;
      </Button>

      <label className="flex flex-1 items-center gap-2 text-xs text-ink-muted">
        <span className="tabular whitespace-nowrap font-semibold text-ink">
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
          className="w-full"
        />
      </label>

      <select
        value={speed}
        disabled={disabled}
        aria-label="Playback speed"
        onChange={(e) => setSpeed(Number(e.target.value))}
        className="rounded-lg bg-surface-sunken px-2 py-1.5 text-xs font-medium text-ink ring-1 ring-hairline"
      >
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}&times;
          </option>
        ))}
      </select>

      <Button variant="ghost" onClick={reset}>
        Reset
      </Button>
    </div>
  );
}
