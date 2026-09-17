/**
 * Client state: what the user is looking at, not what the server knows.
 *
 * Server data (facilities, medicines, runs) lives in TanStack Query. This store
 * holds only view state -- the selected day, mode, filters and selection -- so
 * playback can advance 60 times a second without touching the network.
 */
import { create } from "zustand";
import type { Mode } from "../api/types";
import { DEFAULT_SCENARIO, type ScenarioSettings, type ShareableState } from "./scenario";

export type LayerKey = "government" | "private" | "pharmacy";

export interface MapFilters {
  layers: Record<LayerKey, boolean>;
  networkOnly: boolean;
  verifiedOnly: boolean;
  /** Radius filter in km, applied around the facility used as the search origin. */
  radiusKm: number | null;
}

export interface ViewState {
  mode: Mode;
  day: number;
  playing: boolean;
  /** Simulated days advanced per second of real time. */
  speed: number;
  totalDays: number;
  runId: string | null;
  selectedFacilityId: string | null;
  selectedMedicineId: string | null;
  /** Facility the "nearest first" medicine search measures distance from. */
  originFacilityId: string | null;
  filters: MapFilters;
  /**
   * Network membership chosen by the user, overriding each facility's default
   * (pharmacies and the Railway Hospital start outside). Part of the scenario, so a
   * change produces a new run.
   */
  networkOverrides: Record<string, boolean>;
  dataStatusOpen: boolean;
  /** The committed scenario. Changing it changes the run. */
  scenario: ScenarioSettings;
  /** "<day>:<facility>:<medicine>" -> approve | reject. Also part of the scenario. */
  approvalDecisions: Record<string, "approve" | "reject">;

  setMode: (mode: Mode) => void;
  setDay: (day: number) => void;
  stepDay: (delta: number) => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
  setTotalDays: (days: number) => void;
  setRunId: (runId: string | null) => void;
  selectFacility: (id: string | null) => void;
  selectMedicine: (id: string | null) => void;
  setOriginFacility: (id: string | null) => void;
  toggleLayer: (layer: LayerKey) => void;
  setNetworkOnly: (value: boolean) => void;
  setRadiusKm: (km: number | null) => void;
  setNetworkMembership: (facilityId: string, inNetwork: boolean, defaultValue: boolean) => void;
  setVerifiedOnly: (value: boolean) => void;
  setDataStatusOpen: (open: boolean) => void;
  setScenario: (scenario: ScenarioSettings) => void;
  hydrate: (state: ShareableState) => void;
  resetScenario: () => void;
  decideApproval: (key: string, decision: "approve" | "reject") => void;
  reset: () => void;
}

const INITIAL_FILTERS: MapFilters = {
  layers: { government: true, private: true, pharmacy: true },
  networkOnly: false,
  verifiedOnly: false,
  radiusKm: null,
};

export const DEFAULT_SPEED = 4;

export const useViewStore = create<ViewState>((set) => ({
  mode: "with_zealo",
  day: 0,
  playing: false,
  speed: DEFAULT_SPEED,
  totalDays: 0,
  runId: null,
  selectedFacilityId: null,
  selectedMedicineId: null,
  originFacilityId: null,
  filters: INITIAL_FILTERS,
  networkOverrides: {},
  dataStatusOpen: false,
  scenario: DEFAULT_SCENARIO,
  approvalDecisions: {},

  setMode: (mode) => set({ mode }),
  setDay: (day) => set((s) => ({ day: clampDay(day, s.totalDays) })),
  stepDay: (delta) => set((s) => ({ day: clampDay(s.day + delta, s.totalDays) })),
  play: () => set({ playing: true }),
  pause: () => set({ playing: false }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setSpeed: (speed) => set({ speed }),
  setTotalDays: (totalDays) =>
    set((s) => ({ totalDays, day: clampDay(s.day, totalDays) })),
  setRunId: (runId) => set({ runId }),
  selectFacility: (selectedFacilityId) => set({ selectedFacilityId }),
  selectMedicine: (selectedMedicineId) => set({ selectedMedicineId }),
  setOriginFacility: (originFacilityId) => set({ originFacilityId }),
  toggleLayer: (layer) =>
    set((s) => ({
      filters: {
        ...s.filters,
        layers: { ...s.filters.layers, [layer]: !s.filters.layers[layer] },
      },
    })),
  setNetworkOnly: (networkOnly) =>
    set((s) => ({ filters: { ...s.filters, networkOnly } })),
  setRadiusKm: (radiusKm) => set((s) => ({ filters: { ...s.filters, radiusKm } })),
  setNetworkMembership: (facilityId, inNetwork, defaultValue) =>
    set((s) => {
      // Store only departures from the default, so the scenario key stays minimal.
      const next = { ...s.networkOverrides };
      if (inNetwork === defaultValue) delete next[facilityId];
      else next[facilityId] = inNetwork;
      return { networkOverrides: next };
    }),
  setVerifiedOnly: (verifiedOnly) =>
    set((s) => ({ filters: { ...s.filters, verifiedOnly } })),
  setDataStatusOpen: (dataStatusOpen) => set({ dataStatusOpen }),
  setScenario: (scenario) => set({ scenario, day: 0, playing: false }),
  hydrate: ({ scenario, networkOverrides, approvalDecisions }) =>
    set({ scenario, networkOverrides, approvalDecisions, day: 0, playing: false }),
  resetScenario: () =>
    set({
      scenario: DEFAULT_SCENARIO,
      networkOverrides: {},
      approvalDecisions: {},
      day: 0,
      playing: false,
    }),
  decideApproval: (key, decision) =>
    set((s) => ({ approvalDecisions: { ...s.approvalDecisions, [key]: decision } })),
  reset: () =>
    set({
      day: 0,
      playing: false,
      speed: DEFAULT_SPEED,
      selectedFacilityId: null,
      selectedMedicineId: null,
      originFacilityId: null,
      filters: INITIAL_FILTERS,
      networkOverrides: {},
      approvalDecisions: {},
    }),
}));

export function clampDay(day: number, totalDays: number): number {
  if (totalDays <= 0) return 0;
  return Math.max(0, Math.min(Math.round(day), totalDays - 1));
}
