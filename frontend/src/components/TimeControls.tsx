/**
 * The playback bar.
 *
 * Playback runs entirely in the browser from the timeline returned by one /simulate
 * call -- there is no per-day request. The interval is driven off the speed setting
 * and cleans itself up, so leaving the tab does not leak timers.
 */
import { useId } from "react";
import { useViewStore } from "../state/store";
import { usePlaybackClock } from "../state/usePlayback";
import { Button } from "../ui";

const SPEEDS = [1, 4, 20];

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 1.5 L12 7 L3 12.5 Z" fill="currentColor" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="2.5" y="1.5" width="3.2" height="11" rx="1" fill="currentColor" />
      <rect x="8.3" y="1.5" width="3.2" height="11" rx="1" fill="currentColor" />
    </svg>
  );
}

function StepIcon({ direction }: { direction: "back" | "forward" }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={direction === "back" ? "M10 3 L5 8 L10 13" : "M6 3 L11 8 L6 13"}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TimeControls({
  disabled,
  floating = false,
  showReset = true,
}: {
  disabled: boolean;
  /** Over the map: a shadow lifts it off the tiles. */
  floating?: boolean;
  /** The map keeps Reset in its side panel, so the bar fits on one line over the map. */
  showReset?: boolean;
}) {
  const { day, totalDays, playing, speed, setDay, stepDay, togglePlay, setSpeed, reset } =
    useViewStore();
  const rangeId = useId();
  const speedId = useId();
  usePlaybackClock(disabled);

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[10px] border border-line bg-surface px-3.5 py-2.5 ${
        floating ? "shadow-[var(--shadow-float)]" : ""
      }`}
    >
      <Button
        variant="primary"
        onClick={togglePlay}
        disabled={disabled}
        aria-label={playing ? "Pause playback" : "Play playback"}
        className="w-[96px]"
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
        {playing ? "Pause" : "Play"}
      </Button>
      <Button
        variant="quiet"
        onClick={() => stepDay(-1)}
        disabled={disabled || day === 0}
        aria-label="Previous day"
        className="w-11 px-0"
      >
        <StepIcon direction="back" />
      </Button>
      <Button
        variant="quiet"
        onClick={() => stepDay(1)}
        disabled={disabled || day >= totalDays - 1}
        aria-label="Next day"
        className="w-11 px-0"
      >
        <StepIcon direction="forward" />
      </Button>

      <div className="flex min-w-[150px] flex-1 items-center gap-3">
        {/* The slider is named "Simulation day"; the changing "Day 4 of 180" is its value
            text, so a screen reader announces the day as it moves. */}
        <span aria-hidden="true" className="tabular whitespace-nowrap text-[15px] font-bold text-ink">
          Day {totalDays ? day + 1 : 0} of {totalDays}
        </span>
        <input
          id={rangeId}
          type="range"
          min={0}
          max={Math.max(0, totalDays - 1)}
          value={day}
          aria-label="Simulation day"
          aria-valuetext={`Day ${totalDays ? day + 1 : 0} of ${totalDays}`}
          disabled={disabled}
          onChange={(e) => setDay(Number(e.target.value))}
          className="h-11 w-full cursor-pointer"
        />
      </div>

      <label htmlFor={speedId} className="flex items-center gap-2 text-[15px] text-ink-2">
        Speed
        <select
          id={speedId}
          value={SPEEDS.includes(speed) ? speed : 4}
          disabled={disabled}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="min-h-11 rounded-lg border border-line bg-surface px-2 text-[15px] text-ink"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}&times;
            </option>
          ))}
        </select>
      </label>

      {showReset && (
        <Button variant="ghost" onClick={reset}>
          Reset
        </Button>
      )}
    </div>
  );
}
