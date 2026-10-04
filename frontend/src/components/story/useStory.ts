/**
 * The story for the current run: its facts and chapters, shared by the pitch page
 * and the tour on the map. Uses the same cached run as every other page, so opening
 * the pitch page warms the map's run and the tour starts instantly.
 */
import { useMemo } from "react";
import { shortMedicineName } from "../../api/format";
import { useFacilities, useMedicines, useSurveySummary } from "../../api/hooks";
import { useRun } from "../../api/useRun";
import { buildChapters, storyFacts } from "./storyLogic";

export function useStory() {
  const { run, isLoading, error, missingInputs } = useRun();
  const facilities = useFacilities();
  const medicines = useMedicines(true);
  const survey = useSurveySummary();

  const facts = useMemo(() => (run ? storyFacts(run) : null), [run]);

  const chapters = useMemo(() => {
    if (!facts) return [];
    const labels = new Map(
      (facilities.data?.facilities ?? []).map((f) => [f.id, f.display_label]),
    );
    const names = new Map((medicines.data?.medicines ?? []).map((m) => [m.id, m.name]));
    return buildChapters(
      facts,
      {
        facility: (id) => labels.get(id) ?? "A facility",
        medicine: (id) => shortMedicineName(names.get(id) ?? "A medicine", 40),
      },
      survey.data?.overall_availability_pct ?? null,
    );
  }, [facts, facilities.data, medicines.data, survey.data]);

  return { run, facts, chapters, survey: survey.data, isLoading, error, missingInputs };
}
