/**
 * Motion preference. Anything that animates in script (camera flights, counters,
 * story playback) checks this; CSS animations are switched off in index.css.
 */
export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

/** How long the map's camera takes to fly to a story chapter's facilities. */
export const CAMERA_FLIGHT_MS = 1200;
