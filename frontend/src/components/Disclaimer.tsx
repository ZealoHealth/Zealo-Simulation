/**
 * The disclaimer, required on every page.
 *
 * Exported as a constant as well as a component so tests can assert the exact
 * wording rather than a paraphrase of it.
 */
export const DISCLAIMER_TEXT =
  "Facility locations and medicine lists come from public sources. Stock levels are " +
  "estimates. PHC availability patterns come from a 2021–22 published survey and are " +
  "assigned to map locations for illustration.";

export function Disclaimer({ className = "" }: { className?: string }) {
  return (
    <p
      role="note"
      className={`text-[11px] leading-snug text-navy/70 ${className}`}
      data-testid="disclaimer"
    >
      {DISCLAIMER_TEXT}
    </p>
  );
}
