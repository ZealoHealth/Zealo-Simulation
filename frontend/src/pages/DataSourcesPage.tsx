/**
 * Data and methods: where every number on the site comes from, how the derived ones are
 * made, and what the proof of concept cannot tell you yet. Every list here is generated
 * from the API (sources registry, survey summary, data status, coverage statements).
 */
import type { ReactNode } from "react";
import {
  useDataStatus,
  useFacilities,
  useMedicines,
  useSources,
  useSurveySummary,
} from "../api/hooks";
import type { Source } from "../api/types";
import { ProvenanceBadge } from "../components/Provenance";
import { Card, Table, Td, Th } from "../ui";

/** Plain names for the survey's medicine groups; the survey's own name is kept on hover. */
const PLAIN_GROUP: Record<string, string> = {
  NSAIDs: "Pain relief and fever (NSAIDs)",
  Antibiotics: "Antibiotics",
  "Anti-allergic and drugs used in anaphylaxis": "Allergy and anaphylaxis",
  Bronchodilators: "Breathing (bronchodilators)",
  "Gastro-intestinal, anti-ulcer drugs, and intestinal anthelmintics": "Stomach, ulcers and worms",
  "Cardiovascular drugs": "Heart and blood pressure",
  "Anti-diabetic drugs": "Diabetes",
  "Obstetrics drugs": "Pregnancy and childbirth",
  "Tranquilizers, sedatives, psychiatric drugs": "Mental health and sedation",
  Anesthetics: "Anaesthetics",
  "Anti-dotes, vaccines, and sera": "Antidotes, vaccines and sera",
  "IV infusions and other electrolytes": "IV fluids and electrolytes",
  "Dermatological, ophthalmic, and ENT drugs": "Skin, eye, ear, nose and throat",
  "Vitamins and haematinics": "Vitamins and iron",
  "Sterile and disposable items": "Sterile and disposable items",
};

const ACCESS_LABEL: Record<Source["access"], string> = {
  automated: "Retrieved automatically",
  manual: "Collected by hand",
  pending: "Not yet obtained",
};

const KINDS = [
  {
    badge: "real" as const,
    text: "Taken directly from a published source, unchanged.",
    examples: "Facility coordinates, the state medicine list, survey percentages, population.",
  },
  {
    badge: "derived" as const,
    text: "Calculated from real data by a formula written down on this page.",
    examples: "A facility's type inferred from its name, the survey matrix, the map colours.",
  },
  {
    badge: "estimated" as const,
    text: "Modelled. Not observed in any source.",
    examples:
      "Stock quantities, daily demand, expiry dates, and stand-ins while data is collected.",
  },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-[30px] font-bold leading-tight tracking-[-0.02em] text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Formula({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-line-soft py-4 last:border-b-0">
      <dt className="text-[17px] font-bold text-ink">{title}</dt>
      <dd className="mt-1 max-w-[46em] text-[16px] leading-relaxed text-ink-2">{children}</dd>
    </div>
  );
}

export function DataSourcesPage() {
  const sources = useSources().data?.sources ?? [];
  const survey = useSurveySummary().data;
  const medicines = useMedicines(true).data;
  const dataStatus = useDataStatus().data;
  const coverage = useFacilities().data?.coverage;
  const quantified = medicines?.medicines.filter((m) => m.quantity_modelled).length ?? 0;
  const total = medicines?.medicines.length ?? 0;

  const categories = [...(survey?.categories ?? [])].sort(
    (a, b) => b.availability_pct - a.availability_pct,
  );
  const average = survey?.overall_availability_pct ?? 0;
  const openItems = (dataStatus?.items ?? []).filter(
    (item) => item.status !== "complete" && item.status !== "decided",
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1120px] space-y-14 px-4 py-10 sm:px-6">
        <header>
          <h1 className="text-[40px] font-bold leading-[1.04] tracking-[-0.025em] text-ink sm:text-[52px]">
            Data and methods
          </h1>
          <p className="mt-4 max-w-[38em] text-[21px] leading-relaxed text-ink-2">
            Every number in Zealo is labelled with where it came from. Facility locations and
            medicine lists are public records. Stock levels are a simulation built on top of them.
          </p>
        </header>

        <Section title="Three kinds of number">
          <div className="grid gap-5 md:grid-cols-3">
            {KINDS.map((kind) => (
              <Card key={kind.badge}>
                <ProvenanceBadge provenance={kind.badge} />
                <p className="mt-3 text-[17px] font-bold text-ink">{kind.text}</p>
                <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{kind.examples}</p>
              </Card>
            ))}
          </div>
        </Section>

        {survey && (
          <Section title="What the Gadag PHC survey found">
            <Card>
              <div className="flex flex-wrap items-center gap-2">
                <ProvenanceBadge provenance="real" />
                <p className="text-[15px] text-ink-2">
                  Tejesh S, Nagaveni SJ (2023). Cureus 15(5): e39341. {survey.phcs_surveyed} PHCs
                  observed {survey.period}.
                </p>
              </div>
              <dl className="mt-5 grid grid-cols-2 border-t-2 border-ink md:grid-cols-4">
                {[
                  {
                    value: `${survey.overall_availability_pct.toFixed(2)}%`,
                    label: "Overall availability",
                    tone: "text-ink",
                  },
                  {
                    value: `${survey.highest_phc.availability_pct}%`,
                    label: `Best PHC (PHC ${survey.highest_phc.phc})`,
                    tone: "text-scrub",
                  },
                  {
                    value: `${survey.lowest_phc.availability_pct}%`,
                    label: `Worst PHC (PHC ${survey.lowest_phc.phc})`,
                    tone: "text-out-text",
                  },
                  {
                    value: `${survey.items_at_full_availability} of ${survey.items_assessed}`,
                    label: "Items found at every PHC",
                    tone: "text-ink",
                  },
                ].map((stat) => (
                  <div key={stat.label} className="flex flex-col-reverse py-4 pr-4">
                    <dt className="text-[15px] text-ink-2">{stat.label}</dt>
                    <dd className={`tabular text-[32px] font-bold leading-tight ${stat.tone}`}>
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>
              {survey.unavailable_everywhere.length > 0 && (
                <p className="text-[15px] text-ink-2">
                  <strong className="text-ink">On the shelf at no PHC:</strong>{" "}
                  {survey.unavailable_everywhere.map((i) => i.name).join(", ")}.
                </p>
              )}

              <figure className="mt-8">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b-2 border-ink pb-2">
                  <h3 className="text-lg font-bold text-ink">
                    Share of items in stock, by medicine group
                  </h3>
                  <p className="flex items-center gap-2 text-[13px] text-ink-2">
                    <span aria-hidden="true" className="inline-block h-4 w-0.5 bg-ink" />
                    Taluk average, {average.toFixed(1)}%
                  </p>
                </div>
                <ul
                  aria-label={`Share of items in stock in each of ${categories.length} medicine groups, highest first.`}
                >
                  {categories.map((c) => (
                    <li
                      key={c.category}
                      className="grid grid-cols-[minmax(0,15em)_minmax(0,1fr)_4em] items-center gap-3 border-b border-line-soft py-2"
                    >
                      <span className="text-[15px] text-ink" title={c.category}>
                        {PLAIN_GROUP[c.category] ?? c.category}
                      </span>
                      <span className="relative h-[14px] rounded-r bg-grid" aria-hidden="true">
                        <span
                          className="absolute inset-y-0 left-0 rounded-r bg-scrub"
                          style={{ width: `${c.availability_pct}%` }}
                        />
                        <span
                          className="absolute -inset-y-2 w-px bg-ink"
                          style={{ left: `${average}%` }}
                        />
                      </span>
                      <span className="tabular text-right text-[15px] font-bold text-ink">
                        {c.availability_pct.toFixed(1)}%
                      </span>
                    </li>
                  ))}
                </ul>
                <figcaption className="mt-3 text-sm text-muted">
                  Licensed under CC BY 4.0. PHCs were anonymised in the survey, so its profiles are
                  assigned to map locations for illustration only.
                </figcaption>
              </figure>
            </Card>
          </Section>
        )}

        <Section title="How the numbers are made">
          <dl className="rounded-xl border border-line bg-surface px-6">
            <Formula title="Taluk demand">
              Annual demand for an item = statewide indent quantity &times; (Gadag taluk population
              &divide; Karnataka population) = indent &times; 0.6011%. Only the share is used, so no
              growth projection is applied to 2011 populations.
            </Formula>
            <Formula title="Splitting demand between facilities">
              Government facilities carrying an item share it equally until hospital attendance data
              arrives, after which it is weighted by outpatient attendance. Daily demand is drawn
              from a Poisson distribution with a fixed seed, so every run is reproducible.
            </Formula>
            <Formula title="Demand at private facilities">
              No public source records medicine volumes at private hospitals, clinics or pharmacies.
              The closest evidence is where people are treated: in Karnataka, government hospitals
              treat 29.0% of ailments in rural areas and 14.1% in towns, private hospitals and
              clinics 70.7% and 84.0% (NSS 75th round, 2017&ndash;18, Table A8). Weighted by Gadag
              taluk&rsquo;s 52% urban population, private facilities treat about 3.66 ailments for
              every one treated in a government facility, so they carry 3.66 times the government
              demand, split equally between them. <ProvenanceBadge provenance="derived" />
            </Formula>
            <Formula title="Map colours">
              A facility is out (red) when fewer than 80% of its medicines are in stock, the
              availability benchmark set by WHO and Health Action International and cited in the
              Gadag survey. It is running low (amber) at 80&ndash;95%, or when more than a tenth of
              its medicines have under a week of stock, or more than a quarter of its stock is
              within 90 days of expiry. Otherwise it is in stock (green). Days of stock count
              deliveries already due within the week. The thresholds were fixed before any run was
              measured. <ProvenanceBadge provenance="derived" />
            </Formula>
            <Formula title="Which facilities are shown">
              This proof of concept shows 15 of the 77 health facilities mapped in Gadag taluk:
              every state facility that carries a medicine list, and the private facility nearest
              each PHC and the district hospital. Each keeps the share of taluk demand it would have
              with all 77 present, so no facility&rsquo;s demand is inflated by the smaller network.
            </Formula>
            <Formula title="Which PHC holds which medicine">
              The survey publishes availability per item and per PHC, never which PHC held which
              item. A matrix is reconstructed whose totals match both published margins exactly; its
              individual cells are reconstructions, not observations.
            </Formula>
            <Formula title="Interim per-PHC availability">
              Until the survey chart is transcribed, PHC 1 = 45.45% and PHC 4 = 94.17% (stated in
              the paper), and the other 13 share one value that keeps the published mean of 74.20%.
            </Formula>
            <Formula title="Opening stock">
              An item recorded as in stock opens with 30 days of its own estimated demand; an item
              recorded as out of stock opens empty.
            </Formula>
          </dl>
        </Section>

        <Section title="Sources">
          <Card padded={false} className="px-6 py-4">
            <Table>
              <thead>
                <tr>
                  <Th>Source</Th>
                  <Th>What Zealo uses</Th>
                  <Th>Licence or terms</Th>
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => (
                  <tr key={source.id}>
                    <Td className="w-[38%] align-top">
                      <span className="block font-bold text-ink">{source.title}</span>
                      <span className="block text-sm text-muted">
                        {source.publisher}. {ACCESS_LABEL[source.access]}
                        {source.retrieved ? `, ${source.retrieved}` : ""}.
                      </span>
                      {source.url && (
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block break-all text-sm font-bold text-scrub underline underline-offset-2"
                        >
                          {source.url}
                        </a>
                      )}
                    </Td>
                    <Td className="align-top text-ink-2">
                      {source.what_was_taken}
                      {source.limitations.length > 0 && (
                        <ul className="mt-1 list-disc pl-4 text-sm text-muted">
                          {source.limitations.map((l) => (
                            <li key={l}>{l}</li>
                          ))}
                        </ul>
                      )}
                    </Td>
                    <Td className="align-top text-ink-2">{source.licence}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <p className="text-[15px] text-ink-2">
            Retrieval dates and sources consulted but not used are listed in{" "}
            <span className="code">data/references.csv</span>. Map data &copy;{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
              className="font-bold text-scrub underline underline-offset-2"
            >
              OpenStreetMap contributors
            </a>
            , available under the Open Database License.
          </p>
        </Section>

        <Section title="What this proof of concept can't tell you yet">
          <ul className="max-w-[46em] list-disc space-y-2 pl-5 text-[17px] leading-relaxed text-ink-2">
            <li>
              Stock is simulated. No public source records quantities on the shelf, so every stock
              figure is an estimate.
            </li>
            {total > 0 && (
              <li>
                {quantified} of {total} survey items have quantity estimates; the rest show only
                whether they were in stock.
              </li>
            )}
            <li>There are no rupee values: no verified public price list could be accessed.</li>
            <li>
              Gadag taluk&rsquo;s population comes from a third-party mirror of Census 2011 data,
              because the official census site could not be reached securely.
            </li>
            {coverage?.statements.map((s) => (
              <li key={s}>{s}</li>
            ))}
            {openItems.map((item) => (
              <li key={item.id}>
                <strong className="text-ink">{item.title}.</strong> Meanwhile:{" "}
                {item.interim_approach}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
