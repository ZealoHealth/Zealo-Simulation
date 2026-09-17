/**
 * One facility's inventory in full: every medicine, a chart of one of them over
 * time, expiry alerts, the approval queue and its Zealo network membership.
 *
 * Rule changes and approve/reject decisions alter the scenario, so they produce
 * a new run rather than editing the current one -- the comparison between modes
 * only means anything if both sides come from the same settings.
 */
import { useMemo, useState } from "react";
import { useParams } from "react-router";
import {
  CartesianGrid,
  Legend as ChartLegend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFacilities, useFacilityRun } from "../api/hooks";
import { useRun } from "../api/useRun";
import type { FacilityMedicineRow, SimulationEvent } from "../api/types";
import { Disclaimer } from "../components/Disclaimer";
import { MissingInputsNotice } from "../components/MissingInputsNotice";
import { ProvenanceBadge } from "../components/Provenance";
import { TimeControls } from "../components/TimeControls";
import { TYPE_LABELS } from "../components/map/icons";
import {
  Button,
  Card,
  CardTitle,
  Checkbox,
  EmptyState,
  Field,
  Select,
  StatTile,
  StatusPill,
  Table,
  Td,
  Th,
} from "../ui";
import { useViewStore } from "../state/store";

type SortKey = "name" | "on_hand" | "days_of_cover" | "status";

const STATUS_ORDER: Record<string, number> = { red: 0, amber: 1, green: 2 };

// Stable empty arrays: `?? []` allocates a new one every render and defeats the memos below.
const NO_ROWS: FacilityMedicineRow[] = [];
const NO_EVENTS: SimulationEvent[] = [];

export function FacilityDashboardPage() {
  const params = useParams();
  const { mode, day, selectedFacilityId, selectFacility, networkOverrides, setNetworkMembership } =
    useViewStore();
  const facilitiesQuery = useFacilities();
  const { run, isLoading, error, missingInputs } = useRun();

  const facilityId = params.facilityId ?? selectedFacilityId ?? "phc-01";
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const [groupFilter, setGroupFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [chartMedicineId, setChartMedicineId] = useState<string | null>(null);

  const detail = useFacilityRun(run?.run_id ?? null, facilityId, mode, day, chartMedicineId);
  const facilities = facilitiesQuery.data?.facilities ?? [];
  const facility = facilities.find((f) => f.id === facilityId);

  const rows = detail.data?.medicines ?? NO_ROWS;
  const groups = useMemo(
    () => Array.from(new Set(rows.map((r) => r.therapeutic_group))).sort(),
    [rows],
  );

  const visible = useMemo(() => {
    const filtered = rows.filter(
      (r) =>
        (!groupFilter || r.therapeutic_group === groupFilter) &&
        (!statusFilter || r.status === statusFilter),
    );
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sortKey) {
        case "on_hand":
          return b.on_hand - a.on_hand;
        case "days_of_cover":
          return (a.days_of_cover ?? Infinity) - (b.days_of_cover ?? Infinity);
        case "status":
          return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name);
        default:
          return a.name.localeCompare(b.name);
      }
    });
    return sorted;
  }, [rows, groupFilter, statusFilter, sortKey]);

  const chartData = useMemo(() => {
    const series = detail.data?.series;
    if (!series) return [];
    return series.days.map((d, i) => ({
      day: d + 1,
      stock: series.on_hand[i],
      demand: series.demand[i],
      forecast: series.forecast[i],
    }));
  }, [detail.data?.series]);

  const facilityEvents = detail.data?.events ?? NO_EVENTS;
  const approvals = facilityEvents.filter((e) => e.type === "approval_requested");
  const refills = facilityEvents.filter(
    (e) => e.type === "manufacturer_order" || e.type === "express_order",
  );
  const transfers = facilityEvents.filter(
    (e) => e.type === "relief_transfer" || e.type === "rebalance_transfer",
  );
  const alerts = detail.data?.expiry_alerts ?? [];

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-[1400px] space-y-4">
        {missingInputs && error && <MissingInputsNotice detail={error.detail} />}
        {/* Facility picker and identity */}
        <Card>
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-56">
              <Field label="Facility">
                <Select
                  value={facilityId}
                  aria-label="Select a facility"
                  onChange={(e) => {
                    selectFacility(e.target.value);
                    setChartMedicineId(null);
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
            {facility && (
              <>
                {detail.data?.survey_profile != null && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-ink-subtle">Stock pattern</p>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      Survey profile {detail.data.survey_profile}
                      <span className="text-[10px] font-normal text-ink-subtle">(illustrative)</span>
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-ink-subtle">Type</p>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {TYPE_LABELS[facility.facility_type] ?? facility.facility_type}
                    <ProvenanceBadge provenance={facility.provenance.facility_type ?? "derived"} />
                  </p>
                  {(facility.level_unconfirmed || !facility.verified) && (
                    <p className="text-[10px] text-status-amber">
                      {facility.level_unconfirmed ? "Level unconfirmed" : "Location unverified"}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-ink-subtle">Ownership</p>
                  <p className="flex items-center gap-2 text-sm font-medium capitalize">
                    {facility.ownership}
                    <ProvenanceBadge provenance={facility.provenance.ownership ?? "derived"} />
                  </p>
                </div>
                <div className="ml-auto">
                  <Checkbox
                    label="In the Zealo network"
                    checked={networkOverrides[facility.id] ?? facility.in_network}
                    onChange={(value) =>
                      setNetworkMembership(facility.id, value, facility.in_network)
                    }
                  />
                  <p className="px-1.5 text-[10px] text-ink-subtle">
                    Changing this re-runs the scenario.
                  </p>
                </div>
              </>
            )}
          </div>
        </Card>

        {isLoading && (
          <Card>
            <p className="text-sm text-ink-muted">Running the simulation&hellip;</p>
          </Card>
        )}

        {run && (
          <>
            <Card padded={false} className="p-3">
              <TimeControls disabled={!run} />
            </Card>

            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              {/* Medicine table */}
              <Card>
                <CardTitle
                  hint={`${visible.length} of ${rows.length} medicines on day ${day + 1}`}
                >
                  Inventory
                </CardTitle>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Select
                    value={groupFilter}
                    aria-label="Filter by therapeutic group"
                    onChange={(e) => setGroupFilter(e.target.value)}
                    className="max-w-56"
                  >
                    <option value="">All therapeutic groups</option>
                    {groups.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={statusFilter}
                    aria-label="Filter by status"
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="max-w-40"
                  >
                    <option value="">Any status</option>
                    <option value="red">Out of stock</option>
                    <option value="amber">Low or near expiry</option>
                    <option value="green">Healthy</option>
                  </Select>
                </div>

                {visible.length === 0 ? (
                  <EmptyState title="Nothing matches those filters" />
                ) : (
                  <div className="max-h-[420px] overflow-y-auto">
                    <Table>
                      <thead>
                        <tr>
                          <Th onClick={() => setSortKey("name")} active={sortKey === "name"}>
                            Medicine
                          </Th>
                          <Th
                            align="right"
                            onClick={() => setSortKey("on_hand")}
                            active={sortKey === "on_hand"}
                          >
                            Stock
                          </Th>
                          <Th
                            align="right"
                            onClick={() => setSortKey("days_of_cover")}
                            active={sortKey === "days_of_cover"}
                          >
                            Days cover
                          </Th>
                          <Th align="right">Next expiry</Th>
                          <Th
                            align="right"
                            onClick={() => setSortKey("status")}
                            active={sortKey === "status"}
                          >
                            Status
                          </Th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((row: FacilityMedicineRow) => (
                          <tr
                            key={row.medicine_id}
                            onClick={() => setChartMedicineId(row.medicine_id)}
                            className={`cursor-pointer transition hover:bg-surface-sunken ${
                              chartMedicineId === row.medicine_id ? "bg-lavender/60" : ""
                            }`}
                          >
                            <Td>{row.name}</Td>
                            <Td align="right">{row.on_hand}</Td>
                            <Td align="right">{row.days_of_cover?.toFixed(1) ?? "—"}</Td>
                            <Td align="right">
                              {row.next_expiry_day != null
                                ? `day ${row.next_expiry_day}`
                                : "—"}
                            </Td>
                            <Td align="right">
                              <StatusPill status={row.status} />
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                )}
                <p className="mt-2 flex items-center gap-1.5 text-[10px] text-ink-subtle">
                  Stock is modelled <ProvenanceBadge provenance="estimated" /> &middot; the
                  medicine list is from the Karnataka annual indent{" "}
                  <ProvenanceBadge provenance="real" />
                </p>
                {(detail.data?.availability_only.length ?? 0) > 0 && (
                  <details className="mt-3 rounded-lg bg-surface-sunken px-3 py-2">
                    <summary className="cursor-pointer text-xs font-semibold text-ink">
                      Availability only ({detail.data!.availability_only.length} survey items)
                    </summary>
                    <p className="mt-1 text-[11px] text-ink-subtle">
                      Not yet matched to the state indent, so in or out of stock with no quantities.
                    </p>
                    <ul className="mt-1.5 grid max-h-48 grid-cols-1 gap-x-4 gap-y-0.5 overflow-y-auto text-[11px] sm:grid-cols-2">
                      {detail.data!.availability_only.map((item) => (
                        <li key={item.medicine_id} className="flex justify-between gap-2">
                          <span className="truncate">{item.name}</span>
                          <span className={item.in_stock ? "text-status-green" : "text-status-red"}>
                            {item.in_stock ? "in stock" : "out"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Card>

              {/* Chart */}
              <Card>
                <CardTitle hint="Click a medicine in the table to plot it.">
                  Stock, demand and forecast
                </CardTitle>
                {chartData.length === 0 ? (
                  <EmptyState title="No medicine selected">
                    Pick a row from the inventory table to see how its stock, demand and
                    forecast move over the run.
                  </EmptyState>
                ) : (
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                        <CartesianGrid stroke="#E6E2F0" strokeDasharray="3 3" />
                        <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#8C86A3" }} />
                        <YAxis tick={{ fontSize: 10, fill: "#8C86A3" }} />
                        <ChartTooltip
                          contentStyle={{
                            fontSize: 11,
                            borderRadius: 8,
                            border: "none",
                            boxShadow: "0 4px 16px rgba(35,28,68,.15)",
                          }}
                        />
                        <ChartLegend wrapperStyle={{ fontSize: 11 }} />
                        <Line
                          type="monotone"
                          dataKey="stock"
                          stroke="#6A4CA8"
                          strokeWidth={2}
                          dot={false}
                          name="Stock on hand"
                        />
                        <Line
                          type="monotone"
                          dataKey="demand"
                          stroke="#F0674A"
                          strokeWidth={1.5}
                          dot={false}
                          name="Demand"
                        />
                        <Line
                          type="monotone"
                          dataKey="forecast"
                          stroke="#1F9D55"
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                          dot={false}
                          name="Forecast"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              {/* Expiry alerts */}
              <Card>
                <CardTitle hint="Batches expiring within 30, 60 and 90 days.">
                  Expiry alerts
                </CardTitle>
                {alerts.length === 0 ? (
                  <EmptyState title="Nothing expiring soon" />
                ) : (
                  <ul className="max-h-56 space-y-1 overflow-y-auto">
                    {alerts.map((alert) => (
                      <li
                        key={alert.medicine_id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-surface-sunken px-2 py-1.5 text-xs"
                      >
                        <span className="truncate">{alert.name}</span>
                        <span className="shrink-0 tabular text-ink-muted">
                          {alert.on_hand} units &middot; {alert.days_until_expiry} d
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {/* Approvals */}
              <Card>
                <CardTitle hint="Orders above this facility's auto-approval limit.">
                  Approval queue
                </CardTitle>
                {approvals.length === 0 ? (
                  <EmptyState title="No approvals needed">
                    Set an auto-approval limit in Settings to see orders held for a decision.
                  </EmptyState>
                ) : (
                  <ul className="max-h-56 space-y-1.5 overflow-y-auto">
                    {approvals.slice(0, 20).map((event, i) => {
                      const key = `${event.day}:${facilityId}:${event.medicine_id}`;
                      return (
                        <li key={`${key}-${i}`} className="rounded-lg bg-surface-sunken p-2 text-xs">
                          <p className="mb-1.5 leading-snug">{event.message}</p>
                          <div className="flex gap-1.5">
                            <Button
                              variant="primary"
                              onClick={() => useViewStore.getState().decideApproval(key, "approve")}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => useViewStore.getState().decideApproval(key, "reject")}
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

              {/* Movement log */}
              <Card>
                <CardTitle hint="Refills from manufacturers and transfers with the network.">
                  Movement log
                </CardTitle>
                <div className="grid grid-cols-2 gap-2">
                  <StatTile label="Refills" value={refills.length} />
                  <StatTile label="Transfers" value={transfers.length} />
                </div>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[11px]">
                  {[...refills, ...transfers]
                    .sort((a, b) => b.day - a.day)
                    .slice(0, 25)
                    .map((event, i) => (
                      <li key={`${event.day}-${event.medicine_id}-${i}`} className="leading-snug">
                        <span className="mr-1 font-semibold text-ink-subtle">
                          Day {event.day + 1}
                        </span>
                        {event.message}
                      </li>
                    ))}
                </ul>
              </Card>
            </div>
          </>
        )}

        <Disclaimer />
      </div>
    </div>
  );
}
