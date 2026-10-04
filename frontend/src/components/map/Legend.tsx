/**
 * What the map's marks mean. The stock group follows the view: the facility's share of
 * medicines in stock by default, or one medicine's stock once a medicine is chosen.
 * Swatches are drawn with the same `pinHtml` as the map, so they cannot drift from it.
 */
import { useState, type ReactNode } from "react";
import { pinHtml, type PinStatus } from "./icons";

function Swatch({ status }: { status: PinStatus }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 scale-[0.8]"
      // Static markup from our own builder; no user input reaches it.
      dangerouslySetInnerHTML={{ __html: pinHtml("clinic", status) }}
    />
  );
}

const SHAPE_SWATCH: Record<string, string> = {
  hospital: "h-3.5 w-3.5 rounded-[3px]",
  "health-centre": "mx-0.5 h-3 w-3 rotate-45 rounded-[2px]",
  clinic: "h-3.5 w-3.5 rounded-full",
  pharmacy: "mx-0.5 h-2.5 w-2.5 rounded-full",
  "other-government": "h-3.5 w-3.5 rounded-[3px] border-dashed",
};

function ShapeSwatch({ shape }: { shape: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 border-[1.5px] border-ink-2 ${SHAPE_SWATCH[shape]}`}
    />
  );
}

function Row({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2.5 leading-snug">
      <span className="flex w-6 shrink-0 justify-center">{swatch}</span>
      <span>{children}</span>
    </li>
  );
}

function LineSwatch({ className }: { className: string }) {
  return (
    <svg width="24" height="8" aria-hidden="true">
      <line x1="1" y1="4" x2="23" y2="4" className={className} />
    </svg>
  );
}

/** Open by default only where the map is wide enough not to be covered by it. */
const WIDE_ENOUGH = "(min-width: 1600px)";

export function Legend({
  hasRun,
  medicineName,
}: {
  hasRun: boolean;
  /** Set when the pins show one medicine's stock. */
  medicineName: string | null;
}) {
  const [open, setOpen] = useState(
    () => typeof window !== "undefined" && Boolean(window.matchMedia?.(WIDE_ENOUGH).matches),
  );
  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className={`rounded-[10px] border border-line bg-surface text-sm text-ink-2 shadow-[var(--shadow-float)] ${
        open ? "w-[214px]" : ""
      }`}
    >
      <summary className="flex min-h-11 cursor-pointer items-center px-3.5 font-bold text-ink">
        Legend
      </summary>
      <div className="space-y-3 px-3.5 pb-3.5">
        <section>
          <h3 className="mb-1.5 text-[13px] font-bold text-ink">
            {medicineName ? `Stock of ${medicineName}` : "Medicines in stock"}
          </h3>
          {!hasRun ? (
            <p className="text-[13px] text-muted">Shown once the simulation has run.</p>
          ) : medicineName ? (
            <ul className="space-y-1.5">
              <Row swatch={<Swatch status="ok" />}>A week or more</Row>
              <Row swatch={<Swatch status="low" />}>Under a week</Row>
              <Row swatch={<Swatch status="out" />}>Out of stock</Row>
              <Row swatch={<Swatch status="none" />}>Doesn&rsquo;t carry it</Row>
            </ul>
          ) : (
            <ul className="space-y-1.5">
              <Row swatch={<Swatch status="ok" />}>95% or more</Row>
              <Row swatch={<Swatch status="low" />}>80&ndash;95%, or many running low</Row>
              <Row swatch={<Swatch status="out" />}>Under 80% (WHO/HAI benchmark)</Row>
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-1.5 text-[13px] font-bold text-ink">Facility type</h3>
          <ul className="space-y-1.5">
            <Row swatch={<ShapeSwatch shape="hospital" />}>Hospital</Row>
            <Row swatch={<ShapeSwatch shape="health-centre" />}>Health centre (PHC, CHC)</Row>
            <Row swatch={<ShapeSwatch shape="clinic" />}>Clinic</Row>
            <Row swatch={<ShapeSwatch shape="pharmacy" />}>Pharmacy</Row>
            <Row swatch={<ShapeSwatch shape="other-government" />}>Other government</Row>
          </ul>
        </section>

        <section>
          <h3 className="mb-1.5 text-[13px] font-bold text-ink">Movement</h3>
          <ul className="space-y-1.5">
            <Row swatch={<LineSwatch className="zealo-legend-transfer" />}>
              Transfer between facilities
            </Row>
            <Row swatch={<LineSwatch className="zealo-legend-maker" />}>
              Express order from a manufacturer
            </Row>
          </ul>
        </section>
      </div>
    </details>
  );
}
