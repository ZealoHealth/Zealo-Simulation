/**
 * Build-time switches, read once from Vite env vars.
 *
 * The "without Zealo" baseline is hidden by default: the demo shows the network as
 * it would run. The backend still simulates both modes on identical demand, so the
 * mode toggle and the Compare page come back by setting
 * `VITE_SHOW_WITHOUT_ZEALO=true` -- no code change.
 */
export const SHOW_WITHOUT_ZEALO =
  (import.meta.env.VITE_SHOW_WITHOUT_ZEALO as string | undefined) === "true";
