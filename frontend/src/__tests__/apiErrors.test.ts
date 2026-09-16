import { describe, expect, it, vi, afterEach } from "vitest";
import { getFacilityRun, simulate } from "../api/client";
import { ApiError } from "../api/types";

function mockResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "",
    json: async () => body,
  } as Response;
}

afterEach(() => vi.unstubAllGlobals());

describe("missing run handling", () => {
  it("surfaces a missing run as a typed error the app can act on", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockResponse(404, {
          detail: {
            error: "run_not_found",
            message: "Run abc is not cached. Re-submit the scenario to /simulate.",
            run_id: "abc",
          },
        }),
      ),
    );

    await expect(getFacilityRun("abc", "phc-01", "with_zealo", 0)).rejects.toThrowError(ApiError);
    try {
      await getFacilityRun("abc", "phc-01", "with_zealo", 0);
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.isRunMissing).toBe(true);
      expect(apiError.isMissingInputs).toBe(false);
      // The message tells the client what to do, so it can re-run rather than
      // rendering an empty map.
      expect(apiError.message).toContain("/simulate");
    }
  });

  it("distinguishes absent real-world inputs from a broken backend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockResponse(422, {
          detail: {
            error: "missing_demand_inputs",
            message: "Cannot build a scenario without: population figures.",
            missing: ["official Gadag taluk and Karnataka population figures"],
            requests: ["R5", "R1"],
          },
        }),
      ),
    );

    try {
      await simulate({ days: 30 });
      throw new Error("expected a rejection");
    } catch (error) {
      const apiError = error as ApiError;
      expect(apiError.isMissingInputs).toBe(true);
      expect(apiError.detail.requests).toEqual(["R5", "R1"]);
      expect(apiError.status).toBe(422);
    }
  });

  it("still throws a usable error when the body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 502,
        statusText: "Bad Gateway",
        json: async () => {
          throw new Error("not json");
        },
      })) as unknown as typeof fetch,
    );

    await expect(simulate({})).rejects.toThrowError(ApiError);
  });
});
