"use client";

import { useEffect } from "react";

export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Authenticated route failed to render", error);
  }, [error]);

  return (
    <main
      className="flex min-h-[50vh] items-center justify-center p-6 text-center"
      role="alert"
    >
      <div className="max-w-lg space-y-4">
        <h1 className="font-heading text-headline-md font-semibold text-brand-navy">
          We couldn&apos;t load your workspace
        </h1>
        <p className="font-body text-body-md text-text-grey">
          You are still signed in, but this page&apos;s data did not finish
          loading. Try again or continue to the dashboard.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              // A route-level server error can leave the App Router cache
              // holding the failed RSC payload. A full reload requests a
              // fresh server render; reset() alone can appear to do nothing
              // when the same cached payload is returned.
              window.location.reload();
            }}
            className="min-h-11 rounded bg-brand-navy px-5 font-label text-label uppercase tracking-wide text-surface-white"
          >
            Try again
          </button>
          <a
            href="/dashboard"
            className="inline-flex min-h-11 items-center rounded border border-brand-navy px-5 font-label text-label uppercase tracking-wide text-brand-navy"
          >
            Go to dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
