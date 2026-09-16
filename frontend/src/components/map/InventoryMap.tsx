/**
 * The Leaflet street map of Gadag taluk.
 *
 * Tile policy: standard OpenStreetMap tiles, with the required attribution
 * always visible and the tile URL read from an environment variable so the
 * provider can be swapped without a code change if traffic grows. No tiles are
 * pre-fetched or bulk downloaded.
 */
import { useEffect, useMemo } from "react";
import { GeoJSON, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import type { Facility, FacilityStatus, SimulationEvent } from "../../api/types";
import type { GeoJsonBoundary } from "../../api/types";
import { facilityIcon, TYPE_LABELS } from "./icons";
import { manufacturerArrowsForDay, transferLinesForDay } from "./mapLogic";

const TILE_URL =
  (import.meta.env.VITE_TILE_URL as string | undefined) ??
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Gadag taluk, from the OSM boundary relation's bounding box. */
const GADAG_CENTRE: [number, number] = [15.42, 75.63];
const DEFAULT_ZOOM = 11;

function FitToBoundary({ boundary }: { boundary: GeoJsonBoundary | null }) {
  const map = useMap();
  useEffect(() => {
    if (!boundary?.features?.length) return;
    const ring = boundary.features[0].geometry.coordinates[0];
    if (!ring?.length) return;
    const lats = ring.map((p) => p[1]);
    const lons = ring.map((p) => p[0]);
    map.fitBounds([
      [Math.min(...lats), Math.min(...lons)],
      [Math.max(...lats), Math.max(...lons)],
    ]);
  }, [boundary, map]);
  return null;
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
}: InventoryMapProps) {
  const transfers = useMemo(
    () => transferLinesForDay(events, facilities, day),
    [events, facilities, day],
  );
  const arrows = useMemo(
    () => manufacturerArrowsForDay(events, facilities, day),
    [events, facilities, day],
  );

  return (
    <MapContainer
      center={GADAG_CENTRE}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      className="h-full w-full"
      data-testid="inventory-map"
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
      <FitToBoundary boundary={boundary} />

      {boundary && (
        <GeoJSON
          data={boundary as never}
          style={{ color: "#6A4CA8", weight: 2, fillOpacity: 0.04, dashArray: "6 4" }}
        />
      )}

      {/* Manufacturer supply, drawn as an arrow entering from the map edge:
          this dataset does not record where manufacturers are. */}
      {arrows.map((arrow) => (
        <Polyline
          key={`mfr-${arrow.id}`}
          positions={[[arrow.to[0] + 0.28, arrow.to[1] - 0.34], arrow.to]}
          pathOptions={{
            color: arrow.express ? "#F0674A" : "#6A4CA8",
            weight: 2,
            opacity: 0.55,
            dashArray: "2 6",
          }}
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

      <MarkerClusterGroup chunkedLoading maxClusterRadius={45}>
        {facilities.map((facility) => {
          const dimmed = highlightedFacilityIds
            ? !highlightedFacilityIds.has(facility.id)
            : false;
          return (
            <Marker
              key={facility.id}
              position={[facility.lat, facility.lon]}
              icon={facilityIcon(facility.facility_type, statuses[facility.id] ?? null, {
                selected: facility.id === selectedFacilityId,
                dimmed,
              })}
              eventHandlers={{ click: () => onSelectFacility(facility.id) }}
            >
              <Tooltip direction="top" offset={[0, -12]}>
                <span className="font-semibold">{facility.display_label}</span>
                <br />
                {TYPE_LABELS[facility.facility_type] ?? facility.facility_type}
              </Tooltip>
            </Marker>
          );
        })}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
