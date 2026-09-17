/**
 * Where stock is surplus, where it is short, and how much has moved.
 *
 * Surplus and shortage are measured in **days of cover**, not units: a hundred
 * tablets is a month's supply at one PHC and a day's at the taluk hospital, so
 * comparing raw counts across facilities would be meaningless.
 */
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { shortMedicineName } from "../api/format";
import { useMedicines, useRedistribution } from "../api/hooks";
import { useRun } from "../api/useRun";
import { Disclaimer } from "../components/Disclaimer";
import { MissingInputsNotice } from "../components/MissingInputsNotice";
import { ProvenanceBadge } from "../components/Provenance";
import { TimeControls } from "../components/TimeControls";
import { Card, CardTitle, EmptyState, Field, Select, StatTile, StatusPill, Table, Td, Th } from "../ui";
import { useViewStore } from "../state/store";

const POSITION_ORDER: Record<string, number> = { short: 0, surplus: 1, balanced: 2 };

export function NetworkRedistributionPage() {
  const { mode, day } = useViewStore();
  const { run, isLoading, error, missingInputs } = useRun();
  const medicinesQuery = useMedicines(true);
  const [medicineId, setMedicineId] = useState<string>("");

  const redistribution = useRedistribution(run?.run_id ?? null, mode, day, medicineId || null);
  const data = redistribution.data;

  const cumulative = useMemo(() => {
    if (!data) return [];
    let transfers = 0;
    let units = 0;
    let distance = 0;
    return data.transfers_over_time.map((point) => {
      transfers += point.transfers;
      units += point.units;
      distance += point.distance_km;
      return {
        day: point.day + 1,
        transfers,
        units,
        distance: Math.round(distance),
      };
    });
  }, [data]);

  const notable = useMemo(() => {
    if (!data) return [];
    return [...data.balances]
      .filter((b) => b.position !== "balanced")
      .sort(
        (a, b) =>
          POSITION_ORDER[a.position] - POSITION_ORDER[b.position] ||
          (a.days_of_cover ?? 0) - (b.days_of_cover ?? 0),
      )
      .slice(0, 60);
  }, [data]);

  const topMedicines = (data?.top_medicines ?? []).slice(0, 8).map((m) => ({
    name: m.name.length > 22 ? `${m.name.slice(0, 22)}…` : m.name,
    relief: m.relief_units,
    rebalance: m.rebalance_units,
  }));

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-[1400px] space-y-4">
        {missingInputs && error && <MissingInputsNotice detail={error.detail} />}
        <Card padded={false} className="p-3">
          <TimeControls disabled={!run} />
        </Card>

        {isLoading && (
          <Card>
            <p className="text-sm text-ink-muted">Running the simulation&hellip;</p>
          </Card>
        )}

        {mode === "without_zealo" && data && (
          <Card className="bg-lavender/60">
            <p className="text-xs leading-relaxed text-ink-muted">
              <strong className="text-ink">Without Zealo there is no network.</strong> Each
              facility manages stock alone, so nothing is redistributed however much surplus
              sits a few kilometres from a shortage. Switch to <em>With Zealo</em> to see the
              movement.
            </p>
          </Card>
        )}

        {data && (
          <>
            <Card>
              <CardTitle hint={`Totals across the whole run, on day ${day + 1}.`}>
                Network totals
              </CardTitle>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                <StatTile label="Transfers" value={(data.totals.transfers ?? 0).toLocaleString()} />
                <StatTile label="Units moved" value={(data.totals.transfer_units ?? 0).toLocaleString()} />
                <StatTile
                  label="Distance"
                  value={`${(data.totals.transfer_distance_km ?? 0).toLocaleString()} km`}
                />
                <StatTile
                  label="Short positions"
                  value={(data.totals.short_positions ?? 0).toLocaleString()}
                  tone="bad"
                />
                <StatTile
                  label="Surplus positions"
                  value={(data.totals.surplus_positions ?? 0).toLocaleString()}
                />
                <StatTile
                  label="Expired units"
                  value={(data.totals.expired_units ?? 0).toLocaleString()}
                  tone="bad"
                />
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[10px] text-ink-subtle">
                Derived from simulated stock <ProvenanceBadge provenance="derived" />
              </p>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardTitle hint="Cumulative over the run.">Transfers over time</CardTitle>
                {cumulative.every((p) => p.transfers === 0) ? (
                  <EmptyState title="No transfers in this mode" />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={cumulative} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                        <defs>
                          <linearGradient id="unitsFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6A4CA8" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#6A4CA8" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
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
                        <Area
                          type="monotone"
                          dataKey="units"
                          stroke="#6A4CA8"
                          strokeWidth={2}
                          fill="url(#unitsFill)"
                          name="Units moved"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>

              <Card>
                <CardTitle hint="Units moved to cover shortages, and to use stock before it expires.">
                  Medicines moved most
                </CardTitle>
                {topMedicines.length === 0 ? (
                  <EmptyState title="Nothing has moved yet" />
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={topMedicines}
                        layout="vertical"
                        margin={{ top: 4, right: 8, bottom: 0, left: 8 }}
                      >
                        <CartesianGrid stroke="#E6E2F0" strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: "#8C86A3" }} />
                        <YAxis
                          type="category"
                          dataKey="name"
                          width={130}
                          tick={{ fontSize: 10, fill: "#5B5474" }}
                        />
                        <ChartTooltip
                          contentStyle={{
                            fontSize: 11,
                            borderRadius: 8,
                            border: "none",
                            boxShadow: "0 4px 16px rgba(35,28,68,.15)",
                          }}
                        />
                        <Bar dataKey="relief" stackId="a" fill="#F0674A" name="Shortage relief" />
                        <Bar
                          dataKey="rebalance"
                          stackId="a"
                          fill="#1F9D55"
                          name="Near-expiry rebalancing"
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Card>
            </div>

            {data.unmapped_phcs.length > 0 && (
              <Card>
                <CardTitle
                  hint="Survey PHCs with no public location in our sources. Their availability profiles still count in taluk-wide statistics."
                >
                  Unmapped PHCs ({data.unmapped_phcs.length})
                </CardTitle>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {data.unmapped_phcs.map((phc) => (
                    <div key={phc.phc_number} className="rounded-lg bg-surface-sunken px-3 py-2">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
                        Survey profile {phc.phc_number}
                      </p>
                      <p className="tabular text-sm font-bold text-ink">
                        {phc.availability_pct.toFixed(1)}%
                      </p>
                      <p className="flex items-center gap-1 text-[10px] text-ink-subtle">
                        {phc.items_in_stock} of 104 items
                        <ProvenanceBadge provenance={phc.provenance} />
                      </p>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card>
              <CardTitle
                hint="Days of cover, not units: the same count is a month at one facility and a day at another."
                action={
                  <div className="w-64">
                    <Field label="Medicine">
                      <Select
                        value={medicineId}
                        aria-label="Filter by medicine"
                        onChange={(e) => setMedicineId(e.target.value)}
                      >
                        <option value="">All medicines</option>
                        {(medicinesQuery.data?.medicines ?? []).map((m) => (
                          <option key={m.id} value={m.id}>
                            {shortMedicineName(m.name)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                }
              >
                Surplus and shortage
              </CardTitle>
              {notable.length === 0 ? (
                <EmptyState title="Every facility is within a normal range">
                  Nothing is below a week of cover or above a month of it on this day.
                </EmptyState>
              ) : (
                <div className="max-h-[360px] overflow-y-auto">
                  <Table>
                    <thead>
                      <tr>
                        <Th>Facility</Th>
                        <Th>Medicine</Th>
                        <Th align="right">Stock</Th>
                        <Th align="right">Days cover</Th>
                        <Th align="right">Position</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {notable.map((b) => (
                        <tr key={`${b.facility_id}-${b.medicine_id}`}>
                          <Td>{b.display_label}</Td>
                          <Td className="text-ink-muted">{b.medicine_id}</Td>
                          <Td align="right">{b.on_hand}</Td>
                          <Td align="right">{b.days_of_cover?.toFixed(1) ?? "—"}</Td>
                          <Td align="right">
                            <StatusPill status={b.position} />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
              <ul className="mt-3 space-y-0.5 text-[10px] text-ink-subtle">
                {data.caveats.map((caveat) => (
                  <li key={caveat}>&middot; {caveat}</li>
                ))}
              </ul>
            </Card>
          </>
        )}

        <Disclaimer />
      </div>
    </div>
  );
}
