// `/` — authenticated landing page.
//
// Traceability:
//   specs/05-ui-shell-and-navigation/design.md §3.2 (`/` route: capability
//     "none", surface "shared", added 2026-08-07; §3.3 floor vs. office shell
//     behavior; §3.2 office heatmap widget gated by reporting.read at the
//     widget level, not the route level).
//   specs/05-ui-shell-and-navigation/requirements.md R11.2 (floor vs. office
//     summary shape per resolved surface), R11.5 (no KPI/financial metrics on
//     `/`), R11.6 (reporting.read → ActivityHeatmap widget, office/party only).
//   specs/00-steering/brand-design-system.md §3 (floor primary actions,
//     touch targets, dark surface), §6 (no glassmorphism on floor), §9
//     (floor CTA h-16 full-width), §10 (active: press feedback, no hover
//     on floor).
//
// Surface: "shared" — floor tier for warehouse_staff sessions, office tier
// for supervisor/administrator/party_user sessions.
//
// This is a Server Component: it resolves the session and user's display
// name server-side, following the same pattern as app/(authenticated)/receiving/page.tsx.
//
// KNOWN SEAM GAP (flag for integration-reviewer): all count data below is
// zeroed placeholder. Real aggregation queries are owned by:
//   openWrrs         → 07-incoming-receiving
//   openPickLists    → 08-outgoing-withdrawal-and-two-stage-commitment
//   pendingTransfers → 11-transfer-and-inspection
//   pendingApprovals → 09-approval-queue
// Wire each when its owning feature's backend query is available.

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { PackageCheck, ListChecks, ArrowLeftRight, Clock, CheckSquare } from "lucide-react";
import { eq } from "drizzle-orm";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { resolveSessionPresentationTier } from "@/lib/shell/surface";
import { db } from "@/lib/db/client";
import { userProfiles } from "@/lib/db/schema";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreetingPeriod(hour: number): string {
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function getTodayString(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ─── Floor surface ─────────────────────────────────────────────────────────────
//
// brand-design-system.md §3/§6/§9: dark navy bg, solid surfaces (no
// glassmorphism), h-16 full-width primary CTA, active: press feedback only
// (no hover), all text ≥ 16px, floor primary touch targets 64px min.

function FloorLanding({
  firstName,
  greeting,
  dateString,
  openWrrs,
  openPickLists,
  pendingTransfers,
}: {
  firstName: string;
  greeting: string;
  dateString: string;
  openWrrs: number;
  openPickLists: number;
  pendingTransfers: number;
}) {
  return (
    // bg-brand-navy fills the main content area.  The ShellChrome already
    // provides pt-14 (header) and pb-20 (tab bar) on the <main> wrapper, so
    // no additional chrome-clearance padding is needed here.
    <div className="flex min-h-full flex-col gap-6 bg-brand-navy px-4 py-6">
      {/* ── Greeting header ──────────────────────────────────────────────── */}
      <header>
        <h1 className="font-heading text-headline-lg font-extrabold text-white">
          Good {greeting}, {firstName}
        </h1>
        <p className="mt-1 font-body text-body-md text-white/70">{dateString}</p>
      </header>

      {/* ── Today's task summary card ─────────────────────────────────────
          brand-design-system.md §6: solid bg-white/10, no backdrop-blur.
          Each count row: large number (text-data-display / font-heading),
          label (text-body-md / font-body). */}
      <section
        aria-label="Today's open tasks"
        data-testid="landing-task-counts"
        className="rounded-2xl bg-white/10 p-6"
      >
        <p className="font-label text-body-md uppercase tracking-wide text-white/70">
          Today&apos;s Open Tasks
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="font-body text-body-md text-white/70">Receiving</span>
            <span className="font-heading text-data-display font-semibold text-white">
              {openWrrs} WRRs open
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-body text-body-md text-white/70">Picking</span>
            <span className="font-heading text-data-display font-semibold text-white">
              {openPickLists} pick lists assigned
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-body text-body-md text-white/70">Transfers</span>
            <span className="font-heading text-data-display font-semibold text-white">
              {pendingTransfers} transfers pending
            </span>
          </div>
        </div>
      </section>

      {/* ── Quick Actions ─────────────────────────────────────────────────
          Three h-16 (64px) floor-primary-sized buttons: icon (24px Lucide)
          stacked above label.  active: press feedback per §10, no hover. */}
      <section
        aria-label="Quick actions"
        data-testid="landing-quick-actions"
        className="flex flex-col gap-3"
      >
        <h2 className="font-heading text-body-md uppercase tracking-wide text-white/70">
          Quick Actions
        </h2>
        <Link
          href="/receiving"
          className="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-xl bg-white/10 font-body text-body-md text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy motion-safe:transition-transform motion-safe:duration-100 active:scale-[0.97]"
        >
          <PackageCheck size={24} strokeWidth={2} aria-hidden="true" />
          Go to Receiving
        </Link>
        <Link
          href="/outgoing"
          className="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-xl bg-white/10 font-body text-body-md text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy motion-safe:transition-transform motion-safe:duration-100 active:scale-[0.97]"
        >
          <ListChecks size={24} strokeWidth={2} aria-hidden="true" />
          Pick List
        </Link>
        <Link
          href="/transfers"
          className="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-xl bg-white/10 font-body text-body-md text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy motion-safe:transition-transform motion-safe:duration-100 active:scale-[0.97]"
        >
          <ArrowLeftRight size={24} strokeWidth={2} aria-hidden="true" />
          Transfers
        </Link>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────────────────
          Full-width bg-brand-red h-16 per §9 floor primary action rules.
          Not fixed: the ShellChrome's main already ensures chrome clearance
          via pb-20.  The content fits on a 375px screen without scrolling
          so this sits naturally in the bottom third. */}
      <Link
        href="/receiving"
        data-testid="landing-work-queue-cta"
        className="mt-auto flex h-16 w-full items-center justify-center rounded-xl bg-brand-red font-label text-body-md uppercase tracking-wide text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy motion-safe:transition-transform motion-safe:duration-100 active:scale-[0.97]"
      >
        View All Open Work
      </Link>
    </div>
  );
}

// ─── Office surface ────────────────────────────────────────────────────────────
//
// brand-design-system.md §6 Level 1 elevation: bg-surface-white
// for cards. Touch targets h-11 (44px). Hover states permitted.

function QueueCard({
  label,
  openCount,
  todayCount,
  icon: Icon,
}: {
  label: string;
  openCount: number;
  todayCount: number;
  icon: LucideIcon;
}) {
  return (
    <div className="min-w-[200px] flex-1 rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 transition-shadow hover:shadow-elevation-2">
      <div className="flex items-center justify-between">
        <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
          {label}
        </p>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-indigo-50 text-accent-indigo-600">
          <Icon size={18} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 font-heading text-headline-xl font-extrabold text-on-surface">
        {openCount}
      </p>
      <p className="font-body text-body-sm text-text-grey">
        open &middot; {todayCount} today
      </p>
    </div>
  );
}

function OfficeLanding({
  dateString,
  openWrrs,
  openPickLists,
  pendingTransfers,
  pendingApprovals,
  hasApprovalAccess,
  hasReportingRead,
}: {
  dateString: string;
  openWrrs: number;
  openPickLists: number;
  pendingTransfers: number;
  pendingApprovals: number;
  hasApprovalAccess: boolean;
  hasReportingRead: boolean;
}) {
  return (
    <div className="mx-auto max-w-container px-6 py-8 lg:px-8">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="mb-8">
        <h1 className="font-heading text-headline-xl font-extrabold text-on-surface">
          Dashboard
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">{dateString}</p>
      </header>

      {/* ── Queue summary cards ───────────────────────────────────────────
          Horizontal row that wraps on mobile.  4 cards: Receiving, Picking,
          Transfers, and Approvals (only if fifo_override.approve capability).
          design.md §3.2: office surface, Level 1 elevation cards. These are
          open-task counts, not KPI/financial metrics — R11.5 still applies;
          real analytics/KPI content lives on /reports (spec 16), not here. */}
      <section
        aria-label="Queue summaries"
        data-testid="landing-queue-cards"
        className="mb-8"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <QueueCard label="Receiving" openCount={openWrrs} todayCount={0} icon={PackageCheck} />
          <QueueCard label="Picking" openCount={openPickLists} todayCount={0} icon={ListChecks} />
          <QueueCard label="Transfers" openCount={pendingTransfers} todayCount={0} icon={ArrowLeftRight} />
          {/* Approvals card — gated at widget level by fifo_override.approve */}
          {hasApprovalAccess && (
            <QueueCard label="Approvals" openCount={pendingApprovals} todayCount={0} icon={CheckSquare} />
          )}
        </div>
      </section>

      {/* ── Recent Activity feed ─────────────────────────────────────────
          Last 5 recent transactions — placeholder until real aggregation
          query is wired (design.md §3.2 office surface, no KPI/financial
          data per R11.5). */}
      <section
        aria-label="Recent activity"
        data-testid="landing-recent-activity"
        className="mb-8 rounded-xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1"
      >
        <h2 className="flex items-center gap-2 font-heading text-headline-md font-semibold text-on-surface">
          <Clock size={20} className="text-brand-red" aria-hidden="true" />
          Recent Activity
        </h2>
        {/* TODO: wire to real activity feed query (07/08/11 transaction events) */}
        <p className="mt-4 font-body text-body-md text-text-grey">
          Recent activity will appear here.
        </p>
      </section>

      {/* ── ActivityHeatmap widget ────────────────────────────────────────
          Gated by reporting.read at the widget level only — `/` route itself
          has no capability gate (design.md §3.2).  Sourced from
          16-reporting-and-analytics design.md §4.3 (forward-dependency).
          "party" sessions with reporting.read also receive this widget
          (design.md §3.2: "party" sessions receive office content). */}
      {hasReportingRead && (
        <section
          aria-label="Inventory activity heatmap"
          data-testid="landing-activity-heatmap"
          className="rounded-xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1"
        >
          <h2 className="font-heading text-headline-md font-semibold text-on-surface">
            Inventory Activity (52 weeks)
          </h2>
          <p className="mt-2 font-body text-body-sm text-text-grey">
            Heatmap widget — sourced from spec 16, to be wired when reports are
            built.
          </p>
        </section>
      )}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function Home() {
  const resolver = await createPageResolver();
  const resolution = await resolver.getContext();

  // Safe fallback — AuthenticatedShellBoundary in the layout handles the real
  // redirect/revoked-session rendering client-side. This branch should never
  // be visible in a production session.
  if (resolution.kind !== "authorized") {
    return null;
  }

  const { context } = resolution;
  const tier = resolveSessionPresentationTier(context.activeRoleKeys);

  // Capability checks — widget-level gates only (route itself has none)
  const hasReportingRead = context.grants.some(
    (g) => g.resource === "reporting" && g.action === "read",
  );
  const hasApprovalAccess = context.grants.some(
    (g) => g.resource === "fifo_override" && g.action === "approve",
  );

  // Display name for greeting — from user_profiles.display_name.
  // Falls back to "there" if the profile row isn't found (edge case during
  // account bootstrap; should never happen for an active session).
  const profileRows = await db
    .select({ displayName: userProfiles.displayName })
    .from(userProfiles)
    .where(eq(userProfiles.id, context.userId))
    .limit(1);
  const displayName = profileRows[0]?.displayName ?? "";
  const firstName = displayName.split(" ")[0] || "there";

  // Time-based greeting — server time.  Acceptable for an initial render;
  // a client-side hydration correction could be added later if timezone
  // accuracy becomes a requirement.
  const now = new Date();
  const greeting = getGreetingPeriod(now.getHours());
  const dateString = getTodayString();

  // Placeholder counts — TODO: wire to real aggregation queries
  const openWrrs = 0; // TODO: wire to real query (07-incoming-receiving)
  const openPickLists = 0; // TODO: wire to real query (08-outgoing-withdrawal)
  const pendingTransfers = 0; // TODO: wire to real query (11-transfer-and-inspection)
  const pendingApprovals = 0; // TODO: wire to real query (09-approval-queue)

  if (tier === "floor") {
    return (
      <FloorLanding
        firstName={firstName}
        greeting={greeting}
        dateString={dateString}
        openWrrs={openWrrs}
        openPickLists={openPickLists}
        pendingTransfers={pendingTransfers}
      />
    );
  }

  // "office" and "party" tiers both receive the office content shape
  // (design.md §3.2/§3.3: "party" sessions reuse office shell composition).
  return (
    <OfficeLanding
      dateString={dateString}
      openWrrs={openWrrs}
      openPickLists={openPickLists}
      pendingTransfers={pendingTransfers}
      pendingApprovals={pendingApprovals}
      hasApprovalAccess={hasApprovalAccess}
      hasReportingRead={hasReportingRead}
    />
  );
}
