// Shell navigation — one navigation registry, two alternate presentations.
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §4
// (`DesktopSidebar` and `MobileFloorNavigation` are alternate presentations
// of the same navigation registry, never both at once) and §3.3 (floor
// routes never render the persistent desktop sidebar; "party" sessions use
// the identical office-shape sidebar). requirements.md R3.4 (visibility
// derived from server-provided capability context, hidden not disabled),
// R3.6 (dynamic-segment active matching), R3.7 (active destination carries
// a non-color `aria-current` signal), R4.1/R4.2.

import Link from "next/link";
import type { AuthorizationContext } from "@/lib/rbac/session";
import type { SessionPresentationTier } from "@/lib/shell/surface";
import { filterVisibleRoutes, selectRoutesForPresentation } from "@/lib/shell/navigation";
import { resolveActiveRouteId } from "@/lib/shell/active-route";
import type { RouteRegistryEntry } from "@/lib/shell/registry";

function toLabel(id: string): string {
  return id
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

// Dynamic-segment routes (e.g. "/receiving/[wrr_id]") are reached by
// drilling into a list/detail item, not from the persistent nav — the nav
// registry still declares them (for capability/surface bookkeeping and
// active-route matching), but they are not rendered as standalone nav links.
function isNavigableEntry(entry: RouteRegistryEntry): boolean {
  return !entry.path.includes("[");
}

function NavLink({
  entry,
  isActive,
  tier,
}: {
  entry: RouteRegistryEntry;
  isActive: boolean;
  tier: SessionPresentationTier;
}) {
  const sharedClassName =
    "font-label uppercase tracking-wide focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy";

  // Floor text has a hard 16px minimum (brand-design-system.md §2/§11) — the
  // type scale's own `label` row is 14px, so floor nav labels use the same
  // font-label + text-body-md combination already established for
  // FloorPrimaryAction/the landing-page floor CTA, not `text-label`.
  const floorClassName =
    "flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-2 text-body-md text-surface-white/70 active:scale-[0.97] aria-[current=page]:text-brand-red aria-[current=page]:bg-brand-red/10";

  const officeClassName =
    "flex min-h-11 items-center rounded px-4 py-3 text-label text-surface-white/70 hover:bg-brand-royal-blue/40 aria-[current=page]:bg-brand-red aria-[current=page]:text-surface-white";

  return (
    <Link
      href={entry.path}
      data-testid={`nav-entry-${entry.id}`}
      aria-current={isActive ? "page" : undefined}
      className={`${sharedClassName} ${tier === "floor" ? floorClassName : officeClassName}`}
    >
      {toLabel(entry.id)}
    </Link>
  );
}

export function ShellNavigation({
  tier,
  context,
  currentPath,
}: {
  tier: SessionPresentationTier;
  context: Pick<AuthorizationContext, "grants">;
  currentPath: string;
}) {
  const visible = filterVisibleRoutes(context).filter(
    // "planned" routes never render as a live link (design.md §5's
    // registry rule).
    (entry) => entry.launchStatus !== "planned",
  );
  const presented = selectRoutesForPresentation(visible, tier).filter(isNavigableEntry);
  const activeId = resolveActiveRouteId(currentPath);

  if (tier === "floor") {
    return (
      <nav
        data-testid="floor-tab-bar"
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-outline-variant/30 bg-brand-navy shadow-elevation-2"
      >
        {presented.map((entry) => (
          <NavLink key={entry.id} entry={entry} isActive={entry.id === activeId} tier={tier} />
        ))}
      </nav>
    );
  }

  return (
    <nav
      data-testid="desktop-sidebar"
      aria-label="Primary"
      className="hidden flex-col gap-1 bg-brand-navy p-4 lg:flex lg:h-screen lg:w-64"
    >
      {presented.map((entry) => (
        <NavLink key={entry.id} entry={entry} isActive={entry.id === activeId} tier={tier} />
      ))}
    </nav>
  );
}
