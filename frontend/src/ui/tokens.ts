/**
 * Design tokens for code that cannot use CSS: Recharts paints colours as SVG
 * attributes, where `var(--…)` is not reliably resolved. Reads the live value from
 * the stylesheet so `index.css` stays the one place colours are defined; the
 * fallbacks only matter where no stylesheet is loaded (unit tests).
 */
const FALLBACK = {
  ink: "#10231f",
  muted: "#4a5e58",
  line: "#c9d6d0",
  "line-soft": "#e3eae6",
  grid: "#eef3f0",
  scrub: "#14503f",
  move: "#1f5fa8",
  stone: "#9fb3ab",
  low: "#d99a1e",
  out: "#b3261e",
} as const;

export type TokenName = keyof typeof FALLBACK;

export function token(name: TokenName): string {
  if (typeof document === "undefined") return FALLBACK[name];
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--color-${name}`)
    .trim();
  return value || FALLBACK[name];
}
