/**
 * The Network page: what has moved between facilities so far, and who is short and who
 * has spare on the day shown.
 *
 * Movement figures come from the run's event log (the map's source), so they count up
 * to the selected day and cost no request. Short and spare are positions on that day,
 * in days of cover rather than units -- a hundred tablets is a month at one PHC and a
 * day at the district hospital -- with deliveries due this week counted, as the map does.
 */
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { shortMedicineName } from "../api/format";
import { useFacilities, useRedistribution, useSurveySummary } from "../api/hooks";
import type { FacilityBalance } from "../api/types";
import { useRun } from "../api/useRun";
import { MissingInputsNotice } from "../components/MissingInputsNotice";
import { ProvenanceBadge } from "../components/Provenance";
import {
  busiestRoutes,
  networkActivity,
  shortageGrid,
  type GridCell,
} from "../components/network/networkLogic";
import { useViewStore } from "../state/store";
import { usePlaybackClock } from "../state/usePlayback";
import { Button, Card, CardTitle, Stat, StatRow, Table, Td, Th } from "../ui";
import { token } from "../ui/tokens";

const GRID_ROWS_SHOWN = 12;
const NO_BALANCES: FacilityBalance[] = [];

function DayControl({ disabled }: { disabled: boolean }) {
  const { day, totalDays, playing, setDay, play, pause } = useViewStore();
  usePlaybackClock(disabled);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-surface px-3.5 py-2">
      <span
        aria-hidden="true"
        className="tabular whitespace-nowrap text-[15px] font-bold text-ink"
      >
        Day {totalDays ? day + 1 : 0} of {totalDays}
      </span>
      <input
        type="range"
        min={0}
        max={Math.max(0, totalDays - 1)}
        value={day}
        disabled={disabled}
        aria-label="Simulation day"
        aria-valuetext={`Day ${day + 1} of ${totalDays}`}
        onChange={(e) => setDay(Number(e.target.value))}
        className="h-11 w-44 cursor-pointer"
      />
      <Button
        variant="secondary"
        disabled={disabled}
        onClick={() => {
          if (playing) {
            pause();
          } else {
            setDay(0);
            play();
          }
        }}
      >
        {playing ? "Pause" : "Replay"}
      </Button>
    </div>
  );
}

const CELL_STYLE: Record<GridCell, string> = {
  short: "bg-out text-white",
  normal: "bg-grid",
  spare: "bg-scrub text-white",
  none: "border border-dashed border-stone bg-surface",
};

const CELL_GLYPH: Record<GridCell, string> = { short: "−", normal: "", spare: "+", none: "" };

const units = (n: number) => `${n.toLocaleString()} unit${n === 1 ? "" : "s"}`;

/**
 * A cell in words. Days of stock count deliveries due this week (the map's rule), so a
 * shelf can be empty yet have weeks of stock on the way; the text says so rather than
 * printing "0 units, 21 days of stock".
 */
function cellText(label: string, cell: GridCell, balance: FacilityBalance | null): string {
  if (!balance) return `${label}: doesn't carry it`;
  const shelf = `${units(balance.on_hand)} on the shelf`;
  const due = balance.incoming_7d > 0 ? ` and ${units(balance.incoming_7d)} due this week` : "";
  const days =
    balance.days_of_cover == null
      ? "no use expected"
      : `${Math.floor(balance.days_of_cover)} days of stock`;
  const state =
    cell === "short" ? ", under a week" : cell === "spare" ? ", over a month spare" : "";
  return `${label}: ${shelf}${due}, ${days}${state}`;
}

function KeySwatch({ cell, glyph }: { cell: GridCell; glyph?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 items-center justify-center rounded font-bold ${CELL_STYLE[cell]}`}
    >
      {glyph}
    </span>
  );
}

export function NetworkRedistributionPage() {
  const mode = useViewStore((s) => s.mode);
  const day = useViewStore((s) => s.day);
  const { run, isLoading, error, missingInputs } = useRun();
  const facilities = useFacilities().data?.facilities;
  const itemsAssessed = useSurveySummary().data?.items_assessed;
  const [showAllRows, setShowAllRows] = useState(false);

  const events = run?.events[mode];
  const totalDays = run?.days ?? 0;
  const activity = useMemo(
    () => networkActivity(events, day, totalDays),
    [events, day, totalDays],
  );
  const routes = useMemo(() => busiestRoutes(events, day), [events, day]);

  const positions = useRedistribution(run?.run_id ?? null, mode, day, null);
  const data = positions.data;
  const balances = data?.balances ?? NO_BALANCES;

  const labels = useMemo(
    () => new Map((facilities ?? []).map((f) => [f.id, f.display_label])),
    [facilities],
  );
  const columns = useMemo(() => {
    const ids = new Set(balances.map((b) => b.facility_id));
    return (facilities ?? []).filter((f) => ids.has(f.id) && f.in_network).map((f) => f.id);
  }, [balances, facilities]);
  const grid = useMemo(() => shortageGrid(balances, columns), [balances, columns]);
  const gridRows = showAllRows ? grid : grid.slice(0, GRID_ROWS_SHOWN);

  const short = data ? balances.filter((b) => b.position === "short").length : null;
  const spare = data ? balances.filter((b) => b.position === "surplus").length : null;

  // Units moved so far, with the day-1 opening rebalance called out when it is most of
  // the movement: otherwise the jump on day 1 looks like an error.
  const points = activity.cumulative;
  const dayOneUnits = points.find((p) => p.day === 1)?.units ?? 0;
  const openingRebalance = activity.units > 0 && dayOneUnits / activity.units > 0.5;
  const colours = {
    line: token("scrub"),
    grid: token("line-soft"),
    tick: token("muted"),
    ink: token("ink"),
  };
  const chartSummary =
    `Units moved between network facilities, day 1 to day ${day + 1}: ` +
    `${activity.units.toLocaleString()} in ${activity.transfers.toLocaleString()} transfers` +
    (openingRebalance ? `, ${dayOneUnits.toLocaleString()} of them on day 1.` : ".");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1360px] space-y-6 px-4 py-6 sm:px-6">
        {missingInputs && error && <MissingInputsNotice detail={error.detail} />}

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[40px] font-bold leading-[1.04] tracking-[-0.025em] text-ink sm:text-[52px]">
              Network
            </h1>
            <p className="mt-2 max-w-2xl text-[17px] text-ink-2">
              What has moved between the facilities in the Zealo network, and where stock is short
              or spare on the day shown.
            </p>
          </div>
          <DayControl disabled={!run} />
        </header>

        {mode === "without_zealo" && run && (
          <p className="rounded-xl border border-line bg-wash p-4 text-[15px] text-ink-2">
            Without Zealo there is no network: each facility manages its stock alone, so nothing
            moves between them.
          </p>
        )}

        {isLoading && (
          <p className="rounded-xl border border-line bg-surface p-5 text-[15px] text-muted">
            Running the simulation&hellip;
          </p>
        )}

        {run && (
          <>
            <div>
              <StatRow>
                <Stat label="Transfers" value={activity.transfers.toLocaleString()} />
                <Stat label="Units moved" value={activity.units.toLocaleString()} />
                <Stat label="Kilometres travelled" value={activity.distanceKm.toLocaleString()} />
                <Stat label="Units lost to expiry" value={activity.expiredUnits.toLocaleString()} />
                <Stat
                  label="Shelves under a week today"
                  value={short == null ? "—" : short.toLocaleString()}
                  tone="out"
                />
                <Stat
                  label="Shelves with over a month spare"
                  value={spare == null ? "—" : spare.toLocaleString()}
                  tone="scrub"
                />
              </StatRow>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
                Up to day {day + 1} of {totalDays}. A shelf is one medicine at one facility.
                Simulated <ProvenanceBadge provenance="estimated" />
              </p>
            </div>

            {/* The centrepiece: who is short and who has spare */}
            <Card>
              <CardTitle
                hint="Each row is a medicine, each column a facility. Zealo pairs a short cell with the nearest spare one in the same row."
                action={
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2" aria-label="Key">
                    <li className="flex items-center gap-1.5">
                      <KeySwatch cell="short" glyph="−" /> Under a week
                    </li>
                    <li className="flex items-center gap-1.5">
                      <KeySwatch cell="normal" /> A week to a month
                    </li>
                    <li className="flex items-center gap-1.5">
                      <KeySwatch cell="spare" glyph="+" /> Over a month spare
                    </li>
                    <li className="flex items-center gap-1.5">
                      <KeySwatch cell="none" /> Doesn&rsquo;t carry it
                    </li>
                  </ul>
                }
              >
                Who is short and who has spare, today
              </CardTitle>
              {!data ? (
                <p className="text-[15px] text-muted">Loading positions&hellip;</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="border-separate border-spacing-1 text-left">
                      <thead>
                        <tr>
                          <th className="w-[260px] min-w-[200px] pb-1 text-[13px] font-bold text-muted">
                            Medicine
                          </th>
                          {columns.map((id) => (
                            <th
                              key={id}
                              scope="col"
                              className="min-w-[56px] pb-1 align-bottom text-[13px] font-bold leading-tight text-ink-2"
                            >
                              {labels.get(id)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {gridRows.map((row) => (
                          <tr key={row.medicineId}>
                            <th
                              scope="row"
                              className="pr-2 text-[15px] font-bold text-ink"
                              title={row.name}
                            >
                              {shortMedicineName(row.name, 34)}
                            </th>
                            {row.cells.map((cell) => {
                              const text = cellText(
                                labels.get(cell.facilityId) ?? "",
                                cell.state,
                                cell.balance,
                              );
                              return (
                                <td key={cell.facilityId} className="p-0">
                                  <span
                                    tabIndex={0}
                                    title={text}
                                    // relative: keeps the visually hidden text inside the scrolling grid, or it widens the page.
                                    className={`relative flex h-10 items-center justify-center rounded text-lg font-bold ${CELL_STYLE[cell.state]}`}
                                  >
                                    <span aria-hidden="true">{CELL_GLYPH[cell.state]}</span>
                                    <span className="sr-only">{text}</span>
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {grid.length > GRID_ROWS_SHOWN && (
                    <Button
                      variant="ghost"
                      className="mt-2"
                      onClick={() => setShowAllRows((v) => !v)}
                    >
                      {showAllRows ? "Show the first twelve" : `Show all ${grid.length} medicines`}
                    </Button>
                  )}
                  <ul className="mt-3 space-y-1 text-sm text-muted">
                    {data.caveats.map((caveat) => (
                      <li key={caveat}>{caveat}</li>
                    ))}
                  </ul>
                </>
              )}
            </Card>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card>
                <CardTitle hint="Between network facilities, up to the day shown.">
                  Units moved so far
                </CardTitle>
                <div role="img" aria-label={chartSummary} className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={points} margin={{ top: 24, right: 72, bottom: 0, left: -6 }}>
                      <CartesianGrid stroke={colours.grid} vertical={false} />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 12, fill: colours.tick }}
                        tickLine={false}
                        axisLine={{ stroke: colours.grid }}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: colours.tick }}
                        tickLine={false}
                        axisLine={false}
                        width={60}
                      />
                      <Tooltip
                        content={({ active, payload, label }) =>
                          active && payload?.length && payload[0].value != null ? (
                            <div className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink shadow-[var(--shadow-float)]">
                              <p className="font-bold">Day {label}</p>
                              <p className="tabular">
                                {Number(payload[0].value).toLocaleString()} units moved so far
                              </p>
                            </div>
                          ) : null
                        }
                      />
                      <Line
                        type="stepAfter"
                        dataKey="units"
                        stroke={colours.line}
                        strokeWidth={2.5}
                        dot={false}
                        isAnimationActive={false}
                      />
                      {openingRebalance && (
                        <ReferenceDot
                          x={1}
                          y={dayOneUnits}
                          r={4}
                          fill={colours.line}
                          stroke="white"
                          label={{
                            value: "Opening rebalance",
                            position: "right",
                            fill: colours.ink,
                            fontSize: 12,
                            fontWeight: 700,
                            stroke: "white",
                            strokeWidth: 4,
                            paintOrder: "stroke",
                          }}
                        />
                      )}
                      {activity.units > 0 && day > 0 && (
                        <ReferenceDot
                          x={day + 1}
                          y={activity.units}
                          r={4}
                          fill={colours.line}
                          stroke="white"
                          label={{
                            value: activity.units.toLocaleString(),
                            position: "right",
                            fill: colours.ink,
                            fontSize: 12,
                            fontWeight: 700,
                          }}
                        />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card>
                <CardTitle hint="By units moved, up to the day shown.">Busiest routes</CardTitle>
                {routes.length === 0 ? (
                  <p className="text-[15px] text-muted">Nothing has moved yet.</p>
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>From and to</Th>
                        <Th align="right">Transfers</Th>
                        <Th align="right">Units</Th>
                        <Th align="right">Distance</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {routes.map((route) => (
                        <tr key={`${route.fromId}-${route.toId}`}>
                          <Td>
                            <span className="font-bold text-ink">{labels.get(route.fromId)}</span>
                            <span className="text-muted"> to </span>
                            <span className="font-bold text-ink">{labels.get(route.toId)}</span>
                          </Td>
                          <Td align="right">{route.transfers.toLocaleString()}</Td>
                          <Td align="right">{route.units.toLocaleString()}</Td>
                          <Td align="right">{route.distanceKm.toFixed(1)} km</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Card>
            </div>

            {data && data.unmapped_phcs.length > 0 && (
              <Card>
                <CardTitle hint="These PHCs were surveyed but have no public location in our sources yet, so they are not on the map. Their survey results still count in taluk-wide figures.">
                  {data.unmapped_phcs.length} surveyed PHCs without a location
                </CardTitle>
                <ul className="flex flex-wrap gap-2">
                  {data.unmapped_phcs.map((phc) => (
                    <li
                      key={phc.phc_number}
                      className="flex items-center gap-2 rounded-lg border-[1.5px] border-dashed border-stone px-3 py-2 text-sm text-ink-2"
                    >
                      <span>
                        <span className="font-bold text-ink">Survey profile {phc.phc_number}</span>
                        : {phc.availability_pct.toFixed(1)}%, {phc.items_in_stock}
                        {itemsAssessed ? ` of ${itemsAssessed}` : ""} items
                      </span>
                      <ProvenanceBadge provenance={phc.provenance} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
