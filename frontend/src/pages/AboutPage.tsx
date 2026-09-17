import { Disclaimer } from "../components/Disclaimer";
import { Card, CardTitle } from "../ui";

export function AboutPage() {
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <Card>
          <h1 className="text-xl font-extrabold tracking-tight text-ink">About Zealo</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            India&rsquo;s medicine supply chain has no shared, live view of stock. Each hospital,
            clinic and pharmacy keeps its own records, so a medicine can run out at one facility
            while the same medicine sits unused, or expires, at another a few kilometres away.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            <strong className="text-ink">Zealo is a shared inventory layer.</strong> Facilities in
            the network share their stock, so it is visible where it is needed. When stock runs
            low, Zealo orders directly from the manufacturer &mdash; there are no warehouses or
            distributors in the model. When a facility is about to run short, Zealo moves stock
            from a nearby network facility with surplus, and stock close to expiry goes to a
            facility that will use it in time. Each facility sets its targets and approval limit
            once.
          </p>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardTitle>What this demo shows</CardTitle>
            <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-ink-muted">
              <li>Real health facility locations in Gadag taluk, Karnataka, from OpenStreetMap.</li>
              <li>Real medicine lists from the Karnataka State Annual Indent 2025&ndash;26.</li>
              <li>Real availability patterns from a published survey of Gadag&rsquo;s 15 PHCs.</li>
              <li>
                A simulation of these facilities run as a Zealo network: refilled directly from
                manufacturers, with stock moved between members before it runs out or expires.
              </li>
              <li>Every number labelled Real, Derived or Estimated.</li>
            </ul>
          </Card>
          <Card>
            <CardTitle>What it does not show</CardTitle>
            <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-ink-muted">
              <li>
                <strong className="text-ink">Real stock levels.</strong> No public source records
                quantities; stock is modelled.
              </li>
              <li>Real facility names, which are deliberately never displayed.</li>
              <li>Prices or rupee values: no verified public price list could be accessed.</li>
              <li>Outbreak detection, disease forecasting or patient delivery.</li>
              <li>Any dosing or clinical guidance. Medicines are inventory items only.</li>
              <li>Real manufacturers or brands, which appear only as generic supply nodes.</li>
            </ul>
          </Card>
        </div>

        <Card>
          <CardTitle>Team</CardTitle>
          <p className="text-sm text-ink">Shriyans Nayak and Sanjana Srinivas</p>
        </Card>

        <Disclaimer />
      </div>
    </div>
  );
}
