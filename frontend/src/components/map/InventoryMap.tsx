/**
 * The Leaflet street map of Gadag taluk.
 *
 * Tile policy: standard OpenStreetMap tiles, with the required attribution always
 * visible and the tile URL read from an environment variable so the provider can be
 * swapped without a code change. No tiles are pre-fetched or bulk downloaded. The
 * tiles are muted in CSS so the facilities and movements read first.
 *
 * Colours come from CSS classes on the paths (index.css), not hex values here.
 */
import { Fragment, useEffect, useMemo, useRef } from "react";
import { GeoJSON, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Facility, GeoJsonBoundary, SimulationEvent } from "../../api/types";
import { CAMERA_FLIGHT_MS, prefersReducedMotion } from "../../ui/motion";
import { facilityIcon, TYPE_LABELS, type PinStatus } from "./icons";
import {
  along,
  bearingDeg,
  edgePoint,
  labelledFacilityIds,
  manufacturerActivityForDay,
  transferLinesForDay,
  type Bounds,
} from "./mapLogic";

const TILE_URL =
  (import.meta.env.VITE_TILE_URL as string | undefined) ??
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

// Most transfer routes and express deliveries drawn on one day. On the first days the
// network closes the gaps in its opening stock all at once, and drawing every route
// turned the map into a solid block of lines. The largest are drawn; the rest are
// counted in the day's summary, and every movement stays in the event feed.
export const MAX_ROUTES_DRAWN = 25;
export const MAX_EXPRESS_DRAWN = 12;

const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Gadag taluk, from the OSM boundary relation's bounding box. */
const GADAG_CENTRE: [number, number] = [15.42, 75.63];
const DEFAULT_ZOOM = 11;

/**
 * Keep Leaflet's idea of its size in step with the layout. The map mounts inside a
 * grid that settles after first paint, so Leaflet measured a smaller box and only
 * tiled part of the view.
 */
function KeepSizeInSync() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

function boundaryBounds(boundary: GeoJsonBoundary | null): Bounds | null {
  const ring = boundary?.features?.[0]?.geometry.coordinates[0];
  if (!ring?.length) return null;
  const lats = ring.map((p) => p[1]);
  const lons = ring.map((p) => p[0]);
  return [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ];
}

/**
 * Leave room for the playback bar along the bottom. The legend starts folded into a
 * small chip unless the screen is wide, so it is not padded for.
 */
function overlayPadding(map: L.Map) {
  const wide = map.getSize().x >= 700;
  return {
    paddingTopLeft: (wide ? [20, 20] : [16, 16]) as [number, number],
    paddingBottomRight: (wide ? [20, 80] : [16, 90]) as [number, number],
  };
}

function FitToBoundary({ boundary }: { boundary: GeoJsonBoundary | null }) {
  const map = useMap();
  useEffect(() => {
    const bounds = boundaryBounds(boundary);
    if (!bounds) return;
    // Wait a frame so the grid has laid out before measuring the bounds.
    const frame = requestAnimationFrame(() => {
      map.invalidateSize();
      map.fitBounds(bounds, overlayPadding(map));
    });
    return () => cancelAnimationFrame(frame);
  }, [boundary, map]);
  return null;
}

/**
 * Where the guided story points the camera: a set of facilities, or the whole
 * taluk. Undefined outside the story, so ordinary panning is never overridden.
 */
export type MapFocus = { facilityIds: string[] } | "taluk" | undefined;

function FocusOn({
  focus,
  facilities,
  boundary,
}: {
  focus: MapFocus;
  facilities: Facility[];
  boundary: GeoJsonBoundary | null;
}) {
  const map = useMap();
  const key = focus === undefined ? "" : focus === "taluk" ? "taluk" : focus.facilityIds.join(",");
  const previous = useRef("");

  useEffect(() => {
    const was = previous.current;
    previous.current = key;
    // Leaving the story returns to the taluk once; outside it the user owns the view.
    if (!key && !was) return;
    let bounds = boundaryBounds(boundary);
    if (focus) {
      // "taluk" frames every facility rather than the whole boundary: with room left
      // for the story panel, the boundary only fits a zoom level further out.
      const points = facilities
        .filter((f) => focus === "taluk" || focus.facilityIds.includes(f.id))
        .map((f) => [f.lat, f.lon] as [number, number]);
      if (points.length) {
        bounds = [
          [Math.min(...points.map((p) => p[0])), Math.min(...points.map((p) => p[1]))],
          [Math.max(...points.map((p) => p[0])), Math.max(...points.map((p) => p[1]))],
        ];
      }
    }
    if (!bounds) return;
    // The story panel covers the left of the map (or the bottom, on a narrow screen),
    // and the scoreboard the top right; frame the facilities in what is left. On
    // leaving the story the taluk is framed as on load.
    const wide = map.getSize().x >= 900;
    const options = !focus
      ? overlayPadding(map)
      : {
          paddingTopLeft: (wide ? [470, 50] : [40, 230]) as [number, number],
          paddingBottomRight: (wide ? [60, 40] : [40, 300]) as [number, number],
          maxZoom: 14,
        };
    if (prefersReducedMotion()) map.fitBounds(bounds, options);
    else map.flyToBounds(bounds, { ...options, duration: CAMERA_FLIGHT_MS / 1000 });
    // `focus` is summarised by `key`; facilities and boundary are stable per run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

/**
 * An arrowhead on a route, pointing at the receiving facility. Cached per whole degree,
 * like the pins, so an arrow that stays on screen is not rebuilt every day.
 */
const arrowIcons = new Map<number, L.DivIcon>();
function arrowIcon(rawBearing: number) {
  const bearing = Math.round(rawBearing);
  const cached = arrowIcons.get(bearing);
  if (cached) return cached;
  const icon = L.divIcon({
    className: "zealo-arrow",
    html: `<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style="transform:rotate(${bearing}deg)"><path d="M8 1 L14 14 L8 10.5 L2 14 Z" fill="var(--color-move)" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
  arrowIcons.set(bearing, icon);
  return icon;
}

const MANUFACTURER_CHIP = L.divIcon({
  className: "zealo-maker-chip",
  html: "Manufacturer A",
  iconSize: [118, 26],
  iconAnchor: [59, 13],
});

export interface InventoryMapProps {
  facilities: Facility[];
  boundary: GeoJsonBoundary | null;
  /** Pin state per facility: by facility status, or by the selected medicine. */
  pins: Record<string, PinStatus>;
  events: SimulationEvent[] | undefined;
  day: number;
  selectedFacilityId: string | null;
  onSelectFacility: (id: string) => void;
  /** Set by the guided story: facilities outside it are dimmed. */
  highlightedFacilityIds: Set<string> | null;
  /** Set only by the guided story. */
  focus?: MapFocus;
  /**
   * False for a picture of the map (the Home page): no dragging, zooming, keyboard or
   * clicks, so it cannot trap scrolling or focus on a page that is read top to bottom.
   */
  interactive?: boolean;
}

export function InventoryMap({
  facilities,
  boundary,
  pins,
  events,
  day,
  selectedFacilityId,
  onSelectFacility,
  highlightedFacilityIds,
  focus,
  interactive = true,
}: InventoryMapProps) {
  const transfers = useMemo(
    () =>
      transferLinesForDay(events, facilities, day)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, MAX_ROUTES_DRAWN),
    [events, facilities, day],
  );
  const express = useMemo(
    () => manufacturerActivityForDay(events, facilities, day).express.slice(0, MAX_EXPRESS_DRAWN),
    [events, facilities, day],
  );
  const edge = useMemo<Bounds | null>(() => {
    const bounds = boundaryBounds(boundary);
    if (!bounds) return null;
    const margin = 0.03;
    return [
      [bounds[0][0] - margin, bounds[0][1] - margin],
      [bounds[1][0] + margin, bounds[1][1] + margin],
    ];
  }, [boundary]);
  const labelled = useMemo(
    () => new Set(labelledFacilityIds(selectedFacilityId, transfers, pins)),
    [selectedFacilityId, transfers, pins],
  );

  return (
    <MapContainer
      center={GADAG_CENTRE}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom={interactive}
      dragging={interactive}
      zoomControl={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      boxZoom={interactive}
      keyboard={interactive}
      className={`zealo-map h-full w-full ${interactive ? "" : "zealo-still"}`}
      data-testid="inventory-map"
    >
      {/* During a camera flight, fetch tiles for where it lands rather than for every zoom
          level it passes through (which stuttered the flight), and keep a wider ring of
          tiles loaded so panning shows fewer blank squares. */}
      <TileLayer
        url={TILE_URL}
        attribution={TILE_ATTRIBUTION}
        maxZoom={19}
        updateWhenZooming={false}
        keepBuffer={4}
      />
      <KeepSizeInSync />
      <FitToBoundary boundary={boundary} />
      <FocusOn focus={focus} facilities={facilities} boundary={boundary} />

      {boundary && (
        <GeoJSON
          data={boundary as never}
          pathOptions={{
            className: "zealo-boundary",
            weight: 1.5,
            dashArray: "6 5",
            fillOpacity: 0.03,
          }}
        />
      )}

      {/* Manufacturer orders come in from the nearest edge: manufacturers' locations are
          not in this dataset, so none is placed on the map. Express orders only. */}
      {edge &&
        express.map((arrow, index) => {
          const start = edgePoint(arrow.to, edge);
          return (
            <Fragment key={`express-${arrow.id}`}>
              <Polyline
                positions={[start, arrow.to]}
                pathOptions={{ className: "zealo-manufacturer", weight: 2, dashArray: "4 6" }}
              >
                <Tooltip sticky>{arrow.message}</Tooltip>
              </Polyline>
              {index === 0 && (
                <Marker
                  position={start}
                  icon={MANUFACTURER_CHIP}
                  interactive={false}
                  keyboard={false}
                />
              )}
            </Fragment>
          );
        })}

      {transfers.map((line) => (
        <Fragment key={line.id}>
          <Polyline
            positions={[line.from, line.to]}
            pathOptions={{
              className: "zealo-transfer",
              weight: 4.5,
              lineCap: "round",
              dashArray: "10 10",
            }}
          >
            <Tooltip sticky>{line.message}</Tooltip>
          </Polyline>
          <Marker
            position={along(line.from, line.to, 0.78)}
            icon={arrowIcon(bearingDeg(line.from, line.to))}
            interactive={false}
            keyboard={false}
          />
        </Fragment>
      ))}

      {facilities.map((facility) => {
        const dimmed = highlightedFacilityIds ? !highlightedFacilityIds.has(facility.id) : false;
        const selected = facility.id === selectedFacilityId;
        const permanent = labelled.has(facility.id) && !dimmed;
        return (
          <Marker
            key={facility.id}
            position={[facility.lat, facility.lon]}
            icon={facilityIcon(facility.facility_type, pins[facility.id] ?? "unknown", {
              selected,
              dimmed,
              approximate: facility.location_precision !== "exact",
            })}
            // Selected and spotlit pins sit above the neighbours they overlap.
            zIndexOffset={selected ? 2000 : highlightedFacilityIds && !dimmed ? 1000 : 0}
            title={facility.display_label}
            interactive={interactive}
            keyboard={interactive}
            eventHandlers={{ click: () => onSelectFacility(facility.id) }}
          >
            {permanent ? (
              <Tooltip
                key="label"
                permanent
                direction="right"
                offset={[10, 0]}
                className="zealo-label"
              >
                {facility.display_label}
              </Tooltip>
            ) : (
              <Tooltip key="hover" direction="top" offset={[0, -12]} className="zealo-tooltip">
                <strong>{facility.display_label}</strong>
                <br />
                {TYPE_LABELS[facility.facility_type] ?? facility.facility_type}
                {!facility.verified && (
                  <>
                    <br />
                    Location not yet checked
                  </>
                )}
                {facility.location_precision !== "exact" && (
                  <>
                    <br />
                    Approximate: village centre
                  </>
                )}
              </Tooltip>
            )}
          </Marker>
        );
      })}
    </MapContainer>
  );
}
