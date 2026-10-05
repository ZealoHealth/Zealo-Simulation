/**
 * The "Data status" drawer.
 *
 * Interim data is shown honestly but quietly: a small link in the header, not a banner
 * over the map. It lists what is still being collected, what approach stands in for it
 * meanwhile, and what each item unlocks.
 */
import { useDataStatus } from "../api/hooks";
import type { DataStatusItem } from "../api/types";
import { useViewStore } from "../state/store";
import { Button } from "../ui";

const STATUS_STYLE: Record<DataStatusItem["status"], { label: string; className: string }> = {
  complete: { label: "Complete", className: "bg-scrub-tint text-scrub" },
  decided: { label: "Decided", className: "bg-scrub-tint text-scrub" },
  interim: { label: "Interim", className: "bg-low-tint text-low-text" },
  pending: { label: "Pending", className: "bg-low-tint text-low-text" },
  invalid: { label: "Needs fixing", className: "bg-out-tint text-out-text" },
  optional: { label: "Optional", className: "bg-wash text-ink-2" },
};

const ORDER: Record<DataStatusItem["status"], number> = {
  invalid: 0, interim: 1, pending: 2, optional: 3, decided: 4, complete: 5,
};

export function DataStatusLink() {
  const { data } = useDataStatus();
  const setOpen = useViewStore((s) => s.setDataStatusOpen);
  const pending = data?.pending_count ?? 0;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap px-1 text-[15px] text-ink-2 underline-offset-4 hover:text-ink hover:underline"
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${pending > 0 ? "bg-low" : "bg-scrub"}`}
      />
      Data status
      {pending > 0 && (
        <>
          <span className="hidden text-muted sm:inline">({pending} interim)</span>
          <span className="sr-only sm:hidden">, {pending} interim</span>
        </>
      )}
    </button>
  );
}

export function DataStatusPanel() {
  const { data, isLoading } = useDataStatus();
  const { dataStatusOpen, setDataStatusOpen } = useViewStore();
  if (!dataStatusOpen) return null;

  const items = [...(data?.items ?? [])].sort((a, b) => ORDER[a.status] - ORDER[b.status]);

  return (
    <div className="fixed inset-0 z-[2000] flex justify-end bg-ink/20" onClick={() => setDataStatusOpen(false)}>
      <aside
        role="dialog"
        aria-label="Data status"
        className="h-full w-full max-w-md overflow-y-auto bg-surface p-5 shadow-[var(--shadow-float)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold tracking-tight text-ink">Data status</h2>
            <p className="mt-0.5 text-[15px] leading-relaxed text-ink-2">
              Some inputs are still being collected. Where one is missing, a clearly labelled
              interim approach is used, and figures resting on it carry the{" "}
              <strong>Estimated</strong> badge.
            </p>
          </div>
          <Button variant="ghost" onClick={() => setDataStatusOpen(false)} aria-label="Close data status">
            &times;
          </Button>
        </header>

        {isLoading && <p className="text-[15px] text-ink-2">Loading&hellip;</p>}

        <ul className="space-y-2.5">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg border border-line-soft bg-paper p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[13px] font-semibold ${STATUS_STYLE[item.status].className}`}>
                  {STATUS_STYLE[item.status].label}
                </span>
              </div>
              <p className="text-sm text-muted">{item.progress}</p>
              {item.status !== "complete" && (
                <p className="mt-1.5 text-[15px] leading-relaxed text-ink-2">
                  <span className="font-medium text-ink">Meanwhile: </span>
                  {item.interim_approach}
                </p>
              )}
              <p className="mt-1 text-sm text-muted">Unlocks: {item.unlocks}</p>
              {item.problems.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-sm text-out-text">
                  {item.problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
