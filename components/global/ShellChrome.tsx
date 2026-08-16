// Renders full shell composition: AppHeader, ShellNavigation, StatusRegion, and page content slot.
// Traceability: design.md §4, requirements.md R5.1, R5.5

"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Settings, Wifi, WifiOff } from "lucide-react";
import { resolveSessionPresentationTier } from "@/lib/shell/surface";
import { isScanLoopRoute } from "@/lib/shell/scan-loop";
import { useShellSidebar } from "@/lib/shell/state";
import { useConnectivityStatus } from "@/lib/shell/use-connectivity";
import { useShellAuthorizationContext } from "./AuthenticatedShellBoundary";
import { ShellNavigation } from "./ShellNavigation";
import {
  resolveShellNotifications,
  resolveShellUserDisplay,
  signOutAction,
} from "@/app/(authenticated)/actions";
import type { ShellNotification } from "@/app/(authenticated)/actions";
import { markNotificationReadAction } from "@/lib/actions/notifications";

const CONNECTIVITY_LABEL: Record<
  ReturnType<typeof useConnectivityStatus>,
  string
> = {
  online: "Online",
  offline: "Offline",
  checking: "Checking connection…",
};

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ShellChrome({ children }: { children: ReactNode }) {
  const context = useShellAuthorizationContext();
  const pathname = usePathname();
  const { isOpen, toggle, close } = useShellSidebar();
  const connectivityStatus = useConnectivityStatus();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [organizationScope, setOrganizationScope] = useState<string | null>(null);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const accountMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<ShellNotification[]>([]);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const notificationPanelRef = useRef<HTMLDivElement | null>(null);
  const desktopBellRef = useRef<HTMLButtonElement | null>(null);
  const mobileBellRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isAccountMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        setIsAccountMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAccountMenuOpen(false);
        accountMenuTriggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountMenuOpen]);

  useEffect(() => {
    let active = true;
    resolveShellUserDisplay()
      .then((result) => {
        if (active) {
          setDisplayName(result.displayName);
          setEmail(result.email);
          setOrganizationScope(result.organizationScope);
        }
      })
      .catch(() => {
        if (active) {
          setDisplayName(null);
          setEmail(null);
          setOrganizationScope(null);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    resolveShellNotifications()
      .then((result) => {
        if (active) {
          setUnreadCount(result.unreadCount);
          setNotifications(result.notifications);
        }
      })
      .catch(() => {
        if (active) {
          setUnreadCount(0);
          setNotifications([]);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isNotificationPanelOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        notificationPanelRef.current &&
        !notificationPanelRef.current.contains(target) &&
        !desktopBellRef.current?.contains(target) &&
        !mobileBellRef.current?.contains(target)
      ) {
        setIsNotificationPanelOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsNotificationPanelOpen(false);
        desktopBellRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isNotificationPanelOpen]);

  function handleNotificationClick(notification: ShellNotification) {
    if (notification.readAt) return;

    // Optimistic UI: mark this notification read locally and drop the
    // unread count immediately, then fire the real write. The write is
    // RLS-enforced (markNotificationReadAction -> withRlsTransaction), so
    // no local rollback/refetch is attempted on failure here -- worst case
    // is a stale badge until the next resolveShellNotifications() load.
    setNotifications((current) =>
      current.map((item) =>
        item.id === notification.id
          ? { ...item, readAt: new Date().toISOString() }
          : item,
      ),
    );
    setUnreadCount((count) => Math.max(0, count - 1));
    void markNotificationReadAction(notification.id);
  }

  const tier = resolveSessionPresentationTier(context?.activeRoleKeys ?? []);
  const showFloorTabBar = tier === "floor" && !isScanLoopRoute(pathname);
  const pageTitle = getPageTitle(pathname);
  const canManageAccess = context?.grants.some(
    (grant) => grant.resource === "users" && grant.action === "read",
  );

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface px-4 shadow-elevation-1 lg:left-[306px] lg:h-[76px] lg:px-8 lg:shadow-none">
        {tier !== "floor" && (
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={isOpen}
            onClick={toggle}
            className="flex h-16 w-16 items-center justify-center text-text-primary active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
          >
            <span aria-hidden="true" className="text-body-lg">
              ☰
            </span>
          </button>
        )}

        <div className="flex flex-1 items-center gap-3 lg:hidden">
          <span
            aria-hidden="true"
            className="inline-flex h-8 items-center rounded-lg bg-primary px-2 font-heading text-body-sm font-bold tracking-tight text-surface"
          >
            DS
          </span>
          <span className="font-label text-body-md font-semibold uppercase tracking-wide text-text-primary">
            Dyna-Serv WIMS
          </span>
          <span
            data-testid="connectivity-indicator-mobile"
            aria-label={CONNECTIVITY_LABEL[connectivityStatus]}
            className="ml-auto flex shrink-0 items-center"
          >
            {connectivityStatus === "offline" ? (
              <WifiOff size={18} aria-hidden="true" className="text-warning" />
            ) : (
              <Wifi
                size={18}
                aria-hidden="true"
                className={
                  connectivityStatus === "online"
                    ? "text-status-available"
                    : "text-status-neutral"
                }
              />
            )}
          </span>
          <button
            ref={mobileBellRef}
            type="button"
            data-testid="notification-bell"
            aria-label="Notifications"
            aria-haspopup="dialog"
            aria-expanded={isNotificationPanelOpen}
            onClick={() => setIsNotificationPanelOpen((open) => !open)}
            className="relative flex h-14 w-14 shrink-0 items-center justify-center text-text-primary active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Bell size={20} aria-hidden="true" />
            {unreadCount > 0 && (
              <span
                data-testid="notification-badge"
                className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-label text-mono-md font-semibold leading-none text-surface"
              >
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        <div className="hidden min-w-0 flex-1 items-center lg:flex">
          <div className="min-w-0 max-w-[220px]">
            <p
              className="truncate font-heading text-headline-md font-bold text-text-primary"
              title={pageTitle}
            >
              {pageTitle}
            </p>
          </div>
          <div className="ml-auto flex min-w-0 items-center gap-7">
            <span
              data-testid="connectivity-indicator"
              className="flex shrink-0 items-center gap-1.5 text-body-sm font-semibold text-text-secondary"
            >
              {connectivityStatus === "offline" ? (
                <WifiOff size={18} aria-hidden="true" className="text-warning" />
              ) : (
                <Wifi
                  size={18}
                  aria-hidden="true"
                  className={
                    connectivityStatus === "online"
                      ? "text-status-available"
                      : "text-status-neutral"
                  }
                />
              )}
              {CONNECTIVITY_LABEL[connectivityStatus]}
            </span>
            <button
              ref={desktopBellRef}
              type="button"
              data-testid="notification-bell"
              aria-label="Notifications"
              aria-haspopup="dialog"
              aria-expanded={isNotificationPanelOpen}
              onClick={() => setIsNotificationPanelOpen((open) => !open)}
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Bell size={22} aria-hidden="true" />
              {unreadCount > 0 && (
                <span
                  data-testid="notification-badge"
                  className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 font-label text-mono-md font-semibold leading-none text-surface"
                >
                  {unreadCount}
                </span>
              )}
            </button>
            {canManageAccess && (
              <Link
                href="/settings"
                aria-label="Settings"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Settings size={22} aria-hidden="true" />
              </Link>
            )}
            <div ref={accountMenuRef} className="relative shrink-0">
              <button
                ref={accountMenuTriggerRef}
                type="button"
                id="account-menu-trigger"
                data-testid="account-menu-trigger"
                aria-label="Account"
                aria-haspopup="dialog"
                aria-expanded={isAccountMenuOpen}
                onClick={() => setIsAccountMenuOpen((open) => !open)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-primary font-label text-body-md text-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {initials(displayName)}
              </button>
              {isAccountMenuOpen && (
                <div
                  data-testid="account-popup"
                  aria-labelledby="account-menu-trigger"
                  className="absolute right-0 top-[calc(100%+8px)] z-40 min-w-[220px] rounded-lg border border-border bg-surface p-2 shadow-elevation-2"
                >
                  {(email || organizationScope) && (
                    <div role="presentation" className="mb-1 border-b border-border pb-1">
                      {email && (
                        <span
                          className="block truncate px-3 py-1 text-body-sm text-text-secondary"
                          title={email}
                        >
                          {email}
                        </span>
                      )}
                      {organizationScope && (
                        <span
                          data-testid="account-organization-scope"
                          className="block truncate px-3 py-1 text-body-sm text-text-secondary"
                          title={organizationScope}
                        >
                          {organizationScope}
                        </span>
                      )}
                    </div>
                  )}
                  <Link
                    href="/profile"
                    aria-label="Profile"
                    className="block rounded-md px-3 py-2 font-label text-body-sm font-semibold text-text-primary hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() => setIsAccountMenuOpen(false)}
                  >
                    Profile
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAccountMenuOpen(false);
                      void signOutAction();
                    }}
                    className="mt-1 flex w-full items-center justify-start rounded-md px-3 py-2 font-label text-body-sm font-semibold text-text-secondary hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {isNotificationPanelOpen && (
        <div
          ref={notificationPanelRef}
          data-testid="notification-panel"
          aria-labelledby="notification-bell"
          className="fixed inset-x-4 top-14 z-40 max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-surface p-2 shadow-elevation-2 lg:inset-x-auto lg:right-8 lg:top-[86px] lg:w-[320px]"
        >
          {notifications.length === 0 ? (
            <p className="px-3 py-4 text-center text-body-sm text-text-secondary">
              No notifications
            </p>
          ) : (
            <ul>
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    data-testid="notification-list-item"
                    onClick={() => handleNotificationClick(notification)}
                    className={`block w-full truncate rounded-md px-3 py-2 text-left text-body-sm font-semibold hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      notification.readAt
                        ? "text-text-secondary"
                        : "text-text-primary"
                    }`}
                  >
                    {notification.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ShellNavigation
        tier={tier}
        context={{ grants: context?.grants ?? [] }}
        currentPath={pathname}
        mobileNavOpen={isOpen}
        onCloseMobileNav={close}
      />

      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      <main
        id="main-content"
        data-surface={tier}
        className={`min-h-screen pt-14 lg:pb-0 lg:pl-[306px] lg:pt-[76px] ${
          showFloorTabBar ? "pb-20" : "pb-0"
        } ${tier === "floor" ? "bg-surface" : "bg-background"}`}
      >
        <div
          className={
            tier === "floor"
              ? "px-floor-padding py-6 lg:px-office-margin lg:py-8"
              : "px-4 py-6 md:px-6 lg:px-office-margin lg:py-8"
          }
        >
          {children}
        </div>
      </main>
    </>
  );
}

function getPageTitle(pathname: string): string {
  if (pathname === "/") return "Overview Dashboard";
  if (pathname.startsWith("/reports")) return "Reports & Analytics";
  if (pathname.startsWith("/receiving")) return "Receiving / Incoming";
  if (pathname.startsWith("/inventory")) return "Stock View";
  if (pathname.startsWith("/outgoing") || pathname.startsWith("/pick-lists")) return "Picking & Dispatch";
  if (pathname.startsWith("/transfers")) return "Transfers";
  if (pathname.startsWith("/inspection")) return "Inspection";
  if (pathname.startsWith("/approvals")) return "Approvals";
  if (pathname.startsWith("/enrollment")) return "Organization & Item Enrollment";
  if (pathname.startsWith("/master-data/parties")) return "Organizations";
  if (pathname.startsWith("/master-data/items")) return "Items (Inventory Model)";
  if (pathname.startsWith("/master-data/locations")) return "Locations";
  if (pathname.startsWith("/billing-pricing")) return "Billing & Pricing";
  if (pathname.startsWith("/documents")) return "Documents";
  if (pathname.startsWith("/portal")) return "Organization Portal";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/profile")) return "Profile";
  if (pathname.startsWith("/sync")) return "Sync Center";
  return "Dyna-Serv WIMS";
}
