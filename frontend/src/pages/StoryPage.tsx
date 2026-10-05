/**
 * How it works: the home page.
 *
 * Hero (a still map of Gadag with one real transfer from the run), what the 2021-22
 * survey found, the three steps Zealo takes, the guided story, and the simulation's
 * results. Every figure comes from the run, the survey summary or the medicine list;
 * nothing is typed in by hand.
 */
import { useQueries } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { getFacilityRun } from "../api/client";
import { shortMedicineName } from "../api/format";
import { useFacilities, useMedicineRun, useMedicines } from "../api/hooks";
import type { Facility, FacilityRunResponse, GeoJsonBoundary, Medicine } from "../api/types";
import {
  heroCandidates,
  pickHeroTransfer,
  shelvesToCheck,
  type HeroTransfer,
} from "../components/home/heroTransfer";
import { InventoryMap } from "../components/map/InventoryMap";
import { pinHtml, type PinStatus } from "../components/map/icons";
import { pinStatusesForMedicine } from "../components/map/mapLogic";
import { MissingInputsNotice } from "../components/MissingInputsNotice";
import { ProvenanceBadge } from "../components/Provenance";
import { useStory } from "../components/story/useStory";
import { useViewStore } from "../state/store";
import { Chip, LogoMark } from "../ui";
import { buttonClass } from "../ui/buttonStyles";

const NO_FACILITIES: Facility[] = [];
const NO_MEDICINES: Medicine[] = [];

/** The survey items shown in the shelf matrix, by the survey's own item number. */
const MATRIX_ITEMS: Array<{ slNo: number; label: string }> = [
  { slNo: 60, label: "Paracetamol 500 mg tablet" },
  { slNo: 56, label: "Oral rehydration salts" },
  { slNo: 71, label: "Ringer lactate infusion" },
  { slNo: 79, label: "Sodium chloride 0.9% 500 ml" },
  { slNo: 11, label: "Amoxicillin and clavulanic acid 625 mg tablet" },
  { slNo: 55, label: "Ondansetron 2 mg/ml injection" },
  { slNo: 50, label: "Magnesium sulfate 500 mg/ml injection" },
  { slNo: 17, label: "Calcium gluconate 10% injection" },
  { slNo: 41, label: "Glyceryl trinitrate 0.5 mg sublingual" },
];
const SURVEYED_PHCS = 15;

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="shrink-0">
      <path
        d="M2 9 H14 M9.5 4.5 L14 9 L9.5 13.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M3 1.5 L12 7 L3 12.5 Z" fill="currentColor" />
    </svg>
  );
}

function LegendRow({ status, children }: { status: PinStatus; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block scale-75"
        dangerouslySetInnerHTML={{ __html: pinHtml("clinic", status) }}
      />
      {children}
    </li>
  );
}

/* ------------------------------------------------------------------ Hero */

function HeroMap({
  hero,
  facilities,
  boundary,
  labels,
  medicines,
}: {
  hero: HeroTransfer | null;
  facilities: Facility[];
  boundary: GeoJsonBoundary | null;
  labels: Map<string, string>;
  medicines: Medicine[];
}) {
  const runId = useViewStore((s) => s.runId);
  const mode = useViewStore((s) => s.mode);
  const event = hero?.event ?? null;
  const medicineRun = useMedicineRun(runId, event?.medicine_id ?? null, mode, event?.day ?? 0);
  const pins = useMemo(
    () => (medicineRun.data ? pinStatusesForMedicine(medicineRun.data.rows, facilities) : {}),
    [medicineRun.data, facilities],
  );
  const medicine = medicines.find((m) => m.id === event?.medicine_id);
  const events = useMemo(() => (event ? [event] : []), [event]);
  const left = hero?.daysLeft;

  return (
    <figure className="relative">
      <div className="relative aspect-[4/3] overflow-hidden rounded-[14px] border border-line bg-grid">
        <InventoryMap
          facilities={facilities}
          boundary={boundary}
          pins={pins}
          events={events}
          day={event?.day ?? 0}
          selectedFacilityId={null}
          onSelectFacility={() => {}}
          highlightedFacilityIds={null}
          interactive={false}
        />
        <ul className="absolute right-3 top-3 z-[1000] space-y-0.5 rounded-[10px] border border-line bg-surface px-3 py-2 text-[13px] text-ink-2 shadow-[var(--shadow-float)]">
          <LegendRow status="ok">In stock</LegendRow>
          <LegendRow status="low">Running low</LegendRow>
          <LegendRow status="out">Out</LegendRow>
        </ul>
      </div>

      {event && (
        <div className="relative z-[1001] mx-3 -mt-20 rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-lift)] sm:absolute sm:-bottom-9 sm:-left-6 sm:mx-0 sm:mt-0 sm:w-[320px]">
          <p className="font-bold text-ink">
            {medicine ? shortMedicineName(medicine.name, 36) : "A medicine"}
          </p>
          <p className="code text-xs text-muted">{event.medicine_id}</p>
          <dl className="mt-3 space-y-2 text-[15px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="font-bold text-ink">{labels.get(event.to_facility_id ?? "")}</dt>
              <dd>
                <Chip tone="out">
                  {left == null || left <= 0
                    ? "Out of stock"
                    : `Runs out in ${left} day${left === 1 ? "" : "s"}`}
                </Chip>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-ink-2">
                <span className="font-bold text-ink">
                  {labels.get(event.from_facility_id ?? "")}
                </span>
                {event.distance_km != null && `, ${event.distance_km.toFixed(1)} km away`}
              </dt>
              <dd>
                <Chip tone="scrub">Sends {event.quantity.toLocaleString()}</Chip>
              </dd>
            </div>
          </dl>
          <p className="mt-3 flex items-center gap-2 border-t border-line-soft pt-3 text-[15px] font-bold text-move">
            <ArrowIcon />
            Transfer placed, arrives day {event.day + 2}
          </p>
        </div>
      )}
      <figcaption className="mt-3 text-sm text-muted sm:mt-12 sm:pl-[310px]">
        {event
          ? `From the Gadag simulation, day ${event.day + 1}.`
          : "Facilities in Gadag taluk, from public records."}
      </figcaption>
    </figure>
  );
}

/* ---------------------------------------------------------------- Survey */

function RangeStrip({ low, average, high }: { low: number; average: number; high: number }) {
  const markers = [
    { value: low, label: `PHC 1: ${low.toFixed(2)}%`, bar: "bg-out", text: "text-out-text -top-6 -translate-x-1/2" },
    { value: average, label: `Average: ${average.toFixed(2)}%`, bar: "bg-ink", text: "text-ink top-11 -translate-x-1/2" },
    { value: high, label: `PHC 4: ${high.toFixed(2)}%`, bar: "bg-scrub", text: "text-scrub -top-6 -translate-x-full" },
  ];
  return (
    <figure
      className="mt-6"
      aria-label={`PHC availability ranged from ${low}% to ${high}%, with an average of ${average}%.`}
    >
      <div className="relative h-24" aria-hidden="true">
        <div className="absolute inset-x-0 top-9 h-3 rounded bg-grid" />
        <div className="absolute top-9 h-3 bg-stone" style={{ left: `${low}%`, width: `${high - low}%` }} />
        {markers.map((m) => (
          <div key={m.label} className="absolute top-6" style={{ left: `${m.value}%` }}>
            <span className={`absolute -ml-[2px] block h-9 w-1 rounded ${m.bar}`} />
            <span className={`absolute whitespace-nowrap text-sm font-bold ${m.text}`}>{m.label}</span>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[13px] text-muted" aria-hidden="true">
        <span>0%</span>
        <span>100%</span>
      </div>
    </figure>
  );
}

function ShelfMatrix({ medicines }: { medicines: Medicine[] }) {
  const bySl = new Map(
    medicines.filter((m) => m.survey_sl_no != null).map((m) => [m.survey_sl_no!, m]),
  );
  const rows = MATRIX_ITEMS.flatMap((item) => {
    const pct = bySl.get(item.slNo)?.survey_availability_pct;
    if (pct == null) return [];
    return [{ ...item, count: Math.round((pct / 100) * SURVEYED_PHCS) }];
  });
  return (
    <figure>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-2">
        <h3 className="text-lg font-bold text-ink">Which PHCs had it on the shelf</h3>
        <p className="flex items-center gap-3 text-[13px] text-ink-2">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-[15px] w-[15px] rounded-[3px] bg-scrub" />
            On the shelf
          </span>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-[15px] w-[15px] rounded-[3px] border-[1.5px] border-stone"
            />
            Not on the shelf
          </span>
        </p>
      </div>
      <ul>
        {rows.map((row) => (
          <li
            key={row.slNo}
            className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-soft py-2.5"
          >
            <span className="min-w-0 flex-1 basis-56 text-[15px] text-ink">{row.label}</span>
            <span className="flex gap-1" aria-hidden="true">
              {Array.from({ length: SURVEYED_PHCS }, (_, i) => (
                <span
                  key={i}
                  className={`h-[15px] w-[15px] rounded-[3px] ${
                    i < row.count ? "bg-scrub" : "border-[1.5px] border-stone"
                  }`}
                />
              ))}
            </span>
            <span className="tabular w-16 text-right text-[15px] font-bold text-ink">
              {row.count} of {SURVEYED_PHCS}
            </span>
          </li>
        ))}
      </ul>
      <figcaption className="mt-3 text-[13px] text-muted">
        Each square is one of the {SURVEYED_PHCS} PHCs. Filled means the medicine was on the
        shelf on the survey day. Order within a row is not the PHC number.
      </figcaption>
    </figure>
  );
}

const STEPS = [
  {
    n: 1,
    circle: "bg-scrub",
    title: "Zealo sees it coming",
    text: "It forecasts each medicine from what patients ask for, and spots a shelf that will run out before the next delivery arrives.",
  },
  {
    n: 2,
    circle: "bg-move",
    title: "A neighbour fills the gap",
    text: "The nearest member with more than it needs sends some across, without dropping below its own reorder point. Stock close to expiry goes to whoever will use it in time.",
  },
  {
    n: 3,
    circle: "bg-ink",
    title: "The manufacturer refills",
    text: "Zealo orders straight from the manufacturer, within the facility's approval limit. There is no warehouse in between. An express order goes out only when no neighbour can help.",
  },
];

/* ------------------------------------------------------------------ Page */

export function StoryPage() {
  const { run, facts, chapters, survey, error, missingInputs } = useStory();
  const facilitiesQuery = useFacilities();
  const medicines = useMedicines(true).data?.medicines ?? NO_MEDICINES;
  const facilities = facilitiesQuery.data?.facilities ?? NO_FACILITIES;
  const mode = useViewStore((s) => s.mode);
  const setStoryChapter = useViewStore((s) => s.setStoryChapter);
  const navigate = useNavigate();

  const labels = useMemo(
    () => new Map(facilities.map((f) => [f.id, f.display_label])),
    [facilities],
  );

  // The hero transfer: look at the receiving PHCs' shelves for the first few candidates.
  const candidates = useMemo(
    () => heroCandidates(run?.events[mode], facilities),
    [run, mode, facilities],
  );
  const toCheck = useMemo(() => shelvesToCheck(candidates), [candidates]);
  const shelfQueries = useQueries({
    queries: toCheck.map(({ facilityId, day }) => ({
      queryKey: ["facility-run", run?.run_id, facilityId, mode, day, null],
      queryFn: () => getFacilityRun(run!.run_id, facilityId, mode, day),
      enabled: Boolean(run),
      staleTime: Infinity,
    })),
  });
  const shelves = new Map<string, FacilityRunResponse>();
  shelfQueries.forEach((q, i) => {
    if (q.data) shelves.set(`${toCheck[i].facilityId}:${toCheck[i].day}`, q.data);
  });
  const hero = pickHeroTransfer(candidates, shelves);

  const startStory = (chapter = 0) => {
    setStoryChapter(chapter);
    navigate("/map");
  };

  const summary = run?.summaries.find((s) => s.mode === mode)?.metrics;
  const num = (v: unknown) => (typeof v === "number" ? v.toLocaleString() : "—");
  const gap = survey
    ? Math.round(survey.highest_phc.availability_pct - survey.lowest_phc.availability_pct)
    : null;

  return (
    <div className="h-full overflow-y-auto">
      {/* Hero */}
      <section className="mx-auto grid max-w-[1320px] items-center gap-12 px-4 pb-20 pt-12 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:pt-16">
        <div>
          <h1 className="max-w-[600px] text-[44px] font-bold leading-[1.04] tracking-[-0.025em] text-ink sm:text-[62px]">
            The medicine a patient needs is often a few kilometres away.
          </h1>
          <p className="mt-6 max-w-[34em] text-[20px] leading-relaxed text-ink-2">
            Zealo links the stock rooms of hospitals, primary health centres and clinics in a
            taluk. When one runs short, stock comes from a neighbour that has more than it needs.
            Refills go straight to manufacturers.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/map" className={buttonClass("primary", "lg")}>
              Open the Gadag map
            </Link>
            <button
              type="button"
              onClick={() => startStory()}
              disabled={chapters.length === 0}
              className={`${buttonClass("secondary", "lg")} disabled:opacity-45`}
            >
              <PlayIcon /> Watch the story
            </button>
          </div>
          <p className="mt-4">
            <a
              href="#how"
              className="inline-flex min-h-11 items-center text-[15px] font-bold text-scrub underline underline-offset-4 hover:text-scrub-dark"
            >
              See how a transfer works
            </a>
          </p>
          <p className="mt-4 max-w-[34em] text-[15px] text-muted">
            A proof of concept for Gadag taluk, Karnataka. Facility locations and medicine lists
            come from public records. Stock levels are simulated.
          </p>
        </div>
        <HeroMap
          hero={hero}
          facilities={facilities}
          boundary={facilitiesQuery.data?.boundary ?? null}
          labels={labels}
          medicines={medicines}
        />
      </section>

      {/* The problem, from the survey */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-[1320px] gap-12 px-4 py-16 sm:px-8 lg:grid-cols-2">
          <div>
            <h2 className="text-[32px] font-bold leading-tight tracking-[-0.02em] text-ink sm:text-[42px]">
              Gadag already shows the problem.
            </h2>
            {survey ? (
              <>
                <p className="mt-4 max-w-[36em] text-[17px] leading-relaxed text-ink-2">
                  Between {survey.period.replace(" to ", " and ")}, researchers walked into all{" "}
                  {survey.phcs_surveyed} primary health centres in Gadag taluk and checked{" "}
                  {survey.items_assessed} essential medicines on the shelf. On the day they
                  visited, the average PHC had {survey.overall_availability_pct.toFixed(1)}% of
                  them.
                </p>
                <RangeStrip
                  low={survey.lowest_phc.availability_pct}
                  average={survey.overall_availability_pct}
                  high={survey.highest_phc.availability_pct}
                />
                <p className="mt-4 max-w-[36em] text-[17px] text-ink-2">
                  Same taluk, same state supply system, and a {gap}-point gap between the best and
                  worst stocked centres.
                </p>
                <p className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
                  <ProvenanceBadge provenance="real" />
                  Tejesh S, Nagaveni SJ (2023), Cureus 15(5): e39341. CC BY 4.0.
                </p>
              </>
            ) : (
              <div className="skeleton mt-6 h-40" />
            )}
          </div>
          <ShelfMatrix medicines={medicines} />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-[1320px] scroll-mt-6 px-4 py-16 sm:px-8">
        <h2 className="text-[32px] font-bold leading-tight tracking-[-0.02em] text-ink sm:text-[42px]">
          What happens when stock runs low
        </h2>
        <p className="mt-4 max-w-[44em] text-[17px] leading-relaxed text-ink-2">
          Each facility sets its rules once: how many days of stock to hold and how large an
          order can go through without sign-off. After that, Zealo works through three steps every
          day.
        </p>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n} className="rounded-xl border border-line bg-surface p-6">
              <span
                aria-hidden="true"
                className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-white ${step.circle}`}
              >
                {step.n}
              </span>
              <h3 className="mt-4 text-[22px] font-bold leading-snug text-ink">
                <span className="sr-only">Step {step.n}: </span>
                {step.title}
              </h3>
              <p className="mt-2 text-[17px] leading-relaxed text-ink-2">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* The guided story */}
      {chapters.length > 0 && (
        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-[1320px] px-4 py-16 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-[32px] font-bold leading-tight tracking-[-0.02em] text-ink sm:text-[42px]">
                  Watch it happen on the map
                </h2>
                <p className="mt-3 max-w-[44em] text-[17px] text-ink-2">
                  A guided walk through the simulation, compared with the same facilities managing
                  stock on their own. Step through with the arrow keys or a presentation clicker.
                </p>
              </div>
              <button
                type="button"
                onClick={() => startStory()}
                className={buttonClass("primary", "lg")}
              >
                <PlayIcon /> Watch the story
              </button>
            </div>
            <ol className="mt-8 grid gap-x-8 md:grid-cols-2">
              {chapters.map((chapter, i) => (
                <li key={chapter.id} className="border-b border-line-soft">
                  <button
                    type="button"
                    onClick={() => startStory(i)}
                    className="flex min-h-11 w-full items-baseline gap-4 py-3 text-left hover:text-scrub"
                  >
                    <span className="tabular w-6 shrink-0 font-bold text-muted">{i + 1}</span>
                    <span>
                      <span className="block text-sm text-muted">{chapter.kicker}</span>
                      <span className="block text-[17px] font-bold text-ink">{chapter.title}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {/* Results */}
      <section className="bg-scrub text-white">
        <div className="mx-auto max-w-[1320px] px-4 py-16 sm:px-8">
          {missingInputs && error && <MissingInputsNotice detail={error.detail} />}
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="text-[32px] font-bold leading-tight tracking-[-0.02em] sm:text-[42px]">
                {run ? `${run.days} days in Gadag, simulated` : "Gadag, simulated"}
              </h2>
              <p className="mt-3 max-w-[44em] text-[17px] text-scrub-label">
                {facts?.facilityCount ?? facilities.length} real facility locations and their state
                medicine lists, with demand and stock estimated from public data.
              </p>
            </div>
            <Link to="/network" className={buttonClass("inverse", "lg")}>
              See the network
            </Link>
          </div>
          <dl className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                value:
                  typeof summary?.availability_rate === "number"
                    ? `${(summary.availability_rate * 100).toFixed(1)}%`
                    : "—",
                label: "of medicine-days in stock",
              },
              { value: num(summary?.transfers), label: "transfers between facilities" },
              {
                value: num(summary?.transfer_units),
                label: "units moved to where they were needed",
              },
              { value: num(summary?.expired_units), label: "units lost to expiry" },
            ].map((item) => (
              <div key={item.label} className="flex flex-col-reverse">
                <dt className="mt-1 text-[17px] text-scrub-label">{item.label}</dt>
                <dd className="tabular text-[56px] font-bold leading-none tracking-[-0.02em]">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-10 text-[15px] text-scrub-label">
            These are simulation results, not records from the facilities.{" "}
            <Link to="/sources" className="font-bold text-white underline underline-offset-4">
              How the simulation works
            </Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-[1320px] gap-8 px-4 py-12 sm:px-8 md:grid-cols-2">
          <div>
            <p className="flex items-center gap-2.5">
              <LogoMark />
              <span className="text-[22px] font-bold text-ink">Zealo</span>
            </p>
            <p className="mt-3 max-w-[34em] text-[15px] text-ink-2">
              Built by Shriyans Nayak and Sanjana Srinivas for the Rajiv Gandhi Entrepreneurship
              Program 2026&ndash;27.
            </p>
          </div>
          <ul className="space-y-1.5 text-sm text-muted">
            <li>Survey: Tejesh S, Nagaveni SJ (2023), Cureus 15(5): e39341, licensed CC BY 4.0.</li>
            <li>
              Medicine lists: Karnataka State Medical Supplies Corporation, Annual Indent
              2025&ndash;26.
            </li>
            <li>Map data &copy; OpenStreetMap contributors.</li>
            <li>Zealo gives no clinical or dosing advice. Medicines appear here only as stock.</li>
            <li>
              <Link to="/sources" className="font-bold text-scrub underline underline-offset-4">
                Data and methods
              </Link>
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
