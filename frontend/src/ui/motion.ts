/**
 * Motion preference. Anything that animates in script (camera flights, counters,
 * story playback) checks this; CSS animations are switched off in index.css.
 */
export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
