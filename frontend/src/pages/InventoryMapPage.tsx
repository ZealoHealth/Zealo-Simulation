/**
 * The Map page: the facilities of Gadag taluk, their stock on the day shown, and the
 * medicine moving between them.
 *
 * Facilities load from the API and render immediately; the simulation is requested
 * separately, so the map is useful even when a run cannot be produced. The guided
 * story takes over the map when it is open: full width, its own spotlight and camera.
 */
import { useMemo } from "react";
import { shortMedicineName } from "../api/format";
import { useFacilities, useFacilityRun, useMedicineRun, useMedicines } from "../api/hooks";
import type { Facility, Medicine } from "../api/types";
import { InventoryMap, MAX_ROUTES_DRAWN } from "../components/map/InventoryMap";
import { Legend } from "../components/map/Legend";
import {
  eventsForDay,
  filterFacilities,
  pinStatusesForDay,
  pinStatusesForMedicine,
  statusesForDay,
  transferLinesForDay,
} from "../components/map/mapLogic";
import { MissingInputsNotice } from "../components/MissingInputsNotice";
import { EventFeed } from "../components/panels/EventFeed";
import { FacilityRail } from "../components/panels/FacilityRail";
import { MedicineSearch } from "../components/panels/MedicineSearch";
import { StoryTour } from "../components/story/StoryTour";
import { chapterEvents } from "../components/story/storyLogic";
import { useStory } from "../components/story/useStory";
import { TimeControls } from "../components/TimeControls";
import { useViewStore } from "../state/store";
import { Button, Checkbox } from "../ui";

// Stable empty arrays: `?? []` would allocate a new array every render and
// invalidate every memo that depends on it.
const NO_FACILITIES: Facility[] = [];
const NO_MEDICINES: Medicine[] = [];

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 1.5 L12 7 L3 12.5 Z" fill="currentColor" />
    </svg>
  );
}

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
    toggleLayer,
    setRadiusKm,
    setStoryChapter,
    reset,
  } = useViewStore();

  const facilities = facilitiesQuery.data?.facilities ?? NO_FACILITIES;
  const medicines = medicinesQuery.data?.medicines ?? NO_MEDICINES;

  // Distances are measured from the selected facility.
  const originId = selectedFacilityId ?? originFacilityId;
  const origin = facilities.find((f) => f.id === originId) ?? null;
  const visible = useMemo(
    () => filterFacilities(facilities, filters, origin),
    [facilities, filters, origin],
  );

  const medicineRun = useMedicineRun(runId, selectedMedicineId, mode, day);
  const facilityRun = useFacilityRun(runId, selectedFacilityId, mode, day);
  const medicineView = Boolean(selectedMedicineId && medicineRun.data);

  const pins = useMemo(() => {
    if (selectedMedicineId && medicineRun.data) {
      return pinStatusesForMedicine(medicineRun.data.rows, facilities);
    }
    return pinStatusesForDay(statusesForDay(run?.timeline[mode], day), facilities);
  }, [selectedMedicineId, medicineRun.data, facilities, run, mode, day]);

  const chapter =
    storyChapter !== null && chapters.length
      ? chapters[Math.min(storyChapter, chapters.length - 1)]
      : null;
  const storyOn = Boolean(chapter && run);

  const highlighted = useMemo(
    () => (chapter?.highlight ? new Set(chapter.highlight) : null),
    [chapter],
  );
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

  const today = useMemo(() => {
    const all = run?.events[mode] ?? [];
    const onDay = all.filter((e) => e.day === day);
    return {
      feed: eventsForDay(all, day).filter((e) => e.day === day),
      transfers: onDay.filter(
        (e) => e.type === "relief_transfer" || e.type === "rebalance_transfer",
      ).length,
      express: onDay.filter((e) => e.type === "express_order").length,
      refills: onDay.filter((e) => e.type === "manufacturer_order").length,
      routes: transferLinesForDay(all, facilities, day, 0).length,
    };
  }, [run, mode, day, facilities]);

  const selectedFacility = facilities.find((f) => f.id === selectedFacilityId) ?? null;
  const selectedMedicine = medicines.find((m) => m.id === selectedMedicineId) ?? null;
  const hasRun = Boolean(run);
  const coverage = facilitiesQuery.data?.coverage;

  return (
    <div className="h-full overflow-y-auto xl:overflow-hidden">
      <div
        className={`grid gap-5 px-4 py-5 sm:px-6 xl:h-full xl:grid-rows-[minmax(0,1fr)] ${
          storyOn ? "" : "xl:grid-cols-[330px_minmax(0,1fr)_370px]"
        }`}
      >
        {/* Left rail: find a medicine, what to show, what the data covers. */}
        {!storyOn && (
          <aside
            aria-label="Map controls"
            className="rounded-xl border border-line bg-surface p-5 xl:min-h-0 xl:overflow-y-auto"
          >
            <MedicineSearch
              medicines={medicines}
              selectedMedicineId={selectedMedicineId}
              onSelect={selectMedicine}
              rows={medicineRun.data?.rows}
              facilities={facilities}
              originFacilityId={originId}
              radiusKm={filters.radiusKm}
              onRadiusChange={setRadiusKm}
              day={day}
            />

            <fieldset className="mt-6 border-t border-line-soft pt-5">
              <legend className="float-left mb-1 w-full text-lg font-bold text-ink">
                Show on the map
              </legend>
              <div className="clear-both">
                <Checkbox
                  checked={filters.layers.government}
                  onChange={() => toggleLayer("government")}
                  label="Government facilities"
                />
                <Checkbox
                  checked={filters.layers.private}
                  onChange={() => toggleLayer("private")}
                  label="Private hospitals and clinics"
                />
                <Checkbox
                  checked={filters.layers.pharmacy}
                  onChange={() => toggleLayer("pharmacy")}
                  label="Pharmacies"
                />
                {/* <Checkbox
                  checked={filters.networkOnly}
                  onChange={setNetworkOnly}
                  label="Zealo network only"
                />
                <Checkbox
                  checked={filters.verifiedOnly}
                  onChange={setVerifiedOnly}
                  label="Checked locations only"
                /> */}
              </div>
              <p className="mt-1 text-sm text-muted" data-testid="facility-count">
                Showing {visible.length} of {facilities.length} facilities.
              </p>
              <Button variant="ghost" onClick={reset} className="-ml-4 mt-1">
                Reset the map
              </Button>
            </fieldset>

            {coverage && (
              <section className="mt-6 border-t border-line-soft pt-5">
                <h2 className="mb-2 text-[15px] font-bold text-ink">What this map covers</h2>
                <div className="space-y-2 text-sm leading-relaxed text-ink-2">
                  {coverage.statements.map((s) => (
                    <p key={s}>{s}</p>
                  ))}
                </div>
              </section>
            )}
          </aside>
        )}

        {/* The map, with its legend and playback bar floating over it. */}
        <section
          aria-label="Map of Gadag taluk"
          className="relative h-[420px] overflow-hidden rounded-xl border border-line sm:h-[600px] xl:h-auto xl:min-h-0"
        >
          {facilitiesQuery.isLoading && (
            <p className="p-6 text-[15px] text-muted">Loading facilities&hellip;</p>
          )}
          {facilitiesQuery.isError && (
            <p className="p-6 text-[15px] text-out-text">
              Could not load facilities. Check that the backend is running, then reload.
            </p>
          )}
          {facilitiesQuery.data && (
            <InventoryMap
              facilities={visible}
              boundary={facilitiesQuery.data.boundary}
              pins={pins}
              events={mapEvents}
              day={day}
              selectedFacilityId={storyOn ? null : selectedFacilityId}
              onSelectFacility={selectFacility}
              highlightedFacilityIds={highlighted}
              focus={focus}
            />
          )}

          {!storyOn && (
            <>
              <div className="absolute right-3 top-3 z-[1000]">
                <Legend
                  hasRun={hasRun}
                  medicineName={
                    medicineView && selectedMedicine
                      ? shortMedicineName(selectedMedicine.name, 28)
                      : null
                  }
                />
              </div>
              {chapters.length > 0 && (
                <div className="absolute left-[68px] top-3 z-[1000]">
                  <Button
                    variant="secondary"
                    onClick={() => setStoryChapter(0)}
                    className="bg-surface shadow-[var(--shadow-float)]"
                  >
                    <PlayIcon />
                    Watch the story
                  </Button>
                </div>
              )}
              <div className="absolute inset-x-3 bottom-3 z-[1000]">
                <TimeControls disabled={!hasRun} floating showReset={false} />
              </div>
            </>
          )}
          {storyOn && run && <StoryTour chapters={chapters} run={run} />}
        </section>

        {/* Right rail: the selected facility, and what happened today. */}
        {!storyOn && (
          <div className="flex flex-col gap-5 xl:min-h-0 xl:overflow-y-auto">
            {missingInputs && runError && <MissingInputsNotice detail={runError.detail} />}
            {runLoading && (
              <p className="rounded-xl border border-line bg-surface p-5 text-[15px] text-muted">
                Running the simulation&hellip;
              </p>
            )}

            {selectedFacility ? (
              <FacilityRail
                facility={selectedFacility}
                run={facilityRun.data}
                facilities={facilities}
              />
            ) : (
              <section className="rounded-xl border border-line bg-surface p-5">
                <h2 className="text-lg font-bold text-ink">No facility selected</h2>
                <p className="mt-1 text-[15px] text-ink-2">
                  Select a pin on the map to see that facility&rsquo;s shelf, and what Zealo is
                  doing about anything running short.
                </p>
              </section>
            )}

            {hasRun && (
              <section
                aria-labelledby="today-heading"
                className="rounded-xl border border-line bg-surface p-5"
              >
                <h2 id="today-heading" className="text-lg font-bold text-ink">
                  Day {day + 1} in the network
                </h2>
                <p className="tabular mt-1 text-sm text-muted">
                  {today.transfers.toLocaleString()} transfers, {today.express.toLocaleString()}{" "}
                  express orders and {today.refills.toLocaleString()} routine refill orders.
                  {today.routes > MAX_ROUTES_DRAWN &&
                    ` The map draws the ${MAX_ROUTES_DRAWN} busiest of ${today.routes} routes.`}
                </p>
                <div className="mt-2">
                  <EventFeed
                    events={today.feed}
                    showDay={false}
                    empty={`Nothing moved on day ${day + 1}.`}
                  />
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
