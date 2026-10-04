/**
 * "Find a medicine": choose one, recolour the pins by its stock, and list the nearest
 * facilities that have it.
 *
 * Distances are measured from the selected facility. "Has spare" means over a month of
 * stock -- the Network page's surplus rule -- rather than a number of units, because the
 * medicine view does not carry each facility's reorder point and a spare quantity
 * worked out any other way would not be the one Zealo actually moves.
 */
import { useId, useMemo, useState } from "react";
import { shortMedicineName } from "../../api/format";
import { daysLeft, medicineRowForecast, medicineRowState, type StockState } from "../../api/stock";
import type { Facility, Medicine, MedicineDayRow } from "../../api/types";
import { Chip, Select, type ChipTone } from "../../ui";
import { ProvenanceBadge } from "../Provenance";
import { rankByDistance } from "../map/mapLogic";

const NEAREST_SHOWN = 5;
const SUGGESTIONS_SHOWN = 8;

const STATE_CHIP: Record<StockState, { tone: ChipTone; label: string }> = {
  spare: { tone: "scrub", label: "Has spare" },
  ok: { tone: "scrub", label: "In stock" },
  low: { tone: "low", label: "Running low" },
  out: { tone: "out", label: "Out" },
};

export interface MedicineSearchProps {
  medicines: Medicine[];
  selectedMedicineId: string | null;
  onSelect: (id: string | null) => void;
  rows: MedicineDayRow[] | undefined;
  facilities: Facility[];
  /** Distances are measured from here: the selected facility. */
  originFacilityId: string | null;
  radiusKm: number | null;
  onRadiusChange: (km: number | null) => void;
  day: number;
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="text-muted">
      <circle cx="7.5" cy="7.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M11.8 11.8 L16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
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
  day,
}: MedicineSearchProps) {
  const inputId = useId();
  const listId = useId();
  const selected = medicines.find((m) => m.id === selectedMedicineId) ?? null;
  const [query, setQuery] = useState("");
  // The box shows what is being typed, or the chosen medicine while idle.
  const shown = query || (selected ? shortMedicineName(selected.name) : "");
  const searching = query.trim().length > 0;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return medicines
      .filter(
        (m) => m.name.toLowerCase().includes(q) || m.therapeutic_group.toLowerCase().includes(q),
      )
      .slice(0, SUGGESTIONS_SHOWN);
  }, [medicines, query]);

  const origin = facilities.find((f) => f.id === originFacilityId) ?? null;
  const withStock = useMemo(() => {
    if (!rows) return [];
    const ranked = rankByDistance(rows, facilities, originFacilityId, { radiusKm }).filter(
      (r) => r.in_stock && r.facility_id !== originFacilityId,
    );
    // Without a facility to measure from, list those holding the most days of stock.
    if (!origin) ranked.sort((a, b) => (b.days_of_cover ?? 0) - (a.days_of_cover ?? 0));
    return ranked.slice(0, NEAREST_SHOWN);
  }, [rows, facilities, originFacilityId, radiusKm, origin]);

  const choose = (id: string | null) => {
    onSelect(id);
    setQuery("");
  };

  const carried = rows?.length ?? 0;
  const inStock = rows?.filter((r) => r.in_stock).length ?? 0;
  const availabilityOnly = selected ? !selected.quantity_modelled : false;

  return (
    <div>
      <label htmlFor={inputId} className="mb-2 block text-lg font-bold text-ink">
        Find a medicine
      </label>
      {/* The focus ring is drawn around the whole box, not the bare input inside it. */}
      <div
        className={`flex min-h-11 items-center gap-2 rounded-lg border bg-surface px-3 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-move ${
          shown ? "border-scrub" : "border-line"
        }`}
      >
        <SearchIcon />
        <input
          id={inputId}
          type="search"
          value={shown}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={(e) => e.target.select()}
          placeholder="Paracetamol, insulin, ORS…"
          autoComplete="off"
          aria-controls={searching ? listId : undefined}
          aria-expanded={searching}
          className="zealo-search min-h-11 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-muted focus-visible:outline-none"
        />
        {selected && (
          <button
            type="button"
            onClick={() => choose(null)}
            aria-label="Clear the medicine and show every facility's status"
            className="flex h-11 w-11 shrink-0 items-center justify-center text-xl text-muted hover:text-ink"
          >
            &times;
          </button>
        )}
      </div>

      {searching && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching medicines"
          className="mt-2 border-y border-line-soft"
        >
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected={m.id === selectedMedicineId}
                onClick={() => choose(m.id)}
                title={m.name}
                className="flex min-h-11 w-full items-center justify-between gap-2 border-b border-line-soft px-1 text-left text-[15px] text-ink last:border-b-0 hover:bg-wash"
              >
                <span className="truncate">{shortMedicineName(m.name)}</span>
                {!m.quantity_modelled && <Chip tone="plain">Availability only</Chip>}
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-1 py-3 text-[15px] text-muted">
              No medicine matches &ldquo;{query}&rdquo;.
            </li>
          )}
        </ul>
      )}

      {!selected && !searching && (
        <p className="mt-2 text-sm text-muted">
          Choose one to colour every pin by that medicine&rsquo;s stock.
        </p>
      )}

      {selected && !searching && (
        <div className="mt-3">
          {rows ? (
            <p className="text-sm leading-relaxed text-ink-2" data-testid="medicine-search-summary">
              Carried by {carried} {carried === 1 ? "facility" : "facilities"}. {inStock}{" "}
              {inStock === 1 ? "has" : "have"} stock on day {day + 1}. Map pins now show this
              medicine only.
            </p>
          ) : (
            <p className="text-sm text-muted">Loading where it is stocked&hellip;</p>
          )}

          {availabilityOnly ? (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
              Survey item: in or out of stock at mapped PHCs, with no quantities.
              <ProvenanceBadge provenance="derived" />
            </p>
          ) : (
            rows && (
              <section className="mt-4">
                <div className="mb-1 flex flex-wrap items-end justify-between gap-2">
                  <h3 className="text-[15px] font-bold text-ink">
                    {origin ? `Nearest to ${origin.display_label} with stock` : "Most stock first"}
                  </h3>
                  {origin && (
                    <div className="w-36">
                      <Select
                        value={radiusKm ?? ""}
                        onChange={(e) =>
                          onRadiusChange(e.target.value ? Number(e.target.value) : null)
                        }
                        aria-label="Only facilities within"
                      >
                        <option value="">Any distance</option>
                        <option value="5">Within 5 km</option>
                        <option value="10">Within 10 km</option>
                        <option value="25">Within 25 km</option>
                      </Select>
                    </div>
                  )}
                </div>
                {!origin && (
                  <p className="mb-1 text-sm text-muted">
                    Select a facility on the map to sort by distance.
                  </p>
                )}
                {withStock.length === 0 ? (
                  <p className="py-2 text-sm text-muted">
                    No other facility has it in stock on this day.
                  </p>
                ) : (
                  <ul>
                    {withStock.map((row) => {
                      const state = medicineRowState(row);
                      const days =
                        row.on_hand != null ? daysLeft(row.on_hand, medicineRowForecast(row)) : null;
                      const facts = [
                        row.distanceKm != null ? `${row.distanceKm.toFixed(1)} km` : null,
                        days != null ? `${days} days of stock` : null,
                      ].filter(Boolean);
                      return (
                        <li
                          key={row.facility_id}
                          className="flex items-center justify-between gap-3 border-b border-line-soft py-2.5 last:border-b-0"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-bold text-ink">
                              {row.display_label}
                            </span>
                            <span className="tabular block text-sm text-muted">
                              {facts.join(", ")}
                            </span>
                          </span>
                          <Chip tone={STATE_CHIP[state].tone}>{STATE_CHIP[state].label}</Chip>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                  Stock levels are simulated <ProvenanceBadge provenance="estimated" />
                </p>
              </section>
            )
          )}
        </div>
      )}
    </div>
  );
}
