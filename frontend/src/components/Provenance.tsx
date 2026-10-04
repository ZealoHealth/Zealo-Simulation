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
    className: "border-scrub bg-scrub text-white",
    title: "Taken directly from a published source, unmodified.",
  },
  derived: {
    label: "Derived",
    className: "border-move text-move",
    title: "Calculated from real data using a formula documented in METHODS.md.",
  },
  estimated: {
    label: "Estimated",
    className: "border-dashed border-muted text-ink-2",
    title: "Modelled. Not observed in any source.",
  },
  unknown: {
    label: "Unknown",
    className: "border-dotted border-line text-muted",
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
      className={`inline-flex items-center whitespace-nowrap rounded border-[1.5px] px-1.5 py-px text-[13px] font-bold leading-snug ${style.className} ${className}`}
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
    <div className="flex items-baseline justify-between gap-3 border-b border-line-soft py-2">
      <span className="text-sm text-muted">{label}</span>
      <span className="flex items-center gap-2 text-[15px] font-bold text-ink">
        {value}
        <ProvenanceBadge provenance={provenance} />
      </span>
    </div>
  );
}
