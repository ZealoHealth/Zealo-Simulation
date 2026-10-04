/**
 * Whole-run totals, shown inline at the right of the disclaimer strip on the Map page.
 * They cover all of the run's days; the map itself shows one day at a time.
 */
import { useRun } from "../../api/useRun";
import { useViewStore } from "../../state/store";

function count(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString() : "—";
}

export function RunTotals() {
  const { run } = useRun();
  const mode = useViewStore((s) => s.mode);
  const summary = run?.summaries.find((s) => s.mode === mode);
  if (!run || !summary) return null;
  const m = summary.metrics;
  const availability =
    typeof m.availability_rate === "number" ? `${(m.availability_rate * 100).toFixed(1)}%` : "—";

  const items: Array<[string, string]> = [
    [`Whole ${run.days}-day run`, `${availability} in stock`],
    ["Transfers", count(m.transfers)],
    ["Units moved", count(m.transfer_units)],
    ["Expired", count(m.expired_units)],
  ];

  return (
    <dl className="flex flex-wrap gap-x-5 gap-y-0.5 text-sm text-ink-2" data-testid="network-totals">
      {items.map(([label, value]) => (
        <div key={label} className="flex gap-1.5">
          <dt>{label}:</dt>
          <dd className="tabular font-bold text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
