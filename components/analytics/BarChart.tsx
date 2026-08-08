export type BarDatum = { label: string; value: number; color?: string };

export function BarChart({ data, title, xAxisLabel, yAxisLabel, horizontal = false }: {
  data: BarDatum[]; title: string; xAxisLabel: string; yAxisLabel: string; horizontal?: boolean;
}) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return <section className="rounded bg-surface-white p-6 shadow-elevation-1" aria-label={title}>
    <div className={horizontal ? "space-y-3" : "flex min-h-56 items-end gap-3 overflow-x-auto border-b border-outline-variant/30 pb-2"}>
      {data.map((item) => <div key={item.label} className={horizontal ? "flex items-center gap-3" : "flex min-w-12 flex-1 flex-col justify-end gap-1"}>
        <span className="font-mono text-mono-sm text-on-surface">{item.value}</span><div className={horizontal ? "h-6 flex-1" : "flex h-40 w-full items-end"}>
          <div className={`${horizontal ? "h-full" : "w-full"} rounded-t bg-brand-royal-blue`} style={{ ...(horizontal ? { width: `${(item.value / max) * 100}%` } : { height: `${(item.value / max) * 100}%` }), backgroundColor: item.color }} />
        </div><span className="max-w-32 truncate text-center font-label text-label text-text-grey">{item.label}</span>
      </div>)}
    </div><p className="mt-3 font-body text-body-sm text-text-grey">{xAxisLabel} · {yAxisLabel}</p>
    <table className="sr-only"><caption>{title}</caption><thead><tr><th>Category</th><th>Value</th></tr></thead><tbody>{data.map((item) => <tr key={item.label}><td>{item.label}</td><td>{item.value}</td></tr>)}</tbody></table>
  </section>;
}
