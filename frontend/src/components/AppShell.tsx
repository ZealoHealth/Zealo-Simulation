/**
 * The frame every page sits in: brand, navigation, mode toggle, disclaimer.
 *
 * The disclaimer lives here rather than on each page, so it cannot be forgotten
 * on a page added later.
 */
import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { Disclaimer } from "./Disclaimer";
import { useViewStore } from "../state/store";

const NAV = [
  { to: "/", label: "Map", end: true },
  { to: "/facility", label: "Facility" },
  { to: "/network", label: "Network" },
];

function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple text-sm font-black text-white"
      >
        Z
      </span>
      <span className="text-base font-extrabold tracking-tight text-navy">Zealo</span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { mode, setMode } = useViewStore();

  return (
    <div className="flex h-full flex-col">
      <header className="z-20 shrink-0 bg-surface shadow-card">
        <div className="flex flex-wrap items-center gap-4 px-4 py-2.5">
          <Wordmark />

          <nav className="flex items-center gap-1 rounded-lg bg-surface-sunken p-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isActive ? "bg-surface text-purple shadow-sm" : "text-ink-muted hover:text-ink"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1 rounded-lg bg-surface-sunken p-1">
            {(["without_zealo", "with_zealo"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  mode === m ? "bg-purple text-white shadow-sm" : "text-ink-muted hover:text-ink"
                }`}
              >
                {m === "with_zealo" ? "With Zealo" : "Without Zealo"}
              </button>
            ))}
          </div>
        </div>
        <Disclaimer className="border-t border-hairline px-4 py-1.5" />
      </header>

      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
