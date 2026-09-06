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
          Your sign-in succeeded, but the workspace data did not finish loading.
          Try again, or return to the sign-in page if the problem continues.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="min-h-11 rounded bg-brand-navy px-5 font-label text-label uppercase tracking-wide text-surface-white"
          >
            Try again
          </button>
          <a
            href="/login"
            className="inline-flex min-h-11 items-center rounded border border-brand-navy px-5 font-label text-label uppercase tracking-wide text-brand-navy"
          >
            Return to sign in
          </a>
        </div>
      </div>
    </main>
  );
}
