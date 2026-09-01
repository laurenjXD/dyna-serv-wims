import Link from "next/link";
export function AlertBanner({ severity, message, linkTo, linkLabel }: { severity: "warning" | "critical"; message: string; linkTo: string; linkLabel: string }) {
  const critical = severity === "critical";
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-lg border bg-surface p-4 shadow-sm transition-all ${
        critical ? "border-status-held/40 bg-status-held/5" : "border-status-pending/40 bg-status-pending/5"
      }`}
      role="alert"
    >
      <span
        aria-hidden="true"
        className={`flex h-8 w-8 items-center justify-center rounded-full font-bold text-body-md ${
          critical ? "bg-status-held/15 text-status-held" : "bg-status-pending/15 text-status-pending"
        }`}
      >
        {critical ? "⊗" : "⚠"}
      </span>
      <p className="flex-1 font-body text-body-md text-on-surface">{message}</p>
      <Link
        href={linkTo}
        className="font-label text-label font-semibold text-brand-navy underline hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      >
        {linkLabel}
      </Link>
    </div>
  );
}
