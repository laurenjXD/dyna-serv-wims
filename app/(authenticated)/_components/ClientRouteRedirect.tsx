"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Browser-facing aliases use a client handoff instead of a server redirect.
 *
 * These routes are kept for old bookmarks and deep links. A client handoff
 * avoids replacing the authenticated App Router tree with a redirect flight
 * response, which can otherwise make Next 15/React 19 lose hook ordering on
 * the subsequent destination render.
 */
export function ClientRouteRedirect({ href }: { href: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace(href);
  }, [href, router]);

  return (
    <main
      className="flex min-h-[50vh] items-center justify-center p-6 text-center"
      role="status"
      aria-live="polite"
    >
      <p className="font-body text-body-md text-text-grey">Opening the requested workspace…</p>
    </main>
  );
}
