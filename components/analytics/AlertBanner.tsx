import Link from "next/link";
export function AlertBanner({ severity, message, linkTo, linkLabel }: { severity: "warning" | "critical"; message: string; linkTo: string; linkLabel: string }) {
  const critical = severity === "critical";
  return <div className={`flex flex-wrap items-center gap-3 rounded border-l-4 bg-surface-dim p-4 ${critical ? "border-status-error" : "border-status-warning"}`} role="alert"><span aria-hidden="true" className={`text-body-lg ${critical ? "text-status-error" : "text-status-warning"}`}>{critical ? "⊗" : "⚠"}</span><p className="flex-1 font-body text-body-md text-on-surface">{message}</p><Link href={linkTo} className="font-label text-label font-semibold text-primary underline focus:outline-none focus:ring-2 focus:ring-primary">{linkLabel}</Link></div>;
}
