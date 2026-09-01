// Shell navigation — one navigation registry, two alternate presentations.
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §4
// (`DesktopSidebar` and `MobileFloorNavigation` are alternate presentations
// of the same navigation registry) and §3.3. requirements.md R3.4, R3.6, R3.7, R4.1/R4.2.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
  ChevronRight,
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
  notifications: Bell,
};

const SHORT_LABEL_OVERRIDES: Record<string, string> = {
  root: "Dashboard",
  // Sidebar nav entry label. "Stock View" is one of the tabs INSIDE this
  // page (Stock View / Pick Lists / Inspection), not the page's own name —
  // per multi-agent-work-division.md's confirmed sidebar target ("Master
  // Inventory (/inventory — Stock View, Pick Lists, Inspection tabs...)").
  // See specs/00-steering/revision-log.md's matching entry.
  inventory: "Master Inventory",
  enrollment: "Enrollment",
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

function shortcutLabel(index: number): string {
  if (index < 9) return `Ctrl+${index + 1}`;
  if (index === 9) return "Ctrl+0";
  return `Ctrl+Shift+${index - 9}`;
}

/**
 * Detail and creation routes intentionally do not appear as separate sidebar
 * destinations. Keep their owning work area highlighted instead of leaving
 * the user without an active navigation cue.
 */
function resolveNavigationActiveId(currentPath: string, activeId: string | null): string | null {
  const path = currentPath.split("?")[0].split("#")[0].replace(/\/$/, "");
  if (path === "/receiving" || path.startsWith("/receiving/")) return "receiving";
  return activeId;
}

function NavLink({
  entry,
  isActive,
  tier,
  variant = "tab",
  onNavigate,
  compact = false,
  pendingApprovalCount = 0,
  shortcutNumber,
}: {
  entry: RouteRegistryEntry;
  isActive: boolean;
  tier: SessionPresentationTier;
  variant?: "tab" | "list";
  onNavigate?: () => void;
  compact?: boolean;
  pendingApprovalCount?: number;
  shortcutNumber?: number;
}) {
  const Icon = routeIcon(entry.id);
  const label = toLabel(entry.id);
  const floorText = tier === "floor";

  if (tier === "floor" && variant === "tab") {
    const tabLabel = entry.id === "inventory" ? "Inventory" : label;
    return (
      <Link
        href={entry.path}
        data-testid={`nav-entry-${entry.id}`}
        aria-current={isActive ? "page" : undefined}
        onClick={onNavigate}
        title={label}
        className={`flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1
          font-label tracking-normal
          active:scale-[0.97] active:opacity-75
          focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
          ${isActive ? "bg-primary/10 text-primary" : "text-text-secondary"}`}
      >
        <Icon size={19} className="shrink-0" aria-hidden="true" />
        <span className="w-full truncate text-center text-mono-md font-label font-medium leading-none tracking-normal">
          {tabLabel}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href={entry.path}
      data-testid={`nav-entry-${entry.id}`}
      aria-current={isActive ? "page" : undefined}
      onClick={onNavigate}
      data-active={isActive ? "true" : "false"}
    className={`group relative flex ${compact ? "h-11 gap-3 rounded-md px-2.5" : "h-12 gap-3 rounded-md px-3"} items-center overflow-hidden font-label font-semibold
        ${floorText ? "text-mono-md" : "text-label"}
        motion-safe:transition-[background-color,color,box-shadow,transform] motion-safe:duration-150
        focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1
        ${isActive
          ? "bg-accent-indigo-50 text-brand-navy shadow-elevation-1 before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-r-full before:bg-primary before:content-['']"
          : "text-text-secondary hover:translate-x-0.5 hover:bg-accent-indigo-50 hover:text-brand-navy hover:shadow-elevation-1"}`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md motion-safe:transition-colors motion-safe:duration-150 ${isActive ? "bg-primary text-surface" : "bg-background text-text-secondary group-hover:bg-primary/10 group-hover:text-primary"}`}>
        <Icon size={19} strokeWidth={2.1} aria-hidden="true" />
      </span>
      <span className={`min-w-0 flex-1 truncate ${floorText ? "text-mono-md" : "text-label"}`}>{label}</span>
      {entry.id === "approvals" && pendingApprovalCount > 0 && (
        <span data-testid="approval-count-badge" className="inline-flex min-w-6 items-center justify-center rounded-full border-2 border-red-500 bg-red-500 px-1.5 py-0.5 font-mono text-mono-sm font-bold leading-none text-surface">
          {pendingApprovalCount > 99 ? "99+" : pendingApprovalCount}
        </span>
      )}
      {shortcutNumber && (
        <kbd className="pointer-events-none absolute right-8 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-surface px-1.5 py-1 font-mono text-[11px] font-semibold leading-none text-text-secondary opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 xl:inline-flex">
          {shortcutLabel(shortcutNumber - 1)}
        </kbd>
      )}
      <ChevronRight size={16} aria-hidden="true" className={`shrink-0 motion-safe:transition-transform motion-safe:duration-150 ${isActive ? "translate-x-0 text-primary" : "-translate-x-1 text-text-secondary/40 opacity-0 group-hover:translate-x-0 group-hover:opacity-100"}`} />
    </Link>
  );
}

function GroupedSections({
  sections,
  activeId,
  tier,
  onNavigate,
  compact = false,
  pendingApprovalCount = 0,
  shortcutNumberById,
}: {
  sections: readonly NavSection[];
  activeId: string | null;
  tier: SessionPresentationTier;
  onNavigate?: () => void;
  compact?: boolean;
  pendingApprovalCount?: number;
  shortcutNumberById?: ReadonlyMap<string, number>;
}) {
  const floorText = tier === "floor";
  return (
    <>
      {sections.map((section) => (
        <div key={section.group} className={compact ? "mb-0" : "mb-4"}>
          <div
            data-testid={`nav-group-${groupTestId(section.group)}`}
            className={`${compact ? "px-2.5 pb-0.5 pt-0.5" : "px-3 pb-2 pt-3"} flex items-center gap-3 font-label font-bold uppercase tracking-[0.14em] text-text-secondary/70
              ${floorText ? "text-mono-md" : "text-mono-sm"}`}
          >
            <span>{section.group}</span>
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
          </div>
          <div className={`flex flex-col ${compact ? "gap-0" : "gap-1"}`}>
            {section.entries.map((entry) => (
              <NavLink
                key={entry.id}
                entry={entry}
                isActive={entry.id === activeId}
                tier={tier}
                variant="list"
                onNavigate={onNavigate}
                compact={compact}
                pendingApprovalCount={pendingApprovalCount}
                shortcutNumber={shortcutNumberById?.get(entry.id)}
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
  pendingApprovalCount = 0,
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
  pendingApprovalCount?: number;
}) {
  const router = useRouter();
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
  const activeId = resolveNavigationActiveId(currentPath, resolveActiveRouteId(currentPath));
  const sections = groupRoutesForSidebar(presented);
  const roleLabel = roleDisplayLabel(activeRoleKeys);
  const shortcutEntries = presented;
  const shortcutNumberById = new Map(
    shortcutEntries.map((entry, index) => [entry.id, index + 1] as const),
  );

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      if (
        target?.isContentEditable ||
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select"
      ) {
        return;
      }
      if (!event.ctrlKey || event.metaKey) return;
      const number = Number(event.key);
      if (!Number.isInteger(number) || number < 0 || number > 9) return;
      const index = event.shiftKey ? number + 9 : number === 0 ? 9 : number - 1;
      const entry = shortcutEntries[index];
      if (!entry) return;
      event.preventDefault();
      router.push(entry.path);
      onCloseMobileNav?.();
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [onCloseMobileNav, router, shortcutEntries]);

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
              className="flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 font-label tracking-normal text-text-secondary active:scale-[0.97] active:opacity-75 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Menu size={19} className="shrink-0" aria-hidden="true" />
              <span className="w-full truncate text-center text-mono-md font-label font-medium leading-none tracking-normal">More</span>
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
            pendingApprovalCount={pendingApprovalCount}
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
        className={`hidden h-[calc(100vh-1.5rem)] flex-col overflow-hidden bg-surface lg:fixed lg:bottom-3 lg:left-3 lg:top-3 lg:z-40 lg:w-[286px] lg:rounded-2xl lg:border lg:border-border lg:shadow-elevation-2 ${
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

        <div className="relative border-b border-border bg-background px-4 py-2.5">
          <div aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-surface shadow-elevation-1">
              <Image src="/logo.svg" alt="Dyna-Serv WIMS" width={30} height={30} priority />
            </span>
            <div className="min-w-0">
              <p className="truncate font-heading text-title-lg font-bold tracking-tight text-text-primary">Dyna-Serv WIMS</p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden px-3 py-0.5">
          <GroupedSections sections={sections} activeId={activeId} tier={tier} compact pendingApprovalCount={pendingApprovalCount} shortcutNumberById={shortcutNumberById} />
        </div>

        <div className="border-t border-border bg-background p-2">
          <div className="flex items-center gap-3 rounded-md border border-border bg-surface p-2.5 shadow-elevation-1">
            <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-navy font-heading text-label font-bold text-surface">
              {initials(displayName)}
              <span aria-hidden="true" className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface bg-status-available" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-label text-label font-bold text-text-primary">{displayName ?? "Signed-in user"}</p>
              <p className="mt-0.5 truncate font-body text-mono-sm text-text-secondary">{roleLabel}</p>
            </div>
          </div>
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
            pendingApprovalCount={pendingApprovalCount}
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
  pendingApprovalCount,
  onClose,
}: {
  sections: readonly NavSection[];
  activeId: string | null;
  displayName: string | null;
  roleLabel: string;
  tier: SessionPresentationTier;
  pendingApprovalCount: number;
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
      <div className="absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col overflow-y-auto rounded-r-lg bg-surface pb-20 shadow-elevation-2">
        <div className="relative flex items-center justify-between border-b border-border bg-background px-4 py-4">
          <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />
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
          <GroupedSections sections={sections} activeId={activeId} tier={tier} onNavigate={onClose} pendingApprovalCount={pendingApprovalCount} />
        </div>
      </div>
    </div>
  );
}
