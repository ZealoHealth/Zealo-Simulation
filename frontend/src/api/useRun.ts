/**
 * The simulation run, shared by every page.
 *
 * A query keyed on the full scenario rather than a mutation, so all pages share one
 * cached run instead of each starting its own. Network membership, approval decisions
 * and every Settings value are part of that key: changing any of them must produce a
 * new run, or the comparison between modes would rest on different inputs.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { simulate } from "./client";
import { useFacilities } from "./hooks";
import { retryDelay, retryWhileWaking } from "./retry";
import { ApiError } from "./types";
import { buildScenarioRequest, DEFAULT_RULES, sameRules } from "../state/scenario";
import { useViewStore } from "../state/store";

export function useRun() {
  const setRunId = useViewStore((s) => s.setRunId);
  const setTotalDays = useViewStore((s) => s.setTotalDays);
  const scenario = useViewStore((s) => s.scenario);
  const networkOverrides = useViewStore((s) => s.networkOverrides);
  const approvalDecisions = useViewStore((s) => s.approvalDecisions);
  const facilities = useFacilities();

  const facilityIds = useMemo(
    () => (facilities.data?.facilities ?? []).map((f) => f.id),
    [facilities.data],
  );
  const request = useMemo(
    () => buildScenarioRequest({ scenario, networkOverrides, approvalDecisions }, facilityIds),
    [scenario, networkOverrides, approvalDecisions, facilityIds],
  );

  const query = useQuery({
    queryKey: ["run", request],
    queryFn: () => simulate(request),
    staleTime: Infinity,
    // Facility ids are only part of the request when rules differ from the defaults, so
    // the default run starts at once instead of waiting for the facility list.
    enabled: facilityIds.length > 0 || sameRules(scenario.rules, DEFAULT_RULES),
    // A refused run means inputs are missing, not that the request was flaky. Only retry while
    // the API is unreachable (asleep on the free plan and waking up).
    retry: retryWhileWaking,
    retryDelay,
  });

  useEffect(() => {
    if (query.data) {
      setRunId(query.data.run_id);
      setTotalDays(query.data.days);
    }
  }, [query.data, setRunId, setTotalDays]);

  return {
    run: query.data,
    isLoading: query.isLoading || facilities.isLoading,
    error: query.error instanceof ApiError ? query.error : null,
    missingInputs: query.error instanceof ApiError && query.error.isMissingInputs,
  };
}
