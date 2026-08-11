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
import type { ReactNode } from "react";
import { PackageCheck, ListChecks, ArrowLeftRight, ClipboardList, ShieldAlert, Truck } from "lucide-react";
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

function OfficeLanding({
  dateString,
  openWrrs,
  openPickLists,
  pendingTransfers,
  pendingApprovals,
  hasApprovalAccess,
}: {
  dateString: string;
  openWrrs: number;
  openPickLists: number;
  pendingTransfers: number;
  pendingApprovals: number;
  hasApprovalAccess: boolean;
}) {
  return (
    <div className="mx-auto max-w-[1280px] px-4 py-6 md:px-6 lg:px-7 lg:py-10">
      <header className="mb-6 lg:hidden">
        <h1 className="font-heading text-headline-xl font-extrabold text-on-surface">
          Overview Dashboard
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">{dateString}</p>
      </header>

      <section
        aria-label="Queue summaries"
        data-testid="landing-queue-cards"
        className="mb-7"
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Open WRRs" value={openWrrs} detail="+12% vs last week" icon={<ClipboardList size={24} />} accent="border-b-on-surface" />
          <MetricCard label="Active Picks" value={openPickLists} detail="On track for shift" icon={<PackageCheck size={24} />} accent="border-b-on-surface" />
          <MetricCard label="Pending Transfers" value={pendingTransfers} detail="3 critical priority" icon={<ArrowLeftRight size={24} />} accent="border-b-status-held" />
          <MetricCard label="Pending Approvals" value={pendingApprovals} detail={hasApprovalAccess ? "Requires attention" : "Supervisor access required"} icon={<ListChecks size={24} />} accent="border-b-transparent" />
        </div>
      </section>

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_378px]">
      {/* ── Recent Activity feed ─────────────────────────────────────────
          Last 5 recent transactions — placeholder until real aggregation
          query is wired (design.md §3.2 office surface, no KPI/financial
          data per R11.5). */}
      <section
        aria-label="Recent activity"
        data-testid="landing-recent-activity"
        className="rounded border border-outline-variant/30 bg-surface-white"
      >
        <div className="flex items-center justify-between border-b border-outline-variant/30 bg-accent-indigo-50 px-5 py-4">
          <h2 className="font-heading text-headline-md font-bold text-on-surface">Recent Activity</h2>
          <Link href="/documents" className="font-label text-label font-bold text-on-surface underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy">View All</Link>
        </div>
        <div className="divide-y divide-outline-variant/20 px-5">
          <ActivityRow icon={<LogisticIcon type="receive" />} title="PO-2023-8941 Received" detail="Dock 4 • 2 pallets • Scanned by J. Doe" time="10m ago" />
          <ActivityRow icon={<LogisticIcon type="inventory" />} title="Location Audit Completed" detail="Aisle B-12 • 42 SKUs verified" time="1h ago" />
          <ActivityRow icon={<ShieldAlert size={23} />} danger title="Quarantine Flag Raised" detail="SKU-9981 • Damage reported during picking" time="2h ago" />
          <ActivityRow icon={<Truck size={23} />} title="Shipment Dispatched" detail="Order #4402 • Carrier: Freightways" time="3h ago" />
        </div>
      </section>

      <aside className="space-y-5">
      <section aria-label="System alerts" className="rounded border border-outline-variant/30 bg-surface-white p-5">
        <h2 className="font-heading text-headline-md font-bold text-on-surface">System Alerts</h2>
        <div className="mt-5 flex items-start gap-3 border border-outline-variant/30 bg-accent-indigo-50 p-3 text-on-surface">
          <span className="mt-0.5 text-text-grey" aria-hidden="true">ⓘ</span>
          <p className="font-body text-body-sm">Scheduled maintenance window tonight at 02:00 AM EST.</p>
        </div>
      </section>
      <section
          aria-label="Inventory activity heatmap"
          data-testid="landing-activity-heatmap"
          className="rounded border border-outline-variant/30 bg-surface-white p-5"
        >
          <h2 className="font-heading text-headline-md font-bold text-on-surface">Throughput</h2>
          <div className="mt-5 flex h-52 items-end justify-center gap-2 border border-outline-variant/30 bg-accent-indigo-50 px-6 pb-5" aria-label="Throughput chart placeholder">
            {[36, 64, 68, 70, 142, 36].map((height, index) => <span key={index} className={`w-10 bg-brand-royal-blue/30 ${index === 4 ? "bg-status-neutral/70" : ""}`} style={{ height }} />)}
          </div>
      </section>
      </aside>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  accent,
}: {
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
  accent: string;
}) {
  return (
    <article className={`rounded border border-outline-variant/30 border-b-4 bg-surface-white p-5 shadow-elevation-1 ${accent}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="font-label text-label font-bold tracking-wide text-text-grey">{label}</p>
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-indigo-50 text-on-surface" aria-hidden="true">{icon}</span>
      </div>
      <p className="mt-5 font-heading text-[44px] font-extrabold leading-none text-on-surface">{value}</p>
      <p className="mt-4 font-body text-body-sm text-text-grey">{detail}</p>
    </article>
  );
}

function LogisticIcon({ type }: { type: "receive" | "inventory" }) {
  const Icon = type === "receive" ? PackageCheck : ClipboardList;
  return <Icon size={23} aria-hidden="true" />;
}

function ActivityRow({
  icon,
  title,
  detail,
  time,
  danger = false,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  time: string;
  danger?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 py-5">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${danger ? "bg-status-held/10 text-status-held" : "bg-accent-indigo-50 text-on-surface"}`} aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-body-md font-bold text-on-surface">{title}</p>
        <p className="mt-1 truncate font-body text-body-sm text-text-grey">{detail}</p>
      </div>
      <time className="shrink-0 font-label text-label font-semibold text-text-grey">{time}</time>
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
    />
  );
}
