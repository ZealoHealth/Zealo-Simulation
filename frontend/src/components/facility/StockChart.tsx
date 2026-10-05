/**
 * One medicine at one facility over the run: what is on the shelf, what will be once
 * everything on its way arrives, and the reorder point a refill is triggered against.
 *
 * One hue per series, no fills; status colours are not used here because nothing on
 * this chart is a status. A sentence summarising it is the accessible name.
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MedicineSeries, SimulationEvent } from "../../api/types";
import { token } from "../../ui/tokens";
import { chartPoints, transferMarks } from "./shelfLogic";

function Swatch({ dash, colour }: { dash?: string; colour: string }) {
  return (
    <svg width="26" height="8" aria-hidden="true">
      <line
        x1="1"
        y1="4"
        x2="25"
        y2="4"
        stroke={colour}
        strokeWidth="2.5"
        strokeDasharray={dash}
      />
    </svg>
  );
}

export function StockChart({
  series,
  events,
  facilityId,
  facilityLabel,
  labels,
  day,
}: {
  series: MedicineSeries;
  events: SimulationEvent[];
  facilityId: string;
  facilityLabel: string;
  labels: Map<string, string>;
  day: number;
}) {
  const points = chartPoints(series);
  const marks = transferMarks(events, facilityId, series, labels);
  const colours = {
    shelf: token("scrub"),
    incoming: token("move"),
    reorder: token("stone"),
    grid: token("line-soft"),
    tick: token("muted"),
    ink: token("ink"),
  };
  const hasPolicyLines = points.some((p) => p.reorderPoint != null);

  const shelf = series.on_hand;
  const transfersIn = events.filter(
    (e) =>
      e.medicine_id === series.medicine_id &&
      e.to_facility_id === facilityId &&
      (e.type === "relief_transfer" || e.type === "rebalance_transfer"),
  ).length;
  const summary =
    `${series.name} at ${facilityLabel} over ${shelf.length} days: between ` +
    `${Math.min(...shelf).toLocaleString()} and ${Math.max(...shelf).toLocaleString()} units ` +
    `on the shelf, ${transfersIn} transfer${transfersIn === 1 ? "" : "s"} in from the network.`;

  const eventsOn = (shownDay: number) =>
    events.filter((e) => e.medicine_id === series.medicine_id && e.day === shownDay - 1);

  return (
    <figure>
      <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
        <li className="flex items-center gap-1.5">
          <Swatch colour={colours.shelf} /> Units on the shelf
        </li>
        {hasPolicyLines && (
          <>
            <li className="flex items-center gap-1.5">
              <Swatch colour={colours.incoming} dash="6 4" /> Shelf plus deliveries on the way
            </li>
            <li className="flex items-center gap-1.5">
              <Swatch colour={colours.reorder} dash="2 4" /> Reorder point
            </li>
          </>
        )}
      </ul>
      <div role="img" aria-label={summary} className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 18, right: 12, bottom: 0, left: -6 }}>
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
              width={52}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as (typeof points)[number];
                const happened = eventsOn(Number(label)).slice(0, 2);
                return (
                  <div className="max-w-64 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink shadow-[var(--shadow-float)]">
                    <p className="font-bold">Day {label}</p>
                    <p className="tabular">On the shelf: {point.shelf.toLocaleString()}</p>
                    {point.withIncoming != null && (
                      <p className="tabular">
                        With deliveries on the way: {point.withIncoming.toLocaleString()}
                      </p>
                    )}
                    {point.reorderPoint != null && (
                      <p className="tabular">
                        Reorder point: {point.reorderPoint.toLocaleString()}
                      </p>
                    )}
                    {happened.map((e, i) => (
                      <p key={i} className="mt-1 text-muted">
                        {e.message}
                      </p>
                    ))}
                  </div>
                );
              }}
            />
            {hasPolicyLines && (
              <Line
                type="stepAfter"
                dataKey="reorderPoint"
                stroke={colours.reorder}
                strokeWidth={1.5}
                strokeDasharray="2 4"
                dot={false}
                isAnimationActive={false}
              />
            )}
            {hasPolicyLines && (
              <Line
                type="stepAfter"
                dataKey="withIncoming"
                stroke={colours.incoming}
                strokeWidth={2}
                strokeDasharray="6 4"
                dot={false}
                isAnimationActive={false}
              />
            )}
            <Line
              type="stepAfter"
              dataKey="shelf"
              stroke={colours.shelf}
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
            <ReferenceLine
              x={day + 1}
              stroke={colours.ink}
              strokeWidth={1}
              label={{ value: "Today", position: "top", fill: colours.ink, fontSize: 12 }}
            />
            {marks.map((mark) => (
              <ReferenceDot
                key={`${mark.day}-${mark.label}`}
                x={mark.day}
                y={mark.shelf}
                r={4}
                fill={colours.incoming}
                stroke="white"
                label={{
                  value: mark.label,
                  // Near the start the label would run off the left edge; put it to the right.
                  position: mark.day < points.length * 0.2 ? "right" : "top",
                  fill: colours.incoming,
                  fontSize: 12,
                  fontWeight: 700,
                  // A white halo keeps the label readable where it crosses the lines.
                  stroke: "white",
                  strokeWidth: 4,
                  paintOrder: "stroke",
                }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
