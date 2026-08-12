// Renders the full shell composition: AppHeader landmark (with mobile nav
// toggle), ShellNavigation, StatusRegion, and the page content slot.
//
// Traceability:
// - design.md §4 (shell composition tree: AppHeader, DesktopSidebar /
//   MobileFloorNavigation, MainContent slot, StatusRegion).
// - requirements.md R5.1 ("Authenticated feature routes SHALL render inside
//   a shared shell layout").
// - requirements.md R5.5 ("The shell SHALL provide stable landmarks for
//   header, navigation, main content, and status/feedback regions").
// - design.md §6 ("At narrow mobile widths the sidebar collapses to a
//   hamburger/drawer").
//
// This is app-wiring glue for app/(authenticated)/layout.tsx, not a
// separately spec'd component — it composes already-tested pieces
// (ShellNavigation, useShellAuthorizationContext) with Next.js'
// `usePathname()`, which is only available client-side.

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

  // AuthenticatedShellBoundary only renders this subtree once authorized,
  // so `context` is non-null in practice; the fallback keeps this
  // component defensively correct without asserting on the boundary.
  const tier = resolveSessionPresentationTier(context?.activeRoleKeys ?? []);
  const pageTitle = getPageTitle(pathname);
  const canManageAccess = context?.grants.some(
    (grant) => grant.resource === "users" && grant.action === "read",
  );

  return (
    <>
      {/* AppHeader — role="banner" landmark (R5.5, design.md §4).
          Holds the brand mark, the mobile nav-open toggle, and account
          controls. brand-navy background per brand-design-system.md §9.
          No backdrop-blur — solid surface for both floor and office tiers. */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-white/10 bg-brand-navy px-4 shadow-elevation-2 lg:left-[306px] lg:h-[76px] lg:border-outline-variant/30 lg:bg-surface-white lg:px-8 lg:shadow-none">
        {/* Mobile hamburger — hidden above lg where the persistent sidebar
            takes over. 64px min touch target (floor primary rules apply
            since this control is present on every surface including floor).
            active: press feedback only, no hover (brand-design-system §9). */}
        {/* Floor tier has no persistent sidebar to collapse — its full nav is
            already one tap away via the bottom tab bar's "More" button
            (ShellNavigation's floor branch), so the header hamburger only
            renders for office/party tiers, per design.md §6. */}
        {tier !== "floor" && (
          <button
            type="button"
            aria-label="Open navigation"
            aria-expanded={isOpen}
            onClick={toggle}
            className="flex h-16 w-16 items-center justify-center text-surface-white active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-surface-white lg:hidden"
          >
            {/* Unicode hamburger — no external icon library (task constraint). */}
            <span aria-hidden="true" className="text-body-lg">
              ☰
            </span>
          </button>
        )}

        {/* Brand word-mark. Real letter-mark asset (text stand-in for now —
            see tasks.md deferred item on logo asset wiring). Inter
            SemiBold per brand-design-system §2 / §9 sidebar spec. */}
        <div className="flex items-center gap-3 lg:hidden">
          <span
            aria-hidden="true"
            className="inline-flex h-8 items-center rounded bg-brand-red px-2 font-heading text-body-sm font-bold tracking-tight text-white"
          >
            DS
          </span>
          <span className="font-label text-body-md font-semibold uppercase tracking-wide text-surface-white">
            Dyna-Serv WIMS
          </span>
        </div>

        {/* Desktop top bar — matches the Stitch reference's compact title and
            account controls. Search stays within feature pages, where it can
            be scoped to a real result set. */}
        <div className="hidden min-w-0 flex-1 items-center lg:flex">
          <div className="min-w-[230px]">
            <p className="font-heading text-headline-md font-bold text-on-surface">
              {pageTitle}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-7">
            {canManageAccess && (
              <Link
                href="/settings"
                aria-label="Settings"
                className="flex h-11 w-11 items-center justify-center rounded-full text-text-grey hover:bg-surface-light-grey focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                <Settings size={22} aria-hidden="true" />
              </Link>
            )}
            <Link
              href="/profile"
              aria-label="Profile"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-indigo-300 font-label text-body-md text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
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

      {/* StatusRegion — role="status" / aria-live="polite" landmark (R5.5,
          design.md §4/§10). Visually hidden until a feature writes a
          message into it; the ARIA live region is always present in the
          accessibility tree so assistive technology can discover it before
          any announcement fires. Features write scan success/error
          feedback here only where shell-level announcement is appropriate
          — feature-owned floor flash behavior is separate (design.md §9). */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      />

      {/* pb-20 (base) clears the fixed floor bottom tab bar; office tier
          doesn't render that bar, so the extra bottom space is harmless.
          lg:pl-72 clears the office/party desktop sidebar's fixed width.
          pt-14 clears the fixed AppHeader.
          Office/party tiers get the light `surface-light-grey` dashboard
          backdrop (brand-design-system §6/§9, revised 2026-08-09); floor
          keeps a plain white background per §6's AAA-contrast floor rule. */}
      <main
        id="main-content"
        data-surface={tier}
        className={`min-h-screen pb-20 pt-14 lg:pb-0 lg:pl-[306px] lg:pt-[76px] ${
          tier === "floor" ? "" : "bg-surface-light-grey"
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
  if (pathname.startsWith("/receiving")) return "Incoming Receiving";
  if (pathname.startsWith("/inventory")) return "Detailed Stock Audit";
  if (pathname.startsWith("/outgoing") || pathname.startsWith("/pick-lists")) return "Picking & Dispatch";
  if (pathname.startsWith("/transfers")) return "Transfers";
  if (pathname.startsWith("/inspection")) return "Inspection";
  if (pathname.startsWith("/approvals")) return "Approvals";
  if (pathname.startsWith("/enrollment")) return "Enrollment";
  if (pathname.startsWith("/master-data/parties")) return "Parties";
  if (pathname.startsWith("/master-data/items")) return "Items";
  if (pathname.startsWith("/master-data/locations")) return "Locations";
  if (pathname.startsWith("/billing-pricing")) return "Billing & Pricing";
  if (pathname.startsWith("/documents")) return "Documents";
  if (pathname.startsWith("/portal")) return "Partner Portal";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/profile")) return "Profile";
  if (pathname.startsWith("/sync")) return "Sync Center";
  return "Dyna-Serv WIMS";
}
