/**
 * HTTP access to the Zealo API.
 *
 * The base URL is an environment variable so the deployed frontend can point at
 * a separately hosted backend. When the backend is asleep or unreachable, the
 * app falls back to a cached default run shipped in `public/` -- see
 * `loadCachedRun` -- so the site still works for someone opening it cold.
 */
import type {
  DataStatusResponse,
  FacilitiesResponse,
  FacilityRunResponse,
  MedicineAtFacilitiesResponse,
  MedicinesResponse,
  Mode,
  RedistributionResponse,
  ScenarioRequest,
  SimulateResponse,
  SourcesResponse,
} from "./types";
import { ApiError } from "./types";

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!response.ok) {
    let detail = { error: "http_error", message: `${response.status} ${response.statusText}` };
    try {
      const body = await response.json();
      if (body?.detail && typeof body.detail === "object") detail = body.detail;
      else if (typeof body?.detail === "string") detail = { error: "http_error", message: body.detail };
    } catch {
      // Body was not JSON; the status line is all we have.
    }
    throw new ApiError(response.status, detail);
  }

  return (await response.json()) as T;
}

export const getFacilities = () => request<FacilitiesResponse>("/facilities");

export const getMedicines = (surveyLinkedOnly = false) =>
  request<MedicinesResponse>(`/medicines?survey_linked_only=${surveyLinkedOnly}`);

export const getSources = () => request<SourcesResponse>("/sources");

export const getDataStatus = () => request<DataStatusResponse>("/data-status");

export interface SurveySummary {
  phcs_surveyed: number;
  items_assessed: number;
  period: string;
  overall_availability_pct: number;
  highest_phc: { phc: number; availability_pct: number };
  lowest_phc: { phc: number; availability_pct: number };
  categories: Array<{ category: string; availability_pct: number }>;
  unavailable_everywhere: Array<{ sl_no: number; name: string }>;
  items_at_full_availability: number;
}

export const getSurveySummary = () => request<SurveySummary>("/survey-summary");

export const simulate = (scenario: ScenarioRequest) =>
  request<SimulateResponse>("/simulate", {
    method: "POST",
    body: JSON.stringify(scenario),
  });

export const getFacilityRun = (
  runId: string,
  facilityId: string,
  mode: Mode,
  day: number,
  series?: string,
) =>
  request<FacilityRunResponse>(
    `/runs/${runId}/facilities/${facilityId}?mode=${mode}&day=${day}` +
      (series ? `&series=${encodeURIComponent(series)}` : ""),
  );

export const getRedistribution = (
  runId: string,
  mode: Mode,
  day: number,
  medicineId?: string,
) =>
  request<RedistributionResponse>(
    `/runs/${runId}/redistribution?mode=${mode}&day=${day}` +
      (medicineId ? `&medicine_id=${encodeURIComponent(medicineId)}` : ""),
  );

export const getMedicineRun = (runId: string, medicineId: string, mode: Mode, day: number) =>
  request<MedicineAtFacilitiesResponse>(
    `/runs/${runId}/medicines/${medicineId}?mode=${mode}&day=${day}`,
  );

/**
 * A pre-computed run bundled with the site.
 *
 * Lets the map load with data even when the backend is asleep, which free
 * hosting tiers do aggressively. Returns null when no cached run has been
 * generated yet.
 */
export async function loadCachedRun(): Promise<SimulateResponse | null> {
  try {
    const response = await fetch("/cached-run.json");
    if (!response.ok) return null;
    return (await response.json()) as SimulateResponse;
  } catch {
    return null;
  }
}
