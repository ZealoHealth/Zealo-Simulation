/**
 * The pitch page: the landing page for a demo.
 *
 * It tells the story in four beats -- the real problem, how Zealo works, what the
 * simulation shows, and the guided tour -- and every number on it is either a
 * published survey figure (badged Real) or computed from the run (badged
 * Estimated). Nothing is written in by hand, so the page cannot overstate the run.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { MissingInputsNotice } from "../components/MissingInputsNotice";
import { ProvenanceBadge } from "../components/Provenance";
import { pct, reduction, type StoryFacts } from "../components/story/storyLogic";
import { useStory } from "../components/story/useStory";
import { useViewStore } from "../state/store";
import { Button } from "../ui";
import { prefersReducedMotion } from "../ui/motion";

const COUNT_MS = 1100;

/** A number that counts up once when it first appears. */
function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const reduced = prefersReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      setShown(value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduced]);
  return <span className="tabular">{format(reduced ? value : shown)}</span>;
}

const whole = (n: number) => Math.round(n).toLocaleString();
const oneDecimal = (n: number) => `${n.toFixed(1)}%`;

function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p
      className={`text-[11px] font-bold uppercase tracking-[0.14em] ${
        light ? "text-coral" : "text-purple"
      }`}
    >
      {children}
    </p>
  );
}

function SectionTitle({
  eyebrow,
  title,
  lede,
}: {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
}) {
  return (
    <header className="max-w-3xl">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2 className="mt-2 text-3xl font-extrabold leading-tight tracking-tight text-ink md:text-4xl">
        {title}
      </h2>
      {lede && <p className="mt-3 text-base leading-relaxed text-ink-muted">{lede}</p>}
    </header>
  );
}

export function StoryPage() {
  const { facts, chapters, survey, isLoading, error, missingInputs } = useStory();
  const setStoryChapter = useViewStore((s) => s.setStoryChapter);
  const navigate = useNavigate();

  const startStory = (chapter = 0) => {
    setStoryChapter(chapter);
    navigate("/map");
  };
  const ready = chapters.length > 0;

  return (
    <div className="h-full overflow-y-auto">
      {/* ------------------------------------------------------------ Hero */}
      <section className="hero-surface relative overflow-hidden text-white">
        <div className="dot-grid absolute inset-0" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-16 md:py-20 lg:grid-cols-[1.25fr_1fr] lg:items-center">
          <div className="rise">
            <Eyebrow light>Gadag taluk, Karnataka &middot; proof of concept</Eyebrow>
            <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
              The medicine a patient needs is often a few kilometres away.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/75">
              Zealo is a shared inventory layer for hospitals, clinics and PHCs. It moves stock
              between neighbours before it runs out, and refills directly from manufacturers.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button variant="danger" size="lg" onClick={() => startStory()} disabled={!ready}>
                &#9654; {ready ? "Start the story" : "Preparing the simulation…"}
              </Button>
              <Button variant="inverse" size="lg" onClick={() => navigate("/map")}>
                Explore the live map
              </Button>
            </div>
          </div>

          <HeroResults facts={facts} loading={isLoading} />
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-20 px-6 py-16">
        {/* ------------------------------------------------------ Problem */}
        <section className="space-y-8">
          <SectionTitle
            eyebrow="The problem"
            title="Public health facilities run short of essential medicines"
            lede="Each facility sees only its own shelves. A medicine can run out at one while the same medicine sits unused at another down the road, and the gap waits for the next order."
          />
          {survey ? (
            <>
              <div className="grid gap-4 md:grid-cols-3">
                <ProblemStat
                  value={<CountUp value={survey.overall_availability_pct} format={oneDecimal} />}
                  label={`of essential medicines in stock across Gadag's ${survey.phcs_surveyed} PHCs`}
                />
                <ProblemStat
                  value={<CountUp value={survey.lowest_phc.availability_pct} format={oneDecimal} />}
                  label="at the worst-stocked PHC: fewer than half its medicines"
                />
                <ProblemStat
                  value={<CountUp value={survey.unavailable_everywhere.length} format={whole} />}
                  label={`of ${survey.items_assessed} medicines missing at every PHC surveyed`}
                />
              </div>
              <AvailabilityGauge value={survey.overall_availability_pct} />
              <p className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
                <ProvenanceBadge provenance="real" />
                Tejesh S, Nagaveni SJ (2023), <em>Cureus</em> 15(5): e39341. Survey of{" "}
                {survey.phcs_surveyed} PHCs, {survey.period}.
              </p>
            </>
          ) : (
            <div className="grid gap-4 md:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-32" />
              ))}
            </div>
          )}
        </section>

        {/* -------------------------------------------------- How it works */}
        <section className="space-y-8">
          <SectionTitle
            eyebrow="How Zealo works"
            title="One view of every shelf in the network"
            lede="Facilities join once and set their own rules. Zealo does the watching, every day."
          />
          <ol className="grid gap-4 md:grid-cols-3">
            <Step
              n={1}
              title="See every shelf"
              icon={<IconEye />}
              text="Members share their stock levels, so Zealo knows where every medicine is and how many days each facility has left."
            />
            <Step
              n={2}
              title="Move it before it runs out"
              icon={<IconSwap />}
              text="A facility about to run short gets stock from the nearest member with surplus. Donors never drop below their own reorder point."
            />
            <Step
              n={3}
              title="Refill from the source"
              icon={<IconFactory />}
              text="Routine refills go directly to the manufacturer. An express order is placed only when no neighbour can help."
            />
          </ol>
          <p className="rounded-xl bg-lavender px-5 py-3 text-sm font-semibold text-navy">
            No warehouses. No distributors. Stock moves facility to facility, or straight from
            the manufacturer.
          </p>
        </section>

        {/* ------------------------------------------------------- Results */}
        <section className="space-y-8">
          <SectionTitle
            eyebrow="What 180 days look like"
            title="The same facilities, with and without the network"
            lede={
              <>
                We simulated {facts?.facilityCount ?? 15} real facilities in Gadag for{" "}
                {facts?.totalDays ?? 180} days, twice: once with each facility on its own, once
                as a Zealo network. Same demand, same opening stock. Only the network differs.
              </>
            }
          />
          {missingInputs && error && <MissingInputsNotice detail={error.detail} />}
          {facts ? (
            <ResultsGrid facts={facts} />
          ) : (
            !missingInputs && (
              <div className="grid gap-4 md:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="skeleton h-40" />
                ))}
              </div>
            )
          )}
          <p className="flex flex-wrap items-center gap-2 text-xs text-ink-subtle">
            <ProvenanceBadge provenance="estimated" />
            Simulated. Facility locations and medicine lists are real; stock levels and demand are
            modelled from public data. Units only, no prices.
            <Link to="/sources" className="font-semibold text-purple hover:underline">
              How each number is made &rarr;
            </Link>
          </p>
        </section>

        {/* --------------------------------------------------------- Story */}
        <section className="space-y-8">
          <SectionTitle
            eyebrow="The story"
            title="Watch it happen on the map"
            lede="A guided walk through the run, chapter by chapter. Use the arrow keys or a presentation clicker to step through."
          />
          {ready ? (
            <ol className="grid gap-3 md:grid-cols-2">
              {chapters.map((chapter, i) => (
                <li key={chapter.id}>
                  <button
                    type="button"
                    onClick={() => startStory(i)}
                    className="group flex h-full w-full items-start gap-4 rounded-xl bg-surface p-4 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-raised"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-lavender text-sm font-extrabold text-purple group-hover:bg-purple group-hover:text-white">
                      {i + 1}
                    </span>
                    <span>
                      <span className="block text-[10px] font-bold uppercase tracking-[0.12em] text-coral">
                        {chapter.kicker}
                      </span>
                      <span className="mt-0.5 block text-sm font-bold leading-snug text-ink">
                        {chapter.title}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            !missingInputs && <div className="skeleton h-40" />
          )}
          <Button variant="primary" size="lg" onClick={() => startStory()} disabled={!ready}>
            &#9654; Start the story
          </Button>
        </section>

        {/* ---------------------------------------------------------- Data */}
        <section className="grid gap-6 rounded-2xl bg-surface p-8 shadow-card md:grid-cols-[1fr_1.4fr]">
          <div>
            <Eyebrow>Built on public data</Eyebrow>
            <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-ink">
              Every number says where it came from
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              Each figure is tagged Real, Derived or Estimated. Facility names, manufacturers and
              brands are never shown, and there is no clinical guidance anywhere.
            </p>
            <Link
              to="/sources"
              className="mt-4 inline-block text-sm font-semibold text-purple hover:underline"
            >
              See every source &rarr;
            </Link>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            <DataItem title="Facility locations" source="OpenStreetMap contributors" />
            <DataItem title="Medicine lists" source="Karnataka State Annual Indent 2025–26" />
            <DataItem title="PHC availability" source="Gadag PHC survey, Cureus 2023" />
            <DataItem title="Population and care-seeking" source="Census 2011 · NSS 75th round" />
          </ul>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline pt-8 text-sm text-ink-muted">
          <p>
            Built by <strong className="text-ink">Shriyans Nayak</strong> and{" "}
            <strong className="text-ink">Sanjana Srinivas</strong>.
          </p>
          <Link to="/about" className="font-semibold text-purple hover:underline">
            What this demo does and does not show &rarr;
          </Link>
        </footer>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- Pieces */

function HeroResults({ facts, loading }: { facts: StoryFacts | null; loading: boolean }) {
  return (
    <div
      className="rise rounded-2xl bg-white/[0.06] p-6 ring-1 ring-white/15 backdrop-blur"
      style={{ animationDelay: "150ms" }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
        Simulated &middot; {facts?.totalDays ?? 180} days &middot; {facts?.facilityCount ?? 15}{" "}
        facilities
      </p>
      {facts ? (
        <>
          <p className="mt-3 text-6xl font-black tracking-tight">
            <CountUp
              value={reduction(facts.stockoutDays.alone, facts.stockoutDays.zealo) ?? 0}
              format={(n) => `${Math.round(n)}%`}
            />
          </p>
          <p className="mt-1 text-base font-semibold text-white/85">
            fewer days with a medicine out of stock
          </p>
          <div className="mt-6 space-y-3">
            <HeroBar
              label="On their own"
              value={facts.stockoutDays.alone}
              max={facts.stockoutDays.alone}
              muted
            />
            <HeroBar
              label="With Zealo"
              value={facts.stockoutDays.zealo}
              max={facts.stockoutDays.alone}
            />
          </div>
          <p className="mt-4 text-xs text-white/55">
            Facility-medicine days out of stock. Same demand and opening stock in both.
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm text-white/70">
          {loading ? "Running the 180-day simulation…" : "The simulation is not available."}
        </p>
      )}
    </div>
  );
}

function HeroBar({
  label,
  value,
  max,
  muted = false,
}: {
  label: string;
  value: number;
  max: number;
  muted?: boolean;
}) {
  const width = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className={muted ? "text-white/60" : "font-semibold text-white"}>{label}</span>
        <span className="tabular font-bold">{value.toLocaleString()}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={`h-full rounded-full ${muted ? "bg-white/40" : "bg-coral"}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function ProblemStat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="rounded-2xl bg-surface p-6 shadow-card">
      <p className="text-5xl font-black tracking-tight text-status-red">{value}</p>
      <p className="mt-2 text-sm leading-snug text-ink-muted">{label}</p>
    </div>
  );
}

/** Where the survey's average sits against the WHO / HAI 80% availability benchmark. */
function AvailabilityGauge({ value }: { value: number }) {
  return (
    <div className="rounded-2xl bg-surface p-6 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-ink">Average PHC availability against the benchmark</span>
        <span className="text-xs text-ink-subtle">WHO / Health Action International: 80%</span>
      </div>
      <div className="relative mt-4 h-4 rounded-full bg-surface-sunken">
        <div className="h-full rounded-full bg-status-red/80" style={{ width: `${value}%` }} />
        <div
          className="absolute -top-1.5 h-7 w-0.5 bg-navy"
          style={{ left: "80%" }}
          aria-hidden="true"
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-ink-subtle">
        <span>0%</span>
        <span className="tabular font-semibold text-status-red">{value.toFixed(1)}%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function Step({
  n,
  title,
  text,
  icon,
}: {
  n: number;
  title: string;
  text: string;
  icon: ReactNode;
}) {
  return (
    <li className="rounded-2xl bg-surface p-6 shadow-card">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple text-white">
          {icon}
        </span>
        <span className="text-xs font-bold uppercase tracking-[0.12em] text-ink-subtle">
          Step {n}
        </span>
      </div>
      <h3 className="mt-4 text-lg font-extrabold tracking-tight text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{text}</p>
    </li>
  );
}

function ResultsGrid({ facts }: { facts: StoryFacts }) {
  const stockoutCut = reduction(facts.stockoutDays.alone, facts.stockoutDays.zealo) ?? 0;
  const unmetCut = reduction(facts.unmetUnits.alone, facts.unmetUnits.zealo) ?? 0;
  const clearZealo = facts.allClear.zealo;
  const clearAlone = facts.allClear.alone;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ResultCard
        headline={<CountUp value={stockoutCut} format={(n) => `${Math.round(n)}% fewer`} />}
        title="days with a medicine out of stock"
        alone={facts.stockoutDays.alone}
        zealo={facts.stockoutDays.zealo}
      />
      <ResultCard
        headline={<CountUp value={unmetCut} format={(n) => `${Math.round(n)}% fewer`} />}
        title="units patients asked for and could not get"
        alone={facts.unmetUnits.alone}
        zealo={facts.unmetUnits.zealo}
      />
      <div className="rounded-2xl bg-surface p-6 shadow-card">
        <p className="text-4xl font-black tracking-tight text-purple">
          {clearZealo != null ? `Day ${clearZealo + 1}` : "—"}
        </p>
        <p className="mt-1 text-sm font-semibold text-ink">until no facility is in the red</p>
        <p className="mt-3 text-sm text-ink-muted">
          On their own:{" "}
          <strong className="text-ink">
            {clearAlone != null ? `day ${clearAlone + 1}` : "not within the run"}
          </strong>
          , waiting for manufacturer refills. {facts.openingRed.length} of {facts.facilityCount}{" "}
          facilities start in the red.
        </p>
      </div>
      <div className="rounded-2xl bg-surface p-6 shadow-card">
        <p className="text-4xl font-black tracking-tight text-purple">
          <CountUp value={facts.availability.zealo * 100} format={oneDecimal} />
        </p>
        <p className="mt-1 text-sm font-semibold text-ink">of the time, each medicine is in stock</p>
        <p className="mt-3 text-sm text-ink-muted">
          On their own: <strong className="text-ink">{pct(facts.availability.alone)}</strong>.
          Zealo made {facts.transfers.count.toLocaleString()} transfers between neighbours and{" "}
          {facts.express.count.toLocaleString()} express orders to get there.
        </p>
      </div>
    </div>
  );
}

function ResultCard({
  headline,
  title,
  alone,
  zealo,
}: {
  headline: ReactNode;
  title: string;
  alone: number;
  zealo: number;
}) {
  const scale = Math.max(alone, zealo, 1);
  return (
    <div className="rounded-2xl bg-surface p-6 shadow-card">
      <p className="text-4xl font-black tracking-tight text-purple">{headline}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{title}</p>
      <div className="mt-4 space-y-2.5">
        {[
          { label: "On their own", value: alone, bar: "bg-ink-subtle/50" },
          { label: "With Zealo", value: zealo, bar: "bg-purple" },
        ].map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-ink-muted">{row.label}</span>
              <span className="tabular font-bold text-ink">{row.value.toLocaleString()}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-sunken">
              <div
                className={`h-full rounded-full ${row.bar}`}
                style={{ width: `${Math.max(1.5, (row.value / scale) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataItem({ title, source }: { title: string; source: string }) {
  return (
    <li className="rounded-xl bg-surface-sunken px-4 py-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        {title} <ProvenanceBadge provenance="real" />
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">{source}</p>
    </li>
  );
}

/* ---------------------------------------------------------------- Icons */

const ICON = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function IconEye() {
  return (
    <svg {...ICON}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconSwap() {
  return (
    <svg {...ICON}>
      <path d="M7 4 3 8l4 4" />
      <path d="M3 8h13a4 4 0 0 1 4 4" />
      <path d="m17 20 4-4-4-4" />
      <path d="M21 16H8a4 4 0 0 1-4-4" />
    </svg>
  );
}

function IconFactory() {
  return (
    <svg {...ICON}>
      <path d="M3 21V10l6 4V10l6 4V6l6 3v12Z" />
      <path d="M7 17h2M12 17h2M17 17h1" />
    </svg>
  );
}
