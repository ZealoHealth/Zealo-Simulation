/**
 * Retry rules for API requests.
 *
 * The free hosting plan puts the API to sleep after 15 idle minutes, and waking it takes up to
 * a minute. While it wakes, requests fail at the network level or with a 502/503/504. Those are
 * retried for about 75 seconds so the first visitor sees a slow load, not an error.
 * Answers the API gave on purpose (a 422 for missing inputs, a 404 for an unknown run) are not
 * retried: asking again would get the same answer.
 */
import { ApiError } from "./types";

const WAKING_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 8;

/** True for failures that mean "the server is not reachable yet". */
export function isServerUnavailable(error: unknown): boolean {
  if (error instanceof ApiError) return WAKING_STATUSES.has(error.status);
  // fetch rejects with a TypeError when the server cannot be reached (or a waking server's
  // placeholder response lacks CORS headers).
  return error instanceof TypeError;
}

export function retryWhileWaking(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_RETRIES && isServerUnavailable(error);
}

/** 1 s, 2 s, 4 s, 8 s, then every 15 s: about 75 s across all retries. */
export function retryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 15_000);
}
