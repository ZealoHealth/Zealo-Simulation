/**
 * The playback clock: while playing, step one day every 1/speed seconds and stop at
 * the end of the run. Mounted by whatever control a page shows (the full playback bar,
 * or the Network page's compact day control), so playback never depends on one widget.
 */
import { useEffect } from "react";
import { useViewStore } from "./store";

export function usePlaybackClock(disabled: boolean) {
  const playing = useViewStore((s) => s.playing);
  const speed = useViewStore((s) => s.speed);
  const totalDays = useViewStore((s) => s.totalDays);
  const pause = useViewStore((s) => s.pause);

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
}
