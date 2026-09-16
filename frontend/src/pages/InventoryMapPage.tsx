/**
 * The inventory map: the site's primary view.
 *
 * Facilities load from the API and render immediately. The simulation is
 * requested separately, so the map is useful even when a run cannot be produced
 * -- which is the current state, since the backend refuses to invent the demand
 * inputs it is missing.
 */
import { useEffect, useMemo } from "react";
import { useFacilities, useFacilityRun, useMedicineRun, useMedicines, useSimulate } from "../api/hooks";
import { ApiError } from "../api/types";
import type { Facility, Medicine } from "../api/types";
import { Disclaimer } from "../components/Disclaimer";
import { EventFeed } from "../components/panels/EventFeed";
import { FacilityPanel } from "../components/panels/FacilityPanel";
import { InventoryMap } from "../components/map/InventoryMap";
import { Legend } from "../components/map/Legend";
import { MedicineSearch } from "../components/panels/MedicineSearch";
import { MissingInputsNotice } from "../components/MissingInputsNotice";
import { NetworkTotals } from "../components/NetworkTotals";
import { TimeControls } from "../components/TimeControls";
import {
  eventsForDay,
  filterFacilities,
  statusesByMedicine,
  statusesForDay,
} from "../components/map/mapLogic";
import { useViewStore } from "../state/store";

const SIMULATION_DAYS = 180;

// Stable empty arrays: `?? []` would allocate a new array every render and
// invalidate every memo that depends on it.
const NO_FACILITIES: Facility[] = [];
const NO_MEDICINES: Medicine[] = [];

export function InventoryMapPage() {
  const facilitiesQuery = useFacilities();
  const medicinesQuery = useMedicines(true);
  const simulation = useSimulate();

  const {
    mode,
    day,
    runId,
    filters,
    selectedFacilityId,
    selectedMedicineId,
    originFacilityId,
    setMode,
    setRunId,
    setTotalDays,
    selectFacility,
    selectMedicine,
    setOriginFacility,
    toggleLayer,
    setNetworkOnly,
    setRadiusKm,
  } = useViewStore();

  // Ask for a run once facilities are available. If the backend cannot build one,
  // the map still works and the reason is shown.
  useEffect(() => {
    if (!facilitiesQuery.data || simulation.isPending || simulation.data || simulation.error) return;
    simulation.mutate({ days: SIMULATION_DAYS, seed: 42 });
  }, [facilitiesQuery.data, simulation]);

  useEffect(() => {
    if (simulation.data) {
      setRunId(simulation.data.run_id);
      setTotalDays(simulation.data.days);
    }
  }, [simulation.data, setRunId, setTotalDays]);

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
    return statusesForDay(simulation.data?.timeline[mode], day);
  }, [selectedMedicineId, medicineRun.data, simulation.data, mode, day]);

  const highlighted = useMemo(() => {
    if (!selectedMedicineId || !medicineRun.data) return null;
    return new Set(medicineRun.data.rows.filter((r) => r.on_hand > 0).map((r) => r.facility_id));
  }, [selectedMedicineId, medicineRun.data]);

  const events = useMemo(
    () => eventsForDay(simulation.data?.events[mode], day),
    [simulation.data, mode, day],
  );

  const summary = simulation.data?.summaries.find((s) => s.mode === mode);
  const selectedFacility = facilities.find((f) => f.id === selectedFacilityId) ?? null;
  const hasRun = Boolean(simulation.data);
  const missingInputs = simulation.error instanceof ApiError && simulation.error.isMissingInputs;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-navy/10 bg-white px-4 py-2">
        <div>
          <h1 className="text-lg font-bold text-navy">
            Zealo &middot; <span className="font-normal">Gadag taluk inventory map</span>
          </h1>
          <Disclaimer className="max-w-3xl" />
        </div>
        <div
          className="flex items-center gap-1 rounded-lg bg-lavender p-1"
          role="group"
          aria-label="Simulation mode"
        >
          {(["without_zealo", "with_zealo"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded px-3 py-1.5 text-xs font-semibold ${
                mode === m ? "bg-purple text-white" : "text-navy/70"
              }`}
            >
              {m === "with_zealo" ? "With Zealo" : "Without Zealo"}
            </button>
          ))}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr_360px]">
        {/* Left: filters and medicine search */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-r border-navy/10 bg-white px-3 py-3">
          <section>
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy/50">
              Layers
            </h2>
            {(["government", "private", "pharmacy"] as const).map((layer) => (
              <label key={layer} className="flex items-center gap-2 py-0.5 text-sm capitalize">
                <input
                  type="checkbox"
                  checked={filters.layers[layer]}
                  onChange={() => toggleLayer(layer)}
                  className="accent-purple"
                />
                {layer === "pharmacy" ? "Pharmacies" : layer}
              </label>
            ))}
            <label className="mt-1 flex items-center gap-2 py-0.5 text-sm">
              <input
                type="checkbox"
                checked={filters.networkOnly}
                onChange={(e) => setNetworkOnly(e.target.checked)}
                className="accent-purple"
              />
              Zealo network members only
            </label>
            <p className="mt-1 text-[11px] text-navy/50" data-testid="facility-count">
              Showing {visible.length} of {facilities.length} facilities
            </p>
          </section>

          <section className="min-h-0 flex-1">
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
          </section>
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
              events={simulation.data?.events[mode]}
              day={day}
              selectedFacilityId={selectedFacilityId}
              onSelectFacility={selectFacility}
              highlightedFacilityIds={highlighted}
            />
          )}
          <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] max-w-xs">
            <div className="pointer-events-auto">
              <Legend hasRun={hasRun} />
            </div>
          </div>
        </div>

        {/* Right: totals, playback, events, facility detail */}
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-l border-navy/10 bg-white px-3 py-3">
          {missingInputs && simulation.error instanceof ApiError && (
            <MissingInputsNotice detail={simulation.error.detail} />
          )}
          {simulation.isPending && (
            <p className="rounded bg-lavender px-3 py-2 text-xs text-navy/60">
              Running the simulation&hellip; this takes a moment for 180 days.
            </p>
          )}
          <NetworkTotals summary={summary} />
          <TimeControls disabled={!hasRun} />
          <section className="min-h-0 flex-1 rounded-lg bg-lavender/50">
            <h2 className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-navy/50">
              What just happened
            </h2>
            <EventFeed events={events} />
          </section>
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
