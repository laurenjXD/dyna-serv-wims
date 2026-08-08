// Authenticated route-group layout — wires AuthenticatedShellBoundary +
// ShellNavigation into the real Next.js app per
// specs/05-ui-shell-and-navigation/design.md §4/§7.
//
// Hands AuthenticatedShellBoundary a resolver whose `getContext` is the
// `resolveShellAuthorization` Server Action (./actions.ts) — the one
// function shape Next.js can serialize across the Server->Client boundary.
import type { ReactNode } from "react";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { AuthenticatedShellBoundary } from "@/components/global/AuthenticatedShellBoundary";
import { ShellChrome } from "@/components/global/ShellChrome";
import { resolveShellAuthorization } from "./actions";

const resolver: RequestAuthorizationResolver = {
  getContext: resolveShellAuthorization,
};

export default function AuthenticatedLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AuthenticatedShellBoundary resolver={resolver}>
      <ShellChrome>{children}</ShellChrome>
    </AuthenticatedShellBoundary>
  );
}
