/**
 * Client state: what the user is looking at, not what the server knows.
 *
 * Server data (facilities, medicines, runs) lives in TanStack Query. This store
 * holds only view state -- the selected day, mode, filters and selection -- so
 * playback can advance 60 times a second without touching the network.
 */
import { create } from "zustand";
import type { Mode } from "../api/types";

export type LayerKey = "government" | "private" | "pharmacy";

export interface MapFilters {
  layers: Record<LayerKey, boolean>;
  networkOnly: boolean;
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
  reset: () => void;
}

const INITIAL_FILTERS: MapFilters = {
  layers: { government: true, private: true, pharmacy: true },
  networkOnly: false,
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
  reset: () =>
    set({
      day: 0,
      playing: false,
      speed: DEFAULT_SPEED,
      selectedFacilityId: null,
      selectedMedicineId: null,
      originFacilityId: null,
      filters: INITIAL_FILTERS,
    }),
}));

export function clampDay(day: number, totalDays: number): number {
  if (totalDays <= 0) return 0;
  return Math.max(0, Math.min(Math.round(day), totalDays - 1));
}
