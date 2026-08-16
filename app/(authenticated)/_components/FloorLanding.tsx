// `FloorLanding` — floor-tier presentation for `/`.
//
// Extracted from app/(authenticated)/page.tsx per
// specs/05-ui-shell-and-navigation/tasks.md §7 so it can be tested directly
// (app/(authenticated)/__tests__/FloorLanding.test.tsx) without going
// through the page's server-side data-fetching layer. Purely presentational
// — props in, JSX out, no DB calls here.
//
// Traceability:
//   specs/05-ui-shell-and-navigation/design.md §3.2/§3.3 (`/` route surface
//     shape, floor vs. office shell behavior).
//   specs/05-ui-shell-and-navigation/requirements.md R11.2 (floor vs. office
//     summary shape), R11.3 (Quick Actions is one of the required floor
//     summary elements).
//   specs/00-steering/brand-design-system.md §3 (floor primary actions,
//     touch targets, dark surface), §6 (no glassmorphism on floor), §9
//     (floor CTA h-16 full-width), §10 (active: press feedback, no hover
//     on floor).
//
// Quick Actions (R11.3): a small, purposeful list of 3-4 links to real,
// already-existing floor-relevant creation/queue routes — not the full
// route registry. Daily Inspection has no dedicated "new" route (it's
// initiated from the Master Inventory dashboard per the 2026-08-06
// amendment), so its Quick Action links to the inspection queue itself.

import Link from "next/link";
import {
  PackageCheck,
  ListChecks,
  ArrowLeftRight,
  FlaskConical,
  PackagePlus,
  Send,
} from "lucide-react";

const QUICK_ACTIONS = [
  { href: "/receiving/new", label: "Receive Shipment", icon: PackagePlus },
  { href: "/transfers/new", label: "New Transfer", icon: ArrowLeftRight },
  { href: "/outgoing", label: "Pick Lists", icon: Send },
  { href: "/inspection", label: "Inspection Queue", icon: FlaskConical },
] as const;

export function FloorLanding({
  firstName,
  greeting,
  dateString,
  openWrrs,
  openPickLists,
  pendingTransfers,
  openInspections,
}: {
  firstName: string;
  greeting: string;
  dateString: string;
  openWrrs: number;
  openPickLists: number;
  pendingTransfers: number;
  openInspections: number;
}) {
  return (
    <div className="flex min-h-full flex-col gap-6 bg-brand-navy px-4 py-6">
      {/* ── Greeting header ──────────────────────────────────────────────── */}
      <header>
        <h1 className="font-heading text-headline-lg font-extrabold text-white">
          Good {greeting}, {firstName}
        </h1>
        <p className="mt-1 font-body text-body-md text-white/70">{dateString}</p>
      </header>

      {/* ── Shift Overview ────────────────────────────────────────────────
          brand-design-system.md §3: floor primary touch targets 64px min.
          4 tappable count cards, each linking to the relevant floor page. */}
      <section
        aria-label="Shift overview"
        data-testid="landing-task-counts"
      >
        <h2 className="mb-3 font-label text-body-md uppercase tracking-wide text-white/70">
          Shift Overview
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/receiving"
            data-testid="floor-card-wrrs"
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-brand-royal-blue px-3 py-4 text-center motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy"
          >
            <PackageCheck size={24} strokeWidth={2} aria-hidden="true" className="text-white/70" />
            <span className="font-heading text-data-display font-extrabold text-white">
              {openWrrs}
            </span>
            <span className="font-body text-body-md text-white/70">Open WRRs</span>
          </Link>
          <Link
            href="/outgoing"
            data-testid="floor-card-picks"
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-brand-royal-blue px-3 py-4 text-center motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy"
          >
            <ListChecks size={24} strokeWidth={2} aria-hidden="true" className="text-white/70" />
            <span className="font-heading text-data-display font-extrabold text-white">
              {openPickLists}
            </span>
            <span className="font-body text-body-md text-white/70">Active Picks</span>
          </Link>
          <Link
            href="/transfers"
            data-testid="floor-card-transfers"
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-brand-royal-blue px-3 py-4 text-center motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy"
          >
            <ArrowLeftRight size={24} strokeWidth={2} aria-hidden="true" className="text-white/70" />
            <span className="font-heading text-data-display font-extrabold text-white">
              {pendingTransfers}
            </span>
            <span className="font-body text-body-md text-white/70">Pending Transfers</span>
          </Link>
          <Link
            href="/inspection"
            data-testid="floor-card-inspections"
            className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl bg-brand-royal-blue px-3 py-4 text-center motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy"
          >
            <FlaskConical size={24} strokeWidth={2} aria-hidden="true" className="text-white/70" />
            <span className="font-heading text-data-display font-extrabold text-white">
              {openInspections}
            </span>
            <span className="font-body text-body-md text-white/70">Open Inspections</span>
          </Link>
        </div>
      </section>

      {/* ── Quick Actions ────────────────────────────────────────────────
          R11.3: small (3-4 item) list of links to real floor-relevant
          creation/queue routes. Secondary to the full-width CTA below —
          sized to the floor default touch target (56px), not the 64px
          primary-action minimum, since these are secondary shortcuts. */}
      <section aria-label="Quick actions" data-testid="landing-quick-actions">
        <h2 className="mb-3 font-label text-body-md uppercase tracking-wide text-white/70">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {QUICK_ACTIONS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-14 items-center gap-2 rounded-xl bg-brand-royal-blue px-3 py-3 motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy"
            >
              <Icon size={20} strokeWidth={2} aria-hidden="true" className="shrink-0 text-white/70" />
              <span className="font-body text-body-md text-white">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ───────────────────────────────────────────────────
          Full-width bg-brand-red h-16 per §9 floor primary action rules. */}
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
