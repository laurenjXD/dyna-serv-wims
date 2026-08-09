// @vitest-environment jsdom
//
// RED-step test for `components/global/AuthenticatedShellBoundary.tsx`
// (the client-side piece of the authenticated route/layout boundary,
// eventually wired up by `app/(authenticated)/layout.tsx` per design.md
// §3/§4). Does not exist yet.
//
// Traceability:
// - specs/05-ui-shell-and-navigation/design.md §3.4's "Session checking"
//   row ("Render a minimal non-sensitive boundary or loading shell; never
//   render protected content optimistically... Must not flash protected
//   content or claim the user is signed in before server resolution") and
//   "Revoked session" row ("The shell must not render a single byte of
//   protected content after revocation; a brief flash of protected UI
//   while the redirect fires is a failure").
// - specs/05-ui-shell-and-navigation/requirements.md R2.3 ("Expired,
//   revoked, or inactive sessions SHALL not render protected content
//   after the server detects the condition") and R2.4 ("An authenticated
//   user with no active usable capability SHALL receive the approved safe
//   empty-access state rather than an unbounded application shell").
//
// Assumed component contract (RED-step decision — the design specifies
// the *behavior*, not an exact React implementation strategy; a resolver
// whose `getContext()` returns a Promise must be awaited somewhere, and
// this test exercises the "never flash" requirement by controlling that
// promise's resolution timing directly, matching the DI pattern already
// used by lib/rbac/session.ts's own tests):
//   export function AuthenticatedShellBoundary(props: {
//     resolver: RequestAuthorizationResolver;
//     children: ReactNode;
//   }): JSX.Element
//   - A client component. While `resolver.getContext()` is pending, renders
//     only <ShellStateView state={{ kind: "session_checking" }} /> — never
//     `children`.
//   - On "unauthenticated" resolution, renders <ShellStateView
//     state={{ kind: "revoked_session" }} /> — never `children`.
//   - On "authorized" resolution with an empty effective grant set, renders
//     <ShellStateView state={{ kind: "empty_access" }} /> and does NOT
//     render any `nav`-role navigation landmark (R2.4: "must not render
//     the full navigation shell with every item disabled or hidden").
//   - On "authorized" resolution with at least one grant, renders
//     `children` verbatim, tagged `data-testid="protected-content"` by
//     the caller in these tests.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type {
  AuthorizationResolution,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import { AuthenticatedShellBoundary } from "@/components/global/AuthenticatedShellBoundary";

// Mock next/navigation — useRouter is only available in a Next.js render
// context; jsdom never has it. `push` is shared/reset per-test below so
// individual tests can assert on redirect calls (2026-08-08: the
// "revoked_session" state's copy claims a redirect happens; this file's
// tests previously never verified that claim, since nothing actually
// performed one — see the real bug fixed the same day in the component).
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  push.mockClear();
});

function deferredResolver(): {
  resolver: RequestAuthorizationResolver;
  resolve: (value: AuthorizationResolution) => void;
} {
  let resolveFn: (value: AuthorizationResolution) => void = () => {};
  const promise = new Promise<AuthorizationResolution>((resolve) => {
    resolveFn = resolve;
  });
  return {
    resolver: { getContext: () => promise },
    resolve: resolveFn,
  };
}

describe("AuthenticatedShellBoundary (design.md §3.4, requirements.md R2.3/R2.4)", () => {
  it("never renders protected content while the session is resolving (no flash of protected content)", async () => {
    const { resolver, resolve } = deferredResolver();

    render(
      <AuthenticatedShellBoundary resolver={resolver}>
        <div data-testid="protected-content">secret</div>
      </AuthenticatedShellBoundary>,
    );

    // Synchronously, before the resolver promise settles: must show the
    // session-checking state and must NOT show protected content.
    expect(screen.getByTestId("shell-state-session_checking")).toBeInTheDocument();
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();

    resolve({
      kind: "authorized",
      context: {
        userId: "user-1",
        profileStatus: "active",
        activeRoleKeys: ["warehouse_staff"],
        grants: [{ resource: "receiving", action: "view", scopeKind: "global" }],
        partyScopes: [],
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });
  });

  it("never renders protected content when the resolution is unauthenticated", async () => {
    const resolver: RequestAuthorizationResolver = {
      getContext: async () => ({ kind: "unauthenticated" }),
    };

    render(
      <AuthenticatedShellBoundary resolver={resolver}>
        <div data-testid="protected-content">secret</div>
      </AuthenticatedShellBoundary>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("shell-state-revoked_session")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();

    // The displayed copy ("Redirecting you to sign in…") must be true, not
    // just a claim — 2026-08-08: previously nothing actually navigated
    // anywhere and the user was stranded on this message indefinitely.
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/login");
    });
  });

  it("renders the same revoked_session message for forbidden as for unauthenticated, but does NOT redirect (2026-08-08: redirecting forbidden to /login created an infinite loop, since a forbidden session is already validly authenticated — re-login just succeeds again and lands back on forbidden)", async () => {
    const resolver: RequestAuthorizationResolver = {
      getContext: async () => ({ kind: "forbidden", reason: "missing_profile" }),
    };

    render(
      <AuthenticatedShellBoundary resolver={resolver}>
        <div data-testid="protected-content">secret</div>
      </AuthenticatedShellBoundary>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("shell-state-revoked_session")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();

    // Give any (incorrect) redirect effect a tick to fire, then assert it
    // never does — this is the regression test for the loop.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(push).not.toHaveBeenCalled();
  });

  it("renders the empty-access state (not the full nav shell) when authorized but grants is empty (R2.4)", async () => {
    const resolver: RequestAuthorizationResolver = {
      getContext: async () => ({
        kind: "authorized",
        context: {
          userId: "user-1",
          profileStatus: "active",
          activeRoleKeys: [],
          grants: [],
          partyScopes: [],
        },
      }),
    };

    render(
      <AuthenticatedShellBoundary resolver={resolver}>
        <div data-testid="protected-content">secret</div>
      </AuthenticatedShellBoundary>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("shell-state-empty_access")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("protected-content")).not.toBeInTheDocument();
    // R2.4: "must not render the full navigation shell with every item
    // disabled or hidden" — no nav landmark at all in this state.
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("renders children when authorized with at least one grant", async () => {
    const resolver: RequestAuthorizationResolver = {
      getContext: async () => ({
        kind: "authorized",
        context: {
          userId: "user-1",
          profileStatus: "active",
          activeRoleKeys: ["warehouse_staff"],
          grants: [{ resource: "receiving", action: "view", scopeKind: "global" }],
          partyScopes: [],
        },
      }),
    };

    render(
      <AuthenticatedShellBoundary resolver={resolver}>
        <div data-testid="protected-content">secret</div>
      </AuthenticatedShellBoundary>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    });
  });
});
