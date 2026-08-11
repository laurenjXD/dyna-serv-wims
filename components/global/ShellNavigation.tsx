import Link from "next/link";
import type { AuthorizationContext } from "@/lib/rbac/session";
import type { SessionPresentationTier } from "@/lib/shell/surface";
import {
  filterVisibleRoutes,
  groupRoutesForSidebar,
  selectRoutesForPresentation,
} from "@/lib/shell/navigation";
import { resolveActiveRouteId } from "@/lib/shell/active-route";
import type { RouteRegistryEntry } from "@/lib/shell/registry";

const ROUTE_ICON_MAP: Record<string, string> = {
  root: "dashboard",
  receiving: "input",
  inventory: "inventory_2",
  outgoing: "local_shipping",
  enrollment: "person_add",
  transfers: "swap_horiz",
  inspection: "shield",
  approvals: "fact_check",
  documents: "description",
  reports: "bar_chart",
  "billing-pricing": "receipt",
  sync: "sync",
  profile: "account_circle",
  settings: "settings",
  portal: "hub",
  "portal-inventory": "inventory_2",
  "portal-orders": "shopping_cart",
  "portal-documents": "description",
  "portal-notifications": "notifications",
  "portal-labels": "label",
};

const OFFICE_SIDEBAR_ROUTE_IDS = new Set([
  "root",
  "receiving",
  "outgoing",
  "transfers",
  "inventory",
  "inspection",
  "approvals",
  "enrollment",
  "profile",
  "settings",
]);

function routeIcon(id: string): string {
  return ROUTE_ICON_MAP[id] ?? "circle";
}

function toLabel(id: string): string {
  const labels: Record<string, string> = { 
    root: "Overview", 
    outgoing: "Outgoing",
    "master-data": "Master Data"
  };
  if (labels[id]) return labels[id];

  return id
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

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
  const iconName = routeIcon(entry.id);
  const label = toLabel(entry.id);

  if (tier === "floor") {
    // Floor mobile icon styles
    return (
      <Link
        href={entry.path}
        data-testid={`nav-entry-${entry.id}`}
        aria-current={isActive ? "page" : undefined}
        className={`flex flex-col items-center justify-center rounded-full px-4 py-1 active:bg-surface-container-highest transition-all duration-200 ${
          isActive ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant"
        }`}
      >
        <span className={`material-symbols-outlined ${isActive ? "filled" : ""}`}>{iconName}</span>
        <span className="font-label-md-mobile text-label-md mt-1">{label}</span>
      </Link>
    );
  }

  // Desktop side nav styles
  return (
    <Link
      href={entry.path}
      data-testid={`nav-entry-${entry.id}`}
      aria-current={isActive ? "page" : undefined}
      className={`flex items-center gap-md px-md py-sm font-label-md text-label-md rounded-lg transition-transform scale-95 active:scale-90 ${
        isActive
          ? "bg-primary-container text-on-primary-container"
          : "text-on-surface-variant hover:bg-surface-variant hover:bg-surface-container-high"
      }`}
    >
      <span className={`material-symbols-outlined ${isActive ? "filled" : ""}`}>{iconName}</span>
      {label}
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
    (entry) => entry.launchStatus !== "planned",
  );
  const presented = selectRoutesForPresentation(visible, tier).filter(isNavigableEntry);
  const activeId = resolveActiveRouteId(currentPath);

  // Note: mobile view on office still uses the bottom nav per responsive design guidelines
  const profileImg = "https://lh3.googleusercontent.com/aida-public/AB6AXuCn0x5KZZh2cA4tLyhYvD4p0Trg9-Iu9c6ZBHTzh1PfMfE_lls7ZBvkyFiH4-DbfwyWzAxCoSioAX0VD6Gn2YCTwUpvvzN60bMSa_srcdXLNOdLSM4PCV8jM7FUUETjvc8uBnYkJbGDDdmzsQQOOTp661Sv6rNOo78a_kvyBen2SlP2AzFPjLEyb5Y2mkKPJ8HcHUcZVSxtq6Mi0Jy7AVHAuC7t6VkVj0n76zXhtuOXmcZWJZZ6VTU";

  // Desktop Sidebar items (main vs bottom section)
  // Stitch design has "Documents" and "Account" at the bottom
  const bottomRouteIds = new Set(["documents", "profile", "settings"]);
  const mainDesktopRoutes = presented.filter(e => !bottomRouteIds.has(e.id));
  const bottomDesktopRoutes = presented.filter(e => bottomRouteIds.has(e.id));

  return (
    <>
      {/* Desktop Sidebar */}
      <nav
        data-testid="desktop-sidebar"
        aria-label="Primary navigation"
        className="hidden md:flex flex-col h-screen p-sm fixed left-0 top-0 w-64 bg-surface-container-low border-r border-outline-variant z-40"
      >
        <div className="px-md py-lg">
          <div className="font-headline-md text-headline-md font-black text-primary truncate">Dyna-Serv WIMS</div>
          <div className="flex items-center gap-sm mt-md">
            <img src={profileImg} alt="User Account" className="w-10 h-10 rounded-full object-cover" />
            <div className="flex flex-col">
              <span className="font-label-md text-label-md text-on-surface">Admin User</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">Warehouse Admin</span>
            </div>
          </div>
        </div>

        <button className="mx-md mb-md bg-primary text-on-primary font-label-md text-label-md py-sm px-md rounded-lg flex items-center justify-center gap-sm hover:bg-tertiary-container transition-colors">
          <span className="material-symbols-outlined">qr_code_scanner</span>
          Quick Scan
        </button>

        <div className="flex-1 overflow-y-auto px-xs flex flex-col gap-xs">
          {mainDesktopRoutes.map((entry) => (
            <NavLink key={entry.id} entry={entry} isActive={entry.id === activeId} tier="office" />
          ))}
        </div>

        <div className="mt-auto px-xs pb-md pt-sm border-t border-outline-variant flex flex-col gap-xs">
          {bottomDesktopRoutes.map((entry) => (
            <NavLink key={entry.id} entry={entry} isActive={entry.id === activeId} tier="office" />
          ))}
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      <nav
        data-testid="mobile-tab-bar"
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 w-full z-50 flex justify-around items-center px-4 h-20 pb-safe bg-surface shadow-[0_-4px_12px_rgba(0,0,0,0.08)] rounded-t-xl transition-all duration-200"
      >
        {/* We limit the mobile nav to 4 primary routes + Scan button */}
        {presented.slice(0, 4).map((entry) => (
          <NavLink key={entry.id} entry={entry} isActive={entry.id === activeId} tier="floor" />
        ))}
        {tier === "floor" && (
          <Link
            href="/scan"
            className="flex flex-col items-center justify-center text-on-surface-variant active:bg-surface-container-highest rounded-full px-4 py-1"
          >
            <span className="material-symbols-outlined text-primary">barcode_scanner</span>
            <span className="font-label-md-mobile text-label-md mt-1 text-primary">Scan</span>
          </Link>
        )}
      </nav>
    </>
  );
}
