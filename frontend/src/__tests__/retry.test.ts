import { describe, expect, it } from "vitest";
import { isServerUnavailable, retryDelay, retryWhileWaking } from "../api/retry";
import { ApiError } from "../api/types";

const apiError = (status: number) => new ApiError(status, { error: "x", message: "x" });

describe("retry while the API wakes up", () => {
  it("treats network failures and gateway errors as a waking server", () => {
    expect(isServerUnavailable(new TypeError("Failed to fetch"))).toBe(true);
    expect(isServerUnavailable(apiError(502))).toBe(true);
    expect(isServerUnavailable(apiError(503))).toBe(true);
    expect(isServerUnavailable(apiError(504))).toBe(true);
  });

  it("does not retry answers the API gave on purpose", () => {
    expect(retryWhileWaking(0, apiError(422))).toBe(false);
    expect(retryWhileWaking(0, apiError(404))).toBe(false);
  });

  it("keeps retrying for about 75 seconds, then stops", () => {
    expect(retryWhileWaking(7, new TypeError("Failed to fetch"))).toBe(true);
    expect(retryWhileWaking(8, new TypeError("Failed to fetch"))).toBe(false);
    const total = Array.from({ length: 8 }, (_, i) => retryDelay(i)).reduce((a, b) => a + b, 0);
    expect(total).toBe(75_000);
  });
});
