/**
 * The live event feed.
 *
 * Messages come from the backend already written in plain language, so the feed
 * renders them as-is rather than reconstructing sentences from fields.
 */
import type { SimulationEvent } from "../../api/types";

const TYPE_STYLE: Record<string, string> = {
  relief_transfer: "border-coral/40 bg-coral/10",
  rebalance_transfer: "border-status-green/40 bg-status-green/10",
  manufacturer_order: "border-purple/30 bg-purple/5",
  express_order: "border-coral/40 bg-coral/5",
  expired: "border-status-red/40 bg-status-red/10",
  stockout: "border-status-red/50 bg-status-red/15",
  approval_requested: "border-status-amber/40 bg-status-amber/10",
  approval_granted: "border-navy/15 bg-navy/5",
  approval_rejected: "border-status-red/40 bg-status-red/10",
};

export function EventFeed({ events }: { events: SimulationEvent[] }) {
  if (events.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-navy/50">
        Nothing has happened yet. Press play to watch the network move stock.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5 overflow-y-auto px-2 py-2" aria-label="Event feed">
      {events.map((event, index) => (
        <li
          key={`${event.day}-${event.type}-${event.medicine_id}-${index}`}
          className={`rounded border px-2 py-1.5 text-[11px] leading-snug ${
            TYPE_STYLE[event.type] ?? "border-navy/10 bg-white"
          }`}
        >
          <span className="mr-1 font-semibold text-navy/50">Day {event.day + 1}</span>
          {event.message}
        </li>
      ))}
    </ul>
  );
}
