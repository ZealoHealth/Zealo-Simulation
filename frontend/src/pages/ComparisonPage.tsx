/**
 * Without Zealo vs with Zealo, side by side.
 *
 * Both columns come from one run: identical demand, identical opening stock. Figures are
 * in units only, by decision -- no verified price list could be accessed.
 */
import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRun } from "../api/useRun";
import { Disclaimer } from "../components/Disclaimer";
import { MissingInputsNotice } from "../components/MissingInputsNotice";
import { ProvenanceBadge } from "../components/Provenance";
import { percentChange } from "../state/scenario";
import { Card, CardTitle } from "../ui";

interface MetricDef {
  key: string;
  label: string;
  /** True when a lower number is the better outcome. */
  lowerIsBetter: boolean;
  /** Neither direction is better (e.g. stock held), so the change is not coloured. */
  neutral?: boolean;
  format: (value: number) => string;
}

const METRICS: MetricDef[] = [
  { key: "availability_rate", label: "Availability", lowerIsBetter: false, format: (v) => `${(v * 100).toFixed(1)}%` },
  { key: "stockout_item_days", label: "Stockout item-days", lowerIsBetter: true, format: (v) => v.toLocaleString() },
  { key: "unmet_units", label: "Unmet demand (units)", lowerIsBetter: true, format: (v) => v.toLocaleString() },
  { key: "expired_units", label: "Expired (units)", lowerIsBetter: true, format: (v) => v.toLocaleString() },
  { key: "manufacturer_orders", label: "Manufacturer orders", lowerIsBetter: true, format: (v) => v.toLocaleString() },
  { key: "express_orders", label: "Express orders", lowerIsBetter: true, format: (v) => v.toLocaleString() },
  { key: "transfers", label: "Transfers between facilities", lowerIsBetter: false, format: (v) => v.toLocaleString() },
  { key: "transfer_units", label: "Units moved", lowerIsBetter: false, format: (v) => v.toLocaleString() },
  // More stock is not better in itself -- it is also capital tied up -- so it is not scored.
  { key: "closing_stock_units", label: "Stock on hand at end (units)", lowerIsBetter: false, neutral: true, format: (v) => v.toLocaleString() },
];

export function ComparisonPage() {
  const { run, isLoading, error, missingInputs } = useRun();

  const baseline = run?.summaries.find((s) => s.mode === "without_zealo")?.metrics;
  const zealo = run?.summaries.find((s) => s.mode === "with_zealo")?.metrics;

  // Share of facility-days in each map colour, from the same statuses the map shows.
  const colourShares = useMemo(() => {
    if (!run) return null;
    const shares = (mode: "without_zealo" | "with_zealo") => {
      const counts = { green: 0, amber: 0, red: 0 };
      let total = 0;
      for (const day of run.timeline[mode]) {
        for (const status of Object.values(day.status)) {
          counts[status] += 1;
          total += 1;
        }
      }
      return {
        green: total ? counts.green / total : 0,
        amber: total ? counts.amber / total : 0,
        red: total ? counts.red / total : 0,
      };
    };
    return { without: shares("without_zealo"), with: shares("with_zealo") };
  }, [run]);

  const chart = useMemo(() => {
    if (!run) return [];
    const a = run.timeline.without_zealo;
    const b = run.timeline.with_zealo;
    return a.map((point, i) => ({
      day: point.day + 1,
      without: Number((point.availability_rate * 100).toFixed(2)),
      with: Number(((b[i]?.availability_rate ?? 0) * 100).toFixed(2)),
    }));
  }, [run]);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-[1100px] space-y-4">
        {missingInputs && error && <MissingInputsNotice detail={error.detail} />}
        {isLoading && (
          <Card>
            <p className="text-sm text-ink-2">Running both modes&hellip;</p>
          </Card>
        )}

        {baseline && zealo && run && (
          <>
            <Card>
              <CardTitle
                hint={`${run.days} days, same facilities, same demand and the same opening stock in both columns.`}
              >
                With and without Zealo
              </CardTitle>
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="text-[13px] text-muted">
                      <th className="pb-2 text-left font-semibold">Measure</th>
                      <th className="pb-2 text-right font-semibold">Without Zealo</th>
                      <th className="pb-2 text-right font-semibold">With Zealo</th>
                      <th className="pb-2 text-right font-semibold">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map((metric) => {
                      const a = Number(baseline[metric.key] ?? 0);
                      const b = Number(zealo[metric.key] ?? 0);
                      const change = percentChange(a, b);
                      const better =
                        change == null || metric.neutral ? null : metric.lowerIsBetter ? change < 0 : change > 0;
                      return (
                        <tr key={metric.key}>
                          <td className="border-t border-line-soft py-2 text-ink">{metric.label}</td>
                          <td className="tabular border-t border-line-soft py-2 text-right text-ink-2">
                            {metric.format(a)}
                          </td>
                          <td className="tabular border-t border-line-soft py-2 text-right font-semibold text-ink">
                            {metric.format(b)}
                          </td>
                          <td
                            className={`tabular border-t border-line-soft py-2 text-right text-xs font-semibold ${
                              better == null || change === 0
                                ? "text-muted"
                                : better
                                  ? "text-scrub"
                                  : "text-out-text"
                            }`}
                          >
                            {change == null ? "new" : `${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 flex items-center gap-1.5 text-[13px] text-muted">
                Simulated from estimated stock and demand <ProvenanceBadge provenance="estimated" />
                All figures are in units.
              </p>
            </Card>

            {colourShares && (
              <Card>
                <CardTitle hint="Share of all facility-days in each map colour over the run. Green: 95%+ of medicines in stock; red: under the WHO/HAI 80% benchmark.">
                  How often facilities are healthy
                </CardTitle>
                <div className="space-y-3">
                  {([
                    ["Without Zealo", colourShares.without],
                    ["With Zealo", colourShares.with],
                  ] as const).map(([label, s]) => (
                    <div key={label}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="font-medium text-ink">{label}</span>
                        <span className="tabular text-ink-2">
                          {(s.green * 100).toFixed(0)}% green, {(s.amber * 100).toFixed(0)}% amber,{" "}
                          {(s.red * 100).toFixed(0)}% red
                        </span>
                      </div>
                      <div className="flex h-3 overflow-hidden rounded-full bg-paper" aria-hidden="true">
                        <span className="bg-scrub" style={{ width: `${s.green * 100}%` }} />
                        <span className="bg-low" style={{ width: `${s.amber * 100}%` }} />
                        <span className="bg-out" style={{ width: `${s.red * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card>
              <CardTitle hint="Running share of facility-medicine-days with stock on hand.">
                Availability over the run
              </CardTitle>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                    <CartesianGrid stroke="#E6E2F0" strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#8C86A3" }} />
                    <YAxis
                      domain={[(min: number) => Math.max(0, Math.floor(min / 5) * 5), 100]}
                      allowDataOverflow
                      tick={{ fontSize: 10, fill: "#8C86A3" }}
                      unit="%"
                    />
                    <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: "none", boxShadow: "0 4px 16px rgba(35,28,68,.15)" }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="without" name="Without Zealo" stroke="#8C86A3" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="with" name="With Zealo" stroke="#6A4CA8" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </>
        )}

        <Disclaimer />
      </div>
    </div>
  );
}
