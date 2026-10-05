/**
 * The selected facility, in the map's right rail: what it is, how its shelf looks on
 * the day shown, and what Zealo is doing about the medicines that are short.
 *
 * Every line here comes from the run; "what Zealo is doing" is `zealoAction`, the same
 * rule the Facility page's shelf table uses.
 */
import { Link } from "react-router";
import { shortMedicineName } from "../../api/format";
import { daysLeft, facilityRowState, shelfCounts } from "../../api/stock";
import type { Facility, FacilityRunResponse } from "../../api/types";
import { buttonClass } from "../../ui/buttonStyles";
import { Chip } from "../../ui";
import { ProvenanceBadge } from "../Provenance";
import { TYPE_LABELS } from "../map/icons";
import { zealoAction } from "./zealoAction";

const ATTENTION_SHOWN = 6;

function ShelfBar({
  inStock,
  underAWeek,
  out,
}: {
  inStock: number;
  underAWeek: number;
  out: number;
}) {
  const total = inStock + underAWeek + out || 1;
  return (
    <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-[3px] bg-grid">
      <span className="bg-scrub" style={{ width: `${(inStock / total) * 100}%` }} />
      <span className="bg-low" style={{ width: `${(underAWeek / total) * 100}%` }} />
      <span className="bg-out" style={{ width: `${(out / total) * 100}%` }} />
    </div>
  );
}

export function FacilityRail({
  facility,
  run,
  facilities,
}: {
  facility: Facility;
  run: FacilityRunResponse | undefined;
  facilities: Facility[];
}) {
  const labels = new Map(facilities.map((f) => [f.id, f.display_label]));
  const counts = run ? shelfCounts(run.medicines) : null;
  const attention = run
    ? run.medicines
        .map((row) => ({ row, state: facilityRowState(row) }))
        .filter(({ state }) => state === "out" || state === "low")
        .sort(
          (a, b) =>
            (a.state === "out" ? 0 : 1) - (b.state === "out" ? 0 : 1) ||
            (daysLeft(a.row.on_hand, a.row.forecast) ?? 0) -
              (daysLeft(b.row.on_hand, b.row.forecast) ?? 0),
        )
    : [];

  return (
    <section
      aria-labelledby="rail-facility"
      className="rounded-xl border border-line bg-surface p-5"
    >
      <h2
        id="rail-facility"
        className="text-[30px] font-bold leading-tight tracking-[-0.02em] text-ink"
      >
        {facility.display_label}
      </h2>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-ink-2">
        <span>
          {TYPE_LABELS[facility.facility_type] ?? facility.facility_type},{" "}
          {facility.ownership.toLowerCase()}.{" "}
          {facility.in_network ? "In the Zealo network." : "Not in the Zealo network."}
        </span>
        <ProvenanceBadge provenance={facility.provenance.facility_type ?? "derived"} />
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {facility.facility_type === "phc" && run?.survey_profile != null && (
          <Chip tone="wash">Survey profile {run.survey_profile}, illustrative</Chip>
        )}
        {!facility.verified && <Chip tone="low">Location not yet checked</Chip>}
        {facility.location_precision !== "exact" && <Chip tone="low">Approximate location</Chip>}
        {facility.level_unconfirmed && <Chip tone="low">Level unconfirmed</Chip>}
      </div>

      {!run || !counts ? (
        <p className="mt-4 text-[15px] text-muted">Loading this facility&rsquo;s shelf&hellip;</p>
      ) : (
        <>
          <div className="mt-4">
            <ShelfBar inStock={counts.inStock} underAWeek={counts.underAWeek} out={counts.out} />
            <p className="tabular mt-2 text-[15px] text-ink-2">
              {counts.carried} medicines carried. {counts.inStock} in stock,{" "}
              {counts.underAWeek} under a week, {counts.out} out.
            </p>
          </div>

          <h3 className="mt-5 text-[15px] font-bold text-ink">Needs attention</h3>
          {attention.length === 0 ? (
            <p className="mt-1 text-[15px] text-muted">
              Every medicine has a week of stock or more.
            </p>
          ) : (
            <ul className="mt-1">
              {attention.slice(0, ATTENTION_SHOWN).map(({ row, state }) => {
                const left = daysLeft(row.on_hand, row.forecast) ?? 0;
                const action = zealoAction({
                  row,
                  state,
                  nearExpiry: false,
                  events: run.events,
                  facilityId: run.facility_id,
                  day: run.day,
                  labels,
                });
                return (
                  <li
                    key={row.medicine_id}
                    className="border-b border-line-soft py-2.5 last:border-b-0"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-bold text-ink" title={row.name}>
                        {shortMedicineName(row.name, 34)}
                      </span>
                      <span
                        className={`tabular shrink-0 text-[15px] font-bold ${
                          state === "out" ? "text-out-text" : "text-low-text"
                        }`}
                      >
                        {state === "out" ? "Out" : left === 1 ? "1 day left" : `${left} days left`}
                      </span>
                    </div>
                    {action && (
                      <p
                        className={`text-sm ${action.move ? "font-bold text-move" : "text-muted"}`}
                      >
                        {action.text}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {attention.length > ATTENTION_SHOWN && (
            <p className="mt-1 text-sm text-muted">
              And {attention.length - ATTENTION_SHOWN} more on the full inventory.
            </p>
          )}

          <p className="mt-3 flex items-center gap-1.5 text-sm text-muted">
            Stock is simulated <ProvenanceBadge provenance="estimated" />
          </p>
        </>
      )}

      <Link to={`/facility/${facility.id}`} className={`mt-4 w-full ${buttonClass("secondary")}`}>
        Open {facility.display_label}&rsquo;s full inventory
      </Link>
    </section>
  );
}
