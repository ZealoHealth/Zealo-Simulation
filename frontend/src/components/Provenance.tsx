/**
 * Provenance badges.
 *
 * Every number on the site sits next to one of these. They are not decoration:
 * a facility's coordinates are real, its type is inferred, and its stock level
 * is modelled, and a reader has to be able to tell those apart at a glance.
 */
import type { Provenance } from "../api/types";

const STYLES: Record<Provenance, { label: string; className: string; title: string }> = {
  real: {
    label: "Real",
    className: "bg-status-green/15 text-status-green border-status-green/30",
    title: "Taken directly from a published source, unmodified.",
  },
  derived: {
    label: "Derived",
    className: "bg-purple/15 text-purple border-purple/30",
    title: "Calculated from real data using a formula documented in METHODS.md.",
  },
  estimated: {
    label: "Estimated",
    className: "bg-coral/15 text-coral border-coral/40",
    title: "Modelled. Not observed in any source.",
  },
  unknown: {
    label: "Unknown",
    className: "bg-navy/10 text-navy/60 border-navy/20",
    title: "No source records this value, so it is not shown as a number.",
  },
};

export function ProvenanceBadge({
  provenance,
  className = "",
}: {
  provenance: Provenance;
  className?: string;
}) {
  const style = STYLES[provenance] ?? STYLES.unknown;
  return (
    <span
      title={style.title}
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.className} ${className}`}
    >
      {style.label}
    </span>
  );
}

/** A labelled value with its provenance badge, for the facility panel. */
export function ProvenanceRow({
  label,
  value,
  provenance,
}: {
  label: string;
  value: React.ReactNode;
  provenance: Provenance;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="text-xs text-navy/60">{label}</span>
      <span className="flex items-center gap-2 text-sm font-medium">
        {value}
        <ProvenanceBadge provenance={provenance} />
      </span>
    </div>
  );
}
