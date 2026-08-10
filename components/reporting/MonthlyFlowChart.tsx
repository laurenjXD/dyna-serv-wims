"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface MonthlyFlowDatum {
  month: string;
  vmi: number;
  trading: number;
  supplies: number;
}

export function MonthlyFlowChart({ data }: { data: MonthlyFlowDatum[] }) {
  return (
    <div className="mt-5 h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }} barSize={34}>
          <CartesianGrid vertical={false} stroke="#C5C6D2" strokeOpacity={0.3} />
          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: "#555555", fontSize: 12, fontFamily: "var(--font-inter)" }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#555555", fontSize: 12, fontFamily: "var(--font-inter)" }} width={34} />
          <Tooltip
            cursor={{ fill: "#F2F2F2" }}
            contentStyle={{ borderRadius: 8, border: "1px solid rgba(197,198,210,0.3)", fontFamily: "var(--font-inter)", fontSize: 13 }}
          />
          <Bar dataKey="vmi" stackId="flow" fill="#002060" radius={[0, 0, 0, 0]} />
          <Bar dataKey="trading" stackId="flow" fill="#2E4094" radius={[0, 0, 0, 0]} />
          <Bar dataKey="supplies" stackId="flow" fill="#64748B" radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
