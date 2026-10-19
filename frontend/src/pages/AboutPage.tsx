/**
 * About: what Zealo is, what this demo does and does not show, and who built it.
 */
import type { ReactNode } from "react";
import { Link } from "react-router";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[30px] font-bold leading-tight tracking-[-0.02em] text-ink">{title}</h2>
      <div className="max-w-[46em] space-y-3 text-[17px] leading-relaxed text-ink-2">
        {children}
      </div>
    </section>
  );
}

export function AboutPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1120px] space-y-14 px-4 py-10 sm:px-6">
        <header>
          <h1 className="text-[40px] font-bold leading-[1.04] tracking-[-0.025em] text-ink sm:text-[52px]">
            About Zealo
          </h1>
          <p className="mt-4 max-w-[38em] text-[21px] leading-relaxed text-ink-2">
            A shared view of the medicine on every shelf in a taluk, so that stock reaches the
            place that needs it before anyone runs out.
          </p>
        </header>

        <Section title="What Zealo is">
          <p>
            India&rsquo;s medicine supply has no shared, live view of stock. Each hospital, clinic
            and pharmacy keeps its own records, so a medicine can run out at one facility while the
            same medicine sits unused, or expires, at another a few kilometres away.
          </p>
          <p>
            Zealo links those stock rooms. Facilities in the network share their stock levels, so
            it is visible where it is needed. When a facility is about to run short, Zealo moves
            stock from a nearby member with more than it needs, and stock close to expiry goes to a
            facility that will use it in time. Refills go straight to the manufacturer: there are
            no warehouses or distributors in the model. Each facility sets its targets and approval
            limit once.
          </p>
        </Section>

        <div className="grid gap-10 md:grid-cols-2">
          <Section title="What this demo shows">
            <ul className="list-disc space-y-2 pl-5">
              <li>Real health facility locations in Gadag taluk, Karnataka, from OpenStreetMap.</li>
              <li>Real medicine lists from the Karnataka State Annual Indent 2025&ndash;26.</li>
              <li>Real availability patterns from a published survey of Gadag&rsquo;s 15 PHCs.</li>
              <li>
                A simulation of these facilities run as a Zealo network, compared with the same
                facilities managing stock on their own.
              </li>
              <li>Every number labelled Real, Derived or Estimated.</li>
            </ul>
          </Section>
          <Section title="What it does not show">
            <ul className="list-disc space-y-2 pl-5">
              <li>Real stock levels. No public source records them, so stock is simulated.</li>
              <li>Real facility names, which are deliberately never displayed.</li>
              <li>Prices or rupee values: no verified public price list could be accessed.</li>
              <li>Outbreak detection, disease forecasting or patient delivery.</li>
              <li>Any dosing or clinical guidance. Medicines appear only as stock.</li>
              <li>Real manufacturers or brands, which appear only as generic supply nodes.</li>
            </ul>
          </Section>
        </div>

        <Section title="Who built it">
          <p>
            Zealo was built by <strong className="text-ink">Shriyans Nayak</strong> and{" "}
            <strong className="text-ink">Sanjana Srinivas</strong>. 
          </p>
          <p>
            It is a proof of concept for one taluk.
            Every source behind it is listed on{" "}
            <Link to="/sources" className="font-bold text-scrub underline underline-offset-4">
              Data and methods
            </Link>
            .
          </p>
        </Section>
      </div>
    </div>
  );
}
