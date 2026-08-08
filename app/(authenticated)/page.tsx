// `/` — moved into the `(authenticated)` route group so it renders behind
// AuthenticatedShellBoundary/ShellChrome (app/(authenticated)/layout.tsx),
// per specs/05-ui-shell-and-navigation/design.md §3.2's `/` route (registry
// id "root", capability "none", surface "shared" — any authenticated user,
// no specific grant required).
//
// KNOWN SEAM GAP (flag for integration-reviewer): `data` below is
// placeholder/empty. Real task-count, queue-card, and recent-activity
// figures are each owned by their respective feature backends
// (07-incoming-receiving, 08-outgoing-withdrawal-and-two-stage-commitment,
// 11-transfer-and-inspection, 16-reporting-and-analytics) — none of which
// have a landing-page summary query wired yet. This page renders the
// correct floor/office *shape* now (per lib/shell/landing.ts) with zeroed
// data, so no feature spec's UI is blocked on this fixture.
"use client";

import { LandingPage } from "@/components/global/LandingPage";
import { useShellAuthorizationContext } from "@/components/global/AuthenticatedShellBoundary";
import { resolveSessionPresentationTier } from "@/lib/shell/surface";
import type { LandingPageSummaryData } from "@/lib/shell/landing";

const EMPTY_LANDING_DATA: LandingPageSummaryData = {
  taskCounts: { receiving: 0, picking: 0, inspection: 0 },
  quickActions: [],
  workQueueCta: { label: "Open work queue", href: "/receiving" },
  queueCards: [],
  recentActivity: [],
};

export default function Home() {
  const context = useShellAuthorizationContext();
  const tier = resolveSessionPresentationTier(context?.activeRoleKeys ?? []);
  const hasReportingRead =
    context?.grants.some(
      (grant) => grant.resource === "reporting" && grant.action === "read",
    ) ?? false;

  return (
    <LandingPage tier={tier} hasReportingRead={hasReportingRead} data={EMPTY_LANDING_DATA} />
  );
}
