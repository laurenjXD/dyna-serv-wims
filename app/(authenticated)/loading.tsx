"use client";

import { useEffect, useState } from "react";

export default function AuthenticatedLoading() {
  const [isTakingLonger, setIsTakingLonger] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setIsTakingLonger(true), 10000);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <main
      className="flex min-h-[50vh] items-center justify-center p-6 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="space-y-2">
        {!isTakingLonger && (
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-brand-royal-blue/20 border-t-brand-royal-blue" />
        )}
        <p className="font-body text-body-md text-text-grey">Loading your workspace…</p>
        {isTakingLonger && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 inline-flex min-h-10 items-center rounded-xl bg-brand-navy px-4 font-body text-sm font-semibold text-surface-white hover:bg-brand-navy/90"
          >
            Try again
          </button>
        )}
      </div>
    </main>
  );
}
