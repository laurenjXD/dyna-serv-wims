// Shell navigation — one navigation registry, two alternate presentations.
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §4
// (`DesktopSidebar` and `MobileFloorNavigation` are alternate presentations
// of the same navigation registry) and §3.3. requirements.md R3.4, R3.6, R3.7, R4.1/R4.2.

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
import { isScanLoopRoute } from "@/lib/shell/scan-loop";
import type { RouteRegistryEntry } from "@/lib/shell/registry";
import { resolveShellUserDisplay } from "@/app/(authenticated)/actions";

// Icon map keyed by route id.
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
  // Sidebar nav entry label. "Stock View" is one of the tabs INSIDE this
  // page (Stock View / Pick Lists / Inspection), not the page's own name —
  // per multi-agent-work-division.md's confirmed sidebar target ("Master
  // Inventory (/inventory — Stock View, Pick Lists, Inspection tabs...)").
  // See specs/00-steering/revision-log.md's matching entry.
  inventory: "Master Inventory",
  enrollment: "Organization & Item Enrollment",
  portal: "Organization Portal",
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

function isNavigableEntry(entry: RouteRegistryEntry): boolean {
  return !entry.path.includes("[");
}

function NavLink({
  entry,
  isActive,
  tier,
  variant = "tab",
  onNavigate,
}: {
  entry: RouteRegistryEntry;
  isActive: boolean;
  tier: SessionPresentationTier;
  variant?: "tab" | "list";
  onNavigate?: () => void;
}) {
  const Icon = routeIcon(entry.id);
  const label = toLabel(entry.id);
  const floorText = tier === "floor";

  if (tier === "floor" && variant === "tab") {
    return (
      <Link
        href={entry.path}
        data-testid={`nav-entry-${entry.id}`}
        aria-current={isActive ? "page" : undefined}
        onClick={onNavigate}
        className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-2
          font-label uppercase tracking-wide
          active:scale-[0.97] active:opacity-75
          focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
          ${isActive ? "bg-primary/10 text-primary" : "text-text-secondary"}`}
      >
        <Icon size={22} aria-hidden="true" />
        <span className="text-mono-md font-label">{label}</span>
      </Link>
    );
  }

  return (
    <Link
      href={entry.path}
      data-testid={`nav-entry-${entry.id}`}
      aria-current={isActive ? "page" : undefined}
      onClick={onNavigate}
      className={`flex h-12 items-center gap-4 rounded-xl px-4 font-label font-semibold
        ${floorText ? "text-mono-md" : "text-label"}
        focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
        ${isActive ? "bg-primary text-surface" : "text-text-secondary hover:bg-background hover:text-text-primary"}`}
    >
      <Icon size={22} aria-hidden="true" />
      {label}
    </Link>
  );
}

function GroupedSections({
  sections,
  activeId,
  tier,
  onNavigate,
}: {
  sections: readonly NavSection[];
  activeId: string | null;
  tier: SessionPresentationTier;
  onNavigate?: () => void;
}) {
  const floorText = tier === "floor";
  return (
    <>
      {sections.map((section) => (
        <div key={section.group} className="mb-3">
          <p
            data-testid={`nav-group-${groupTestId(section.group)}`}
            className={`px-4 pb-1 pt-2 font-label font-bold uppercase tracking-wider text-text-secondary/70
              ${floorText ? "text-mono-md" : "text-mono-sm"}`}
          >
            {section.group}
          </p>
          <div className="flex flex-col gap-1">
            {section.entries.map((entry) => (
              <NavLink
                key={entry.id}
                entry={entry}
                isActive={entry.id === activeId}
                tier={tier}
                variant="list"
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
  desktopOpen = true,
}: {
  tier: SessionPresentationTier;
  context: Pick<AuthorizationContext, "grants">;
  currentPath: string;
  mobileNavOpen?: boolean;
  onCloseMobileNav?: () => void;
  // Desktop (lg+) sidebar collapsed/expanded state — distinct from
  // mobileNavOpen, which only ever applies below lg. Defaults true (open)
  // so every existing caller that doesn't pass this keeps today's
  // always-visible desktop sidebar behavior unchanged.
  desktopOpen?: boolean;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath]);

  const visible = filterVisibleRoutes(context).filter(
    (entry) => entry.launchStatus !== "planned",
  );
  const presented = selectRoutesForPresentation(visible, tier).filter(isNavigableEntry);
  const activeId = resolveActiveRouteId(currentPath);
  const sections = groupRoutesForSidebar(presented);
  const roleLabel = roleDisplayLabel(activeRoleKeys);

  const primaryFloorEntries = presented.slice(0, 4);

  if (tier === "floor" && isScanLoopRoute(currentPath)) {
    return null;
  }

  if (tier === "floor") {
    return (
      <>
        <nav
          data-testid="floor-tab-bar"
          aria-label="Primary navigation"
          className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-border bg-surface shadow-elevation-2"
        >
          {primaryFloorEntries.map((entry) => (
            <NavLink key={entry.id} entry={entry} isActive={entry.id === activeId} tier={tier} />
          ))}
          {presented.length > primaryFloorEntries.length && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-label="More navigation options"
              className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1 px-2 font-label uppercase tracking-wide text-text-secondary active:scale-[0.97] active:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Menu size={22} aria-hidden="true" />
              <span className="text-mono-md font-label">More</span>
            </button>
          )}
        </nav>
        {isMoreOpen && (
          <MoreOverlay
            sections={sections}
            activeId={activeId}
            displayName={displayName}
            roleLabel={roleLabel}
            tier={tier}
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
        aria-hidden={!desktopOpen}
        className={`hidden flex-col overflow-y-auto border-r border-border bg-surface p-4 lg:fixed lg:top-6 lg:bottom-6 lg:left-6 lg:z-40 lg:w-[306px] lg:rounded-xl lg:border lg:border-border lg:shadow-elevation-2 ${
          desktopOpen ? "lg:flex" : "lg:hidden"
        }`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50
                     focus:rounded focus:bg-primary focus:px-4 focus:py-2 focus:text-surface
                     focus:font-label focus:text-body-md focus:shadow-lg"
        >
          Skip to content
        </a>

        <div className="flex items-center gap-2 px-2 pt-1">
          <img src="/logo.svg" alt="Dyna-Serv WIMS" className="h-8 w-8" />
          <p className="font-heading text-headline-md font-bold tracking-tight text-text-primary">Dyna-Serv WIMS</p>
        </div>

        <Link
          href="/profile"
          className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-background p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary font-label text-label font-bold text-surface">
            {initials(displayName)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-heading text-body-md font-bold text-text-primary">{displayName ?? "Loading..."}</p>
            <p className="truncate font-body text-body-sm text-text-secondary">{roleLabel}</p>
          </div>
        </Link>

        <div className="mt-5 flex flex-1 flex-col">
          <GroupedSections sections={sections} activeId={activeId} tier={tier} />
        </div>
      </nav>

      {mobileNavOpen && (
        <div className="lg:hidden">
          <MoreOverlay
            sections={sections}
            activeId={activeId}
            displayName={displayName}
            roleLabel={roleLabel}
            tier={tier}
            onClose={() => onCloseMobileNav?.()}
          />
        </div>
      )}
    </>
  );
}

function MoreOverlay({
  sections,
  activeId,
  displayName,
  roleLabel,
  tier,
  onClose,
}: {
  sections: readonly NavSection[];
  activeId: string | null;
  displayName: string | null;
  roleLabel: string;
  tier: SessionPresentationTier;
  onClose: () => void;
}) {
  const floorText = tier === "floor";
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation menu">
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="absolute inset-y-0 right-0 flex w-[85%] max-w-sm flex-col overflow-y-auto bg-surface pb-24 shadow-elevation-2">
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary font-label text-label font-bold text-surface">
              {initials(displayName)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-heading text-body-md font-bold text-text-primary">{displayName ?? "Loading..."}</p>
              <p className={`truncate font-body text-text-secondary ${floorText ? "text-body-md" : "text-body-sm"}`}>{roleLabel}</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-full text-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:bg-background"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 px-2 py-2">
          <GroupedSections sections={sections} activeId={activeId} tier={tier} onNavigate={onClose} />
        </div>
      </div>
    </div>
  );
}
