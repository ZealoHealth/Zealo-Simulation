/**
 * The event feed: plain sentences, separated by rules.
 *
 * Messages come from the backend already written in plain language, so the feed
 * renders them as-is rather than reconstructing sentences from fields. Plain ink
 * throughout: coloured sentences read as links.
 */
import type { SimulationEvent } from "../../api/types";

export function EventFeed({
  events,
  showDay = true,
  empty = "Nothing has happened yet. Press Play to watch the network move stock.",
}: {
  events: SimulationEvent[];
  /** Off when the panel is already about one day. */
  showDay?: boolean;
  empty?: string;
}) {
  if (events.length === 0) {
    return <p className="py-4 text-[15px] text-muted">{empty}</p>;
  }

  return (
    <ul aria-label="Event feed">
      {events.map((event, index) => (
        <li
          key={`${event.day}-${event.type}-${event.medicine_id}-${index}`}
          className="flex gap-3 border-b border-line-soft py-2.5 text-[15px] leading-snug last:border-b-0"
        >
          {showDay && (
            <span className="tabular w-[52px] shrink-0 text-muted">Day {event.day + 1}</span>
          )}
          <span className="text-ink">{event.message}</span>
        </li>
      ))}
    </ul>
  );
}
