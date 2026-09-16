/** Types mirroring the backend schemas in `backend/zealo/api/schemas.py`. */

/** How a number came to be known. Shown as a badge next to every figure. */
export type Provenance = "real" | "derived" | "estimated" | "unknown";

export type FacilityStatus = "green" | "amber" | "red";

export type Mode = "without_zealo" | "with_zealo";

export interface Facility {
  id: string;
  display_label: string;
  facility_type: string;
  ownership: string;
  lat: number;
  lon: number;
  beds: number | null;
  in_network: boolean;
  /** False until a human has checked the location and type. */
  verified: boolean;
  review_flags: string[];
  source_ids: string[];
  retrieved: string;
  provenance: Record<string, Provenance>;
}

export interface FacilitiesResponse {
  facilities: Facility[];
  boundary: GeoJsonBoundary | null;
  attribution: string;
  disclaimer: string;
  caveats: string[];
}

export interface GeoJsonBoundary {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: { type: "Polygon"; coordinates: number[][][] };
  }>;
}

export interface Medicine {
  id: string;
  drug_code: string;
  name: string;
  drug_type: string;
  therapeutic_group: string;
  levels: string[];
  indent_qty: number | null;
  provenance: Provenance;
  survey_availability_pct: number | null;
  survey_essentiality: string | null;
  match_status: string | null;
}

export interface MedicinesResponse {
  medicines: Medicine[];
  survey_linked_count: number;
  pending_review_count: number;
  disclaimer: string;
  caveats: string[];
}

export interface Source {
  id: string;
  title: string;
  publisher: string;
  url: string | null;
  licence: string;
  attribution: string | null;
  what_was_taken: string;
  retrieved: string | null;
  access: "automated" | "manual" | "pending";
  limitations: string[];
}

export interface SourcesResponse {
  sources: Source[];
  disclaimer: string;
}

export interface ScenarioRequest {
  days?: number;
  seed?: number;
  demand_scale?: number;
  lead_time_days?: number;
  express_lead_time_days?: number;
  min_shelf_life_days?: number;
  near_expiry_share?: number;
  excluded_facility_ids?: string[];
  approval_decisions?: Record<string, string>;
}

export interface DayStatus {
  day: number;
  status: Record<string, FacilityStatus>;
  availability_rate: number;
}

export interface SimulationEvent {
  day: number;
  type: string;
  medicine_id: string;
  message: string;
  facility_id: string | null;
  from_facility_id: string | null;
  to_facility_id: string | null;
  quantity: number;
  /** Null while no public unit price source is confirmed. */
  value: number | null;
  distance_km: number | null;
}

export interface ModeSummary {
  mode: Mode;
  metrics: Record<string, number | null | boolean>;
}

export interface SimulateResponse {
  run_id: string;
  days: number;
  seed: number;
  summaries: ModeSummary[];
  timeline: Record<Mode, DayStatus[]>;
  events: Record<Mode, SimulationEvent[]>;
  disclaimer: string;
  caveats: string[];
}

export interface FacilityMedicineRow {
  medicine_id: string;
  name: string;
  therapeutic_group: string;
  on_hand: number;
  demand: number;
  dispensed: number;
  unmet: number;
  forecast: number;
  days_of_cover: number | null;
  next_expiry_day: number | null;
  status: FacilityStatus;
}

export interface FacilityRunResponse {
  run_id: string;
  mode: Mode;
  day: number;
  facility_id: string;
  display_label: string;
  facility_type: string;
  in_network: boolean;
  status: FacilityStatus;
  medicines: FacilityMedicineRow[];
  events: SimulationEvent[];
  expiry_alerts: ExpiryAlert[];
  series: MedicineSeries | null;
  disclaimer: string;
}

export interface MedicineSeries {
  medicine_id: string;
  name: string;
  days: number[];
  on_hand: number[];
  demand: number[];
  dispensed: number[];
  unmet: number[];
  forecast: number[];
}

export interface ExpiryAlert {
  medicine_id: string;
  name: string;
  on_hand: number;
  expires_on_day: number;
  days_until_expiry: number;
  bucket: 30 | 60 | 90;
}

export interface TransferPoint {
  day: number;
  transfers: number;
  units: number;
  distance_km: number;
}

export interface MedicineImpact {
  medicine_id: string;
  name: string;
  relief_transfers: number;
  relief_units: number;
  rebalance_transfers: number;
  rebalance_units: number;
}

export interface FacilityBalance {
  facility_id: string;
  display_label: string;
  medicine_id: string;
  on_hand: number;
  days_of_cover: number | null;
  position: "surplus" | "short" | "balanced";
}

export interface RedistributionResponse {
  run_id: string;
  mode: Mode;
  day: number;
  transfers_over_time: TransferPoint[];
  top_medicines: MedicineImpact[];
  balances: FacilityBalance[];
  totals: Record<string, number | null>;
  disclaimer: string;
  caveats: string[];
}

export interface MedicineDayRow {
  facility_id: string;
  display_label: string;
  on_hand: number;
  days_of_cover: number | null;
  next_expiry_day: number | null;
  status: FacilityStatus;
}

export interface MedicineAtFacilitiesResponse {
  run_id: string;
  mode: Mode;
  day: number;
  medicine_id: string;
  rows: MedicineDayRow[];
  disclaimer: string;
}

/**
 * Why a simulation could not be run.
 *
 * `missing_demand_inputs` is not a failure: the backend refuses to invent
 * population figures or PHC opening stock, so the UI explains what is needed
 * rather than showing a fabricated run.
 */
export interface ApiErrorDetail {
  error: string;
  message: string;
  missing?: string[];
  requests?: string[];
  run_id?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly detail: ApiErrorDetail;

  constructor(status: number, detail: ApiErrorDetail) {
    super(detail.message ?? `Request failed with ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }

  /** True when the backend is missing real-world inputs, not broken. */
  get isMissingInputs(): boolean {
    return this.detail.error === "missing_demand_inputs";
  }

  /** True when a cached run has been evicted and the client should re-run. */
  get isRunMissing(): boolean {
    return this.detail.error === "run_not_found";
  }
}
