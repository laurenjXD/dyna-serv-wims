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
  Layers,
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
  Box,
  ChevronLeft,
  House,
  Inbox,
  Shield,
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
  root: House,
  receiving: Inbox,
  inventory: Layers,
  outgoing: ShoppingCart,
  enrollment: Users,
  transfers: ArrowLeftRight,
  inspection: Shield,
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

function routeIcon(id: string): LucideIcon {
  return ROUTE_ICON_MAP[id] ?? Circle;
}

function toLabel(id: string): string {
  const labels: Record<string, string> = { root: "Dashboard", outgoing: "Picking" };
  if (labels[id]) return labels[id];

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
      className={`flex min-h-14 items-center gap-4 rounded-2xl px-5 py-3
        transition-colors duration-150
        focus-visible:ring-2 focus-visible:ring-white focus:outline-none
        ${isActive
          ? "bg-accent-indigo-600 text-white shadow-elevation-1"
          : "text-white/70 hover:bg-white/10 hover:text-white"}`}
    >
      <Icon size={24} aria-hidden="true" />
      <span className="font-heading text-body-lg font-semibold tracking-tight">{toLabel(entry.id)}</span>
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

  const sections = groupRoutesForSidebar(
    presented.filter((entry) => OFFICE_SIDEBAR_ROUTE_IDS.has(entry.id)),
  );

  return (
    <nav
      data-testid="desktop-sidebar"
      aria-label="Primary navigation"
      className="hidden flex-col gap-6 overflow-y-auto border-r border-black/20 bg-on-surface px-5 py-8 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-72"
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

      <div className="flex items-center gap-4 px-2 pt-1">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-indigo-600/25 text-accent-indigo-300">
          <Box size={31} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-heading text-headline-md font-extrabold tracking-tight text-white">DYNA-SERV</p>
          <p className="mt-1 font-label text-body-md tracking-[0.1em] text-white/45">WIMS</p>
        </div>
        <ChevronLeft size={18} className="text-white/40" aria-hidden="true" />
      </div>

      <div className="flex flex-1 flex-col gap-7">
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
            className="px-3 pb-2 pt-2 font-label text-body-md font-bold uppercase tracking-[0.08em] text-surface-white/40"
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
      </div>

      <aside className="rounded-3xl bg-white/5 p-6">
        <span className="mb-3 flex gap-1" aria-hidden="true">
          <span className="h-1.5 w-8 rounded-full bg-accent-indigo-600" />
          <span className="h-1.5 w-6 rounded-full bg-white/25" />
          <span className="h-1.5 w-6 rounded-full bg-white/25" />
        </span>
        <p className="font-heading text-body-lg font-bold text-white">Keep your warehouse running smoothly.</p>
        <p className="mt-2 font-body text-body-md text-white/55">Every move matters.</p>
      </aside>
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
