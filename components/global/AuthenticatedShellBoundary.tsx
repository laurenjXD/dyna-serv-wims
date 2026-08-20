// Client-side authenticated shell boundary.
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §3.4's "Session
// checking" and "Empty" rows, and requirements.md R2.3 ("Expired, revoked,
// or inactive sessions SHALL not render protected content after the server
// detects the condition") and R2.4 ("An authenticated user with no active
// usable capability SHALL receive the approved safe empty-access state
// rather than an unbounded application shell").
//
// This never renders `children` optimistically. While the resolver's
// getContext() promise is pending, it renders only the session-checking
// state.

"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type {
  AuthorizationContext,
  AuthorizationResolution,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import { ShellStateView } from "./ShellStateView";

// Where an unauthenticated/revoked session actually gets sent. This is
// `/login` (the route this project actually built), not `/sign-in` (the
// name used in specs/05-ui-shell-and-navigation/design.md's App Router
// skeleton) -- flagged here as a real spec/implementation naming mismatch,
// not silently reconciled by picking one and hoping nobody notices.
const SIGN_IN_ROUTE = "/login";

// Exposes the already-resolved AuthorizationContext to descendants once
// authorized, so a shell-composition component (e.g. app/(authenticated)'s
// layout wiring) never needs a second, duplicate resolution just to render
// navigation. `null` outside an authorized boundary (nothing renders
// `children`, and therefore this provider, until authorization succeeds).
const ShellAuthorizationContext = createContext<AuthorizationContext | null>(null);

export function useShellAuthorizationContext(): AuthorizationContext | null {
  return useContext(ShellAuthorizationContext);
}

export function AuthenticatedShellBoundary({
  resolver,
  initialResolution,
  children,
}: {
  resolver?: RequestAuthorizationResolver;
  initialResolution?: AuthorizationResolution;
  children: ReactNode;
}) {
  const router = useRouter();
  const [resolution, setResolution] = useState<AuthorizationResolution | null>(
    initialResolution ?? null,
  );

  useEffect(() => {
    if (initialResolution || !resolver) return;
    let active = true;
    resolver
      .getContext()
      .then((result) => {
        if (active) setResolution(result);
      })
      .catch(() => {
        if (active) setResolution({ kind: "unauthenticated" });
      });
    return () => {
      active = false;
    };
    // A new resolver instance means a new request-scoped resolution;
    // re-resolve whenever the caller supplies a different resolver.
  }, [initialResolution, resolver]);

  // The "revoked_session" ShellStateView copy says "Redirecting you to sign
  // in..." -- this effect is what makes that claim true for a genuinely
  // absent session. Previously nothing actually navigated anywhere at all
  // (caught 2026-08-08 against a real deploy: stuck forever on the static
  // message).
  //
  // Deliberately `unauthenticated` ONLY, not `forbidden` too (a mistake in
  // this fix's first version, caught the same day): `forbidden` means the
  // Supabase session IS valid -- `loadAuthorizationRecord` just has no real
  // query wired in yet (02-rbac-roles seam gap, app/(authenticated)/actions.ts).
  // Redirecting an already-authenticated-but-forbidden session back to
  // /login creates an infinite loop -- login keeps succeeding (the
  // credentials are genuinely valid), landing back on `/`, resolving
  // forbidden again, redirecting again. `forbidden` still renders the
  // identical `revoked_session` ShellStateView below (R2.3/R2.4: never
  // leak *why* access was denied, same message either way) -- it just
  // doesn't navigate anywhere, since re-login cannot fix a missing DB
  // record and there is nowhere more correct to send this session yet.
  useEffect(() => {
    if (resolution?.kind === "unauthenticated") {
      router.push(SIGN_IN_ROUTE);
    }
  }, [resolution?.kind, router]);

  // Never render `children` while resolution is pending (R2.3: no
  // optimistic protected-content render).
  if (resolution === null) {
    return <ShellStateView state={{ kind: "session_checking" }} />;
  }

  if (resolution.kind === "unauthenticated") {
    return <ShellStateView state={{ kind: "revoked_session" }} />;
  }

  if (resolution.kind === "forbidden") {
    // Inactive/missing profile or a resolution-time error: treat identically
    // to a revoked session — never render protected content, never leak the
    // internal denial reason.
    return <ShellStateView state={{ kind: "revoked_session" }} />;
  }

  if (resolution.context.grants.length === 0) {
    // R2.4: an authenticated user with no active usable capability gets the
    // safe empty-access state, never the full navigation shell.
    return <ShellStateView state={{ kind: "empty_access" }} />;
  }

  return (
    <ShellAuthorizationContext.Provider value={resolution.context}>
      {children}
    </ShellAuthorizationContext.Provider>
  );
}
