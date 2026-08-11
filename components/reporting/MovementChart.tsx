"use client";

// Client-boundary chart for /reports — recharts requires a browser canvas,
// so this is split out from the server-rendered reports/page.tsx (same
// pattern as any other client-only widget in an otherwise server page).
//
// brand-design-system.md §9 dashboard pattern: chart colors pull from the
// existing brand/status/accent palette only, brand-red (#9A3412) used
// sparingly as the single highlighted series/bar, accent-indigo-600
// (#1E293B) for the rest.
//
// Inline hex below is the sanctioned §12 exception for SVG chart props
// (recharts doesn't accept Tailwind classes) — every value here is an exact
// match to an already-documented §1 token, never a new color.

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface MovementChartDatum {
  date: string;
  label: string;
  count: number;
}

export function MovementChart({ data }: { data: MovementChartDatum[] }) {
  return (
    <div className="mt-4 h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#E2E8F0" strokeOpacity={0.3} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#475569", fontSize: 12, fontFamily: "var(--font-inter)" }}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#475569", fontSize: 12, fontFamily: "var(--font-inter)" }}
            width={28}
          />
          <Tooltip
            cursor={{ fill: "#F8FAFC" }}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid rgba(226,232,240,0.3)",
              fontFamily: "var(--font-inter)",
              fontSize: 13,
            }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
            {data.map((entry, index) => (
              <Cell
                key={entry.date}
                fill={index === data.length - 1 ? "#9A3412" : "#1E293B"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
