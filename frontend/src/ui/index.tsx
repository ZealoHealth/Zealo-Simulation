/**
 * Shared UI primitives: the "dispensary register" design.
 *
 * Everything visual goes through these so pages stay consistent and a change of
 * look is one edit rather than a sweep. Panels are white with a 1 px rule and no
 * shadow; only floating things (map overlays) cast one. Labels are sentence case,
 * and a big number sits above its plain-language label.
 */
import type { ReactNode } from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./buttonStyles";

/* ------------------------------------------------------------------ Logo */

/** A blister pack with one empty slot. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 30 30" aria-hidden="true" className="shrink-0">
      <rect x="2" y="3" width="7" height="11" rx="3.5" className="fill-scrub" />
      <rect x="11.5" y="3" width="7" height="11" rx="3.5" className="fill-scrub" />
      <rect x="21" y="3" width="7" height="11" rx="3.5" className="fill-scrub" />
      <rect x="2" y="16" width="7" height="11" rx="3.5" className="fill-scrub" />
      <rect x="11.5" y="16" width="7" height="11" rx="3.5" className="fill-scrub" />
      <rect
        x="21.75"
        y="16.75"
        width="5.5"
        height="9.5"
        rx="2.75"
        fill="none"
        strokeWidth="1.5"
        className="stroke-scrub"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ Card */

export function Card({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface ${padded ? "p-5" : ""} ${className}`}
    >
      {children}
    </section>
  );
}

export function CardTitle({
  children,
  hint,
  action,
}: {
  children: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold leading-snug text-ink">{children}</h2>
        {hint && <p className="mt-0.5 text-sm leading-snug text-muted">{hint}</p>}
      </div>
      {action}
    </header>
  );
}

/* ---------------------------------------------------------------- Button */

export function Button({
  children,
  variant = "quiet",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type="button"
      className={`${buttonClass(variant, size)} disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- Field */

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-ink-2">{label}</span>
      {children}
    </label>
  );
}

const CONTROL =
  "min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-[15px] text-ink " +
  "transition-colors focus:border-scrub";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: ReactNode;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-[18px] w-[18px] shrink-0 accent-scrub"
      />
      {label}
    </label>
  );
}

/* ------------------------------------------------------------- Stat row */

type StatTone = "default" | "out" | "low" | "scrub";

const STAT_TONE: Record<StatTone, string> = {
  default: "text-ink",
  out: "text-out-text",
  low: "text-low-text",
  scrub: "text-scrub",
};

/**
 * One panel holding several figures, divided by rules rather than boxed. Put
 * `Stat`s inside. Colour a number only when it is a status.
 */
export function StatRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] overflow-hidden rounded-xl border border-line bg-surface ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * A figure: the number above, the label below. The DOM order stays label then value
 * (column-reverse), so a screen reader reads "Transfers, 274".
 */
export function Stat({
  label,
  value,
  sub,
  tone = "default",
  size = "md",
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: StatTone;
  size?: "md" | "lg";
}) {
  return (
    <dl className="-ml-px -mt-px flex flex-col-reverse justify-end border-l border-t border-line-soft px-5 py-4">
      {sub && <dd className="text-sm text-muted">{sub}</dd>}
      <dt className="text-[15px] leading-snug text-ink-2">{label}</dt>
      <dd
        className={`tabular mb-1 font-bold leading-none tracking-[-0.02em] ${
          size === "lg" ? "text-[56px]" : "text-[40px]"
        } ${STAT_TONE[tone]}`}
      >
        {value}
      </dd>
    </dl>
  );
}

/** A single figure on its own, for layouts that place figures in their own grid. */
export function StatTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "good" | "bad";
}) {
  const toneClass =
    tone === "good" ? "text-scrub" : tone === "bad" ? "text-out-text" : "text-ink";
  return (
    <dl className="flex flex-col-reverse justify-end rounded-lg border border-line-soft bg-surface px-4 py-3">
      {sub && <dd className="text-sm text-muted">{sub}</dd>}
      <dt className="text-sm leading-snug text-ink-2">{label}</dt>
      <dd className={`tabular text-[26px] font-bold leading-tight tracking-[-0.02em] ${toneClass}`}>
        {value}
      </dd>
    </dl>
  );
}

/* ----------------------------------------------------------------- Chips */

export type ChipTone = "scrub" | "low" | "out" | "plain" | "wash" | "move";

const CHIP_TONE: Record<ChipTone, string> = {
  scrub: "bg-scrub-tint text-scrub",
  low: "bg-low-tint text-low-text",
  out: "bg-out-tint text-out-text",
  plain: "border border-line bg-surface text-ink-2",
  wash: "bg-wash text-ink-2",
  move: "border-[1.5px] border-move text-move",
};

/** A small label that always carries words, never colour alone. */
export function Chip({ tone = "plain", children }: { tone?: ChipTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-[13px] font-bold leading-snug ${CHIP_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Stock status in words. A medicine's amber can mean low cover or stock near
 * expiry, so callers that know which pass `label`.
 */
const STATUS: Record<string, { tone: ChipTone; label: string }> = {
  green: { tone: "scrub", label: "In stock" },
  amber: { tone: "low", label: "Low or near expiry" },
  red: { tone: "out", label: "Out" },
  short: { tone: "out", label: "Under a week" },
  surplus: { tone: "scrub", label: "Over a month spare" },
  balanced: { tone: "wash", label: "Normal" },
  availability_only: { tone: "plain", label: "Availability only" },
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const style = STATUS[status] ?? { tone: "plain" as const, label: status };
  return <Chip tone={style.tone}>{label ?? style.label}</Chip>;
}

/* ------------------------------------------------------------ Empty state */

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line bg-paper px-6 py-10 text-center">
      <p className="font-bold text-ink">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted">{children}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ Table */

/** A stock-register table: a heavy rule under the header, light rules between rows. */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-left text-[15px]">
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  onClick,
  active,
  align = "left",
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  align?: "left" | "right";
}) {
  return (
    <th
      onClick={onClick}
      aria-sort={active ? "descending" : undefined}
      className={`sticky top-0 z-10 whitespace-nowrap border-b-2 border-ink bg-surface pb-2 pr-3 pt-1 text-[13px] font-bold ${
        align === "right" ? "text-right" : "text-left"
      } ${onClick ? "cursor-pointer select-none hover:text-scrub" : ""} ${
        active ? "text-scrub" : "text-muted"
      }`}
    >
      {children}
      {active && <span aria-hidden="true"> ▾</span>}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`border-b border-line-soft py-3.5 pr-3 ${
        align === "right" ? "text-right tabular" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}
