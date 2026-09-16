/**
 * Shared UI primitives.
 *
 * Everything visual goes through these so the pages stay consistent and a change
 * of look is one edit rather than a sweep. Separation is done with elevation and
 * spacing rather than a border on every edge -- borders everywhere were what made
 * the first pass read as a wireframe.
 */
import type { ReactNode } from "react";

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
      className={`rounded-xl bg-surface shadow-card ${padded ? "p-4" : ""} ${className}`}
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
    <header className="mb-3 flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-ink">{children}</h2>
        {hint && <p className="mt-0.5 text-xs leading-snug text-ink-muted">{hint}</p>}
      </div>
      {action}
    </header>
  );
}

/* ---------------------------------------------------------------- Button */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-purple text-white hover:bg-purple/90 shadow-sm",
  secondary: "bg-lavender text-navy hover:bg-lavender/70",
  ghost: "text-ink-muted hover:bg-surface-sunken",
  danger: "bg-coral text-white hover:bg-coral/90 shadow-sm",
};

export function Button({
  children,
  variant = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${BUTTON_STYLES[variant]} ${className}`}
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
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-subtle">
        {label}
      </span>
      {children}
    </label>
  );
}

const CONTROL =
  "w-full rounded-lg bg-surface-sunken px-2.5 py-1.5 text-sm text-ink " +
  "outline-none ring-1 ring-hairline transition focus:ring-2 focus:ring-purple/50";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

/** A checkbox that reads as a control rather than a raw browser default. */
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
    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm text-ink transition hover:bg-surface-sunken">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-hairline accent-purple"
      />
      {label}
    </label>
  );
}

/* ------------------------------------------------------------- Stat tile */

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
    tone === "good" ? "text-status-green" : tone === "bad" ? "text-status-red" : "text-ink";
  return (
    <div className="rounded-lg bg-surface-sunken px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
        {label}
      </p>
      <p className={`tabular text-lg font-bold leading-tight ${toneClass}`}>{value}</p>
      {sub && <p className="text-[10px] text-ink-subtle">{sub}</p>}
    </div>
  );
}

/* ----------------------------------------------------------- Status pill */

const STATUS_PILL: Record<string, string> = {
  green: "bg-status-green/12 text-status-green",
  amber: "bg-status-amber/12 text-status-amber",
  red: "bg-status-red/12 text-status-red",
  surplus: "bg-purple/12 text-purple",
  short: "bg-coral/15 text-coral",
  balanced: "bg-ink/8 text-ink-muted",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize ${
        STATUS_PILL[status] ?? STATUS_PILL.balanced
      }`}
    >
      {status}
    </span>
  );
}

/* ------------------------------------------------------------ Empty state */

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl bg-surface-sunken px-6 py-10 text-center">
      <p className="text-sm font-semibold text-ink">{title}</p>
      {children && (
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-muted">{children}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Table */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-left text-xs">
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
      className={`sticky top-0 z-10 whitespace-nowrap bg-surface pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wide ${
        align === "right" ? "text-right" : "text-left"
      } ${onClick ? "cursor-pointer select-none hover:text-purple" : ""} ${
        active ? "text-purple" : "text-ink-subtle"
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
      className={`border-t border-hairline py-1.5 ${
        align === "right" ? "text-right tabular" : ""
      } ${className}`}
    >
      {children}
    </td>
  );
}
