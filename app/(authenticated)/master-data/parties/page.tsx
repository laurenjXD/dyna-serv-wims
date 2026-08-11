// Party list — superseded entry point.
//
// 2026-08-11 (revision-log): the standalone "/master-data/parties" list page
// no longer has its own sidebar entry — "/enrollment" (Parties tab) is the
// SOLE Master Data nav destination and is the real, current implementation
// of this list (see app/(authenticated)/enrollment/page.tsx). This route is
// kept reachable (old bookmarks/deep links, and it remains the base path for
// the still-real /master-data/parties/new, /master-data/parties/[partyId],
// and /master-data/parties/[partyId]/edit routes) but no longer renders its
// own duplicate table — it forwards straight to the real list, preserving
// any search/page query params.
//
// Traceability:
//   specs/06-party-and-item-enrollment/design.md §7
//   specs/00-steering/revision-log.md (2026-08-11 Master Data nav consolidation)

import { redirect } from "next/navigation";

interface PageProps {
  searchParams: Promise<{ search?: string; page?: string }>;
}

export default async function PartiesPage({ searchParams }: PageProps) {
  const { search, page } = await searchParams;

  const params = new URLSearchParams({ tab: "parties" });
  if (search) params.set("search", search);
  if (page) params.set("page", page);

  redirect(`/enrollment?${params.toString()}`);
}
