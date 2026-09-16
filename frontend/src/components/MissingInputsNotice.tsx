/**
 * Shown when the backend refuses to simulate because real inputs are absent.
 *
 * This is a designed state, not an error screen. The backend will not invent
 * population figures or PHC opening stock, so the UI says exactly what is
 * missing rather than showing a fabricated run or a blank map.
 */
import type { ApiErrorDetail } from "../api/types";

export function MissingInputsNotice({ detail }: { detail: ApiErrorDetail }) {
  return (
    <section
      className="rounded-lg border border-coral/40 bg-coral/5 px-4 py-3"
      data-testid="missing-inputs"
    >
      <h3 className="text-sm font-bold text-navy">Simulation not available yet</h3>
      <p className="mt-1 text-xs text-navy/75">
        The map below shows <strong>real facility locations</strong> from OpenStreetMap. The
        stock simulation needs two inputs that have to come from official sources, and this
        project will not substitute estimates for them.
      </p>
      {detail.missing && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-navy/75">
          {detail.missing.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {detail.requests && detail.requests.length > 0 && (
        <p className="mt-2 text-[11px] text-navy/60">
          Tracked as {detail.requests.join(" and ")} in <code>data/manual/REQUESTS.md</code>.
        </p>
      )}
    </section>
  );
}
