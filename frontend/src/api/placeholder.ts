/**
 * Keep showing the previous day's data while the next day loads.
 *
 * Per-day queries change key every time playback advances. Without a placeholder
 * TanStack Query hands back `undefined` until the new response lands, so a page
 * gated on its data unmounts and remounts once a day -- the Network page went
 * blank twelve times in four seconds of playback.
 *
 * The previous data is kept **only when nothing but the day changed**. Switching
 * facility or medicine must not show the last one's numbers under the new name.
 */
import type { QueryKey } from "@tanstack/react-query";

export function keepWhileOnlyDayChanges(key: QueryKey, dayIndex: number) {
  return <T,>(previous: T | undefined, previousQuery?: { queryKey: QueryKey }): T | undefined => {
    if (previous === undefined || !previousQuery) return undefined;
    const before = previousQuery.queryKey;
    if (before.length !== key.length) return undefined;
    const onlyDayChanged = before.every((part, i) => i === dayIndex || part === key[i]);
    return onlyDayChanged ? previous : undefined;
  };
}
