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
      className="rounded-xl border border-out-tint bg-out-row px-5 py-4"
      data-testid="missing-inputs"
    >
      <h3 className="text-lg font-bold text-ink">Simulation not available yet</h3>
      <p className="mt-1 text-[15px] leading-relaxed text-ink-2">
        <strong className="text-ink">Real facility locations and the medicine list are
        loaded</strong> and can be explored. The stock simulation additionally needs inputs
        that have to come from official sources, and this project will not substitute
        estimates for them.
      </p>
      {detail.missing && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] text-ink-2">
          {detail.missing.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {detail.requests && detail.requests.length > 0 && (
        <p className="mt-2 text-sm text-muted">
          Tracked as {detail.requests.join(" and ")} in <span className="code">data/manual/REQUESTS.md</span>.
        </p>
      )}
    </section>
  );
}
