/**
 * One facility's shelf in full: what it is, every medicine it holds on the day shown,
 * a chart of one of them, and what has happened there.
 *
 * Network membership and approve/reject decisions alter the scenario, so they produce a
 * new run rather than editing the current one.
 */
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { shortMedicineName } from "../api/format";
import { useFacilities, useFacilityRun, useMedicines } from "../api/hooks";
import { daysLeft, shelfCounts } from "../api/stock";
import type { Facility, FacilityMedicineRow, SimulationEvent } from "../api/types";
import { useRun } from "../api/useRun";
import { StockChart } from "../components/facility/StockChart";
import { shelfItems, type ShelfFilter, type ShelfItem } from "../components/facility/shelfLogic";
import { groupRoutineOrders } from "../components/map/mapLogic";
import { TYPE_LABELS } from "../components/map/icons";
import { MissingInputsNotice } from "../components/MissingInputsNotice";
import { EventFeed } from "../components/panels/EventFeed";
import { zealoAction } from "../components/panels/zealoAction";
import { ProvenanceBadge } from "../components/Provenance";
import { TimeControls } from "../components/TimeControls";
import { useViewStore } from "../state/store";
import {
  Button,
  Card,
  CardTitle,
  Checkbox,
  Chip,
  EmptyState,
  Field,
  Select,
  Stat,
  StatRow,
  Table,
  Td,
  Th,
  type ChipTone,
} from "../ui";

const ROWS_FIRST_SHOWN = 10;

// Stable empty arrays: `?? []` allocates a new one every render and defeats the memos below.
const NO_ROWS: FacilityMedicineRow[] = [];
const NO_FACILITIES: Facility[] = [];
const NO_EVENTS: SimulationEvent[] = [];

/** A government facility's level picks the state medicine list it should carry. */
const GOVERNMENT_LEVEL_COLUMN: Record<string, string> = {
  phc: "phc",
  chc: "chc",
  taluk_hospital: "taluk_hospital",
  district_hospital: "district_hospital",
  government_level_unknown: "phc",
};

function statusChip(item: ShelfItem): { tone: ChipTone; label: string } {
  if (item.kind === "survey") return { tone: "plain", label: "Availability only" };
  if (item.state === "out") return { tone: "out", label: "Out" };
  if (item.state === "low") return { tone: "low", label: "Under a week" };
  if (item.nearExpiry) return { tone: "low", label: "Near expiry" };
  return { tone: "scrub", label: "In stock" };
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-[15px] font-bold text-ink">
        {children}
      </dd>
    </div>
  );
}

export function FacilityDashboardPage() {
  const params = useParams();
  const { mode, day, selectedFacilityId, selectFacility, networkOverrides, setNetworkMembership } =
    useViewStore();
  const facilitiesQuery = useFacilities();
  const medicinesQuery = useMedicines(true);
  const { run, isLoading, error, missingInputs } = useRun();

  const facilityId = params.facilityId ?? selectedFacilityId ?? "phc-01";
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<ShelfFilter>("problems");
  const [showAll, setShowAll] = useState(false);
  const [chosenMedicineId, setChosenMedicineId] = useState<string | null>(null);

  const facilities = facilitiesQuery.data?.facilities ?? NO_FACILITIES;
  const facility = facilities.find((f) => f.id === facilityId);
  const labels = useMemo(
    () => new Map(facilities.map((f) => [f.id, f.display_label])),
    [facilities],
  );

  // The shelf comes first; the chart's series is a second request once a row is known.
  const shelf = useFacilityRun(run?.run_id ?? null, facilityId, mode, day);
  const rows = shelf.data?.medicines ?? NO_ROWS;
  const availability = shelf.data?.availability_only;
  const events = shelf.data?.events ?? NO_EVENTS;

  const items = useMemo(
    () =>
      shelfItems({
        rows,
        availability: availability ?? [],
        day,
        filter: statusFilter,
        group: groupFilter,
      }),
    [rows, availability, day, statusFilter, groupFilter],
  );
  const groups = useMemo(
    () => Array.from(new Set(rows.map((r) => r.therapeutic_group))).sort(),
    [rows],
  );

  // Chart the chosen medicine, or the first problem on the shelf until one is chosen.
  const firstModelled = items.find((i) => i.kind === "modelled")?.id ?? rows[0]?.medicine_id;
  const chartMedicineId = chosenMedicineId ?? firstModelled ?? null;
  const chart = useFacilityRun(run?.run_id ?? null, facilityId, mode, day, chartMedicineId);
  const series = chart.data?.series ?? null;

  const counts = shelfCounts(rows);
  const shown = showAll ? items : items.slice(0, ROWS_FIRST_SHOWN);
  const activity = useMemo(
    () =>
      groupRoutineOrders(events.filter((e) => e.day <= day))
        .sort((a, b) => b.day - a.day)
        .slice(0, 25),
    [events, day],
  );
  const approvals = events.filter((e) => e.type === "approval_requested");

  const level = facility ? GOVERNMENT_LEVEL_COLUMN[facility.facility_type] : undefined;
  const medicines = medicinesQuery.data?.medicines ?? [];
  const shouldCarry = level ? medicines.filter((m) => m.levels.includes(level)).length : 0;
  const inNetwork = facility ? (networkOverrides[facility.id] ?? facility.in_network) : false;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1360px] space-y-6 px-4 py-6 sm:px-6">
        {missingInputs && error && <MissingInputsNotice detail={error.detail} />}

        {/* Which facility, and what it is */}
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div>
            <div className="w-full max-w-xs">
              <Field label="Facility">
                <Select
                  value={facilityId}
                  onChange={(e) => {
                    selectFacility(e.target.value);
                    setChosenMedicineId(null);
                    setShowAll(false);
                  }}
                >
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.display_label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <h1 className="mt-4 text-[40px] font-bold leading-[1.04] tracking-[-0.025em] text-ink sm:text-[52px]">
              {facility?.display_label ?? "Facility"}
            </h1>
            {facility && (
              <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
                <Fact label="Type">
                  {TYPE_LABELS[facility.facility_type] ?? facility.facility_type}
                  <ProvenanceBadge provenance={facility.provenance.facility_type ?? "derived"} />
                </Fact>
                <Fact label="Ownership">
                  <span className="capitalize">{facility.ownership}</span>
                  <ProvenanceBadge provenance={facility.provenance.ownership ?? "derived"} />
                </Fact>
                {shelf.data?.survey_profile != null && (
                  <Fact label="Stock pattern">
                    Survey profile {shelf.data.survey_profile} (illustrative)
                    <ProvenanceBadge provenance="derived" />
                  </Fact>
                )}
                <Fact label="Location">
                  {facility.verified ? (
                    "Checked"
                  ) : (
                    <span className="text-low-text">Not yet checked</span>
                  )}
                  <ProvenanceBadge provenance={facility.provenance.lat ?? "real"} />
                </Fact>
                <Fact label="Beds">
                  {facility.beds ?? "Not recorded"}
                  <ProvenanceBadge provenance={facility.beds == null ? "unknown" : "real"} />
                </Fact>
                {level && shelf.data && (
                  <Fact label="State medicine list">
                    {/* Carried = modelled items plus availability-only survey items; counting
                        only the modelled ones made a PHC look short of half its list. */}
                    Carries {rows.length + (availability?.length ?? 0)} of the {shouldCarry} on
                    its level&rsquo;s list
                    <ProvenanceBadge provenance="real" />
                  </Fact>
                )}
              </dl>
            )}
            {facility?.level_unconfirmed && (
              <p className="mt-3 max-w-3xl text-sm text-muted">
                {facility.facility_type === "other_government"
                  ? "Probably run outside the state health department, so it is kept out of the Zealo network with no state medicine list until confirmed."
                  : "Its level (PHC, CHC or taluk hospital) is not stated in our sources. It carries the PHC medicine list, the most conservative choice, until confirmed."}
              </p>
            )}
            {facility?.ownership === "private" && (
              <p className="mt-3 max-w-3xl text-sm text-muted">
                No public inventory data exists for private facilities. This stock is modelled from
                the taluk-hospital medicine list as a documented proxy.
              </p>
            )}
          </div>

          {facility && (
            <div className="rounded-xl border border-line bg-surface p-5">
              <Checkbox
                label="In the Zealo network"
                checked={inNetwork}
                onChange={(value) => setNetworkMembership(facility.id, value, facility.in_network)}
              />
              <p className="mt-1 text-sm text-muted">
                Turning this off re-runs the simulation with {facility.display_label} managing
                stock on its own.
              </p>
            </div>
          )}
        </section>

        {isLoading && (
          <p className="rounded-xl border border-line bg-surface p-5 text-[15px] text-muted">
            Running the simulation&hellip;
          </p>
        )}

        {run && (
          <>
            <TimeControls disabled={!run} />

            <StatRow>
              <Stat label="Medicines carried" value={counts.carried.toLocaleString()} />
              <Stat
                label="A week of stock or more"
                value={counts.inStock.toLocaleString()}
                tone="scrub"
              />
              <Stat label="Under a week" value={counts.underAWeek.toLocaleString()} tone="low" />
              <Stat label="Out of stock" value={counts.out.toLocaleString()} tone="out" />
            </StatRow>

            {/* grid-cols-1 (minmax(0, 1fr)) lets the table scroll inside its card on a phone;
                an implicit column grew to the table's width and scrolled the page sideways. */}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              {/* The shelf */}
              <Card>
                <CardTitle
                  hint="Select a medicine to chart it."
                  action={
                    <div className="flex flex-wrap gap-3">
                      <div className="w-56">
                        <Field label="Group">
                          <Select
                            value={groupFilter}
                            onChange={(e) => {
                              setGroupFilter(e.target.value);
                              setShowAll(false);
                            }}
                          >
                            <option value="">All groups</option>
                            {groups.map((g) => (
                              <option key={g} value={g}>
                                {g}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                      <div className="w-44">
                        <Field label="Status">
                          <Select
                            value={statusFilter}
                            onChange={(e) => {
                              setStatusFilter(e.target.value as ShelfFilter);
                              setShowAll(false);
                            }}
                          >
                            <option value="problems">Problems first</option>
                            <option value="out">Out of stock</option>
                            <option value="low">Under a week</option>
                            <option value="near">Near expiry</option>
                            <option value="ok">In stock</option>
                            <option value="survey">Availability only</option>
                          </Select>
                        </Field>
                      </div>
                    </div>
                  }
                >
                  Shelf on day {day + 1}
                </CardTitle>

                {!shelf.data ? (
                  <p className="text-[15px] text-muted">Loading the shelf&hellip;</p>
                ) : items.length === 0 ? (
                  <EmptyState title="Nothing matches those filters" />
                ) : (
                  <>
                    <Table>
                      <thead>
                        <tr>
                          <Th>Medicine</Th>
                          <Th align="right">Units</Th>
                          <Th align="right">Days left</Th>
                          <Th align="right">Next expiry</Th>
                          <Th>Status</Th>
                          <Th>What Zealo is doing</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {shown.map((item) => {
                          const chip = statusChip(item);
                          if (item.kind === "survey") {
                            return (
                              <tr key={item.id}>
                                <Td>
                                  <span className="font-bold text-ink">{item.item.name}</span>
                                  <span className="block text-[13px] text-muted">
                                    Survey item, no quantity data
                                  </span>
                                </Td>
                                <Td align="right">&mdash;</Td>
                                <Td align="right">&mdash;</Td>
                                <Td align="right">&mdash;</Td>
                                <Td>
                                  <Chip tone={chip.tone}>{chip.label}</Chip>
                                  <span className="ml-2 text-sm text-ink-2">
                                    {item.item.in_stock ? "In stock" : "Out"}
                                  </span>
                                </Td>
                                <Td>&mdash;</Td>
                              </tr>
                            );
                          }
                          const { row } = item;
                          const left = daysLeft(row.on_hand, row.forecast);
                          const action = zealoAction({
                            row,
                            state: item.state,
                            nearExpiry: item.nearExpiry,
                            events,
                            facilityId,
                            day,
                            labels,
                          });
                          const selected = row.medicine_id === chartMedicineId;
                          return (
                            <tr
                              key={item.id}
                              className={
                                selected ? "bg-wash" : item.state === "out" ? "bg-out-row" : ""
                              }
                            >
                              <Td>
                                <button
                                  type="button"
                                  onClick={() => setChosenMedicineId(row.medicine_id)}
                                  aria-pressed={selected}
                                  title={`Chart ${row.name}`}
                                  className="min-h-11 text-left font-bold text-ink underline-offset-4 hover:underline"
                                >
                                  {shortMedicineName(row.name)}
                                </button>
                                <span className="code block text-xs text-muted">
                                  {row.medicine_id}
                                </span>
                              </Td>
                              <Td align="right">
                                {row.on_hand.toLocaleString()}
                                {row.incoming_7d > 0 && (
                                  <span className="block whitespace-nowrap text-[13px] text-muted">
                                    +{row.incoming_7d.toLocaleString()} due
                                  </span>
                                )}
                              </Td>
                              <Td align="right">{left == null ? "—" : left.toLocaleString()}</Td>
                              <Td align="right">
                                {row.next_expiry_day == null ? (
                                  "—"
                                ) : (
                                  <span
                                    className={item.nearExpiry ? "font-bold text-low-text" : ""}
                                  >
                                    Day {row.next_expiry_day + 1}
                                  </span>
                                )}
                              </Td>
                              <Td>
                                <Chip tone={chip.tone}>{chip.label}</Chip>
                              </Td>
                              <Td
                                className={
                                  action?.move ? "font-bold text-move" : "text-sm text-ink-2"
                                }
                              >
                                {action?.text ?? ""}
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                    {items.length > ROWS_FIRST_SHOWN && (
                      <Button
                        variant="ghost"
                        onClick={() => setShowAll((v) => !v)}
                        className="mt-2"
                      >
                        {showAll
                          ? "Show the first ten"
                          : `Show all ${items.length.toLocaleString()} medicines`}
                      </Button>
                    )}
                    <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted">
                      Stock is simulated <ProvenanceBadge provenance="estimated" /> The medicine
                      list is from the Karnataka annual indent <ProvenanceBadge provenance="real" />
                    </p>
                  </>
                )}
              </Card>

              {/* One medicine over time, and what happened here */}
              <div className="space-y-6">
                <Card>
                  <CardTitle hint={series ? shortMedicineName(series.name) : undefined}>
                    Stock over the run
                  </CardTitle>
                  {series ? (
                    <StockChart
                      series={series}
                      events={events}
                      facilityId={facilityId}
                      facilityLabel={facility?.display_label ?? ""}
                      labels={labels}
                      day={day}
                    />
                  ) : (
                    <p className="text-[15px] text-muted">
                      {chartMedicineId ? "Loading the chart…" : "Select a medicine to chart it."}
                    </p>
                  )}
                </Card>

                <Card>
                  <CardTitle hint="Newest first, up to the day shown.">
                    Activity at {facility?.display_label ?? "this facility"}
                  </CardTitle>
                  <div className="max-h-[420px] overflow-y-auto">
                    <EventFeed events={activity} />
                  </div>
                </Card>

                <Card>
                  <CardTitle hint="Orders above this facility's approval limit wait here.">
                    Approval queue
                  </CardTitle>
                  {approvals.length === 0 ? (
                    <p className="text-[15px] text-muted">
                      Nothing is waiting. Set an approval limit in Simulation settings to hold large
                      orders for sign-off.
                    </p>
                  ) : (
                    <ul>
                      {approvals.slice(0, 20).map((event, i) => {
                        const key = `${event.day}:${facilityId}:${event.medicine_id}`;
                        return (
                          <li
                            key={`${key}-${i}`}
                            className="border-b border-line-soft py-3 last:border-b-0"
                          >
                            <p className="text-[15px] leading-snug text-ink">{event.message}</p>
                            <div className="mt-2 flex gap-2">
                              <Button
                                variant="primary"
                                onClick={() =>
                                  useViewStore.getState().decideApproval(key, "approve")
                                }
                              >
                                Approve
                              </Button>
                              <Button
                                onClick={() =>
                                  useViewStore.getState().decideApproval(key, "reject")
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
