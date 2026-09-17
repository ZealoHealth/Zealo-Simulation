/**
 * Marker icons: shape carries facility type, colour carries stock status.
 *
 * Two channels rather than one, so the map stays readable for someone who
 * cannot separate red from green -- the outline shape still distinguishes a PHC
 * from a pharmacy, and a status glyph is drawn inside the marker.
 */
import L from "leaflet";
import type { FacilityStatus } from "../../api/types";

const STATUS_COLOURS: Record<FacilityStatus, string> = {
  green: "#1F9D55",
  amber: "#D97706",
  red: "#DC2626",
};

/** Neutral fill used before a simulation has run, so nothing implies a stock level. */
const UNKNOWN_COLOUR = "#6A4CA8";

const STATUS_GLYPH: Record<FacilityStatus, string> = {
  green: "✓",
  amber: "!",
  red: "✕",
};

export type MarkerShape = "square" | "circle" | "diamond" | "triangle" | "pill";

export const SHAPE_BY_TYPE: Record<string, MarkerShape> = {
  district_hospital: "square",
  taluk_hospital: "square",
  government_level_unknown: "square",
  other_government: "square",
  chc: "diamond",
  phc: "diamond",
  private_hospital: "triangle",
  clinic: "circle",
  pharmacy: "pill",
};

export const TYPE_LABELS: Record<string, string> = {
  district_hospital: "District hospital",
  taluk_hospital: "Taluk hospital",
  government_level_unknown: "Government hospital (level unconfirmed)",
  other_government: "Other government facility",
  chc: "CHC",
  phc: "PHC",
  private_hospital: "Private hospital",
  clinic: "Clinic",
  pharmacy: "Pharmacy",
};

function shapePath(shape: MarkerShape): string {
  switch (shape) {
    case "square":
      return "M3 3 H21 V21 H3 Z";
    case "diamond":
      return "M12 2 L22 12 L12 22 L2 12 Z";
    case "triangle":
      return "M12 2 L22 21 H2 Z";
    case "pill":
      return "M6 8 H18 A4 4 0 0 1 18 16 H6 A4 4 0 0 1 6 8 Z";
    default:
      return "M12 12 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0";
  }
}

export function facilityIcon(
  facilityType: string,
  status: FacilityStatus | null,
  options: { selected?: boolean; dimmed?: boolean; approximate?: boolean } = {},
): L.DivIcon {
  const shape = SHAPE_BY_TYPE[facilityType] ?? "circle";
  const fill = status ? STATUS_COLOURS[status] : UNKNOWN_COLOUR;
  const glyph = status ? STATUS_GLYPH[status] : "";
  const size = options.selected ? 32 : 24;
  const opacity = options.dimmed ? 0.35 : 1;

  const html = `
    <svg viewBox="0 0 24 24" width="${size}" height="${size}"
         style="opacity:${opacity};filter:drop-shadow(0 1px 2px rgba(35,28,68,.35))"
         aria-hidden="true">
      <path d="${shapePath(shape)}" fill="${fill}" fill-opacity="${options.approximate ? 0.55 : 1}"
            stroke="${options.selected ? "#231C44" : options.approximate ? "#231C44" : "#ffffff"}"
            stroke-width="${options.selected ? 2.5 : 1.5}"
            ${options.approximate ? 'stroke-dasharray="2 1.5"' : ""} />
      ${glyph ? `<text x="12" y="16" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">${glyph}</text>` : ""}
    </svg>`;

  return L.divIcon({
    html,
    className: "zealo-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export { STATUS_COLOURS, UNKNOWN_COLOUR };
