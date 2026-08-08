// @vitest-environment jsdom
//
// RED-step test for `components/global/RouteGuard.tsx`, which does not
// exist yet. Wraps a route, calls `lib/shell/route-guard.ts`'s
// `evaluateRouteGuard`, and renders the corresponding safe state.
//
// Traceability:
// - specs/05-ui-shell-and-navigation/design.md §7 ("Navigation omission is
//   not security... Enforce route/resource authorization again at the
//   server action, route handler, or data boundary") and §3.4's
//   forbidden/not-found rows.
// - specs/05-ui-shell-and-navigation/requirements.md R6.3 ("Unknown or
//   unauthorized routes SHALL use the approved not-found/forbidden
//   behavior and SHALL not disclose protected resource existence") and
//   R6.7 (not-found vs forbidden must remain distinct).
//
// Assumed component contract (RED-step decision, since neither the
// component nor an established convention for it exists yet):
//   export async function RouteGuard(props: {
//     resolver: RequestAuthorizationResolver;
//     capability: string;
//     existenceSafeToDisclose: boolean;
//     children: ReactNode;
//   }): Promise<JSX.Element>
//   - Delegates entirely to lib/shell/route-guard.ts#evaluateRouteGuard
//     (which itself delegates to lib/rbac/guard.ts) — this component must
//     not re-derive the forbidden-vs-not-found decision.
//   - disclosure === "authorized" -> renders `children` verbatim.
//   - disclosure === "not_found" -> renders <ShellStateView
//     state={{ kind: "not_found" }} />.
//   - disclosure === "forbidden" -> renders <ShellStateView
//     state={{ kind: "forbidden" }} />.
//   - disclosure === "unauthenticated" -> renders <ShellStateView
//     state={{ kind: "revoked_session" }} />.
//   Because this is a Server Component (async, no client interactivity),
//   this test calls it directly and renders the resolved element, per the
//   RSC-in-Vitest pattern already used for `lib/rbac`'s own async
//   resolvers — it does not attempt to simulate React's Suspense/RSC
//   streaming pipeline.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type {
  AuthorizationResolution,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import { RouteGuard } from "@/components/global/RouteGuard";

function makeResolver(resolution: AuthorizationResolution): RequestAuthorizationResolver {
  return { getContext: async () => resolution };
}

const authorizedContext = {
  userId: "user-1",
  profileStatus: "active" as const,
  activeRoleKeys: ["warehouse_staff"],
  grants: [{ resource: "receiving", action: "view", scopeKind: "global" as const }],
  partyScopes: [],
};

describe("RouteGuard (route-guard.ts delegation, R6.3/R6.7)", () => {
  it("renders children verbatim when evaluateRouteGuard resolves 'authorized'", async () => {
    const resolver = makeResolver({ kind: "authorized", context: authorizedContext });
    const element = await RouteGuard({
      resolver,
      capability: "receiving.view",
      existenceSafeToDisclose: true,
      children: <div data-testid="protected-content">secret</div>,
    });
    render(element);
    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
  });

  it("renders the not_found state (never children) when existenceSafeToDisclose is false and the grant is missing", async () => {
    const resolver = makeResolver({
      kind: "authorized",
      context: { ...authorizedContext, grants: [] },
    });
    const element = await RouteGuard({
      resolver,
      capability: "fifo_override.approve",
      existenceSafeToDisclose: false,
      children: <div data-testid="protected-content">secret</div>,
    });
    render(element);
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("shell-state-not_found")).toBeInTheDocument();
  });

  it("renders the forbidden state (never children) when existenceSafeToDisclose is true and the grant is missing", async () => {
    const resolver = makeResolver({
      kind: "authorized",
      context: { ...authorizedContext, grants: [] },
    });
    const element = await RouteGuard({
      resolver,
      capability: "fifo_override.approve",
      existenceSafeToDisclose: true,
      children: <div data-testid="protected-content">secret</div>,
    });
    render(element);
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("shell-state-forbidden")).toBeInTheDocument();
  });

  it("renders visibly different content for not_found vs forbidden from the same underlying denial (R6.7)", async () => {
    const deniedResolver = makeResolver({
      kind: "authorized",
      context: { ...authorizedContext, grants: [] },
    });

    const notFoundElement = await RouteGuard({
      resolver: deniedResolver,
      capability: "fifo_override.approve",
      existenceSafeToDisclose: false,
      children: <div>secret</div>,
    });
    const { unmount } = render(notFoundElement);
    const notFoundText = screen.getByTestId("shell-state-not_found").textContent;
    unmount();

    const forbiddenElement = await RouteGuard({
      resolver: deniedResolver,
      capability: "fifo_override.approve",
      existenceSafeToDisclose: true,
      children: <div>secret</div>,
    });
    render(forbiddenElement);
    const forbiddenText = screen.getByTestId("shell-state-forbidden").textContent;

    expect(notFoundText).not.toBe(forbiddenText);
  });

  it("renders the revoked_session state (never children) when unauthenticated", async () => {
    const resolver = makeResolver({ kind: "unauthenticated" });
    const element = await RouteGuard({
      resolver,
      capability: "receiving.view",
      existenceSafeToDisclose: true,
      children: <div data-testid="protected-content">secret</div>,
    });
    render(element);
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    expect(screen.getByTestId("shell-state-revoked_session")).toBeInTheDocument();
  });
});
