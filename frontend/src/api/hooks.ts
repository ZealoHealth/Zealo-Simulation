/** Server state. Everything cached by TanStack Query; view state lives in Zustand. */
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  getDataStatus,
  getFacilities,
  getFacilityRun,
  getMedicineRun,
  getMedicines,
  getRedistribution,
  getSources,
  getSurveySummary,
  simulate,
} from "./client";
import { keepWhileOnlyDayChanges } from "./placeholder";
import type { Mode, ScenarioRequest } from "./types";

export const useFacilities = () =>
  useQuery({ queryKey: ["facilities"], queryFn: getFacilities, staleTime: Infinity });

export const useMedicines = (surveyLinkedOnly = true) =>
  useQuery({
    queryKey: ["medicines", surveyLinkedOnly],
    queryFn: () => getMedicines(surveyLinkedOnly),
    staleTime: Infinity,
  });

export const useDataStatus = () =>
  useQuery({ queryKey: ["data-status"], queryFn: getDataStatus, staleTime: 60_000 });

export const useSurveySummary = () =>
  useQuery({ queryKey: ["survey-summary"], queryFn: getSurveySummary, staleTime: Infinity });

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
) => {
  const queryKey = ["facility-run", runId, facilityId, mode, day, series ?? null];
  return useQuery({
    queryKey,
    queryFn: () => getFacilityRun(runId!, facilityId!, mode, day, series ?? undefined),
    enabled: Boolean(runId && facilityId),
    placeholderData: keepWhileOnlyDayChanges(queryKey, 4),
  });
};

export const useRedistribution = (
  runId: string | null,
  mode: Mode,
  day: number,
  medicineId?: string | null,
) => {
  const queryKey = ["redistribution", runId, mode, day, medicineId ?? null];
  return useQuery({
    queryKey,
    queryFn: () => getRedistribution(runId!, mode, day, medicineId ?? undefined),
    enabled: Boolean(runId),
    placeholderData: keepWhileOnlyDayChanges(queryKey, 3),
  });
};

export const useMedicineRun = (
  runId: string | null,
  medicineId: string | null,
  mode: Mode,
  day: number,
) => {
  const queryKey = ["medicine-run", runId, medicineId, mode, day];
  return useQuery({
    queryKey,
    queryFn: () => getMedicineRun(runId!, medicineId!, mode, day),
    enabled: Boolean(runId && medicineId),
    placeholderData: keepWhileOnlyDayChanges(queryKey, 4),
  });
};

export type { ScenarioRequest };
