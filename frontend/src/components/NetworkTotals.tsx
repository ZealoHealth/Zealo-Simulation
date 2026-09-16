/**
 * Headline totals for the current mode.
 *
 * Value figures are omitted rather than shown as zero: no public unit price
 * source is confirmed, and a "0" would read as a real measurement.
 */
import type { ModeSummary } from "../api/types";
import { ProvenanceBadge } from "./Provenance";

function percent(value: unknown): string {
  return typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "—";
}

function count(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString() : "—";
}

export function NetworkTotals({ summary }: { summary: ModeSummary | undefined }) {
  if (!summary) return null;
  const m = summary.metrics;
  const pricesKnown = m.prices_available === true;

  const tiles: Array<{ label: string; value: string; hint?: string }> = [
    { label: "Availability", value: percent(m.availability_rate) },
    { label: "Stockout item-days", value: count(m.stockout_item_days) },
    { label: "Unmet units", value: count(m.unmet_units) },
    { label: "Transfers", value: count(m.transfers) },
    { label: "Units moved", value: count(m.transfer_units) },
    { label: "Expired units", value: count(m.expired_units) },
  ];

  return (
    <div>
      <dl className="grid grid-cols-3 gap-2" data-testid="network-totals">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-lg bg-lavender px-2 py-1.5">
            <dt className="text-[10px] uppercase tracking-wide text-navy/50">{tile.label}</dt>
            <dd className="text-sm font-bold tabular-nums text-navy">{tile.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-navy/50">
        Derived from simulated stock <ProvenanceBadge provenance="derived" />
      </p>
      {!pricesKnown && (
        <p className="mt-1 text-[10px] text-navy/50">
          Value figures are not shown: no public unit price source is confirmed, so units are
          reported instead of rupees.
        </p>
      )}
    </div>
  );
}
