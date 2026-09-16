/** Server state. Everything cached by TanStack Query; view state lives in Zustand. */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  getFacilities,
  getFacilityRun,
  getMedicineRun,
  getMedicines,
  getRedistribution,
  getSources,
  simulate,
} from "./client";
import type { Mode, ScenarioRequest } from "./types";

export const useFacilities = () =>
  useQuery({ queryKey: ["facilities"], queryFn: getFacilities, staleTime: Infinity });

export const useMedicines = (surveyLinkedOnly = true) =>
  useQuery({
    queryKey: ["medicines", surveyLinkedOnly],
    queryFn: () => getMedicines(surveyLinkedOnly),
    staleTime: Infinity,
  });

export const useSources = () =>
  useQuery({ queryKey: ["sources"], queryFn: getSources, staleTime: Infinity });

export const useSimulate = () => useMutation({ mutationFn: simulate });

export const useFacilityRun = (
  runId: string | null,
  facilityId: string | null,
  mode: Mode,
  day: number,
  /** Ask for one medicine's whole history, for the dashboard chart. */
  series?: string | null,
) =>
  useQuery({
    queryKey: ["facility-run", runId, facilityId, mode, day, series ?? null],
    queryFn: () => getFacilityRun(runId!, facilityId!, mode, day, series ?? undefined),
    enabled: Boolean(runId && facilityId),
  });

export const useRedistribution = (
  runId: string | null,
  mode: Mode,
  day: number,
  medicineId?: string | null,
) =>
  useQuery({
    queryKey: ["redistribution", runId, mode, day, medicineId ?? null],
    queryFn: () => getRedistribution(runId!, mode, day, medicineId ?? undefined),
    enabled: Boolean(runId),
  });

export const useMedicineRun = (
  runId: string | null,
  medicineId: string | null,
  mode: Mode,
  day: number,
) =>
  useQuery({
    queryKey: ["medicine-run", runId, medicineId, mode, day],
    queryFn: () => getMedicineRun(runId!, medicineId!, mode, day),
    enabled: Boolean(runId && medicineId),
  });

export type { ScenarioRequest };
