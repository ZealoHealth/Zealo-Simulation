/**
 * The inventory map: the site's primary view.
 *
 * Facilities load from the API and render immediately. The simulation is
 * requested separately, so the map is useful even when a run cannot be produced
 * -- which is the current state, since the backend refuses to invent the demand
 * inputs it is missing.
 */
import { useMemo } from "react";
import { useFacilities, useFacilityRun, useMedicineRun, useMedicines } from "../api/hooks";
import type { Facility, Medicine } from "../api/types";
import { StoryLauncher, StoryTour } from "../components/story/StoryTour";
import { chapterEvents } from "../components/story/storyLogic";
import { useStory } from "../components/story/useStory";
import { EventFeed } from "../components/panels/EventFeed";
import { FacilityPanel } from "../components/panels/FacilityPanel";
import { InventoryMap } from "../components/map/InventoryMap";
import { Legend } from "../components/map/Legend";
import { MedicineSearch } from "../components/panels/MedicineSearch";
import { MissingInputsNotice } from "../components/MissingInputsNotice";
import { NetworkTotals } from "../components/NetworkTotals";
import { Card, CardTitle, Checkbox } from "../ui";
import { TimeControls } from "../components/TimeControls";
import {
  eventsForDay,
  filterFacilities,
  statusesByMedicine,
  statusesForDay,
} from "../components/map/mapLogic";
import { useViewStore } from "../state/store";

// Stable empty arrays: `?? []` would allocate a new array every render and
// invalidate every memo that depends on it.
const NO_FACILITIES: Facility[] = [];
const NO_MEDICINES: Medicine[] = [];

export function InventoryMapPage() {
  const facilitiesQuery = useFacilities();
  const medicinesQuery = useMedicines(true);
  const { run, chapters, isLoading: runLoading, error: runError, missingInputs } = useStory();

  const {
    mode,
    day,
    runId,
    storyChapter,
    filters,
    selectedFacilityId,
    selectedMedicineId,
    originFacilityId,
    selectFacility,
    selectMedicine,
    setOriginFacility,
    toggleLayer,
    setNetworkOnly,
    setVerifiedOnly,
    setRadiusKm,
  } = useViewStore();

  const facilities = facilitiesQuery.data?.facilities ?? NO_FACILITIES;
  const medicines = medicinesQuery.data?.medicines ?? NO_MEDICINES;

  const origin = facilities.find((f) => f.id === originFacilityId) ?? null;
  const visible = useMemo(
    () => filterFacilities(facilities, filters, origin),
    [facilities, filters, origin],
  );

  const medicineRun = useMedicineRun(runId, selectedMedicineId, mode, day);
  const facilityRun = useFacilityRun(runId, selectedFacilityId, mode, day);

  const statuses = useMemo(() => {
    if (selectedMedicineId && medicineRun.data) return statusesByMedicine(medicineRun.data.rows);
    return statusesForDay(run?.timeline[mode], day);
  }, [selectedMedicineId, medicineRun.data, run, mode, day]);

  // The story takes over the map: full width, its own spotlight and camera.
  const chapter =
    storyChapter !== null && chapters.length
      ? chapters[Math.min(storyChapter, chapters.length - 1)]
      : null;
  const storyOn = Boolean(chapter && run);

  const highlighted = useMemo(() => {
    if (chapter) return chapter.highlight ? new Set(chapter.highlight) : null;
    if (!selectedMedicineId || !medicineRun.data) return null;
    return new Set(medicineRun.data.rows.filter((r) => r.in_stock).map((r) => r.facility_id));
  }, [chapter, selectedMedicineId, medicineRun.data]);

  // A chapter decides which movements the map draws; outside it, the whole day's.
  const mapEvents = useMemo(
    () => (chapter ? chapterEvents(chapter, run?.events[mode]) : run?.events[mode]),
    [chapter, run, mode],
  );

  const focus = chapter
    ? chapter.zoom && chapter.highlight?.length
      ? { facilityIds: chapter.highlight }
      : ("taluk" as const)
    : undefined;

  const events = useMemo(
    () => eventsForDay(run?.events[mode], day),
    [run, mode, day],
  );

  const summary = run?.summaries.find((s) => s.mode === mode);
  const selectedFacility = facilities.find((f) => f.id === selectedFacilityId) ?? null;
  const hasRun = Boolean(run);
  
  return (
    <div className="flex h-full flex-col">
      <div
        className={`grid h-full min-h-0 ${storyOn ? "grid-cols-1" : "grid-cols-[320px_1fr_380px]"}`}
      >
        {/* Left: filters and medicine search */}
        <div
          className={`min-h-0 flex-col gap-3 overflow-y-auto bg-surface-sunken px-3 py-3 ${
            storyOn ? "hidden" : "flex"
          }`}
        >
          <Card>
            <CardTitle hint={`Showing ${visible.length} of ${facilities.length} facilities`}>
              Layers
            </CardTitle>
            {(["government", "private", "pharmacy"] as const).map((layer) => (
              <Checkbox
                key={layer}
                checked={filters.layers[layer]}
                onChange={() => toggleLayer(layer)}
                label={
                  <span className="capitalize">
                    {layer === "pharmacy" ? "Pharmacies" : layer}
                  </span>
                }
              />
            ))}
            <Checkbox
              checked={filters.networkOnly}
              onChange={setNetworkOnly}
              label="Zealo network members only"
            />
            <Checkbox
              checked={filters.verifiedOnly}
              onChange={setVerifiedOnly}
              label="Verified only"
            />
            <p className="sr-only" data-testid="facility-count">
              Showing {visible.length} of {facilities.length} facilities
            </p>
          </Card>

          {facilitiesQuery.data?.coverage && (
            <Card>
              <CardTitle>About this map&rsquo;s data</CardTitle>
              <ul className="space-y-1.5 text-[11px] leading-relaxed text-ink-muted">
                {facilitiesQuery.data.coverage.statements.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="flex min-h-0 flex-1 flex-col">
            <MedicineSearch
              medicines={medicines}
              selectedMedicineId={selectedMedicineId}
              onSelect={selectMedicine}
              rows={medicineRun.data?.rows}
              facilities={facilities}
              originFacilityId={originFacilityId}
              radiusKm={filters.radiusKm}
              onRadiusChange={setRadiusKm}
            />
          </Card>
        </div>

        {/* Centre: the map */}
        <div className="relative min-h-0">
          {facilitiesQuery.isLoading && (
            <p className="p-6 text-sm text-navy/60">Loading facilities&hellip;</p>
          )}
          {facilitiesQuery.isError && (
            <p className="p-6 text-sm text-status-red">
              Could not load facilities. Is the backend running?
            </p>
          )}
          {facilitiesQuery.data && (
            <InventoryMap
              facilities={visible}
              boundary={facilitiesQuery.data.boundary}
              statuses={statuses}
              events={mapEvents}
              day={day}
              selectedFacilityId={selectedFacilityId}
              onSelectFacility={selectFacility}
              highlightedFacilityIds={highlighted}
              focus={focus}
              cluster={!storyOn}
            />
          )}
          {/* The story panel takes the legend's corner; chapter 1 explains the colours. */}
          <div
            className={`pointer-events-none absolute bottom-3 left-3 z-[1000] max-w-xs ${
              storyOn ? "hidden" : ""
            }`}
          >
            <div className="pointer-events-auto">
              <Legend hasRun={hasRun} />
            </div>
          </div>
          {storyOn && run && <StoryTour chapters={chapters} run={run} />}
          {!storyOn && chapters.length > 0 && (
            <div className="absolute right-3 top-3 z-[1000]">
              <StoryLauncher />
            </div>
          )}
        </div>

        {/* Right: totals, playback, events, facility detail */}
        <div
          className={`min-h-0 flex-col gap-3 overflow-y-auto bg-surface-sunken px-3 py-3 ${
            storyOn ? "hidden" : "flex"
          }`}
        >
          {missingInputs && runError && <MissingInputsNotice detail={runError.detail} />}
          {runLoading && (
            <Card>
              <p className="text-xs text-ink-muted">
                Running the simulation&hellip; this takes a moment for 180 days.
              </p>
            </Card>
          )}
          {summary && run && (
            <Card>
              <CardTitle hint={`All ${run.days} days. The Network page counts up to the day shown.`}>
                Whole run
              </CardTitle>
              <NetworkTotals summary={summary} />
            </Card>
          )}
          <Card padded={false} className="p-2.5">
            <TimeControls disabled={!hasRun} />
          </Card>
          <Card padded={false} className="flex min-h-0 flex-1 flex-col">
            <h2 className="px-3 pt-3 text-sm font-semibold tracking-tight text-ink">
              What just happened
            </h2>
            <EventFeed events={events} />
          </Card>
        </div>
      </div>

      {selectedFacility && (
        <div className="fixed right-0 top-0 z-[1100] h-full w-[380px]">
          <FacilityPanel
            facility={selectedFacility}
            run={facilityRun.data}
            medicines={medicines}
            onClose={() => selectFacility(null)}
            onUseAsOrigin={() => setOriginFacility(selectedFacility.id)}
          />
        </div>
      )}
    </div>
  );
}

