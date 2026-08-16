"use client";

// Weekly transaction line graph for the `/` office landing summary.
//
// Traceability:
//   specs/05-ui-shell-and-navigation/requirements.md R11.3 (Weekly
//     transaction line graph), R11.5 (no raw financial metrics on `/` — the
//     "sales" ($) series named in R11.3 is superseded by this session's
//     confirmed scope decision: 2 series only, outgoing quantity + CBM, no
//     pricing/billing backend exists yet).
//
// Reuses the recharts import/usage style already established by
// components/reporting/MonthlyFlowChart.tsx for consistency.

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type WeeklyTrendDatum = { period: string; qty: number; cbm: number };

export function WeeklyTrendChart({ data }: { data: WeeklyTrendDatum[] }) {
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#E2E8F0" strokeOpacity={0.3} />
          <XAxis
            dataKey="period"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#475569", fontSize: 12, fontFamily: "var(--font-glacial)" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#475569", fontSize: 12, fontFamily: "var(--font-glacial)" }}
            width={34}
          />
          <Tooltip
            cursor={{ stroke: "#E2E8F0" }}
            contentStyle={{ borderRadius: 8, border: "1px solid rgba(226,232,240,0.3)", fontFamily: "var(--font-glacial)", fontSize: 13 }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            wrapperStyle={{ fontFamily: "var(--font-glacial)", fontSize: 12, color: "#475569" }}
          />
          <Line type="monotone" dataKey="qty" name="Outgoing Qty" stroke="#1E293B" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="cbm" name="CBM" stroke="#64748B" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
