// @vitest-environment jsdom
//
// RED-step test for `components/global/ShellChrome.tsx`, targeting the full
// spec requirements for the authenticated shell layout compositor.
//
// *** TDD GAP NOTICE ***
// ShellChrome.tsx already exists with a partial implementation — it renders
// ShellNavigation + <main> but is MISSING the AppHeader, logo,
// ConnectivityIndicator, AccountControl, and StatusRegion components required
// by design.md §4's shell composition tree. The implementation was written
// before this RED test, which is a TDD gap. This is flagged to the task
// owner; the builder agent must not treat the existing partial implementation
// as complete.
//
// Tests that will FAIL (properly RED — unimplemented spec requirements):
//   - "renders a <header> landmark" — no <header> exists in ShellChrome
//   - "renders a mobile navigation toggle button" — no toggle exists
//
// Tests that may PASS (already-implemented behavior, included to anchor
// the baseline and guard against regression):
//   - "renders children inside the <main> content area"
//   - "mounts ShellNavigation alongside the main content"
//
// Traceability:
// - design.md §4 (shell composition tree: AppHeader, DesktopSidebar,
//   MobileFloorNavigation, MainContent slot, StatusRegion)
// - requirements.md R5.1 ("Authenticated feature routes SHALL render inside a
//   shared shell layout unless the approved design explicitly declares a
//   standalone surface")
// - requirements.md R5.5 ("The shell SHALL provide stable landmarks for
//   header, navigation, main content, and status/feedback regions")
// - requirements.md R4.1 ("Office screens SHALL provide the approved desktop
//   sidebar or equivalent navigation surface")
// - requirements.md R4.2 ("Floor screens SHALL not reserve persistent desktop
//   sidebar space by default")
// - design.md §6 ("At narrow mobile widths the sidebar collapses to a
//   hamburger/drawer")
// - tasks.md §7 deferred item (2026-08-08): "build the surrounding
//   AppHeader/logo/connectivity-indicator/account-control/status-region
//   composition design.md §4's shell tree requires"

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next/navigation — usePathname is only available in a Next.js render
// context; jsdom never has it. Return a stable path so ShellNavigation's
// active-route logic is deterministic.
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// Mock ShellNavigation — its rendering is covered in depth by
// ShellNavigation.test.tsx. Here we only verify that ShellChrome mounts a
// navigation region with the resolved tier and path props.
vi.mock("@/components/global/ShellNavigation", () => ({
  ShellNavigation: ({
    tier,
    currentPath,
  }: {
    tier: string;
    context: unknown;
    currentPath: string;
  }) => (
    <nav
      data-testid="shell-navigation"
      data-tier={tier}
      data-current-path={currentPath}
    />
  ),
}));

// Mock lib/shell/surface — resolveSessionPresentationTier is pure logic
// already tested in lib/shell/__tests__/; here we pin the surface to "office"
// so all tests use a stable tier without needing role-array fixtures.
vi.mock("@/lib/shell/surface", () => ({
  resolveSessionPresentationTier: (_roleKeys: string[]) => "office" as const,
}));

// Mock AuthenticatedShellBoundary — ShellChrome calls useShellAuthorizationContext
// to obtain the resolved grants/role set without re-triggering the resolver.
// The mock provides a minimal authorized context; the full boundary contract is
// covered by AuthenticatedShellBoundary.test.tsx.
vi.mock("@/components/global/AuthenticatedShellBoundary", () => ({
  useShellAuthorizationContext: () => ({
    userId: "user-1",
    profileStatus: "active" as const,
    activeRoleKeys: ["warehouse_staff"],
    grants: [{ resource: "receiving", action: "view", scopeKind: "global" }],
    partyScopes: [],
  }),
}));

import { ShellChrome } from "@/components/global/ShellChrome";

describe("ShellChrome (design.md §4, requirements.md R5.1/R5.5)", () => {
  // -------------------------------------------------------------------------
  // PASSING BASELINE (already implemented)
  // -------------------------------------------------------------------------

  it("renders children inside a semantic <main> content landmark (R5.1/R5.5)", () => {
    render(
      <ShellChrome>
        <div data-testid="page-content">page content</div>
      </ShellChrome>,
    );

    const main = screen.getByRole("main");
    expect(main).toBeInTheDocument();
    expect(main).toContainElement(screen.getByTestId("page-content"));
  });

  it("mounts a ShellNavigation region alongside the main content area (design.md §4)", () => {
    render(
      <ShellChrome>
        <div>page</div>
      </ShellChrome>,
    );

    // ShellNavigation is mocked above; its presence confirms ShellChrome
    // renders the navigation region regardless of the exact nav variant.
    expect(screen.getByTestId("shell-navigation")).toBeInTheDocument();
  });

  it("passes the resolved surface tier to ShellNavigation (design.md §3.3 surface routing rules)", () => {
    render(
      <ShellChrome>
        <div>page</div>
      </ShellChrome>,
    );

    // resolveSessionPresentationTier is mocked to return "office"; ShellChrome
    // must propagate that to ShellNavigation — not hard-code a tier string.
    const nav = screen.getByTestId("shell-navigation");
    expect(nav).toHaveAttribute("data-tier", "office");
  });

  it("passes the current pathname to ShellNavigation for active-route matching (R3.6)", () => {
    render(
      <ShellChrome>
        <div>page</div>
      </ShellChrome>,
    );

    // usePathname is mocked to return "/"; ShellChrome must forward it to
    // ShellNavigation so active-route matching is live, not fixed.
    const nav = screen.getByTestId("shell-navigation");
    expect(nav).toHaveAttribute("data-current-path", "/");
  });

  // -------------------------------------------------------------------------
  // RED TESTS (spec-required, not yet implemented)
  // design.md §4 defines the full shell composition tree; ShellChrome
  // currently only renders navigation + <main>. Tasks.md (2026-08-08
  // deferred finding) explicitly documents this gap. These tests will fail
  // until the builder adds the full AppHeader/landmark structure.
  // -------------------------------------------------------------------------

  it(
    "renders a <header> landmark for the AppHeader region (design.md §4 / R5.5 — currently missing from implementation)",
    () => {
      render(
        <ShellChrome>
          <div>page</div>
        </ShellChrome>,
      );

      // R5.5: "stable landmarks for header, navigation, main content, and
      // status/feedback regions". design.md §4 requires an AppHeader
      // containing Brand/Logo, PageHeader slot, ConnectivityIndicator, and
      // AccountControl. The <header> / role="banner" landmark is the semantic
      // anchor for that region.
      //
      // EXPECTED FAILURE: ShellChrome currently renders no <header> element.
      expect(screen.getByRole("banner")).toBeInTheDocument();
    },
  );

  it(
    "renders a mobile navigation-open toggle button for narrow viewports (design.md §6 / R4.1 — currently missing from implementation)",
    () => {
      render(
        <ShellChrome>
          <div>page</div>
        </ShellChrome>,
      );

      // design.md §6: "At narrow mobile widths the sidebar collapses to a
      // hamburger/drawer". R4.1: office screens provide the approved desktop
      // sidebar or equivalent. At breakpoints below the sidebar breakpoint
      // the hamburger/drawer-open control is the only way to reach navigation
      // — it must exist in the DOM (CSS can hide it above `lg` but never
      // remove it from the accessibility tree).
      //
      // EXPECTED FAILURE: ShellChrome currently renders no toggle button.
      const toggle = screen.getByRole("button", {
        name: /open navigation|menu|sidebar/i,
      });
      expect(toggle).toBeInTheDocument();
    },
  );

  it(
    "renders a StatusRegion landmark for global shell status announcements (design.md §4 / R5.5 — currently missing from implementation)",
    () => {
      render(
        <ShellChrome>
          <div>page</div>
        </ShellChrome>,
      );

      // design.md §4's composition tree includes a StatusRegion. R5.5 requires
      // a stable "status/feedback region" landmark. design.md §10 specifies
      // polite status announcements for ordinary transitions. The standard
      // HTML role for a live-region status landmark is role="status".
      //
      // EXPECTED FAILURE: ShellChrome currently renders no status region.
      expect(screen.getByRole("status")).toBeInTheDocument();
    },
  );
});
