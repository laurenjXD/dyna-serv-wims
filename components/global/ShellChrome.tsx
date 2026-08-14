// Renders full shell composition: AppHeader, ShellNavigation, StatusRegion, and page content slot.
// Traceability: design.md §4, requirements.md R5.1, R5.5

"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import { resolveSessionPresentationTier } from "@/lib/shell/surface";
import { useShellSidebar } from "@/lib/shell/state";
import { useShellAuthorizationContext } from "./AuthenticatedShellBoundary";
import { ShellNavigation } from "./ShellNavigation";
import { resolveShellUserDisplay } from "@/app/(authenticated)/actions";

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
  const [displayName, setDisplayName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    resolveShellUserDisplay()
      .then((result) => {
        if (active) setDisplayName(result.displayName);
      })
      .catch(() => {
        if (active) setDisplayName(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const tier = resolveSessionPresentationTier(context?.activeRoleKeys ?? []);
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

        <div className="flex items-center gap-3 lg:hidden">
          <span
            aria-hidden="true"
            className="inline-flex h-8 items-center rounded-lg bg-primary px-2 font-heading text-body-sm font-bold tracking-tight text-surface"
          >
            DS
          </span>
          <span className="font-label text-body-md font-semibold uppercase tracking-wide text-text-primary">
            Dyna-Serv WIMS
          </span>
        </div>

        <div className="hidden min-w-0 flex-1 items-center lg:flex">
          <div className="min-w-[230px]">
            <p className="font-heading text-headline-md font-bold text-text-primary">
              {pageTitle}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-7">
            {canManageAccess && (
              <Link
                href="/settings"
                aria-label="Settings"
                className="flex h-11 w-11 items-center justify-center rounded-full text-text-secondary hover:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Settings size={22} aria-hidden="true" />
              </Link>
            )}
            <Link
              href="/profile"
              aria-label="Profile"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-primary font-label text-body-md text-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {initials(displayName)}
            </Link>
          </div>
        </div>
      </header>

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
        className={`min-h-screen pb-20 pt-14 lg:pb-0 lg:pl-[306px] lg:pt-[76px] ${
          tier === "floor" ? "bg-surface" : "bg-background"
        }`}
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
