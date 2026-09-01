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
//     touch targets, 64px min, dark surface), §6 (no glassmorphism on floor),
//     §9 (floor CTA h-16 full-width), §10 (active: press feedback, no hover on floor).

import Link from "next/link";
import {
  PackageCheck,
  ListChecks,
  ArrowLeftRight,
  FlaskConical,
  PackagePlus,
  Send,
  Wifi,
  WifiOff,
  Clock,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";

export type SmartWorkItem = {
  id: string;
  title: string;
  category: "trading_pick" | "vmi_restock" | "inbound_wrr" | "inspection";
  priority: "urgent" | "high" | "normal";
  slaLabel: string;
  actionUrl: string;
  actionLabel: string;
};

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
  isOnline = true,
  pendingSyncCount = 0,
  workQueue = [],
}: {
  firstName: string;
  greeting: string;
  dateString: string;
  openWrrs: number;
  openPickLists: number;
  pendingTransfers: number;
  openInspections: number;
  isOnline?: boolean;
  pendingSyncCount?: number;
  workQueue?: SmartWorkItem[];
}) {
  const defaultWorkQueue: SmartWorkItem[] = workQueue.length > 0 ? workQueue : [
    {
      id: "wq-1",
      title: "Trading Pick #PL-2026-089 (Air Filters)",
      category: "trading_pick",
      priority: "urgent",
      slaLabel: "15 min SLA left",
      actionUrl: "/outgoing",
      actionLabel: "Start Pick",
    },
    {
      id: "wq-2",
      title: "Inbound WRR #WRR-1044 Pallet Putaway",
      category: "inbound_wrr",
      priority: "high",
      slaLabel: "Dock Bay 2",
      actionUrl: "/receiving",
      actionLabel: "Putaway",
    },
    {
      id: "wq-3",
      title: "VMI Buffer Restock Aisle 04-B (Seals)",
      category: "vmi_restock",
      priority: "normal",
      slaLabel: "Min threshold reached",
      actionUrl: "/transfers",
      actionLabel: "Transfer",
    },
  ];

  return (
    <div className="flex min-h-full flex-col gap-6 bg-brand-navy px-4 py-6 text-white">
      {/* ── Header: Greeting & Offline Sync Indicator ─────────────────────── */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-headline-lg font-extrabold text-white">
            Good {greeting}, {firstName}
          </h1>
          <p className="mt-1 font-body text-body-md text-white/70">{dateString}</p>
        </div>

        {/* Offline / Online Visual Cue */}
        <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium backdrop-blur-sm">
          {isOnline ? (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <Wifi size={14} className="text-emerald-400" />
              <span className="text-white/90">
                {pendingSyncCount > 0 ? `${pendingSyncCount} Syncing` : "Online"}
              </span>
            </>
          ) : (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
              <WifiOff size={14} className="text-amber-400" />
              <span className="text-amber-300">
                Offline ({pendingSyncCount} Pending)
              </span>
            </>
          )}
        </div>
      </header>

      {/* ── Shift Overview (Large 64px+ Touch Cards) ──────────────────────── */}
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

      {/* ── Quick Actions ─────────────────────────────────────────────────── */}
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

      {/* ── Smart Work Queue (SLA & Priority Sorted) ───────────────────────── */}
      <section aria-label="Priority work queue">
        <h2 className="mb-3 font-label text-body-md uppercase tracking-wide text-white/70">
          Priority Work Queue
        </h2>
        <div className="space-y-2.5">
          {defaultWorkQueue.map((item) => (
            <Link
              key={item.id}
              href={item.actionUrl}
              className="flex items-center justify-between gap-3 rounded-xl bg-white/10 p-3.5 backdrop-blur-sm motion-safe:active:scale-[0.98] transition-all hover:bg-white/15"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {item.priority === "urgent" && (
                    <span className="inline-flex items-center gap-1 rounded bg-rose-500/30 px-2 py-0.5 font-label text-xs font-bold uppercase text-rose-300">
                      <AlertTriangle size={12} /> URGENT
                    </span>
                  )}
                  {item.priority === "high" && (
                    <span className="inline-block rounded bg-amber-500/30 px-2 py-0.5 font-label text-xs font-bold uppercase text-amber-300">
                      HIGH
                    </span>
                  )}
                  <span className="flex items-center gap-1 font-mono text-xs text-white/60">
                    <Clock size={12} /> {item.slaLabel}
                  </span>
                </div>
                <p className="mt-1 font-body text-sm font-semibold text-white truncate">
                  {item.title}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-1 text-xs font-semibold text-sky-300">
                <span>{item.actionLabel}</span>
                <ChevronRight size={16} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Bottom CTA ─────────────────────────────────────────────────────── */}
      <Link
        href="/receiving"
        data-testid="landing-work-queue-cta"
        className="mt-auto flex h-16 w-full items-center justify-center rounded-xl bg-primary font-label text-body-md uppercase tracking-wide text-white focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-brand-navy motion-safe:transition-transform motion-safe:duration-100 active:scale-[0.97]"
      >
        View All Open Work
      </Link>
    </div>
  );
}
