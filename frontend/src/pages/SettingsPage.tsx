/**
 * Scenario settings.
 *
 * Edits are held as a draft and only applied on "Run simulation", so typing a number
 * does not start a new 10-second run on every keystroke.
 */
import { useMemo, useState } from "react";
import { useFacilities } from "../api/hooks";
import { useRun } from "../api/useRun";
import type { Facility } from "../api/types";
import { TYPE_LABELS } from "../components/map/icons";
import { Disclaimer } from "../components/Disclaimer";
import { DEFAULT_SCENARIO, shareUrl, type ScenarioSettings } from "../state/scenario";
import { useViewStore } from "../state/store";
import { Button, Card, CardTitle, Checkbox, Field, Select, TextInput } from "../ui";

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
      {hint && <span className="mt-1 block text-[10px] leading-snug text-ink-subtle">{hint}</span>}
    </Field>
  );
}

export function SettingsPage() {
  const store = useViewStore();
  const facilities = useFacilities().data?.facilities ?? NO_FACILITIES;
  const [draft, setDraft] = useState<ScenarioSettings>(store.scenario);
  const [copied, setCopied] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const { run } = useRun();
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
      window.location.origin + "/",
    );
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-[1100px] space-y-4">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-auto">
              <h1 className="text-base font-bold tracking-tight text-ink">Scenario settings</h1>
              <p className="text-xs text-ink-muted">
                Both modes always run on the same settings, so any difference between them comes
                from the policy alone.
              </p>
            </div>
            <Button variant="ghost" onClick={() => { store.resetScenario(); setDraft(DEFAULT_SCENARIO); }}>
              Reset to default
            </Button>
            <Button onClick={copyLink}>{copied ? "Link copied" : "Copy share link"}</Button>
            <Button variant="primary" disabled={!dirty} onClick={() => store.setScenario(draft)}>
              Run simulation
            </Button>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardTitle hint="How long, and which random draw of daily demand.">Simulation</CardTitle>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Length (days)" value={draft.days} min={7} max={730}
                onChange={(v) => set("days", v ?? DEFAULT_SCENARIO.days)} />
              <NumberField label="Seed" value={draft.seed}
                onChange={(v) => set("seed", v ?? DEFAULT_SCENARIO.seed)} />
            </div>
          </Card>

          <Card>
            <CardTitle hint="Estimated demand, scaled from the statewide indent by population share.">
              Demand
            </CardTitle>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Demand scale" value={draft.demand_scale} step={0.1} min={0.1} max={10}
                onChange={(v) => set("demand_scale", v ?? 1)}
                hint="1 = indent quantity x Gadag taluk's share of Karnataka's population." />
              <NumberField label="Private demand per government demand" value={draft.private_demand_share} step={0.1} min={0} max={10}
                onChange={(v) => set("private_demand_share", v)}
                hint={`Blank = research value${researchShare != null ? ` (${researchShare.toFixed(2)})` : ""}: private facilities treat that many ailments per one treated in government facilities in Karnataka (NSS 75th round, 2017-18), weighted for Gadag's urban/rural mix.`} />
              <NumberField label="Near-expiry share at start" value={draft.near_expiry_share} step={0.05} min={0} max={1}
                onChange={(v) => set("near_expiry_share", v ?? 0.15)}
                hint="Share of opening batches that start within 90 days of expiry." />
            </div>
          </Card>

          <Card>
            <CardTitle hint="Manufacturers are generic supply nodes. There are no warehouses.">
              Manufacturer supply
            </CardTitle>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Lead time (days)" value={draft.lead_time_days} min={1} max={180}
                onChange={(v) => set("lead_time_days", v ?? 21)} />
              <NumberField label="Express lead time (days)" value={draft.express_lead_time_days} min={1} max={180}
                onChange={(v) => set("express_lead_time_days", v ?? 5)} />
              <NumberField label="Minimum shelf life (days)" value={draft.min_shelf_life_days} min={0} max={1095}
                onChange={(v) => set("min_shelf_life_days", v ?? 180)}
                hint="Zealo refuses stock with less life left than this." />
            </div>
          </Card>

          <Card>
            <CardTitle hint="Applied to every facility.">Facility rules</CardTitle>
            <div className="grid grid-cols-2 gap-3">
              <NumberField label="Target days of stock" value={draft.rules.target_days} min={2} max={365}
                onChange={(v) => setRule("target_days", v ?? 30)} />
              <NumberField label="Safety days" value={draft.rules.safety_days} min={0} max={180}
                onChange={(v) => setRule("safety_days", v ?? 7)} />
              <NumberField label="Auto-approval limit (units)" value={draft.rules.auto_approval_limit} min={1}
                onChange={(v) => setRule("auto_approval_limit", v)}
                hint="Blank = no limit. In units because no verified price list exists." />
              <NumberField label="Approval delay (days)" value={draft.rules.approval_delay_days} min={0} max={30}
                onChange={(v) => setRule("approval_delay_days", v ?? 1)} />
              <NumberField label="Review interval without Zealo (days)" value={draft.rules.review_interval_days} min={1} max={60}
                onChange={(v) => setRule("review_interval_days", v ?? 7)} />
            </div>
          </Card>
        </div>

        <Card>
          <CardTitle
            hint={`${inNetwork} of ${facilities.length} facilities in the network. Pharmacies and facilities outside the state system start outside it. Changes apply immediately.`}
            action={
              <div className="w-56">
                <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter facilities by type">
                  <option value="">All facility types</option>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </Select>
              </div>
            }
          >
            Network membership
          </CardTitle>
          <div className="grid max-h-80 grid-cols-1 gap-x-4 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {listed.map((f) => (
              <Checkbox
                key={f.id}
                checked={store.networkOverrides[f.id] ?? f.in_network}
                onChange={(value) => store.setNetworkMembership(f.id, value, f.in_network)}
                label={<span>{f.display_label}</span>}
              />
            ))}
          </div>
        </Card>

        <Disclaimer />
      </div>
    </div>
  );
}
