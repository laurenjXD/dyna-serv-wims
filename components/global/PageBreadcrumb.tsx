import Link from "next/link";
import { ChevronRight } from "lucide-react";

export function PageBreadcrumb({
  backHref,
  backLabel,
  currentLabel,
  monoCurrent = false,
  className = "",
}: {
  backHref: string;
  backLabel: string;
  currentLabel?: string;
  monoCurrent?: boolean;
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={`mb-5 ${className}`}>
      <ol className="inline-flex min-h-11 items-center rounded-full border border-outline-variant/50 bg-surface-white p-1 shadow-elevation-1">
        <li><Link href={backHref} className="inline-flex h-9 items-center rounded-full px-3 font-label text-label font-bold text-brand-navy transition-colors hover:bg-brand-blue/5 focus:outline-none focus:ring-2 focus:ring-brand-navy">{backLabel}</Link></li>
        {currentLabel && <><li aria-hidden="true" className="px-1 text-text-grey"><ChevronRight size={16} strokeWidth={2} /></li><li aria-current="page" className={`pr-4 font-label text-label font-bold text-on-surface ${monoCurrent ? "font-mono text-mono-md" : ""}`}>{currentLabel}</li></>}
      </ol>
    </nav>
  );
}
