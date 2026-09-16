/**
 * The simulation run, shared by every page.
 *
 * Modelled as a query keyed on the scenario rather than a mutation, so the three
 * pages share one cached run instead of each kicking off its own 30-second
 * simulation on mount. Changing a setting changes the key and fetches a new run.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { simulate } from "./client";
import { ApiError } from "./types";
import type { ScenarioRequest } from "./types";
import { useViewStore } from "../state/store";

export const DEFAULT_SCENARIO: ScenarioRequest = { days: 180, seed: 42 };

export function useRun(base: ScenarioRequest = DEFAULT_SCENARIO) {
  const setRunId = useViewStore((s) => s.setRunId);
  const setTotalDays = useViewStore((s) => s.setTotalDays);
  const excluded = useViewStore((s) => s.excludedFacilityIds);
  const decisions = useViewStore((s) => s.approvalDecisions);

  // Network membership and approval decisions are part of the scenario, not a
  // view setting: changing either has to produce a new run, or the comparison
  // between modes would be against different inputs.
  const scenario: ScenarioRequest = {
    ...base,
    excluded_facility_ids: excluded,
    approval_decisions: decisions,
  };

  const query = useQuery({
    queryKey: ["run", scenario],
    queryFn: () => simulate(scenario),
    staleTime: Infinity,
    // A refused run means inputs are missing, not that the request was flaky.
    retry: (count, error) => !(error instanceof ApiError) && count < 1,
  });

  useEffect(() => {
    if (query.data) {
      setRunId(query.data.run_id);
      setTotalDays(query.data.days);
    }
  }, [query.data, setRunId, setTotalDays]);

  const missingInputs = query.error instanceof ApiError && query.error.isMissingInputs;

  return {
    run: query.data,
    isLoading: query.isLoading,
    error: query.error instanceof ApiError ? query.error : null,
    missingInputs,
  };
}
