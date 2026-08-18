// `/portal` — Party Portal landing hub.
//
// Traceability:
//   specs/22-parties-portal/design.md §3 (route shape, shared filtered shell),
//     §4 (authorization: requirePermission with assigned_party scope), §8
//     (session-only party/flow selection, no persisted preference).
//   specs/22-parties-portal/requirements.md R1 (party user session scope),
//     R5 (self-party read), R8 (shell integration via "party" ShellSurface).
//   specs/00-steering/brand-design-system.md §6 (office Level 1 elevation —
//     party sessions use office presentation per design.md §3.3), §2
//     (typography), §9 (office buttons h-11, hover states).
//   specs/05-ui-shell-and-navigation/design.md §3.2 ("party" ShellSurface).
//
// Surface: Party (office-style glassmorphism per design.md §3.3 — party
//   sessions use office presentation).
// Capability gate: none (hub landing; per-card gates applied at widget level).
// Offline: no offline caching — every load is a fresh authoritative read
//   (design.md Task 8, requirements.md R8).
//
// Party name/flow badge are resolved from the caller's own session party
// scope (lib/rbac/session.ts AuthorizationContext.partyScopes), never a
// client-supplied value. Task 2 (specs/22-parties-portal tasks.md — full
// multi-assignment switcher) is not yet built; until then this (and every
// other portal route) uses lib/portal/resolve-party-scope.ts's first-active-
// scope resolution and fails safe (renders nothing) when no scope exists.

import Link from "next/link";
import { Package, ListChecks, FileText } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { partyScopeMatchesFlow } from "@/lib/rbac/session";
import { resolveActivePartyScope } from "@/lib/portal/resolve-party-scope";
import { db } from "@/lib/db/client";
import { getPartyWithRoles } from "@/lib/db/queries/parties";

// ─── Nav card ─────────────────────────────────────────────────────────────────
// 2×2 grid cards: bg-surface-white, h-44, rounded-2xl.
// brand-design-system.md §6: Level 1 elevation for office/party surfaces.
// 44×44px effective touch target on hover-states (office default, §3).

interface NavCardProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  locked: boolean;
}

function NavCard({ href, icon, label, description, locked }: NavCardProps) {
  if (locked) {
    return (
      <div className="flex h-44 flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-6 opacity-60 shadow-elevation-1">
        <div className="text-text-grey">{icon}</div>
        <div>
          <p className="font-label text-label uppercase tracking-[0.05em] text-text-grey">
            {label}
          </p>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            Requires access
          </p>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="flex h-44 flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1 motion-safe:transition-shadow motion-safe:duration-150 hover:shadow-elevation-2 focus:outline-none focus:ring-2 focus:ring-brand-navy"
    >
      <div className="text-brand-navy">{icon}</div>
      <div>
        <p className="font-label text-label uppercase tracking-[0.05em] text-brand-navy">
          {label}
        </p>
        <p className="mt-1 font-body text-body-sm text-text-grey">
          {description}
        </p>
      </div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function PortalPage() {
  const resolver = await createPageResolver();
  const resolution = await resolver.getContext();

  // Auth check — capability: "none" route, but still requires authenticated session.
  if (resolution.kind !== "authorized") {
    return null;
  }

  const { context } = resolution;
  const partyScope = resolveActivePartyScope(context);

  // Fail safe: no active party assignment resolves to an explicit empty
  // state, never a fallback to unscoped/hardcoded data (CLAUDE.md RBAC
  // principle; requirements.md R1 — party users only see their own scope).
  if (!partyScope) {
    return (
      <div className="mx-auto max-w-container px-8 py-12 text-center">
        <p className="font-body text-body-md text-text-grey">
          No party assignment is linked to your account.
        </p>
        <p className="mt-2 font-body text-body-sm text-text-grey">
          Contact your administrator to request portal access.
        </p>
      </div>
    );
  }

  const party = await getPartyWithRoles(db, partyScope.partyId);
  const partyName = party?.name ?? "Your Account";
  const partyFlowType =
    partyScope.flowType === "vmi"
      ? "VMI"
      : partyScope.flowType === "trading"
        ? "Trading"
        : null;

  // Per-card capability checks — grant presence AND the flow that matches
  // this card's surface (design.md §5 VMI-only, §6 Trading-only, §7 either
  // flow). A null partyScope.flowType matches every non-Supplies flow
  // (session.ts partyScopeMatchesFlow), consistent with the RLS-side
  // has_party_scope() semantics this mirrors.
  const hasReportingRead =
    context.grants.some(
      (g) => g.resource === "reporting" && g.action === "read",
    ) && partyScopeMatchesFlow(partyScope, "vmi");
  const hasPickListRead =
    context.grants.some(
      (g) => g.resource === "pick_list" && g.action === "read",
    ) && partyScopeMatchesFlow(partyScope, "trading");
  const hasDocumentsRead = context.grants.some(
    (g) => g.resource === "documents" && g.action === "read",
  );

  return (
    <div className="mx-auto max-w-container">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
              Welcome, {partyName}
            </h1>
            <p className="mt-1 font-body text-body-md text-text-grey">
              Vendor Management Portal
            </p>
          </div>
          {partyFlowType ? (
            <span className="inline-flex items-center rounded bg-status-available/10 px-3 py-1 font-label text-label text-status-available">
              {partyFlowType}
            </span>
          ) : null}
        </div>
      </div>

      {/* ── Navigation cards — 2×2 grid ───────────────────────────────────────
          requirements.md R1: party user can only see surfaces for their
          assigned capabilities. Locked cards shown for missing capabilities.
          brand-design-system.md §9: office cards, Level 1 elevation. */}
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <NavCard
          href="/portal/inventory"
          icon={<Package size={28} aria-hidden="true" />}
          label="Portal Inventory"
          description="View your current stock position"
          locked={!hasReportingRead}
        />
        <NavCard
          href="/portal/orders"
          icon={<ListChecks size={28} aria-hidden="true" />}
          label="Portal Orders"
          description="View your pick lists and orders"
          locked={!hasPickListRead}
        />
        <NavCard
          href="/portal/documents"
          icon={<FileText size={28} aria-hidden="true" />}
          label="Portal Documents"
          description="Pick lists and acknowledgement receipts"
          locked={!hasDocumentsRead}
        />
      </div>
      <aside className="rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
        <div className="flex items-center justify-between"><h2 className="font-heading text-body-lg font-bold text-on-surface">Recent Alerts</h2><Link href="/portal/notifications" className="font-label text-label font-bold text-on-surface underline">View All</Link></div>
        <div className="mt-5 space-y-4 font-body text-body-sm text-text-grey"><p><span className="mr-2 text-status-held">●</span><strong className="text-on-surface">Low Stock Alert: ITM-4092</strong><br />Inventory for Industrial Bearings has fallen below minimum threshold.</p><p><span className="mr-2 text-on-surface">●</span><strong className="text-on-surface">Pick List #PL-8824 Approved</strong><br />Pick list verified and approved.</p><p><span className="mr-2 text-status-neutral">●</span><strong className="text-on-surface">System Maintenance</strong><br />Scheduled later this week.</p></div>
      </aside>
      </div>

      {/* ── Note: Supplies-flow data is never rendered in this portal ─────────
          requirements.md R1, constraints: Supplies-flow data must never be
          rendered, queried, or reachable through any task here. */}
    </div>
  );
}
