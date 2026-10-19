/**
 * Scenario settings: what the Settings page edits, what a share link carries, and how
 * both become the request body for /simulate.
 *
 * Kept separate from view state because a scenario change produces a new run, while a
 * view change (day, filters, selection) must never do so.
 */
import type { ScenarioRequest } from "../api/types";

export interface RuleSettings {
  target_days: number;
  safety_days: number;
  /** Units per order line while no price list exists; rupees if one is added. */
  auto_approval_limit: number | null;
  approval_delay_days: number;
  review_interval_days: number;
}

export interface ScenarioSettings {
  days: number;
  seed: number;
  demand_scale: number;
  lead_time_days: number;
  express_lead_time_days: number;
  min_shelf_life_days: number;
  near_expiry_share: number;
  /**
   * Private facilities' demand per unit of government demand. `null` uses the NSS 75th
   * round Karnataka ratio the backend derives (about 3.66); a number overrides it.
   */
  private_demand_share: number | null;
  rules: RuleSettings;
}

export const DEFAULT_RULES: RuleSettings = {
  target_days: 30,
  safety_days: 7,
  auto_approval_limit: null,
  approval_delay_days: 1,
  review_interval_days: 7,
};

export const DEFAULT_SCENARIO: ScenarioSettings = {
  days: 180,
  seed: 42,
  demand_scale: 1,
  lead_time_days: 21,
  express_lead_time_days: 5,
  min_shelf_life_days: 180,
  near_expiry_share: 0.15,
  private_demand_share: null,
  rules: DEFAULT_RULES,
};

export interface ShareableState {
  scenario: ScenarioSettings;
  networkOverrides: Record<string, boolean>;
  approvalDecisions: Record<string, "approve" | "reject">;
}

export function sameRules(a: RuleSettings, b: RuleSettings): boolean {
  return (Object.keys(a) as Array<keyof RuleSettings>).every((k) => a[k] === b[k]);
}

/** Turn settings into a /simulate body. Rules are sent only when they differ from defaults. */
export function buildScenarioRequest(
  state: ShareableState,
  facilityIds: string[],
): ScenarioRequest {
  const { rules, private_demand_share, ...rest } = state.scenario;
  const request: ScenarioRequest & { rules?: Record<string, RuleSettings> } = {
    ...rest,
    // Omitted rather than sent as null, so the default run keeps a stable cache key.
    ...(private_demand_share != null ? { private_demand_share } : {}),
    network_overrides: state.networkOverrides,
    approval_decisions: state.approvalDecisions,
  };
  if (!sameRules(rules, DEFAULT_RULES) && facilityIds.length) {
    request.rules = Object.fromEntries(facilityIds.map((id) => [id, rules]));
  }
  return request;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

export const SHARE_PARAM = "scenario";

export function encodeShareState(state: ShareableState): string {
  return toBase64Url(JSON.stringify(state));
}

/**
 * Read a share link back. Anything malformed falls back to defaults rather than
 * throwing: a broken link should open the default demo, not a blank page.
 */
export function decodeShareState(encoded: string | null): ShareableState | null {
  if (!encoded) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as Partial<ShareableState>;
    return {
      scenario: {
        ...DEFAULT_SCENARIO,
        ...(parsed.scenario ?? {}),
        rules: { ...DEFAULT_RULES, ...(parsed.scenario?.rules ?? {}) },
      },
      networkOverrides: parsed.networkOverrides ?? {},
      approvalDecisions: parsed.approvalDecisions ?? {},
    };
  } catch {
    return null;
  }
}

export function shareUrl(state: ShareableState, base: string): string {
  const url = new URL(base);
  url.searchParams.set(SHARE_PARAM, encodeShareState(state));
  return url.toString();
}

/** Percentage change from baseline, or null when the baseline is zero. */
export function percentChange(baseline: number, withZealo: number): number | null {
  if (baseline === 0) return null;
  return ((withZealo - baseline) / baseline) * 100;
}
