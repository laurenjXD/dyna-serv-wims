// Route guard — a Server Component that delegates the authorization
// decision entirely to lib/shell/route-guard.ts and renders the approved
// safe state on any denial path.
//
// Traceability: specs/05-ui-shell-and-navigation/design.md §7 ("Navigation
// omission is not security... Enforce route/resource authorization again
// at the server action, route handler, or data boundary") and
// requirements.md R6.3/R6.7.

import type { ReactNode } from "react";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { evaluateRouteGuard } from "@/lib/shell/route-guard";
import { ShellStateView } from "./ShellStateView";

export async function RouteGuard({
  resolver,
  capability,
  existenceSafeToDisclose,
  children,
}: {
  resolver: RequestAuthorizationResolver;
  capability: string;
  existenceSafeToDisclose: boolean;
  children: ReactNode;
}) {
  const { disclosure } = await evaluateRouteGuard(resolver, capability, {
    existenceSafeToDisclose,
  });

  switch (disclosure) {
    case "authorized":
      return <>{children}</>;
    case "not_found":
      return <ShellStateView state={{ kind: "not_found" }} />;
    case "forbidden":
      return <ShellStateView state={{ kind: "forbidden" }} />;
    case "unauthenticated":
      return <ShellStateView state={{ kind: "revoked_session" }} />;
    default:
      return <ShellStateView state={{ kind: "error" }} />;
  }
}
