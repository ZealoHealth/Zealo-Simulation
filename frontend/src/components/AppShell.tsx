/**
 * The frame every page sits in: logo, navigation, the disclaimer strip, and the mode
 * toggle when the "without Zealo" baseline is switched on (see `config.ts`).
 *
 * The disclaimer lives here rather than on each page, so it cannot be forgotten on a
 * page added later.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router";
import { SHOW_WITHOUT_ZEALO } from "../config";
import { DataStatusLink, DataStatusPanel } from "./DataStatusPanel";
import { DisclaimerStrip } from "./Disclaimer";
import { SHARE_PARAM, decodeShareState } from "../state/scenario";
import { useViewStore } from "../state/store";
import { LogoMark } from "../ui";
import { buttonClass } from "../ui/buttonStyles";

const NAV = [
  { to: "/", label: "How it works", end: true },
  { to: "/map", label: "Map" },
  { to: "/facility", label: "Facilities" },
  { to: "/network", label: "Network" },
  ...(SHOW_WITHOUT_ZEALO ? [{ to: "/compare", label: "Compare" }] : []),
  { to: "/sources", label: "Data and methods" },
  { to: "/about", label: "About" },
];

const NAV_LINK = "flex min-h-11 items-center px-3.5 text-base transition-colors";
const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? `${NAV_LINK} font-bold text-scrub shadow-[inset_0_-3px_0_currentColor]`
    : `${NAV_LINK} text-ink-2 hover:text-ink`;

function Wordmark() {
  return (
    <Link to="/" className="flex min-h-11 items-center gap-2.5" aria-label="Zealo, home">
      <LogoMark />
      <span className="text-[22px] font-bold tracking-[-0.01em] text-ink">Zealo</span>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { mode, setMode, hydrate } = useViewStore();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const home = pathname === "/";

  // Open a shared link with the exact scenario it was copied from.
  useEffect(() => {
    const shared = decodeShareState(new URLSearchParams(window.location.search).get(SHARE_PARAM));
    if (shared) hydrate(shared);
  }, [hydrate]);

  const links = NAV.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={navClass}
      onClick={() => setMenuOpen(false)}
    >
      {item.label}
    </NavLink>
  ));

  return (
    <div className="flex h-full flex-col">
      <header className="z-20 shrink-0 border-b border-line bg-surface">
        <div
          className={`flex flex-wrap items-center gap-x-6 gap-y-2 px-4 ${
            home ? "min-h-[72px] sm:px-8" : "min-h-16 sm:px-6"
          }`}
        >
          <Wordmark />

          <nav aria-label="Main" className="hidden self-stretch lg:flex">
            {links}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <DataStatusLink />
            {SHOW_WITHOUT_ZEALO && (
              <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Mode">
                {(["without_zealo", "with_zealo"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    aria-pressed={mode === m}
                    className={`min-h-10 rounded-md px-3 text-sm font-bold ${
                      mode === m ? "bg-scrub text-white" : "text-ink-2 hover:text-ink"
                    }`}
                  >
                    {m === "with_zealo" ? "With Zealo" : "Without Zealo"}
                  </button>
                ))}
              </div>
            )}
            {/* The wrapper hides it on phones: the link's own inline-flex would win over
                `hidden` on the same element. The menu carries the link there instead. */}
            <span className="hidden sm:contents">
              {home ? (
                <Link to="/map" className={buttonClass("primary")}>
                  Open the Gadag map
                </Link>
              ) : (
                <Link to="/settings" className={buttonClass("secondary")}>
                  Simulation settings
                </Link>
              )}
            </span>
            <button
              type="button"
              className={`lg:hidden ${buttonClass("quiet")}`}
              aria-expanded={menuOpen}
              aria-controls="main-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              Menu
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav
            id="main-menu"
            aria-label="Main"
            className="flex flex-col border-t border-line-soft px-3 pb-2 lg:hidden"
          >
            {links}
            <NavLink to="/settings" className={navClass} onClick={() => setMenuOpen(false)}>
              Simulation settings
            </NavLink>
            {home && (
              <NavLink to="/map" className={navClass} onClick={() => setMenuOpen(false)}>
                Open the Gadag map
              </NavLink>
            )}
          </nav>
        )}
      </header>
      <DisclaimerStrip />

      <main className="min-h-0 flex-1">{children}</main>
      <DataStatusPanel />
    </div>
  );
}
