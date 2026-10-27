"use client";

import { BarChart2, RefreshCw } from "@/components/ui/icons";
import Link from "next/link";

export default function ReportsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl items-center justify-center px-6 py-12">
      <div
        role="alert"
        className="w-full rounded-xl border border-border bg-surface p-6 text-center shadow-elevation-1"
      >
        <BarChart2 className="mx-auto mb-3 h-10 w-10 text-brand-navy" aria-hidden="true" />
        <h1 className="font-heading text-lg font-bold text-on-surface">
          Reports could not be loaded
        </h1>
        <p className="mt-2 font-body text-sm text-text-grey">
          The reports data did not finish loading. Your other workspace pages are still available.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-brand-navy px-4 font-label text-xs font-bold text-white transition-colors hover:bg-brand-navy/90"
          >
            <RefreshCw size={14} aria-hidden="true" />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-md border border-border bg-surface px-4 font-label text-xs font-bold text-on-surface transition-colors hover:bg-surface-light-grey"
          >
            Go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
