"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = ["#002060", "#2E4094", "#64748B", "#FF2929"];

export function LocationOccupancyChart() {
  const data = [
    { name: "Zone A Storage", value: 42 },
    { name: "Zone B Racks", value: 31 },
    { name: "Cold Storage", value: 19 },
    { name: "Overflow", value: 8 },
  ];

  return (
    <div className="mt-5 h-52">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid rgba(197,198,210,0.3)", fontFamily: "var(--font-inter)", fontSize: 13 }} />
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={85} paddingAngle={2} stroke="none">
            {data.map((entry, index) => <Cell key={entry.name} fill={COLORS[index]} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
