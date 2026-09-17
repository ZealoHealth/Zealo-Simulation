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
  complete: { label: "Complete", className: "bg-status-green/12 text-status-green" },
  decided: { label: "Decided", className: "bg-status-green/12 text-status-green" },
  interim: { label: "Interim", className: "bg-status-amber/12 text-status-amber" },
  pending: { label: "Pending", className: "bg-status-amber/12 text-status-amber" },
  invalid: { label: "Needs fixing", className: "bg-status-red/12 text-status-red" },
  optional: { label: "Optional", className: "bg-ink/8 text-ink-muted" },
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
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
    >
      Data status
      {pending > 0 && (
        <span className="rounded-full bg-status-amber/15 px-1.5 text-[10px] font-semibold text-status-amber">
          {pending} interim
        </span>
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
    <div className="fixed inset-0 z-[2000] flex justify-end bg-navy/20" onClick={() => setDataStatusOpen(false)}>
      <aside
        role="dialog"
        aria-label="Data status"
        className="h-full w-full max-w-md overflow-y-auto bg-surface p-5 shadow-raised"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold tracking-tight text-ink">Data status</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
              Some inputs are still being collected. Where one is missing, a clearly labelled
              interim approach is used, and figures resting on it carry the{" "}
              <strong>Estimated</strong> badge.
            </p>
          </div>
          <Button variant="ghost" onClick={() => setDataStatusOpen(false)} aria-label="Close data status">
            &times;
          </Button>
        </header>

        {isLoading && <p className="text-xs text-ink-muted">Loading&hellip;</p>}

        <ul className="space-y-2.5">
          {items.map((item) => (
            <li key={item.id} className="rounded-lg bg-surface-sunken p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLE[item.status].className}`}>
                  {STATUS_STYLE[item.status].label}
                </span>
              </div>
              <p className="text-[11px] text-ink-subtle">{item.progress}</p>
              {item.status !== "complete" && (
                <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
                  <span className="font-medium text-ink">Meanwhile: </span>
                  {item.interim_approach}
                </p>
              )}
              <p className="mt-1 text-[11px] text-ink-subtle">Unlocks: {item.unlocks}</p>
              {item.problems.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-[11px] text-status-red">
                  {item.problems.map((p) => (
                    <li key={p}>&middot; {p}</li>
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
