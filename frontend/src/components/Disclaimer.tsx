/**
 * The disclaimer, required verbatim on every page.
 *
 * Exported as a constant as well as a component so tests can assert the exact
 * wording rather than a paraphrase of it. The shell shows it as a slim strip under
 * the header on every page; `aside` lets a page add figures to the strip's right.
 */
import type { ReactNode } from "react";
import { Link } from "react-router";

export const DISCLAIMER_TEXT =
  "Facility locations and medicine lists come from public sources. Stock levels are " +
  "estimates. PHC availability patterns come from a 2021–22 published survey and are " +
  "assigned to map locations for illustration.";

export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p role="note" className={`text-sm leading-snug text-ink-2 ${className}`} data-testid="disclaimer">
      {DISCLAIMER_TEXT}
    </p>
  );
}

export function DisclaimerStrip({ aside }: { aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-line bg-wash px-6 py-2.5">
      <p role="note" className="text-sm leading-snug text-ink-2" data-testid="disclaimer">
        {DISCLAIMER_TEXT}{" "}
        <Link
          to="/sources"
          className="font-bold text-scrub underline underline-offset-2 hover:text-scrub-dark"
        >
          How this was built
        </Link>
      </p>
      {aside}
    </div>
  );
}
