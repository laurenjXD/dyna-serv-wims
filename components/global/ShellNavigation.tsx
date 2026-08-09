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
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  PackageCheck,
  Layers,
  PackageMinus,
  Users,
  ArrowLeftRight,
  CheckSquare,
  FileText,
  BarChart2,
  Receipt,
  RefreshCw,
  UserCircle,
  Settings,
  Globe,
  Package,
  ShoppingCart,
  Bell,
  Tag,
  Circle,
} from "lucide-react";
import type { AuthorizationContext } from "@/lib/rbac/session";
import type { SessionPresentationTier } from "@/lib/shell/surface";
import {
  filterVisibleRoutes,
  groupRoutesForSidebar,
  selectRoutesForPresentation,
} from "@/lib/shell/navigation";
import { resolveActiveRouteId } from "@/lib/shell/active-route";
import type { RouteRegistryEntry } from "@/lib/shell/registry";

// Icon map keyed by route id. Any id not present falls back to Circle.
const ROUTE_ICON_MAP: Record<string, LucideIcon> = {
  root: LayoutDashboard,
  receiving: PackageCheck,
  inventory: Layers,
  outgoing: PackageMinus,
  enrollment: Users,
  transfers: ArrowLeftRight,
  approvals: CheckSquare,
  documents: FileText,
  reports: BarChart2,
  "billing-pricing": Receipt,
  sync: RefreshCw,
  profile: UserCircle,
  settings: Settings,
  portal: Globe,
  "portal-inventory": Package,
  "portal-orders": ShoppingCart,
  "portal-documents": FileText,
  "portal-notifications": Bell,
  "portal-labels": Tag,
};

function routeIcon(id: string): LucideIcon {
  return ROUTE_ICON_MAP[id] ?? Circle;
}

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
  const Icon = routeIcon(entry.id);

  if (tier === "floor") {
    // Floor text has a hard 16px minimum (brand-design-system.md §2/§11) —
    // the type scale's own `label` row is 14px, so floor nav labels use
    // font-label + text-body-md. No hover states on floor; press feedback
    // via active:scale-[0.97] + active:opacity-75.
    return (
      <Link
        href={entry.path}
        data-testid={`nav-entry-${entry.id}`}
        aria-current={isActive ? "page" : undefined}
        className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-2
          font-label uppercase tracking-wide
          active:scale-[0.97] active:opacity-75
          focus:outline-none focus-visible:ring-2 focus-visible:ring-white
          ${isActive ? "bg-brand-red/10 text-brand-red" : "text-white/70"}`}
      >
        <Icon size={24} aria-hidden="true" />
        <span className="text-body-md font-label">{toLabel(entry.id)}</span>
      </Link>
    );
  }

  // Office / party sidebar: icon (16px) inline left of label.
  return (
    <Link
      href={entry.path}
      data-testid={`nav-entry-${entry.id}`}
      aria-current={isActive ? "page" : undefined}
      className={`flex items-center gap-3 min-h-11 rounded px-3 py-2
        focus-visible:ring-2 focus-visible:ring-white focus:outline-none
        ${isActive
          ? "bg-brand-red text-white"
          : "text-white/70 hover:bg-brand-royal-blue/40 hover:text-white"}`}
    >
      <Icon size={16} aria-hidden="true" />
      <span className="font-label text-label uppercase tracking-wide">{toLabel(entry.id)}</span>
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
    // Skip link omitted for floor tab bar: content is already above the nav,
    // so no "skip" is needed — users are not trapped below it.
    return (
      <nav
        data-testid="floor-tab-bar"
        aria-label="Primary navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-outline-variant/30 bg-brand-navy shadow-elevation-2"
      >
        {presented.map((entry) => (
          <NavLink key={entry.id} entry={entry} isActive={entry.id === activeId} tier={tier} />
        ))}
      </nav>
    );
  }

  const sections = groupRoutesForSidebar(presented);

  return (
    <nav
      data-testid="desktop-sidebar"
      aria-label="Primary navigation"
      className="hidden flex-col gap-4 overflow-y-auto bg-brand-navy p-4 lg:flex lg:h-screen lg:w-64"
    >
      {/* Skip-to-content: visually hidden until focused, first element in the
          nav so keyboard users can bypass the sidebar entirely. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50
                   focus:rounded focus:bg-brand-red focus:px-4 focus:py-2 focus:text-white
                   focus:font-label focus:text-body-md focus:shadow-lg"
      >
        Skip to content
      </a>

      {sections.map((section) => (
        <div key={section.group} data-testid={`nav-group-${slugify(section.group)}`}>
          {/* Section header — Epilogue label style, dimmer than links so it
              reads as a grouping cue, not another tap target. Not a heading
              element in the a11y tree sense that needs its own landmark;
              this is a visual/structural grouping within the single
              `nav aria-label="Primary navigation"` landmark, per design.md §4's
              "one navigation landmark" shell composition. aria-hidden because
              it is a visual grouping cue only — the landmark + link text
              already provides the accessible context. */}
          <p
            aria-hidden="true"
            className="px-4 pb-1 pt-2 font-label text-label uppercase tracking-wide text-surface-white/40"
          >
            {section.group}
          </p>
          <div className="flex flex-col gap-1">
            {section.entries.map((entry) => (
              <NavLink key={entry.id} entry={entry} isActive={entry.id === activeId} tier={tier} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
