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
  { key: "closing_stock_units", label: "Stock on hand at end (units)", lowerIsBetter: false, format: (v) => v.toLocaleString() },
];

export function ComparisonPage() {
  const { run, isLoading, error, missingInputs } = useRun();

  const baseline = run?.summaries.find((s) => s.mode === "without_zealo")?.metrics;
  const zealo = run?.summaries.find((s) => s.mode === "with_zealo")?.metrics;

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
            <p className="text-sm text-ink-muted">Running both modes&hellip;</p>
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
                    <tr className="text-[10px] uppercase tracking-wide text-ink-subtle">
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
                      const better = change == null ? null : metric.lowerIsBetter ? change < 0 : change > 0;
                      return (
                        <tr key={metric.key}>
                          <td className="border-t border-hairline py-2 text-ink">{metric.label}</td>
                          <td className="tabular border-t border-hairline py-2 text-right text-ink-muted">
                            {metric.format(a)}
                          </td>
                          <td className="tabular border-t border-hairline py-2 text-right font-semibold text-ink">
                            {metric.format(b)}
                          </td>
                          <td
                            className={`tabular border-t border-hairline py-2 text-right text-xs font-semibold ${
                              better == null || change === 0
                                ? "text-ink-subtle"
                                : better
                                  ? "text-status-green"
                                  : "text-status-red"
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
              <p className="mt-3 flex items-center gap-1.5 text-[10px] text-ink-subtle">
                Simulated from estimated stock and demand <ProvenanceBadge provenance="estimated" />
                &middot; all figures in units
              </p>
            </Card>

            <Card>
              <CardTitle hint="Running share of facility-medicine-days with stock on hand.">
                Availability over the run
              </CardTitle>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                    <CartesianGrid stroke="#E6E2F0" strokeDasharray="3 3" />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#8C86A3" }} />
                    <YAxis domain={["auto", 100]} tick={{ fontSize: 10, fill: "#8C86A3" }} unit="%" />
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
