export type TrendPoint = { date: string; value: number };
export type Period = "day" | "week" | "month";

export function TrendLineChart({ data, period, onPeriodChange, label, title, color = "#2E4094" }: {
  data: TrendPoint[]; period: Period; onPeriodChange: (period: Period) => void; label: string; title: string; color?: string;
}) {
  const width = 720; const height = 240; const pad = 32;
  const max = Math.max(1, ...data.map((point) => point.value));
  const points = data.map((point, index) => `${pad + (index * (width - pad * 2)) / Math.max(1, data.length - 1)},${height - pad - (point.value / max) * (height - pad * 2)}`).join(" ");
  return <section className="rounded bg-white p-6 shadow-elevation-1">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><span className="font-body text-body-sm text-on-surface-variant">{label}</span><div className="flex gap-2" role="tablist" aria-label={`${title} period`}>
      {(["day", "week", "month"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={period === value} onClick={() => onPeriodChange(value)} className={`rounded px-3 py-1 font-label text-label font-semibold ${period === value ? "bg-action-blue text-white" : "bg-surface-dim text-on-surface"}`}>{value}</button>)}
    </div></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} — ${period} view`} className="h-auto w-full" preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map((fraction) => <line key={fraction} x1={pad} x2={width - pad} y1={height - pad - fraction * (height - pad * 2)} y2={height - pad - fraction * (height - pad * 2)} stroke="currentColor" className="text-outline-variant/30" strokeDasharray="4 4" />)}
      {points && <polyline points={points} fill="none" stroke={color} strokeWidth="2" />}
      {data.map((point, index) => { const [x, y] = points.split(" ")[index].split(","); return <circle key={`${point.date}-${index}`} cx={x} cy={y} r="4" fill={color}><title>{point.date}: {point.value}</title></circle>; })}
    </svg>
    <table className="sr-only"><caption>{title}</caption><thead><tr><th>Date</th><th>Value</th></tr></thead><tbody>{data.map((point) => <tr key={point.date}><td>{point.date}</td><td>{point.value}</td></tr>)}</tbody></table>
  </section>;
}
