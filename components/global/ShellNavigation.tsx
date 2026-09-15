// Shell navigation — one navigation registry, two alternate presentations.
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §4
// (`DesktopSidebar` and `MobileFloorNavigation` are alternate presentations
// of the same navigation registry) and §3.3. requirements.md R3.4, R3.6, R3.7, R4.1/R4.2.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  receiving: "Receiving",
  inventory: "Master Inventory",
  outgoing: "Outgoing",
  approvals: "Approvals",
  reports: "Reports & Analytics",
  documents: "Documents",
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
  if (path === "" || path === "/" || path === "/dashboard") return "root";
  if (path === "/receiving" || path.startsWith("/receiving/")) return "receiving";
  if (
    path === "/inventory" ||
    path.startsWith("/inventory/") ||
    path === "/transfers" ||
    path.startsWith("/transfers/") ||
    path === "/inspection" ||
    path.startsWith("/inspection/")
  ) {
    return "inventory";
  }
  if (
    path === "/outgoing" ||
    path.startsWith("/outgoing/") ||
    path.startsWith("/pick-lists/")
  ) {
    return "outgoing";
  }
  if (path === "/approvals" || path.startsWith("/approvals/")) return "approvals";
  if (path === "/reports" || path.startsWith("/reports/")) return "reports";
  if (path === "/documents" || path.startsWith("/documents/")) return "documents";
  if (
    path === "/enrollment" ||
    path.startsWith("/enrollment/") ||
    path.startsWith("/master-data/")
  ) {
    return "enrollment";
  }
  if (path === "/billing-pricing" || path.startsWith("/billing-pricing/")) return "billing-pricing";
  if (path === "/settings" || path.startsWith("/settings/")) return "settings";
  if (path === "/profile" || path.startsWith("/profile/")) return "profile";
  if (path === "/portal" || path.startsWith("/portal/")) {
    if (path === "/portal/inventory" || path.startsWith("/portal/inventory/")) return "portal-inventory";
    if (path === "/portal/orders" || path.startsWith("/portal/orders/")) return "portal-orders";
    if (path === "/portal/documents" || path.startsWith("/portal/documents/")) return "portal-documents";
    if (path === "/portal/notifications" || path.startsWith("/portal/notifications/")) return "portal-notifications";
    if (path === "/portal/labels" || path.startsWith("/portal/labels/")) return "portal-labels";
    return "portal";
  }
  return activeId;
}

function NavLink({
  entry,
  isActive,
  tier,
  variant = "tab",
  onNavigate,
  compact = false,
  isMini = false,
  pendingApprovalCount = 0,
  shortcutNumber,
}: {
  entry: RouteRegistryEntry;
  isActive: boolean;
  tier: SessionPresentationTier;
  variant?: "tab" | "list";
  onNavigate?: () => void;
  compact?: boolean;
  isMini?: boolean;
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

  if (isMini) {
    return (
      <Link
        href={entry.path}
        data-testid={`nav-entry-${entry.id}`}
        aria-current={isActive ? "page" : undefined}
        onClick={onNavigate}
        title={`${label}${shortcutNumber ? ` (${shortcutLabel(shortcutNumber - 1)})` : ""}`}
        data-active={isActive ? "true" : "false"}
        className={`group relative mx-auto flex h-11 w-11 items-center justify-center rounded-full
          motion-safe:transition-all motion-safe:duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
          focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80
          ${isActive
            ? "bg-white/20 text-white ring-2 ring-white/60 shadow-[0_4px_14px_rgba(0,0,0,0.18)] scale-105"
            : "text-white/75 hover:text-white hover:bg-white/10 hover:scale-105 active:scale-95"}`}
      >
        <Icon size={22} strokeWidth={2.2} aria-hidden="true" className="motion-safe:transition-transform motion-safe:duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110" />
        {entry.id === "approvals" && pendingApprovalCount > 0 && (
          <span
            data-testid="approval-count-badge"
            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-[#0b4d94] bg-red-500 text-[10px] font-bold text-white shadow-sm"
          >
            {pendingApprovalCount > 9 ? "9+" : pendingApprovalCount}
          </span>
        )}

        {/* Floating Tooltip displaying current tab name on hover */}
        <div
          role="tooltip"
          className="pointer-events-none absolute left-[calc(100%+14px)] top-1/2 z-50 -translate-y-1/2 hidden group-hover:flex items-center gap-2 rounded-xl bg-slate-900/95 px-3 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-md border border-white/10 opacity-0 group-hover:opacity-100 group-hover:scale-100 scale-95 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none whitespace-nowrap"
        >
          {/* Arrow */}
          <span className="absolute -left-1 top-1/2 -translate-y-1/2 h-2 w-2 rotate-45 bg-slate-900 border-b border-l border-white/10" aria-hidden="true" />
          <span className="font-heading text-xs font-bold text-white tracking-wide">{label}</span>
          {isActive && (
            <span className="rounded-full bg-blue-500/20 border border-blue-400/40 px-1.5 py-0.5 text-[10px] font-bold text-blue-300">
              Active
            </span>
          )}
          {shortcutNumber && (
            <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-300">
              {shortcutLabel(shortcutNumber - 1)}
            </kbd>
          )}
        </div>
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
      className={`group relative flex ${compact ? "h-11 gap-3 rounded-full px-3" : "h-12 gap-3 rounded-full px-3"} items-center overflow-hidden font-label font-semibold
        ${floorText ? "text-mono-md" : "text-label"}
        motion-safe:transition-all motion-safe:duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
        focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-1
        ${isActive
          ? "bg-white text-[#0b4d94] shadow-[0_4px_14px_rgba(0,0,0,0.15)] bg-primary/[0.08] before:absolute before:inset-y-2 before:left-0 before:w-2 before:rounded-r-full before:bg-primary before:content-[''] scale-[1.01]"
          : "text-white/90 hover:translate-x-1 hover:bg-white/10 hover:text-white hover:bg-primary/[0.05] hover:shadow-sm"}`}
    >
      {/* Left blue accent curve */}
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-2 rounded-r-full bg-[#1e40af] motion-safe:transition-all motion-safe:duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
        />
      )}
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full motion-safe:transition-all motion-safe:duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isActive ? "bg-blue-100/90 text-primary text-[#0b4d94]" : "bg-white/15 text-white group-hover:bg-white/25"}`}>
        <Icon size={20} strokeWidth={2.2} aria-hidden="true" className="motion-safe:transition-transform motion-safe:duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-110" />
      </span>
      <span className={`whitespace-nowrap min-w-0 flex-1 truncate motion-safe:transition-opacity motion-safe:duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${floorText ? "text-mono-md" : "text-label"} ${isActive ? "text-[#0b4d94] font-bold" : "text-white/90 font-semibold"}`}>{label}</span>
      {entry.id === "approvals" && pendingApprovalCount > 0 && (
        <span data-testid="approval-count-badge" className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1.5 font-mono text-mono-sm font-bold leading-none text-white shadow-sm">
          {pendingApprovalCount > 99 ? "99+" : pendingApprovalCount}
        </span>
      )}
      {shortcutNumber && (
        <kbd className="pointer-events-none absolute right-8 top-1/2 hidden -translate-y-1/2 rounded border border-white/20 bg-white/15 px-1.5 py-1 font-mono text-[11px] font-semibold leading-none text-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 xl:inline-flex">
          {shortcutLabel(shortcutNumber - 1)}
        </kbd>
      )}
      {isActive ? (
        <ChevronRight size={18} strokeWidth={2.5} aria-hidden="true" className="text-[#0b4d94] shrink-0" />
      ) : (
        <ChevronRight size={16} aria-hidden="true" className="shrink-0 motion-safe:transition-transform motion-safe:duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] -translate-x-1 text-white/40 opacity-0 group-hover:translate-x-0 group-hover:opacity-100" />
      )}
    </Link>
  );
}

function GroupedSections({
  sections,
  activeId,
  tier,
  onNavigate,
  compact = false,
  isMini = false,
  pendingApprovalCount = 0,
  shortcutNumberById,
}: {
  sections: readonly NavSection[];
  activeId: string | null;
  tier: SessionPresentationTier;
  onNavigate?: () => void;
  compact?: boolean;
  isMini?: boolean;
  pendingApprovalCount?: number;
  shortcutNumberById?: ReadonlyMap<string, number>;
}) {
  const floorText = tier === "floor";

  if (isMini) {
    return (
      <div className="flex flex-col gap-2 py-1">
        {sections.map((section, sIdx) => (
          <div key={section.group} className="flex flex-col items-center gap-1.5">
            {sIdx > 0 && <div className="my-1.5 h-px w-6 bg-white/20" aria-hidden="true" />}
            {section.entries.map((entry) => (
              <NavLink
                key={entry.id}
                entry={entry}
                isActive={entry.id === activeId}
                tier={tier}
                variant="list"
                isMini={true}
                onNavigate={onNavigate}
                pendingApprovalCount={pendingApprovalCount}
                shortcutNumber={shortcutNumberById?.get(entry.id)}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {sections.map((section) => (
        <div key={section.group} className={compact ? "mb-0" : "mb-4"}>
          <div
            data-testid={`nav-group-${groupTestId(section.group)}`}
            className={`${compact ? "px-2.5 pb-0.5 pt-0.5" : "px-3 pb-2 pt-3"} flex items-center gap-3 font-label font-bold uppercase tracking-[0.14em] text-blue-200/80
              ${floorText ? "text-mono-md" : "text-mono-sm"}`}
          >
            <span>{section.group}</span>
            <span aria-hidden="true" className="h-px flex-1 bg-white/20" />
          </div>
          <div className={`flex flex-col ${compact ? "gap-0.5" : "gap-1"}`}>
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
  desktopOpen = false,
  pendingApprovalCount = 0,
}: {
  tier: SessionPresentationTier;
  context: Pick<AuthorizationContext, "grants">;
  currentPath: string;
  mobileNavOpen?: boolean;
  onCloseMobileNav?: () => void;
  // Desktop (lg+) sidebar collapsed/expanded state — distinct from
  // mobileNavOpen, which only ever applies below lg. Defaults collapsed.
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
        aria-hidden={false}
        className={`print:hidden hidden flex-col overflow-visible border-r border-[#083c77]/60 bg-gradient-to-b from-[#0e549e] via-[#0b4d94] to-[#083c77] shadow-[4px_0_24px_rgba(11,77,148,0.18)] transition-[width] duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none lg:fixed lg:bottom-0 lg:left-0 lg:top-[76px] lg:z-40 lg:flex ${
          desktopOpen ? "lg:w-[304px]" : "lg:w-[88px]"
        }`}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50
                     focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:text-primary
                     focus:font-label focus:text-body-md focus:shadow-lg"
        >
          Skip to content
        </a>

        {/* Navigation Section List */}
        <div className={`min-h-0 flex-1 py-3 transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] ${desktopOpen ? "px-3" : "px-1.5"}`}>
          <GroupedSections
            sections={sections}
            activeId={activeId}
            tier={tier}
            compact
            isMini={!desktopOpen}
            pendingApprovalCount={pendingApprovalCount}
            shortcutNumberById={shortcutNumberById}
          />
        </div>

        {/* User Footer Card */}
        <div className={`border-t border-white/10 bg-black/10 transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] ${desktopOpen ? "p-3" : "p-2 text-center"}`}>
          <div className={`flex items-center transition-all duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] ${desktopOpen ? "gap-3 rounded-2xl border border-white/15 bg-white/10 p-3 backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.15)]" : "justify-center p-1"}`}>
            <span
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#3b5998]/80 font-heading text-sm font-bold text-white border border-white/30 shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-105"
              title={`${displayName ?? "admin"} (${roleLabel})`}
            >
              {initials(displayName)}
              <span aria-hidden="true" className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#0b4d94] bg-emerald-400" />
            </span>
            {desktopOpen && (
              <div className="min-w-0 flex-1 whitespace-nowrap overflow-hidden transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
                <p className="truncate font-heading text-sm font-bold text-white">{displayName ?? "admin"}</p>
                <p className="truncate font-body text-xs text-blue-200/90">{roleLabel}</p>
              </div>
            )}
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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Bottom Sheet rising from bottom to up */}
      <div className="relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-[28px] border-t border-[#083c77]/60 bg-gradient-to-b from-[#0e549e] via-[#0b4d94] to-[#083c77] shadow-2xl transition-transform duration-300 ease-out animate-in slide-in-from-bottom">
        {/* Grab Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1.5 w-12 rounded-full bg-white/30" aria-hidden="true" />
        </div>

        {/* Header with User Profile & Close Button */}
        <div className="flex items-center justify-between border-b border-white/15 bg-black/10 px-5 py-3.5 shrink-0">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 font-label text-label font-bold text-white border border-white/30 shadow-sm">
              {initials(displayName)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-heading text-body-md font-bold text-white">
                {displayName ?? "Navigation Menu"}
              </p>
              <p className={`truncate font-body text-blue-100/80 ${floorText ? "text-body-md" : "text-body-sm"}`}>
                {roleLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/80 hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:scale-95 transition-all"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable Navigation List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 pb-10 space-y-2">
          <GroupedSections
            sections={sections}
            activeId={activeId}
            tier={tier}
            onNavigate={onClose}
            pendingApprovalCount={pendingApprovalCount}
          />
        </div>
      </div>
    </div>
  );
}
