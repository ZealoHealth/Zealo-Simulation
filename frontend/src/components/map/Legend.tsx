import { SHAPE_BY_TYPE, STATUS_COLOURS, TYPE_LABELS, UNKNOWN_COLOUR } from "./icons";

const SHAPE_SWATCH: Record<string, string> = {
  square: "rounded-[2px]",
  circle: "rounded-full",
  diamond: "rotate-45",
  triangle: "[clip-path:polygon(50%_0,100%_100%,0_100%)]",
  pill: "rounded-full",
};

/** Explains both channels the markers use: shape for type, colour for status. */
export function Legend({ hasRun }: { hasRun: boolean }) {
  return (
    <div className="rounded-lg bg-white/95 p-3 text-xs shadow-lg ring-1 ring-navy/10">
      <p className="mb-2 font-semibold text-navy">Legend</p>

      <p className="mb-1 text-[10px] uppercase tracking-wide text-navy/50">Facility type</p>
      <ul className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1">
        {Object.entries(TYPE_LABELS).map(([key, label]) => (
          <li key={key} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-3 w-3 bg-navy/70 ${SHAPE_SWATCH[SHAPE_BY_TYPE[key] ?? "circle"]}`}
            />
            <span className="text-navy/80">{label}</span>
          </li>
        ))}
      </ul>

      <p className="mb-1 text-[10px] uppercase tracking-wide text-navy/50">Stock status</p>
      <ul className="space-y-1">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: STATUS_COLOURS.green }} />
          <span className="text-navy/80">All medicines in stock</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: STATUS_COLOURS.amber }} />
          <span className="text-navy/80">Low cover or near-expiry stock</span>
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: STATUS_COLOURS.red }} />
          <span className="text-navy/80">Something is out of stock</span>
        </li>
        {!hasRun && (
          <li className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full" style={{ background: UNKNOWN_COLOUR }} />
            <span className="text-navy/80">No simulation run yet</span>
          </li>
        )}
      </ul>
    </div>
  );
}
