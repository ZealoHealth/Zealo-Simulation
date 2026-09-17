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
import { CardTitle, Select, TextInput } from "../../ui";
import { shortMedicineName } from "../../api/format";

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

  const inStock = ranked.filter((r) => r.in_stock).length;
  const selected = medicines.find((m) => m.id === selectedMedicineId);
  const availabilityOnly = selected ? !selected.quantity_modelled : false;
  const origin = facilities.find((f) => f.id === originFacilityId);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <CardTitle hint="Pick one to recolour the map by its stock.">Find a medicine</CardTitle>

      <TextInput
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or group"
        aria-label="Search medicines"
        className="mb-2"
      />

      {/* A real list rather than a native multi-select: the browser default
          cannot be styled and was the loudest unpolished element on the page. */}
      <ul
        role="listbox"
        aria-label="Select a medicine"
        className="mb-3 max-h-56 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1"
      >
        <li>
          <button
            type="button"
            role="option"
            aria-selected={selectedMedicineId === null}
            onClick={() => onSelect(null)}
            className={`w-full rounded-lg px-2 py-1.5 text-left text-xs transition ${
              selectedMedicineId === null
                ? "bg-purple text-white font-semibold"
                : "text-ink-muted hover:bg-surface-sunken"
            }`}
          >
            All medicines (facility status)
          </button>
        </li>
        {matches.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              role="option"
              aria-selected={selectedMedicineId === m.id}
              onClick={() => onSelect(m.id)}
              title={m.name}
              className={`w-full truncate rounded-lg px-2 py-1.5 text-left text-xs leading-snug transition ${
                selectedMedicineId === m.id
                  ? "bg-purple text-white font-semibold"
                  : "text-ink hover:bg-surface-sunken"
              }`}
            >
              {shortMedicineName(m.name)}
              {!m.quantity_modelled && (
                <span className="ml-1 text-[9px] font-medium uppercase opacity-60">
                  availability only
                </span>
              )}
            </button>
          </li>
        ))}
        {matches.length === 0 && (
          <li className="px-2 py-3 text-center text-xs text-ink-subtle">
            No medicine matches &ldquo;{query}&rdquo;.
          </li>
        )}
      </ul>

      {selectedMedicineId && (
        <>
          <div className="mb-2">
            <Select
              value={radiusKm ?? ""}
              onChange={(e) => onRadiusChange(e.target.value ? Number(e.target.value) : null)}
              aria-label="Filter by radius"
            >
              <option value="">Any distance</option>
              <option value="5">Within 5 km</option>
              <option value="10">Within 10 km</option>
              <option value="25">Within 25 km</option>
            </Select>
          </div>

          <p className="mb-1 text-xs text-ink-muted" data-testid="medicine-search-summary">
            <strong>{inStock}</strong> of {ranked.length} facilities have it
            {origin ? ` · nearest first from ${origin.display_label}` : ""}
          </p>

          <ul className="min-h-0 flex-1 overflow-y-auto text-xs">
            {ranked.map((row) => (
              <li
                key={row.facility_id}
                className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 hover:bg-surface-sunken"
              >
                <span className="truncate">{row.display_label}</span>
                <span className="tabular flex shrink-0 items-center gap-2">
                  {row.distanceKm != null && (
                    <span className="text-ink-subtle">{row.distanceKm.toFixed(1)} km</span>
                  )}
                  <span
                    className={
                      row.in_stock
                        ? "font-semibold text-status-green"
                        : "font-semibold text-status-red"
                    }
                  >
                    {!row.in_stock
                      ? "out of stock"
                      : row.on_hand == null
                        ? "in stock"
                        : `${row.on_hand} units`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {availabilityOnly ? (
            <p className="mt-2 flex items-center gap-1.5 text-[10px] leading-snug text-ink-subtle">
              Availability only, at mapped PHCs: no confirmed indent match yet, so no
              quantities <ProvenanceBadge provenance="derived" />
            </p>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-ink-subtle">
              Stock levels are modelled <ProvenanceBadge provenance="estimated" />
            </p>
          )}
        </>
      )}
    </div>
  );
}
