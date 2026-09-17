/**
 * Data sources and methods: where every number on the site comes from.
 */
import { useMedicines, useSources, useSurveySummary } from "../api/hooks";
import type { Source } from "../api/types";
import { Disclaimer } from "../components/Disclaimer";
import { ProvenanceBadge } from "../components/Provenance";
import { Card, CardTitle, StatTile } from "../ui";

const ACCESS_LABEL: Record<Source["access"], string> = {
  automated: "Retrieved automatically",
  manual: "Collected by hand",
  pending: "Not yet obtained",
};

const QUALITY_LABEL: Record<string, string> = {
  official_state_government: "Official state government source",
  official_district_site: "Official district website",
  third_party_census_mirror: "Third-party mirror of Census 2011",
  official_central_government: "Official Government of India publication",
};

function SourceCard({ source }: { source: Source }) {
  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-snug text-ink">{source.title}</h3>
        <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-medium text-ink-muted">
          {ACCESS_LABEL[source.access]}
        </span>
      </div>
      <p className="text-xs text-ink-muted">{source.publisher}</p>
      {source.source_quality && (
        <p className="mt-1 text-[11px] font-medium text-status-amber">
          {QUALITY_LABEL[source.source_quality] ?? source.source_quality}
        </p>
      )}
      <dl className="mt-3 space-y-1.5 text-xs">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-ink-subtle">What we used</dt>
          <dd className="text-ink-muted">{source.what_was_taken}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-ink-subtle">Licence</dt>
          <dd className="text-ink-muted">{source.licence}</dd>
        </div>
        {source.attribution && (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-ink-subtle">Credit</dt>
            <dd className="text-ink-muted">{source.attribution}</dd>
          </div>
        )}
        {source.retrieved && (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-ink-subtle">Retrieved</dt>
            <dd className="text-ink-muted">{source.retrieved}</dd>
          </div>
        )}
      </dl>
      {source.limitations.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg bg-surface-sunken px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
          {source.limitations.map((l) => (
            <li key={l}>&middot; {l}</li>
          ))}
        </ul>
      )}
      {source.url && (
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-block break-all text-xs font-medium text-purple hover:underline"
        >
          {source.url}
        </a>
      )}
    </Card>
  );
}

export function DataSourcesPage() {
  const sources = useSources().data?.sources ?? [];
  const survey = useSurveySummary().data;
  const medicines = useMedicines(true).data;
  const quantified = medicines?.survey_linked_count ?? 0;
  const total = medicines?.medicines.length ?? 104;

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-[1100px] space-y-4">
        <Card>
          <h1 className="text-xl font-extrabold tracking-tight text-ink">Data sources and methods</h1>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">
            Every number on this site is either taken from a public source, calculated from one
            by a documented formula, or modelled &mdash; and each is labelled so you can tell
            which.
          </p>
          <ul className="mt-3 space-y-1 text-xs text-ink-muted">
            <li>
              The full reference list, including sources consulted but not used, is in{" "}
              <code>data/references.csv</code>.
            </li>
            <li>
              {quantified} of {total} survey items have quantity estimates; the rest show
              availability only.
            </li>
            <li>Values in rupees are not shown because no verified public price list could be accessed.</li>
            <li>
              Gadag taluk population taken from a third-party mirror of Census 2011 data; the
              official census site could not be accessed securely.
            </li>
          </ul>
        </Card>

        {survey && (
          <Card>
            <CardTitle
              hint={`Tejesh S, Nagaveni SJ (2023). Cureus 15(5): e39341. ${survey.phcs_surveyed} PHCs observed ${survey.period}.`}
              action={<ProvenanceBadge provenance="real" />}
            >
              What the Gadag PHC survey found
            </CardTitle>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <StatTile label="Overall availability" value={`${survey.overall_availability_pct.toFixed(2)}%`} />
              <StatTile label="Best PHC" value={`${survey.highest_phc.availability_pct}%`} sub={`PHC ${survey.highest_phc.phc} in the survey`} />
              <StatTile label="Worst PHC" value={`${survey.lowest_phc.availability_pct}%`} sub={`PHC ${survey.lowest_phc.phc} in the survey`} tone="bad" />
              <StatTile label="Items at every PHC" value={survey.items_at_full_availability} sub={`of ${survey.items_assessed} assessed`} />
            </div>
            {survey.unavailable_everywhere.length > 0 && (
              <p className="mt-3 text-xs text-ink-muted">
                <strong className="text-ink">Available at no PHC:</strong>{" "}
                {survey.unavailable_everywhere.map((i) => i.name).join(", ")}.
              </p>
            )}
            <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {survey.categories.map((c) => (
                <div key={c.category} className="flex items-center gap-2 text-xs">
                  <span className="w-44 shrink-0 truncate text-ink-muted" title={c.category}>
                    {c.category}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                    <span className="block h-full rounded-full bg-purple" style={{ width: `${c.availability_pct}%` }} />
                  </span>
                  <span className="tabular w-12 text-right text-ink">{c.availability_pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-ink-subtle">
              Licensed under CC BY 4.0. PHCs were anonymised in the survey, so its profiles are
              assigned to map locations for illustration only.
            </p>
          </Card>
        )}

        <Card>
          <CardTitle>How to read the labels</CardTitle>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg bg-surface-sunken p-3">
              <ProvenanceBadge provenance="real" />
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                Taken directly from a published source: facility coordinates, the medicine list,
                survey percentages, population figures.
              </p>
            </div>
            <div className="rounded-lg bg-surface-sunken p-3">
              <ProvenanceBadge provenance="derived" />
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                Calculated from real data by a stated formula: a facility&rsquo;s type inferred from
                its name, the survey matrix, map status colours.
              </p>
            </div>
            <div className="rounded-lg bg-surface-sunken p-3">
              <ProvenanceBadge provenance="estimated" />
              <p className="mt-2 text-xs leading-relaxed text-ink-muted">
                Modelled, not observed anywhere: stock quantities, daily demand, expiry dates, and
                interim values used while data is still being collected.
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>The formulas</CardTitle>
          <dl className="space-y-3 text-xs leading-relaxed text-ink-muted">
            <div>
              <dt className="font-semibold text-ink">Taluk demand</dt>
              <dd>
                Annual demand for an item = statewide indent quantity &times; (Gadag taluk population
                &divide; Karnataka population) = indent &times; 0.6011%. Only the share is used, so no
                growth projection is applied to 2011 populations.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Splitting demand between facilities</dt>
              <dd>
                Government facilities carrying an item share it equally until hospital attendance
                data arrives, after which it is weighted by outpatient attendance. Daily demand is
                drawn from a Poisson distribution with a fixed seed, so every run is reproducible.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Demand at private facilities</dt>
              <dd>
                No public source records medicine volumes at private hospitals, clinics or
                pharmacies. The closest government evidence is where people are treated: in
                Karnataka, government hospitals treat 29.0% of ailments in rural areas and 14.1% in
                towns, private hospitals and clinics 70.7% and 84.0% (NSS 75th round, 2017&ndash;18,
                Table A8). Weighted by Gadag taluk&rsquo;s 52% urban population, private facilities
                treat about <strong className="text-ink">3.66</strong> ailments for every one treated
                in a government facility, so they carry 3.66 times the government demand, split
                equally between them. This assumes a treated ailment uses medicines similarly in
                either sector. <ProvenanceBadge provenance="derived" />
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Map colours</dt>
              <dd>
                A facility is <strong className="text-status-red">red</strong> when fewer than 80% of
                its medicines are in stock &mdash; the availability benchmark set by WHO and Health
                Action International, cited in the Gadag survey.{" "}
                <strong className="text-status-amber">Amber</strong> means 80&ndash;95% in stock, or
                more than a tenth of its medicines under a week of cover, or more than a quarter of
                its stock within 90 days of expiry. <strong className="text-status-green">Green</strong>{" "}
                means 95% or more in stock (a standard inventory service level) with none of those
                warnings. Cover counts deliveries already due within the week. The thresholds were fixed
                before any run was measured. <ProvenanceBadge provenance="derived" />
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Which facilities are shown</dt>
              <dd>
                This proof of concept shows 15 of the 77 health facilities mapped in Gadag taluk:
                every state facility that carries a medicine list (5 PHCs, the district hospital and
                3 government hospitals of unconfirmed level), and the private facility nearest each
                PHC and the district hospital. Each facility keeps the share of taluk demand it
                would have with all 77 present, so no facility&rsquo;s demand is inflated by the
                smaller network.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Which PHC holds which medicine</dt>
              <dd>
                The survey publishes availability per item and per PHC, never which PHC held which
                item. A matrix is reconstructed whose totals match both published margins exactly;
                its individual cells are reconstructions, not observations.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Interim per-PHC availability</dt>
              <dd>
                Until the survey chart is transcribed, PHC 1 = 45.45% and PHC 4 = 94.17% (stated in
                the paper), and the other 13 share one value that keeps the published mean of
                74.20%.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Opening stock</dt>
              <dd>
                An item recorded as in stock opens with 30 days of its own estimated demand; an item
                recorded as out of stock opens empty.
              </dd>
            </div>
          </dl>
        </Card>

        <div>
          <h2 className="mb-2 px-1 text-sm font-semibold text-ink">Every source</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {sources.map((source) => (
              <SourceCard key={source.id} source={source} />
            ))}
          </div>
        </div>

        <Card>
          <p className="text-xs text-ink-muted">
            Map data &copy;{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="text-purple hover:underline">
              OpenStreetMap contributors
            </a>
            , available under the Open Database License. Map tiles by OpenStreetMap.
          </p>
        </Card>

        <Disclaimer />
      </div>
    </div>
  );
}
