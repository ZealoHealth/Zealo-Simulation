/**
 * Simulation settings.
 *
 * Edits are held as a draft and only applied on "Run simulation", so typing a number
 * does not start a new run on every keystroke. Network membership applies at once,
 * as it does from the Facilities page.
 */
import { useMemo, useState, type ReactNode } from "react";
import { useFacilities } from "../api/hooks";
import { useRun } from "../api/useRun";
import type { Facility } from "../api/types";
import { TYPE_LABELS } from "../components/map/icons";
import { DEFAULT_SCENARIO, shareUrl, type ScenarioSettings } from "../state/scenario";
import { useViewStore } from "../state/store";
import { Button, Checkbox, Field, Select, TextInput } from "../ui";

// Stable empty array: `?? []` would allocate each render and defeat the memo below.
const NO_FACILITIES: Facility[] = [];

function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <Field label={label}>
      <TextInput
        type="number"
        value={value ?? ""}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
      {hint && <span className="mt-1.5 block text-sm leading-snug text-muted">{hint}</span>}
    </Field>
  );
}

function Panel({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      <h2 className="text-[22px] font-bold text-ink">{title}</h2>
      {intro && <p className="mt-1 text-[15px] text-ink-2">{intro}</p>}
      <div className="mt-5 grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const store = useViewStore();
  const facilities = useFacilities().data?.facilities ?? NO_FACILITIES;
  const [draft, setDraft] = useState<ScenarioSettings>(store.scenario);
  const [copied, setCopied] = useState(false);
  const [ran, setRan] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const { run, isLoading } = useRun();
  const researchShare =
    run?.context?.private_share_basis === "nss_75th_round"
      ? run.context.private_demand_share
      : null;

  const dirty = JSON.stringify(draft) !== JSON.stringify(store.scenario);
  const set = <K extends keyof ScenarioSettings>(key: K, value: ScenarioSettings[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const setRule = <K extends keyof ScenarioSettings["rules"]>(
    key: K,
    value: ScenarioSettings["rules"][K],
  ) => setDraft((d) => ({ ...d, rules: { ...d.rules, [key]: value } }));

  const listed = useMemo(
    () => facilities.filter((f) => !typeFilter || f.facility_type === typeFilter),
    [facilities, typeFilter],
  );
  const inNetwork = facilities.filter((f) => store.networkOverrides[f.id] ?? f.in_network).length;

  async function copyLink() {
    const url = shareUrl(
      {
        scenario: store.scenario,
        networkOverrides: store.networkOverrides,
        approvalDecisions: store.approvalDecisions,
      },
      window.location.origin + "/map",
    );
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const status = dirty
    ? "You have changes that have not run yet."
    : ran && isLoading
      ? "Running the simulation…"
      : ran
        ? "Simulation ran with these settings."
        : "These are the settings of the run you are looking at.";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[760px] space-y-6 px-4 pb-32 pt-10 sm:px-6">
        <header>
          <h1 className="text-[40px] font-bold leading-[1.04] tracking-[-0.025em] text-ink sm:text-[52px]">
            Simulation settings
          </h1>
          <p className="mt-3 text-[17px] text-ink-2">
            Changes take effect when you run the simulation. A share link carries these settings,
            so anyone who opens it sees the same run.
          </p>
        </header>

        <Panel title="Facility rules" intro="Applied to every facility.">
          <NumberField
            label="Days of stock to hold"
            value={draft.rules.target_days}
            min={2}
            max={365}
            onChange={(v) => setRule("target_days", v ?? 30)}
            hint="A refill tops stock up to this many days."
          />
          <NumberField
            label="Safety days"
            value={draft.rules.safety_days}
            min={0}
            max={180}
            onChange={(v) => setRule("safety_days", v ?? 7)}
            hint="Extra days added to the delivery time before a refill is ordered."
          />
          <NumberField
            label="Approval limit (units)"
            value={draft.rules.auto_approval_limit}
            min={1}
            onChange={(v) => setRule("auto_approval_limit", v)}
            hint="Orders above this wait for sign-off. Blank means no limit. In units, because no verified price list exists."
          />
          <NumberField
            label="Days to approve"
            value={draft.rules.approval_delay_days}
            min={0}
            max={30}
            onChange={(v) => setRule("approval_delay_days", v ?? 1)}
          />
        </Panel>

        <Panel
          title="Supply"
          intro="Manufacturers are generic supply nodes. There are no warehouses or distributors."
        >
          <NumberField
            label="Delivery time (days)"
            value={draft.lead_time_days}
            min={1}
            max={180}
            onChange={(v) => set("lead_time_days", v ?? 21)}
          />
          <NumberField
            label="Express delivery time (days)"
            value={draft.express_lead_time_days}
            min={1}
            max={180}
            onChange={(v) => set("express_lead_time_days", v ?? 5)}
          />
          <NumberField
            label="Minimum shelf life (days)"
            value={draft.min_shelf_life_days}
            min={0}
            max={1095}
            onChange={(v) => set("min_shelf_life_days", v ?? 180)}
            hint="Zealo refuses stock with less life left than this."
          />
        </Panel>

        <Panel title="Facilities outside the network">
          <NumberField
            label="Days between stock checks"
            value={draft.rules.review_interval_days}
            min={1}
            max={60}
            onChange={(v) => setRule("review_interval_days", v ?? 7)}
            hint="How often a facility managing stock on its own checks its shelves. Zealo checks network members every day."
          />
        </Panel>

        <section className="rounded-xl border border-line bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-md">
              <h2 className="text-[22px] font-bold text-ink">Zealo network</h2>
              <p className="mt-1 text-[15px] text-ink-2">
                {inNetwork} of {facilities.length} facilities are members. Pharmacies and
                facilities outside the state system start outside. Changes apply at once.
              </p>
            </div>
            <div className="w-56">
              <Field label="Show">
                <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                  <option value="">All facility types</option>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {listed.map((f) => (
              <Checkbox
                key={f.id}
                checked={store.networkOverrides[f.id] ?? f.in_network}
                onChange={(value) => store.setNetworkMembership(f.id, value, f.in_network)}
                label={f.display_label}
              />
            ))}
          </div>
        </section>

        <Panel title="Run" intro="How long, and how much demand.">
          <NumberField
            label="Length (days)"
            value={draft.days}
            min={7}
            max={730}
            onChange={(v) => set("days", v ?? DEFAULT_SCENARIO.days)}
          />
          <NumberField
            label="Seed"
            value={draft.seed}
            onChange={(v) => set("seed", v ?? DEFAULT_SCENARIO.seed)}
            hint="The same seed and settings always give the same run."
          />
          <NumberField
            label="Demand scale"
            value={draft.demand_scale}
            step={0.1}
            min={0.1}
            max={10}
            onChange={(v) => set("demand_scale", v ?? 1)}
            hint="1 means the indent quantity times Gadag taluk's share of Karnataka's population."
          />
          <NumberField
            label="Private demand per government demand"
            value={draft.private_demand_share}
            step={0.1}
            min={0}
            max={10}
            onChange={(v) => set("private_demand_share", v)}
            hint={`Blank uses the research value${researchShare != null ? ` (${researchShare.toFixed(2)})` : ""}: how many ailments private facilities treat for each one treated in a government facility in Karnataka (NSS 75th round), weighted for Gadag's urban and rural mix.`}
          />
          <NumberField
            label="Share of opening stock near expiry"
            value={draft.near_expiry_share}
            step={0.05}
            min={0}
            max={1}
            onChange={(v) => set("near_expiry_share", v ?? 0.15)}
            hint="Share of opening batches that start within 90 days of expiry."
          />
        </Panel>
      </div>

      {/* Always in reach: run, reset, share. */}
      <div className="sticky bottom-0 border-t border-line bg-surface">
        <div className="mx-auto flex max-w-[760px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Button
            variant="primary"
            disabled={!dirty}
            onClick={() => {
              store.setScenario(draft);
              setRan(true);
            }}
          >
            Run simulation
          </Button>
          <Button
            onClick={() => {
              store.resetScenario();
              setDraft(DEFAULT_SCENARIO);
              setRan(false);
            }}
          >
            Reset to default
          </Button>
          <Button onClick={copyLink}>{copied ? "Link copied" : "Copy share link"}</Button>
          <p role="status" className="text-sm text-muted">
            {status}
          </p>
        </div>
      </div>
    </div>
  );
}
