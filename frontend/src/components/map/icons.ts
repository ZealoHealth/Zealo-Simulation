/**
 * Map pins: shape carries facility type, fill carries stock, and a glyph repeats the
 * stock state so it reads without colour (a dot for under a week, a bar for out).
 *
 * `pinHtml` is pure so it can be tested without Leaflet; `facilityIcon` wraps it in a
 * Leaflet divIcon. Colours are the design tokens, as CSS variables.
 */
import L from "leaflet";
import type { FacilityStatus } from "../../api/types";

export type PinShape = "hospital" | "health-centre" | "clinic" | "pharmacy" | "other-government";

/**
 * What a pin shows. `none` = does not carry the selected medicine; `unknown` = no run
 * yet, so nothing implies a stock level.
 */
export type PinStatus = "ok" | "low" | "out" | "none" | "unknown";

export const SHAPE_BY_TYPE: Record<string, PinShape> = {
  district_hospital: "hospital",
  taluk_hospital: "hospital",
  government_level_unknown: "hospital",
  private_hospital: "hospital",
  other_government: "other-government",
  chc: "health-centre",
  phc: "health-centre",
  clinic: "clinic",
  pharmacy: "pharmacy",
};

export const TYPE_LABELS: Record<string, string> = {
  district_hospital: "District hospital",
  taluk_hospital: "Taluk hospital",
  government_level_unknown: "Government hospital (level unconfirmed)",
  other_government: "Other government facility",
  chc: "Community health centre",
  phc: "Primary health centre",
  private_hospital: "Private hospital",
  clinic: "Clinic",
  pharmacy: "Pharmacy",
};

/** The facility-level map status in pin terms: the share-based rule's green/amber/red. */
export function pinStatusForFacility(status: FacilityStatus | undefined): PinStatus {
  if (status === "green") return "ok";
  if (status === "amber") return "low";
  if (status === "red") return "out";
  return "unknown";
}

const FILL: Record<PinStatus, string> = {
  ok: "var(--color-scrub)",
  low: "var(--color-low)",
  out: "var(--color-out)",
  none: "var(--color-stone)",
  unknown: "var(--color-muted)",
};

const SHAPE_STYLE: Record<PinShape, { size: number; style: string }> = {
  hospital: { size: 18, style: "border-radius:4px" },
  "health-centre": { size: 16, style: "border-radius:2px;transform:rotate(45deg)" },
  clinic: { size: 16, style: "border-radius:50%" },
  pharmacy: { size: 11, style: "border-radius:50%" },
  "other-government": { size: 18, style: "border-radius:4px;border-style:dashed" },
};

/** The space every pin sits in, so anchors are the same whatever the shape. */
export const PIN_BOX = 26;
export const SELECTED_BOX = 36;

export interface PinOptions {
  selected?: boolean;
  dimmed?: boolean;
  approximate?: boolean;
}

export function pinHtml(type: string, status: PinStatus, options: PinOptions = {}): string {
  const shape = SHAPE_BY_TYPE[type] ?? "clinic";
  const { size, style } = SHAPE_STYLE[shape];
  const box = options.selected ? SELECTED_BOX : PIN_BOX;
  const opacity = options.dimmed ? 0.3 : options.approximate ? 0.75 : 1;
  const bar = Math.max(6, size - 8);

  // The glyph sits in its own unrotated layer so the bar stays horizontal on a diamond.
  const glyph =
    status === "low"
      ? `<span data-glyph="dot" style="position:absolute;left:50%;top:50%;width:4.8px;height:4.8px;margin:-2.4px 0 0 -2.4px;border-radius:50%;background:var(--color-ink)"></span>`
      : status === "out"
        ? `<span data-glyph="bar" style="position:absolute;left:50%;top:50%;width:${bar}px;height:2.5px;margin:-1.25px 0 0 -${bar / 2}px;border-radius:1px;background:#fff"></span>`
        : "";

  const ring = status === "out" ? "var(--color-out)" : "var(--color-ink)";
  const selection = options.selected
    ? `<span data-selected style="position:absolute;inset:0;border-radius:50%;background:color-mix(in srgb, ${ring} 12%, transparent)"></span>` +
      `<span style="position:absolute;left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;border:2px solid ${ring}"></span>`
    : "";

  return (
    `<span data-pin="${shape}" data-status="${status}" style="position:relative;display:block;width:${box}px;height:${box}px;opacity:${opacity}">` +
    selection +
    `<span style="position:absolute;left:50%;top:50%;width:${size}px;height:${size}px;margin:-${size / 2 + 2.5}px 0 0 -${size / 2 + 2.5}px;` +
    `background:${FILL[status]};border:2.5px solid #fff;box-shadow:0 1px 3px rgba(16,35,31,.35);${style}"></span>` +
    glyph +
    `</span>`
  );
}

// One icon object per look. Leaflet replaces a marker's element whenever it is handed a
// new icon object, so building fresh icons on every render rebuilt every pin on every
// day of playback; reusing them leaves a pin alone until its look actually changes.
const iconCache = new Map<string, L.DivIcon>();

export function facilityIcon(type: string, status: PinStatus, options: PinOptions = {}): L.DivIcon {
  const key = `${type}|${status}|${options.selected ? 1 : 0}${options.dimmed ? 1 : 0}${
    options.approximate ? 1 : 0
  }`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const box = options.selected ? SELECTED_BOX : PIN_BOX;
  const icon = L.divIcon({
    html: pinHtml(type, status, options),
    className: "zealo-pin",
    iconSize: [box, box],
    iconAnchor: [box / 2, box / 2],
  });
  iconCache.set(key, icon);
  return icon;
}
