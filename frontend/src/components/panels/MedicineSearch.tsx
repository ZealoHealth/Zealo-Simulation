/**
 * Medicine search: pick an item, recolour the map by its stock, list where it is.
 *
 * Facilities that are out of the medicine stay in the list rather than being
 * filtered away -- "who has run out" is the question the map exists to answer.
 */
import { useMemo, useState } from "react";
import type { Facility, Medicine, MedicineDayRow } from "../../api/types";
import { ProvenanceBadge } from "../Provenance";
import { rankByDistance } from "../map/mapLogic";

export interface MedicineSearchProps {
  medicines: Medicine[];
  selectedMedicineId: string | null;
  onSelect: (id: string | null) => void;
  rows: MedicineDayRow[] | undefined;
  facilities: Facility[];
  originFacilityId: string | null;
  radiusKm: number | null;
  onRadiusChange: (km: number | null) => void;
}

export function MedicineSearch({
  medicines,
  selectedMedicineId,
  onSelect,
  rows,
  facilities,
  originFacilityId,
  radiusKm,
  onRadiusChange,
}: MedicineSearchProps) {
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return medicines.slice(0, 40);
    return medicines
      .filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.therapeutic_group.toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [medicines, query]);

  const ranked = useMemo(
    () =>
      rows
        ? rankByDistance(rows, facilities, originFacilityId, { radiusKm })
        : [],
    [rows, facilities, originFacilityId, radiusKm],
  );

  const inStock = ranked.filter((r) => r.on_hand > 0).length;
  const origin = facilities.find((f) => f.id === originFacilityId);

  return (
    <div className="flex h-full flex-col">
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-navy/50">
        Find a medicine
      </label>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or therapeutic group"
        aria-label="Search medicines"
        className="mb-2 w-full rounded border border-navy/20 px-2 py-1.5 text-sm"
      />

      <select
        value={selectedMedicineId ?? ""}
        onChange={(e) => onSelect(e.target.value || null)}
        aria-label="Select a medicine"
        size={6}
        className="mb-3 w-full rounded border border-navy/20 bg-white px-1 py-1 text-xs"
      >
        <option value="">All medicines (facility status)</option>
        {matches.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>

      {selectedMedicineId && (
        <>
          <div className="mb-2 flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1 text-navy/70">
              Within
              <select
                value={radiusKm ?? ""}
                onChange={(e) => onRadiusChange(e.target.value ? Number(e.target.value) : null)}
                aria-label="Filter by radius"
                className="rounded border border-navy/20 px-1 py-0.5"
              >
                <option value="">any distance</option>
                <option value="5">5 km</option>
                <option value="10">10 km</option>
                <option value="25">25 km</option>
              </select>
            </label>
          </div>

          <p className="mb-1 text-xs text-navy/70" data-testid="medicine-search-summary">
            <strong>{inStock}</strong> of {ranked.length} facilities have it
            {origin ? ` · nearest first from ${origin.display_label}` : ""}
          </p>

          <ul className="flex-1 divide-y divide-navy/5 overflow-y-auto text-xs">
            {ranked.map((row) => (
              <li
                key={row.facility_id}
                className="flex items-center justify-between gap-2 py-1.5"
              >
                <span className="truncate">{row.display_label}</span>
                <span className="flex shrink-0 items-center gap-2 tabular-nums">
                  {row.distanceKm != null && (
                    <span className="text-navy/50">{row.distanceKm.toFixed(1)} km</span>
                  )}
                  <span
                    className={
                      row.on_hand > 0 ? "font-semibold text-status-green" : "font-semibold text-status-red"
                    }
                  >
                    {row.on_hand > 0 ? `${row.on_hand} units` : "out of stock"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-navy/50">
            Stock levels are modelled <ProvenanceBadge provenance="estimated" />
          </p>
        </>
      )}
    </div>
  );
}
