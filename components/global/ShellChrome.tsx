// Renders ShellNavigation using the authorization context already resolved
// by AuthenticatedShellBoundary (via useShellAuthorizationContext) plus the
// live pathname, and the page content alongside it.
//
// This is app-wiring glue for app/(authenticated)/layout.tsx, not a
// separately spec'd/tested component — it composes two already-tested
// pieces (ShellNavigation, useShellAuthorizationContext) with Next.js'
// `usePathname()`, which is only available client-side.

"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { resolveSessionPresentationTier } from "@/lib/shell/surface";
import { useShellAuthorizationContext } from "./AuthenticatedShellBoundary";
import { ShellNavigation } from "./ShellNavigation";

export function ShellChrome({ children }: { children: ReactNode }) {
  const context = useShellAuthorizationContext();
  const pathname = usePathname();

  // AuthenticatedShellBoundary only renders this subtree once authorized,
  // so `context` is non-null in practice; the fallback keeps this
  // component defensively correct without asserting on the boundary.
  const tier = resolveSessionPresentationTier(context?.activeRoleKeys ?? []);

  return (
    <>
      <ShellNavigation tier={tier} context={{ grants: context?.grants ?? [] }} currentPath={pathname} />
      {/* pb-20 (base) clears the fixed floor bottom tab bar; office tier
          doesn't render that bar, so the extra bottom space is harmless.
          lg:pl-64 clears the office/party desktop sidebar's fixed width. */}
      <main className="pb-20 lg:pb-0 lg:pl-64">{children}</main>
    </>
  );
}
