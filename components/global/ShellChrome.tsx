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

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { resolveSessionPresentationTier } from "@/lib/shell/surface";
import { useShellSidebar } from "@/lib/shell/state";
import { useShellAuthorizationContext } from "./AuthenticatedShellBoundary";
import { ShellNavigation } from "./ShellNavigation";

export function ShellChrome({ children }: { children: ReactNode }) {
  const context = useShellAuthorizationContext();
  const pathname = usePathname();
  const { isOpen, toggle } = useShellSidebar();

  // AuthenticatedShellBoundary only renders this subtree once authorized,
  // so `context` is non-null in practice; the fallback keeps this
  // component defensively correct without asserting on the boundary.
  const tier = resolveSessionPresentationTier(context?.activeRoleKeys ?? []);

  return (
    <>
      {/* AppHeader — role="banner" landmark (R5.5, design.md §4).
          Holds the brand mark, the mobile nav-open toggle, and account
          controls. brand-navy background per brand-design-system.md §9.
          No backdrop-blur — solid surface for both floor and office tiers. */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-white/10 bg-brand-navy px-4 shadow-elevation-2">
        {/* Mobile hamburger — hidden above lg where the persistent sidebar
            takes over. 64px min touch target (floor primary rules apply
            since this control is present on every surface including floor).
            active: press feedback only, no hover (brand-design-system §9). */}
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

        {/* Brand word-mark. Real letter-mark asset (text stand-in for now —
            see tasks.md deferred item on logo asset wiring). Inter
            SemiBold per brand-design-system §2 / §9 sidebar spec. */}
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="btn-diagonal-cut inline-flex h-7 items-center bg-brand-red px-2 font-heading text-body-sm font-bold tracking-tight text-white"
          >
            DS
          </span>
          <span className="font-label text-body-md font-semibold uppercase tracking-wide text-surface-white">
            Dyna-Serv WIMS
          </span>
        </div>
      </header>

      <ShellNavigation
        tier={tier}
        context={{ grants: context?.grants ?? [] }}
        currentPath={pathname}
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
          lg:pl-64 clears the office/party desktop sidebar's fixed width.
          pt-14 clears the fixed AppHeader.
          Office/party tiers get the light `surface-light-grey` dashboard
          backdrop (brand-design-system §6/§9, revised 2026-08-09); floor
          keeps a plain white background per §6's AAA-contrast floor rule. */}
      <main
        className={`min-h-screen pb-20 pt-14 lg:pb-0 lg:pl-64 ${
          tier === "floor" ? "" : "bg-surface-light-grey"
        }`}
      >
        {children}
      </main>
    </>
  );
}
