/** Server state. Everything cached by TanStack Query; view state lives in Zustand. */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  getFacilities,
  getFacilityRun,
  getMedicineRun,
  getMedicines,
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
) =>
  useQuery({
    queryKey: ["facility-run", runId, facilityId, mode, day],
    queryFn: () => getFacilityRun(runId!, facilityId!, mode, day),
    enabled: Boolean(runId && facilityId),
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
