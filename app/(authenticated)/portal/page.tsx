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
// TODO: wire to party record from session scope (Task 2 — authorization/context
//   resolution layer, user_party_scopes assignment resolution).
// TODO: wire party type badge to actual assigned flow_type from session scope.

import Link from "next/link";
import { Package, ListChecks, FileText, Bell } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";

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

  // Per-card capability checks — widget-level gates only (route itself has none).
  // Checks grants for either global or assigned_party scope; full party-scope
  // resolution (Task 2) is wired when the authorization layer is built.
  const hasReportingRead = context.grants.some(
    (g) => g.resource === "reporting" && g.action === "read",
  );
  const hasPickListRead = context.grants.some(
    (g) => g.resource === "pick_list" && g.action === "read",
  );
  const hasDocumentsRead = context.grants.some(
    (g) => g.resource === "documents" && g.action === "read",
  );
  const hasNotificationsRead = context.grants.some(
    (g) => g.resource === "notifications" && g.action === "read",
  );

  // TODO: wire party name to party record from session scope (user_party_scopes →
  //   parties.display_name) — Task 2, authorization/context resolution layer.
  const partyName = "Your Company"; // TODO: resolve from session party scope
  // TODO: wire flow type badge to actual assigned flow_type (VMI / Trading / Supplies)
  const partyFlowType = "VMI"; // TODO: resolve from session party scope

  return (
    <div className="mx-auto max-w-container">
      {/* ── Welcome card ──────────────────────────────────────────────────────
          Level 1 glassmorphism per §6, brand-navy heading per §2. */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading font-bold text-headline-xl text-brand-navy">
              Welcome, {partyName}
            </h1>
            <p className="mt-1 font-body text-body-md text-text-grey">
              Your portal overview. All data shown is scoped to your account.
            </p>
          </div>
          {/* Party flow type badge — §1.3 status semantics, icon + text per §9 */}
          <span className="inline-flex items-center rounded-full bg-brand-royal-blue/10 px-3 py-1 font-label text-label uppercase tracking-[0.05em] text-brand-royal-blue">
            {partyFlowType}
          </span>
        </div>
      </div>

      {/* ── Navigation cards — 2×2 grid ───────────────────────────────────────
          requirements.md R1: party user can only see surfaces for their
          assigned capabilities. Locked cards shown for missing capabilities.
          brand-design-system.md §9: office cards, Level 1 elevation. */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NavCard
          href="/portal/inventory"
          icon={<Package size={28} aria-hidden="true" />}
          label="Inventory"
          description="View your current stock position"
          locked={!hasReportingRead}
        />
        <NavCard
          href="/portal/orders"
          icon={<ListChecks size={28} aria-hidden="true" />}
          label="Orders"
          description="View your pick lists and orders"
          locked={!hasPickListRead}
        />
        <NavCard
          href="/portal/documents"
          icon={<FileText size={28} aria-hidden="true" />}
          label="Documents"
          description="Pick lists and acknowledgement receipts"
          locked={!hasDocumentsRead}
        />
        <NavCard
          href="/portal/notifications"
          icon={<Bell size={28} aria-hidden="true" />}
          label="Notifications"
          description="Your account alerts and updates"
          locked={!hasNotificationsRead}
        />
      </div>

      {/* ── Note: Supplies-flow data is never rendered in this portal ─────────
          requirements.md R1, constraints: Supplies-flow data must never be
          rendered, queried, or reachable through any task here. */}
    </div>
  );
}
