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
//
// Fixed 2026-08-11: the desktop sidebar previously rendered a hardcoded
// STITCH_SIDEBAR_ITEMS array regardless of the caller's actual grants — an
// Administrator (who per specs/00-steering/page-role-map.md deliberately
// holds no floor/office operational grants) would still SEE "Receiving",
// "Approvals", etc. in the nav despite having no capability for them. That
// list is gone; the sidebar now renders the same capability-filtered
// `presented` set the floor tab bar already used, grouped per
// `lib/shell/navigation.ts#groupRoutesForSidebar` (page-role-map.md's 12
// nav groups) instead of an arbitrary slice(0,9)/slice(9) split.

"use client";

import { useEffect, useState } from "react";
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
  House,
  Inbox,
  Shield,
  Menu,
  X,
} from "lucide-react";
import type { AuthorizationContext } from "@/lib/rbac/session";
import type { SessionPresentationTier } from "@/lib/shell/surface";
import { roleDisplayLabel } from "@/lib/shell/surface";
import {
  filterVisibleRoutes,
  groupRoutesForSidebar,
  selectRoutesForPresentation,
  type NavSection,
} from "@/lib/shell/navigation";
import { resolveActiveRouteId } from "@/lib/shell/active-route";
import type { RouteRegistryEntry } from "@/lib/shell/registry";
import { resolveShellUserDisplay } from "@/app/(authenticated)/actions";

// Icon map keyed by route id. Any id not present falls back to Circle.
const ROUTE_ICON_MAP: Record<string, LucideIcon> = {
  root: House,
  receiving: Inbox,
  "receiving-detail": Inbox,
  inventory: Layers,
  outgoing: ShoppingCart,
  "inventory-pick-list-execute": ShoppingCart,
  "inventory-pick-list-dispatch": ShoppingCart,
  enrollment: Users,
  transfers: ArrowLeftRight,
  inspection: Shield,
  "inspection-detail": Shield,
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

const SHORT_LABEL_OVERRIDES: Record<string, string> = {
  root: "Dashboard",
  inventory: "Stock View",
  "billing-pricing": "Billing & Pricing",
};

function routeIcon(id: string): LucideIcon {
  return ROUTE_ICON_MAP[id] ?? Circle;
}

function toLabel(id: string): string {
  if (SHORT_LABEL_OVERRIDES[id]) return SHORT_LABEL_OVERRIDES[id];
  return id
    .split("-")
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function groupTestId(group: string): string {
  return group.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
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
  onNavigate,
}: {
  entry: RouteRegistryEntry;
  isActive: boolean;
  tier: SessionPresentationTier;
  onNavigate?: () => void;
}) {
  const Icon = routeIcon(entry.id);
  const label = toLabel(entry.id);

  if (tier === "floor") {
    return (
      <Link
        href={entry.path}
        data-testid={`nav-entry-${entry.id}`}
        aria-current={isActive ? "page" : undefined}
        onClick={onNavigate}
        className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-2
          font-label uppercase tracking-wide
          active:scale-[0.97] active:opacity-75
          focus:outline-none focus-visible:ring-2 focus-visible:ring-white
          ${isActive ? "bg-brand-red/10 text-brand-red" : "text-white/70"}`}
      >
        <Icon size={22} aria-hidden="true" />
        <span className="text-mono-sm font-label">{label}</span>
      </Link>
    );
  }

  return (
    <Link
      href={entry.path}
      data-testid={`nav-entry-${entry.id}`}
      aria-current={isActive ? "page" : undefined}
      onClick={onNavigate}
      className={`flex h-12 items-center gap-4 rounded px-4 font-label text-label font-semibold
        focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy
        ${isActive ? "bg-on-surface text-surface-white" : "text-text-grey hover:bg-surface-white hover:text-on-surface"}`}
    >
      <Icon size={22} aria-hidden="true" />
      {label}
    </Link>
  );
}

function GroupedSections({
  sections,
  activeId,
  onNavigate,
}: {
  sections: readonly NavSection[];
  activeId: string | null;
  onNavigate?: () => void;
}) {
  return (
    <>
      {sections.map((section) => (
        <div key={section.group} className="mb-3">
          <p
            data-testid={`nav-group-${groupTestId(section.group)}`}
            className="px-4 pb-1 pt-2 font-label text-mono-sm font-bold uppercase tracking-wider text-text-grey/60"
          >
            {section.group}
          </p>
          <div className="flex flex-col gap-1">
            {section.entries.map((entry) => (
              <NavLink
                key={entry.id}
                entry={entry}
                isActive={entry.id === activeId}
                tier="office"
                onNavigate={onNavigate}
              />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function ShellNavigation({
  tier,
  context,
  currentPath,
  mobileNavOpen = false,
  onCloseMobileNav,
}: {
  tier: SessionPresentationTier;
  context: Pick<AuthorizationContext, "grants">;
  currentPath: string;
  // Office/party tiers only — design.md §6: "At narrow mobile widths the
  // sidebar collapses to a hamburger/drawer." The open/close state is owned
  // by ShellChrome (the hamburger button lives in its header), so this
  // component just renders the drawer when told to.
  mobileNavOpen?: boolean;
  onCloseMobileNav?: () => void;
}) {
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [activeRoleKeys, setActiveRoleKeys] = useState<readonly string[]>([]);
  const [isMoreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    let active = true;
    resolveShellUserDisplay()
      .then((result) => {
        if (active) {
          setDisplayName(result.displayName);
          setActiveRoleKeys(result.activeRoleKeys);
        }
      })
      .catch(() => {
        if (active) setDisplayName(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setMoreOpen(false);
  }, [currentPath]);

  useEffect(() => {
    onCloseMobileNav?.();
    // Only re-run when the route actually changes — onCloseMobileNav's
    // identity is not guaranteed stable across ShellChrome renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  const visible = filterVisibleRoutes(context).filter(
    // "planned" routes never render as a live link (design.md §5's
    // registry rule).
    (entry) => entry.launchStatus !== "planned",
  );
  const presented = selectRoutesForPresentation(visible, tier).filter(isNavigableEntry);
  const activeId = resolveActiveRouteId(currentPath);
  const sections = groupRoutesForSidebar(presented);
  const roleLabel = roleDisplayLabel(activeRoleKeys);

  // Floor tab bar: a fixed, small set of the highest-priority destinations
  // stays always visible (brand-design-system.md §3 — fewer, larger floor
  // targets over taxonomy); everything else (Sync, Profile, and anything
  // beyond the first four) is one tap away via "More", which reuses the
  // same grouped list the desktop sidebar shows so nothing is unreachable
  // on a phone.
  const primaryFloorEntries = presented.slice(0, 4);

  if (tier === "floor") {
    return (
      <>
        <nav
          data-testid="floor-tab-bar"
          aria-label="Primary navigation"
          className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-outline-variant/30 bg-brand-navy shadow-elevation-2"
        >
          {primaryFloorEntries.map((entry) => (
            <NavLink key={entry.id} entry={entry} isActive={entry.id === activeId} tier={tier} />
          ))}
          {presented.length > primaryFloorEntries.length && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-label="More navigation options"
              className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-2 font-label uppercase tracking-wide text-white/70 active:scale-[0.97] active:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Menu size={22} aria-hidden="true" />
              <span className="text-mono-sm font-label">More</span>
            </button>
          )}
        </nav>
        {isMoreOpen && (
          <MoreOverlay
            sections={sections}
            activeId={activeId}
            displayName={displayName}
            roleLabel={roleLabel}
            onClose={() => setMoreOpen(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
    <nav
      data-testid="desktop-sidebar"
      aria-label="Primary navigation"
      className="hidden flex-col overflow-y-auto border-r border-outline-variant/30 bg-surface-light-grey p-4 lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-[306px]"
    >
      {/* Skip-to-content: visually hidden until focused, first element in the
          nav so keyboard users can bypass the sidebar entirely. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50
                   focus:rounded focus:bg-brand-navy focus:px-4 focus:py-2 focus:text-white
                   focus:font-label focus:text-body-md focus:shadow-lg"
      >
        Skip to content
      </a>

      <div className="px-2 pt-1">
        <p className="font-heading text-headline-md font-extrabold tracking-tight text-on-surface">Dyna-Serv WIMS</p>
      </div>

      <Link
        href="/profile"
        className="mt-6 flex items-center gap-3 rounded-lg border border-outline-variant/30 bg-surface-white p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-indigo-300 font-label text-label font-bold text-white">
          {initials(displayName)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-heading text-body-md font-bold text-on-surface">{displayName ?? "Loading..."}</p>
          <p className="truncate font-body text-body-sm text-text-grey">{roleLabel}</p>
        </div>
      </Link>

      <div className="mt-5 flex flex-1 flex-col">
        <GroupedSections sections={sections} activeId={activeId} />
      </div>
    </nav>

    {/* Mobile drawer — design.md §6: "At narrow mobile widths the sidebar
        collapses to a hamburger/drawer." Opened by ShellChrome's header
        toggle; reuses the identical grouped-section content the desktop
        sidebar shows, so nothing reachable on desktop is unreachable on a
        phone. `lg:hidden` guards against it staying mounted-open across a
        resize past the breakpoint where the persistent sidebar takes over. */}
    {mobileNavOpen && (
      <div className="lg:hidden">
        <MoreOverlay
          sections={sections}
          activeId={activeId}
          displayName={displayName}
          roleLabel={roleLabel}
          onClose={() => onCloseMobileNav?.()}
        />
      </div>
    )}
    </>
  );
}

// Shared mobile "More" overlay — the full grouped route list, reachable from
// the floor tab bar's overflow button. Uses the same groupRoutesForSidebar
// output the desktop sidebar renders, so anything visible on desktop is
// also reachable on a phone.
function MoreOverlay({
  sections,
  activeId,
  displayName,
  roleLabel,
  onClose,
}: {
  sections: readonly NavSection[];
  activeId: string | null;
  displayName: string | null;
  roleLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation menu">
      {/* Decorative dismiss target — the labeled, keyboard-reachable close
          control below is the real "Close navigation menu" affordance.
          aria-hidden + tabIndex=-1 keep this backdrop out of the
          accessibility tree and tab order so AT/keyboard users don't hit a
          second, redundantly-named button. */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col overflow-y-auto bg-surface-white pb-24 shadow-elevation-2">
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-indigo-300 font-label text-label font-bold text-white">
              {initials(displayName)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-heading text-body-md font-bold text-on-surface">{displayName ?? "Loading..."}</p>
              <p className="truncate font-body text-body-sm text-text-grey">{roleLabel}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-text-grey focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy active:bg-surface-light-grey"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 px-2 py-2">
          <GroupedSections sections={sections} activeId={activeId} onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}
