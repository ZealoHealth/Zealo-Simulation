/**
 * Detail panel for one facility.
 *
 * Shows what it is, what it holds, and -- for government facilities -- the gap
 * between what its level is supposed to carry and what it actually stocks. Every
 * figure carries a provenance badge, and the panel repeats in place that a PHC's
 * stock pattern is an illustrative assignment, because a marker on a real
 * location invites the reader to believe otherwise.
 */
import type { Facility, FacilityRunResponse, Medicine } from "../../api/types";
import { ProvenanceBadge, ProvenanceRow } from "../Provenance";
import { TYPE_LABELS } from "../map/icons";

const GOVERNMENT_LEVEL_COLUMN: Record<string, string> = {
  phc: "phc",
  chc: "chc",
  taluk_hospital: "taluk_hospital",
  district_hospital: "district_hospital",
  government_other: "chc",
};

const STATUS_CLASS: Record<string, string> = {
  green: "text-status-green",
  amber: "text-status-amber",
  red: "text-status-red",
};

export interface FacilityPanelProps {
  facility: Facility;
  run: FacilityRunResponse | undefined;
  medicines: Medicine[];
  onClose: () => void;
  onUseAsOrigin: () => void;
}

export function FacilityPanel({
  facility,
  run,
  medicines,
  onClose,
  onUseAsOrigin,
}: FacilityPanelProps) {
  const level = GOVERNMENT_LEVEL_COLUMN[facility.facility_type];
  const shouldCarry = level
    ? medicines.filter((m) => m.levels.includes(level))
    : [];
  const carriedIds = new Set(run?.medicines.map((m) => m.medicine_id) ?? []);
  const missing = shouldCarry.filter((m) => !carriedIds.has(m.id));

  return (
    <aside
      className="flex h-full w-full flex-col overflow-hidden bg-white shadow-xl ring-1 ring-navy/10"
      aria-label={`Details for ${facility.display_label}`}
    >
      <header className="flex items-start justify-between gap-2 border-b border-navy/10 bg-lavender px-4 py-3">
        <div>
          <h2 className="text-base font-bold text-navy">{facility.display_label}</h2>
          <p className="text-xs text-navy/60">
            {TYPE_LABELS[facility.facility_type] ?? facility.facility_type} &middot;{" "}
            {facility.ownership}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close facility details"
          className="rounded px-2 text-lg leading-none text-navy/50 hover:text-navy"
        >
          &times;
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        <section className="mb-4 rounded-lg bg-lavender/60 px-3 py-2">
          <ProvenanceRow
            label="Location"
            value={`${facility.lat.toFixed(4)}, ${facility.lon.toFixed(4)}`}
            provenance={facility.provenance.lat ?? "real"}
          />
          <ProvenanceRow
            label="Facility type"
            value={TYPE_LABELS[facility.facility_type] ?? facility.facility_type}
            provenance={facility.provenance.facility_type ?? "derived"}
          />
          <ProvenanceRow
            label="Ownership"
            value={facility.ownership}
            provenance={facility.provenance.ownership ?? "derived"}
          />
          <ProvenanceRow
            label="Beds"
            value={facility.beds ?? "Not recorded"}
            provenance={facility.beds == null ? "unknown" : "real"}
          />
          <div className="flex items-baseline justify-between gap-3 py-1">
            <span className="text-xs text-navy/60">Zealo network</span>
            <span className="text-sm font-medium">
              {facility.in_network ? "In network" : "Not in network"}
            </span>
          </div>
        </section>

        {!facility.verified && (
          <p className="mb-3 rounded border border-coral/30 bg-coral/10 px-3 py-2 text-[11px] text-navy/80">
            This location has not been checked by hand yet. Facility type and ownership are
            inferred from OpenStreetMap names, which carry no operator field.
          </p>
        )}

        {facility.facility_type === "phc" && (
          <p className="mb-3 rounded border border-purple/30 bg-purple/10 px-3 py-2 text-[11px] text-navy/80">
            The 2021&ndash;22 survey anonymised its PHCs, so this location&rsquo;s stock pattern
            is an <strong>illustrative assignment</strong> of one survey profile, not an
            observation about this place.
          </p>
        )}

        {facility.ownership === "private" && (
          <p className="mb-3 rounded border border-navy/20 bg-navy/5 px-3 py-2 text-[11px] text-navy/80">
            No public inventory data exists for private facilities. This stock is modelled from
            the taluk-hospital medicine list as a documented proxy.
          </p>
        )}

        <button
          type="button"
          onClick={onUseAsOrigin}
          className="mb-4 w-full rounded border border-purple/40 bg-purple/5 px-3 py-1.5 text-xs font-medium text-purple"
        >
          Measure distances from here
        </button>

        {run ? (
          <>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-navy/50">
              Medicines ({run.medicines.length})
            </h3>
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wide text-navy/50">
                <tr>
                  <th className="pb-1">Medicine</th>
                  <th className="pb-1 text-right">Stock</th>
                  <th className="pb-1 text-right">Days cover</th>
                  <th className="pb-1 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {run.medicines.map((row) => (
                  <tr key={row.medicine_id} className="border-t border-navy/5">
                    <td className="py-1 pr-2">{row.name}</td>
                    <td className="py-1 text-right tabular-nums">{row.on_hand}</td>
                    <td className="py-1 text-right tabular-nums">
                      {row.days_of_cover?.toFixed(1) ?? "—"}
                    </td>
                    <td
                      className={`py-1 text-right font-semibold ${STATUS_CLASS[row.status] ?? ""}`}
                    >
                      {row.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 flex items-center gap-1.5 text-[10px] text-navy/50">
              Stock figures are modelled <ProvenanceBadge provenance="estimated" />
            </p>

            {level && (
              <section className="mt-4">
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy/50">
                  Should carry vs carries
                </h3>
                <p className="text-xs text-navy/70">
                  Its level should carry <strong>{shouldCarry.length}</strong> of the modelled
                  medicines; it stocks <strong>{carriedIds.size}</strong>.
                </p>
                {missing.length > 0 && (
                  <ul className="mt-1 max-h-32 overflow-y-auto text-[11px] text-navy/60">
                    {missing.slice(0, 20).map((m) => (
                      <li key={m.id}>&middot; {m.name}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 flex items-center gap-1.5 text-[10px] text-navy/50">
                  From the Karnataka annual indent&rsquo;s facility-level columns{" "}
                  <ProvenanceBadge provenance="real" />
                </p>
              </section>
            )}
          </>
        ) : (
          <p className="rounded bg-lavender px-3 py-4 text-center text-xs text-navy/60">
            Run a simulation to see this facility&rsquo;s medicine inventory.
          </p>
        )}
      </div>
    </aside>
  );
}
