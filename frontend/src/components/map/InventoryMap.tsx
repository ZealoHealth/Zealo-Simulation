/**
 * The Leaflet street map of Gadag taluk.
 *
 * Tile policy: standard OpenStreetMap tiles, with the required attribution
 * always visible and the tile URL read from an environment variable so the
 * provider can be swapped without a code change if traffic grows. No tiles are
 * pre-fetched or bulk downloaded.
 */
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { GeoJSON, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import type { Facility, FacilityStatus, SimulationEvent } from "../../api/types";
import type { GeoJsonBoundary } from "../../api/types";
import { prefersReducedMotion } from "../../ui/motion";
import { facilityIcon, TYPE_LABELS } from "./icons";
import { manufacturerActivityForDay, transferLinesForDay } from "./mapLogic";

const TILE_URL =
  (import.meta.env.VITE_TILE_URL as string | undefined) ??
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

// Most transfer routes and express deliveries drawn on one day. On the first days the
// network closes the gaps in its opening stock all at once, and drawing every route
// turned the map into a solid block of lines. The largest are drawn; the rest are
// counted on the chip, and every movement stays in the event feed.
export const MAX_ROUTES_DRAWN = 25;
export const MAX_EXPRESS_DRAWN = 12;

const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Gadag taluk, from the OSM boundary relation's bounding box. */
const GADAG_CENTRE: [number, number] = [15.42, 75.63];
const DEFAULT_ZOOM = 11;

/**
 * Keep Leaflet's idea of its size in step with the layout.
 *
 * The map mounts inside a CSS grid that settles after first paint, so Leaflet measured
 * a smaller box and only tiled part of the view. Re-measuring whenever the container
 * resizes fixes it for good, including when the side panels open or close.
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

function FitToBoundary({ boundary }: { boundary: GeoJsonBoundary | null }) {
  const map = useMap();
  useEffect(() => {
    if (!boundary?.features?.length) return;
    const ring = boundary.features[0].geometry.coordinates[0];
    if (!ring?.length) return;
    const lats = ring.map((p) => p[1]);
    const lons = ring.map((p) => p[0]);
    // Wait a frame so the grid has laid out before measuring the bounds.
    const frame = requestAnimationFrame(() => {
      map.invalidateSize();
      map.fitBounds(
        [
          [Math.min(...lats), Math.min(...lons)],
          [Math.max(...lats), Math.max(...lons)],
        ],
        { padding: [16, 16] },
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [boundary, map]);
  return null;
}

function boundaryBounds(boundary: GeoJsonBoundary | null): [[number, number], [number, number]] | null {
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
      // for the story card, the boundary only fits a zoom level further out.
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
    // and the scoreboard the top right; frame the facilities in what is left.
    // On leaving the story there is no panel, so the taluk is centred as on load.
    const wide = map.getSize().x >= 900;
    const options = !focus
      ? { padding: [16, 16] as [number, number] }
      : {
          paddingTopLeft: (wide ? [470, 50] : [40, 230]) as [number, number],
          paddingBottomRight: (wide ? [60, 40] : [40, 300]) as [number, number],
          maxZoom: 14,
        };
    if (prefersReducedMotion()) map.fitBounds(bounds, options);
    else map.flyToBounds(bounds, { ...options, duration: 1.1 });
    // `focus` is summarised by `key`; facilities and boundary are stable per run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

function MaybeCluster({ cluster, children }: { cluster: boolean; children: ReactNode }) {
  if (!cluster) return <>{children}</>;
  return (
    <MarkerClusterGroup chunkedLoading maxClusterRadius={45}>
      {children}
    </MarkerClusterGroup>
  );
}

export interface InventoryMapProps {
  facilities: Facility[];
  boundary: GeoJsonBoundary | null;
  statuses: Record<string, FacilityStatus>;
  events: SimulationEvent[] | undefined;
  day: number;
  selectedFacilityId: string | null;
  onSelectFacility: (id: string) => void;
  /** When a medicine is selected, facilities without it are dimmed rather than hidden. */
  highlightedFacilityIds: Set<string> | null;
  /** Set only by the guided story. */
  focus?: MapFocus;
  /**
   * Group nearby markers. The story turns this off: the facilities a chapter
   * spotlights must stay visible, not fold into a numbered cluster.
   */
  cluster?: boolean;
}

export function InventoryMap({
  facilities,
  boundary,
  statuses,
  events,
  day,
  selectedFacilityId,
  onSelectFacility,
  highlightedFacilityIds,
  focus,
  cluster = true,
}: InventoryMapProps) {
  const allTransfers = useMemo(
    () => transferLinesForDay(events, facilities, day),
    [events, facilities, day],
  );
  const transfers = useMemo(
    () => [...allTransfers].sort((a, b) => b.quantity - a.quantity).slice(0, MAX_ROUTES_DRAWN),
    [allTransfers],
  );
  const manufacturer = useMemo(
    () => manufacturerActivityForDay(events, facilities, day),
    [events, facilities, day],
  );

  return (
    <>
    <MapContainer
      center={GADAG_CENTRE}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      className="h-full w-full"
      data-testid="inventory-map"
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
      <KeepSizeInSync />
      <FitToBoundary boundary={boundary} />
      <FocusOn focus={focus} facilities={facilities} boundary={boundary} />

      {boundary && (
        <GeoJSON
          data={boundary as never}
          style={{ color: "#6A4CA8", weight: 2, fillOpacity: 0.04, dashArray: "6 4" }}
        />
      )}

      {/* Express orders only, as arrows from the map edge: manufacturers' locations are
          not in this dataset, so none is placed on the map. */}
      {manufacturer.express.slice(0, MAX_EXPRESS_DRAWN).map((arrow) => (
        <Polyline
          key={`express-${arrow.id}`}
          positions={[[arrow.to[0] + 0.12, arrow.to[1] - 0.16], arrow.to]}
          pathOptions={{ color: "#F0674A", weight: 2, opacity: 0.7, dashArray: "2 5" }}
        >
          <Tooltip sticky>{arrow.message}</Tooltip>
        </Polyline>
      ))}

      {transfers.map((line) => (
        <Polyline
          key={line.id}
          positions={[line.from, line.to]}
          className="zealo-transfer-line"
          pathOptions={{
            color: line.kind === "relief" ? "#F0674A" : "#1F9D55",
            weight: 3,
            opacity: 0.9,
            dashArray: "8 6",
          }}
        >
          <Tooltip sticky>{line.message}</Tooltip>
        </Polyline>
      ))}

      <MaybeCluster cluster={cluster}>
        {facilities.map((facility) => {
          const dimmed = highlightedFacilityIds
            ? !highlightedFacilityIds.has(facility.id)
            : false;
          return (
            <Marker
              key={facility.id}
              position={[facility.lat, facility.lon]}
              // Spotlit markers sit above dimmed neighbours they overlap.
              zIndexOffset={highlightedFacilityIds && !dimmed ? 1000 : 0}
              icon={facilityIcon(facility.facility_type, statuses[facility.id] ?? null, {
                selected: facility.id === selectedFacilityId,
                dimmed,
                approximate: facility.location_precision !== "exact",
              })}
              eventHandlers={{ click: () => onSelectFacility(facility.id) }}
            >
              <Tooltip direction="top" offset={[0, -12]}>
                <span className="font-semibold">{facility.display_label}</span>
                <br />
                {TYPE_LABELS[facility.facility_type] ?? facility.facility_type}
                {!facility.verified && (
                  <>
                    <br />
                    <span style={{ color: "#D97706" }}>Location unverified</span>
                  </>
                )}
                {facility.location_precision !== "exact" && (
                  <>
                    <br />
                    <span style={{ color: "#D97706" }}>Approximate: village centre</span>
                  </>
                )}
              </Tooltip>
            </Marker>
          );
        })}
      </MaybeCluster>
    </MapContainer>
    <MovementChip
      routineOrders={manufacturer.routineOrders}
      routineFacilities={manufacturer.routineFacilities}
      express={manufacturer.express.length}
      routes={allTransfers.length}
    />
    </>
  );
}

/** What moved today, summarised at the map edge rather than drawn line by line. */
function MovementChip({
  routineOrders,
  routineFacilities,
  express,
  routes,
}: {
  routineOrders: number;
  routineFacilities: number;
  express: number;
  routes: number;
}) {
  if (!routineOrders && !express && !routes) return null;
  const hiddenRoutes = Math.max(0, routes - MAX_ROUTES_DRAWN);
  const hiddenExpress = Math.max(0, express - MAX_EXPRESS_DRAWN);
  return (
    <div className="pointer-events-none absolute left-14 top-3 z-[1000] rounded-lg bg-surface/95 px-3 py-2 text-[11px] leading-snug shadow-card">
      {routes > 0 && (
        <p className="font-semibold text-ink">
          {routes} transfer route{routes === 1 ? "" : "s"} active
          {hiddenRoutes > 0 && (
            <span className="font-normal text-ink-subtle"> &middot; largest {MAX_ROUTES_DRAWN} drawn</span>
          )}
        </p>
      )}
      {(routineOrders > 0 || express > 0) && (
        <p className="text-ink-muted">
          Manufacturer A (off map): {routineOrders} refill orders to {routineFacilities} facilities
        </p>
      )}
      {express > 0 && (
        <p className="font-medium text-coral">
          {express} express deliveries
          {hiddenExpress > 0 && <span className="font-normal"> &middot; {MAX_EXPRESS_DRAWN} drawn</span>}
        </p>
      )}
    </div>
  );
}
