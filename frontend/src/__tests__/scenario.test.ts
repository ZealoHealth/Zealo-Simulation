import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  DEFAULT_SCENARIO,
  buildScenarioRequest,
  decodeShareState,
  encodeShareState,
  percentChange,
  shareUrl,
} from "../state/scenario";

const state = {
  scenario: { ...DEFAULT_SCENARIO, days: 90, seed: 7 },
  networkOverrides: { "pharmacy-01": true, "phc-02": false },
  approvalDecisions: { "3:phc-01:D00461": "reject" as const },
};

describe("share links", () => {
  it("round-trips the whole scenario", () => {
    expect(decodeShareState(encodeShareState(state))).toEqual(state);
  });

  it("produces a URL that carries the scenario", () => {
    const url = new URL(shareUrl(state, "https://zealo.example/"));
    expect(decodeShareState(url.searchParams.get("scenario"))).toEqual(state);
  });

  it("falls back rather than throwing on a broken link", () => {
    expect(decodeShareState("not-valid-base64-json")).toBeNull();
    expect(decodeShareState(null)).toBeNull();
  });

  it("fills settings missing from an older link with defaults", () => {
    const partial = encodeShareState({
      scenario: { days: 60 } as never,
      networkOverrides: {},
      approvalDecisions: {},
    });
    const decoded = decodeShareState(partial)!;
    expect(decoded.scenario.days).toBe(60);
    expect(decoded.scenario.lead_time_days).toBe(DEFAULT_SCENARIO.lead_time_days);
    expect(decoded.scenario.rules).toEqual(DEFAULT_RULES);
  });
});

describe("buildScenarioRequest", () => {
  it("sends network overrides and approval decisions", () => {
    const request = buildScenarioRequest(state, ["phc-01"]);
    expect(request.network_overrides).toEqual(state.networkOverrides);
    expect(request.approval_decisions).toEqual(state.approvalDecisions);
    expect(request.days).toBe(90);
  });

  it("omits the private demand share by default so the research value applies", () => {
    const request = buildScenarioRequest(state, ["phc-01"]) as Record<string, unknown>;
    expect("private_demand_share" in request).toBe(false);
  });

  it("sends an explicit private demand share when the user sets one", () => {
    const custom = { ...state, scenario: { ...state.scenario, private_demand_share: 1.5 } };
    expect(buildScenarioRequest(custom, ["phc-01"]).private_demand_share).toBe(1.5);
  });

  it("omits rules while they are the defaults, keeping the run key stable", () => {
    const request = buildScenarioRequest(state, ["phc-01", "phc-02"]) as Record<string, unknown>;
    expect(request.rules).toBeUndefined();
  });

  it("applies changed rules to every facility", () => {
    const changed = {
      ...state,
      scenario: { ...state.scenario, rules: { ...DEFAULT_RULES, auto_approval_limit: 50 } },
    };
    const request = buildScenarioRequest(changed, ["phc-01", "phc-02"]) as {
      rules: Record<string, { auto_approval_limit: number }>;
    };
    expect(Object.keys(request.rules)).toEqual(["phc-01", "phc-02"]);
    expect(request.rules["phc-02"].auto_approval_limit).toBe(50);
  });
});

describe("percentChange", () => {
  it("measures change from the baseline", () => {
    expect(percentChange(200, 50)).toBe(-75);
    expect(percentChange(0.9, 0.99)).toBeCloseTo(10, 5);
  });

  it("returns null rather than dividing by zero", () => {
    expect(percentChange(0, 10)).toBeNull();
  });
});
