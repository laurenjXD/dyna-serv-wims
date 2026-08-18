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
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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
    desktopOpen,
  }: {
    tier: string;
    context: unknown;
    currentPath: string;
    desktopOpen?: boolean;
  }) => (
    <nav
      data-testid="shell-navigation"
      data-tier={tier}
      data-current-path={currentPath}
      data-desktop-open={String(desktopOpen)}
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

// Mock the Server Actions module ShellChrome calls for identity/session
// controls. A default resolved value is supplied so every pre-existing test
// in this file (none of which assert on displayName/email/sign-out) keeps
// working unchanged; tests below override the resolved value per-case with
// `mockResolvedValueOnce` and assert on `signOutAction` invocation directly.
//
// `signOutAction` does not exist yet in app/(authenticated)/actions.ts as of
// this RED step (2026-08-16) -- tasks.md §5 "Implement account controls with
// safe display (displayName, email, Organization scope) and Sign Out action"
// is unchecked. Traceability: requirements.md R5.1 ("The shell SHALL provide
// an account control with safe display information (display name, email,
// active Organization scope) from the resolved session") and design.md §4's
// shell composition tree ("AppHeader ... AccountControl (displayName, email,
// Organization scope, Sign Out)").
// `resolveShellNotifications` does not exist yet in
// app/(authenticated)/actions.ts as of this RED step (2026-08-16) --
// specs/14-notifications-and-alerts's P1 MVP slice (see
// specs/00-steering/revision-log.md "`14` -- P1 MVP slice scoped" entry)
// adds a real bell UI to the shared shell header, reading the real
// `notifications` table via a Server Action the client component calls --
// the same "Server Action the client component calls" pattern
// `resolveShellUserDisplay` already establishes for identity data. Default
// resolved value is the realistic empty state this slice ships with (no
// event producers wired yet): zero unread, empty list.
vi.mock("@/app/(authenticated)/actions", () => ({
  resolveShellUserDisplay: vi.fn().mockResolvedValue({
    displayName: null,
    email: null,
    activeRoleKeys: [],
    organizationScope: null,
  }),
  signOutAction: vi.fn().mockResolvedValue(undefined),
  resolveShellNotifications: vi.fn().mockResolvedValue({
    unreadCount: 0,
    notifications: [],
  }),
}));

// Mock lib/actions/notifications -- markNotificationReadAction is the
// already-tested (lib/actions/__tests__/notifications.test.ts) RLS-enforced
// write ShellChrome's notification panel wires a click to (fix 4 of the
// rbac-rls-reviewer follow-up pass). Here we only assert ShellChrome calls
// it and updates local state optimistically; the write's own
// authorization/mechanism is covered at the action's own test layer.
vi.mock("@/lib/actions/notifications", () => ({
  markNotificationReadAction: vi.fn().mockResolvedValue({ ok: true }),
}));

import {
  resolveShellUserDisplay,
  resolveShellNotifications,
} from "@/app/(authenticated)/actions";
import { markNotificationReadAction } from "@/lib/actions/notifications";
// `signOutAction` does not exist on the real module yet (RED step) -- imported
// via a namespace import + index access rather than a named import so this
// file type-checks today without a `@ts-expect-error` pragma that would go
// stale the moment the builder adds the real export.
import * as shellActions from "@/app/(authenticated)/actions";
import { ShellChrome } from "@/components/global/ShellChrome";

// -----------------------------------------------------------------------
// RED TESTS: connectivity indicator (design.md §4 AppHeader ->
// ConnectivityIndicator; requirements.md R8.1 "the shell MAY display an
// informational online/offline indicator" and R8.2 "distinguish
// connectivity (online, offline, checking) from synchronization ... and
// SHALL not claim that data is synchronized without authoritative
// evidence"; tasks.md §5 "Implement read-only connectivity indicator
// (online, offline, checking) ... via `03` contract.")
//
// Scope note (task-owner decision, this RED cycle): only connectivity is
// covered here, not synchronization -- lib/offline/index.ts is still a bare
// placeholder with no real Tier 1 sync queue to report on (see
// lib/shell/__tests__/use-connectivity.test.ts for the same scope note).
//
// lib/shell/use-connectivity.ts does not exist yet as of this RED step;
// this file mocks its expected export (`useConnectivityStatus`) so the
// component test controls online/offline deterministically without relying
// on real browser events (those are covered at the hook-unit-test layer).
// -----------------------------------------------------------------------

vi.mock("@/lib/shell/use-connectivity", () => ({
  useConnectivityStatus: vi.fn(() => "online" as const),
}));

import { useConnectivityStatus } from "@/lib/shell/use-connectivity";

describe("ShellChrome connectivity indicator (design.md §4 ConnectivityIndicator, requirements.md R8.1/R8.2)", () => {
  it("renders a connectivity indicator in the header when the connection is online (R8.1/R8.2)", () => {
    vi.mocked(useConnectivityStatus).mockReturnValue("online");

    render(
      <ShellChrome>
        <div>page</div>
      </ShellChrome>,
    );

    // EXPECTED FAILURE (RED): ShellChrome does not import/render
    // useConnectivityStatus or any connectivity indicator today.
    const indicator = screen.getByTestId("connectivity-indicator");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveTextContent(/online/i);
  });

  it("renders a connectivity indicator in the header when the connection is offline, with text distinguishable from the online state (R7.7 no-color-alone, R8.2)", () => {
    vi.mocked(useConnectivityStatus).mockReturnValue("offline");

    render(
      <ShellChrome>
        <div>page</div>
      </ShellChrome>,
    );

    // EXPECTED FAILURE (RED): same as above -- no indicator exists yet.
    const indicator = screen.getByTestId("connectivity-indicator");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveTextContent(/offline/i);
  });

  it("never renders the word 'synchronized' or 'synced' from the connectivity indicator alone (R8.2 -- connectivity is not evidence of sync)", () => {
    vi.mocked(useConnectivityStatus).mockReturnValue("online");

    render(
      <ShellChrome>
        <div>page</div>
      </ShellChrome>,
    );

    // EXPECTED FAILURE (RED): getByTestId throws first, since the indicator
    // does not exist yet -- once it does, this guards against R8.2's
    // "SHALL not claim that data is synchronized without authoritative
    // evidence" by ensuring the connectivity-only indicator never borrows
    // sync vocabulary.
    const indicator = screen.getByTestId("connectivity-indicator");
    expect(indicator.textContent?.toLowerCase()).not.toMatch(/sync/);
  });

  // -------------------------------------------------------------------------
  // RED TEST (NEW, 2026-08-16 header-decrowding follow-up): offline color
  // token change. design-system-auditor pass flagged the desktop header row
  // as overcrowded and separately flagged that the offline connectivity
  // state reused `status-held`/error red — the same visual severity as a
  // system failure — for a condition (device offline) that isn't one.
  // Decision (task-owner, already made, not relitigated here): the offline
  // icon SHALL use the `warning` token (`#F59E0B`), not `status-held`
  // (`#EF4444`) or any other error-red class.
  //
  // Traceability: requirements.md R7.7 ("Status, active, error, and
  // connectivity states SHALL NOT rely on color alone; iconography and
  // clear wording are required") — this test guards the specific color
  // token used for the icon named by that iconography, and R8.2
  // (connectivity is informational, not a failure/sync claim).
  // -------------------------------------------------------------------------
  it(
    "uses the warning color token (not status-held/error red) for the offline connectivity icon (R7.7 — offline is not a system failure)",
    () => {
      vi.mocked(useConnectivityStatus).mockReturnValue("offline");

      const { container } = render(
        <ShellChrome>
          <div>page</div>
        </ShellChrome>,
      );

      const indicator = screen.getByTestId("connectivity-indicator");

      // EXPECTED FAILURE (RED): current implementation renders the offline
      // WifiOff icon with `text-status-held` (error red), not `text-warning`.
      const warningIcon = indicator.querySelector(".text-warning");
      expect(warningIcon).not.toBeNull();

      // Regression guard: no descendant of the connectivity indicator should
      // carry the error/held-severity token while offline.
      expect(indicator.querySelector(".text-status-held")).toBeNull();
      expect(container.querySelectorAll(".text-status-held")).toHaveLength(0);
    },
  );
});

// -----------------------------------------------------------------------
// RED TESTS (NEW, 2026-08-16 header-decrowding follow-up): compact mobile
// connectivity indicator. design-system-auditor pass found the `lg:hidden`
// mobile header block (logo + "Dyna-Serv WIMS" title only) gives floor/
// handheld users (375-430px) no connectivity information at all, since the
// full indicator only renders in the `hidden ... lg:flex` desktop region.
// Decision (task-owner, already made): add a compact icon-only indicator to
// the mobile header row with an `aria-label` distinguishing online/offline
// (no visible text needed at that size).
//
// Traceability: requirements.md R7.1 ("Floor styles SHALL be mobile-first,
// target 375-430px portrait viewports..."), R8.1 ("the shell MAY display an
// informational online/offline indicator"), R7.7 (no color alone —
// aria-label plus distinct icon, not color alone, distinguishes state).
// -----------------------------------------------------------------------
describe(
  "ShellChrome mobile connectivity indicator (design-system-auditor follow-up, requirements.md R7.1/R8.1)",
  () => {
    it("renders a compact icon-only connectivity indicator in the mobile header when online (R7.1/R8.1)", () => {
      vi.mocked(useConnectivityStatus).mockReturnValue("online");

      render(
        <ShellChrome>
          <div>page</div>
        </ShellChrome>,
      );

      // EXPECTED FAILURE (RED): no element with this testid exists yet — the
      // `lg:hidden` mobile header block currently only renders the logo and
      // "Dyna-Serv WIMS" title.
      const mobileIndicator = screen.getByTestId(
        "connectivity-indicator-mobile",
      );
      expect(mobileIndicator).toBeInTheDocument();
      expect(mobileIndicator).toHaveAccessibleName(/online/i);
    });

    it("renders a compact icon-only connectivity indicator in the mobile header when offline, with a distinguishing aria-label (R7.1/R7.7/R8.1)", () => {
      vi.mocked(useConnectivityStatus).mockReturnValue("offline");

      render(
        <ShellChrome>
          <div>page</div>
        </ShellChrome>,
      );

      // EXPECTED FAILURE (RED): same as above — element does not exist yet.
      const mobileIndicator = screen.getByTestId(
        "connectivity-indicator-mobile",
      );
      expect(mobileIndicator).toBeInTheDocument();
      expect(mobileIndicator).toHaveAccessibleName(/offline/i);
    });
  },
);

const signOutAction = (
  shellActions as unknown as { signOutAction: ReturnType<typeof vi.fn> }
).signOutAction;

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

// -----------------------------------------------------------------------
// RED TESTS: account controls (design.md §4 AppHeader -> AccountControl;
// requirements.md R5.1 "The shell SHALL provide an account control with
// safe display information (display name, email, active Organization
// scope) from the resolved session."; tasks.md §5 "Implement account
// controls with safe display (displayName, email, Organization scope) and
// Sign Out action.")
//
// ShellChrome's header today (`components/global/ShellChrome.tsx`) resolves
// `resolveShellUserDisplay()` and renders only initials from `displayName`
// inside a Link to /profile -- it does not render the account holder's
// email, and no Sign Out control exists anywhere in the shell (confirmed:
// zero "signOut"/"sign-out" occurrences in lib/auth, lib/supabase, or any
// component as of this RED step). These tests target the account-controls
// area inside the desktop header (the `lg:flex` region containing the
// Settings/Profile links), consistent with design.md §4 placing
// `AccountControl` inside `AppHeader`, not inside `DesktopSidebar`.
//
// Scope note: this RED cycle covers only the email display and Sign Out
// action per the task instruction for this cycle. "Organization scope"
// display (the third element R5.1 names) is a separate, not-yet-covered
// gap and is deliberately left out of this test's assertions -- flagging
// it here rather than silently broadening scope.
//
// *** MODIFIED 2026-08-16 (header-decrowding follow-up) ***
// A design-system-auditor pass found the desktop header row overcrowded at
// the `lg` breakpoint (email + Organization scope + Sign Out + connectivity
// + Settings + avatar all in one row). Decision (task-owner, already made,
// not relitigated here): email, Organization scope, and Sign Out move OUT
// of the persistent header row and INTO a popup/disclosure triggered by the
// avatar button (`data-testid="account-menu-trigger"`), which opens a plain
// labeled popup container (`data-testid="account-popup"`) -- not a
// `role="menu"`/`menuitem` widget. Per WAI-ARIA Authoring Practices,
// `menu`/`menuitem` implies application-menu semantics (arrow-key roving
// focus, typeahead, Home/End navigation) that a simple account popup with a
// link and a button does not implement; using it here would be an ARIA
// anti-pattern. The popup instead uses `aria-labelledby` pointing at the
// trigger, and the trigger uses `aria-haspopup="dialog"` (accurate for a
// popup panel with mixed content/actions) plus `aria-expanded`. The Profile
// link and Sign Out button keep their natural implicit roles (`link`,
// `button`) with no explicit role override. The tests below are UPDATED
// (not merely added to) to reflect this: they now assert these elements are
// absent by default and only appear after the trigger is activated -- the
// old always-visible assertions are no longer the correct contract.
// -----------------------------------------------------------------------

describe("ShellChrome account controls (design.md §4 AccountControl, requirements.md R5.1)", () => {
  it(
    "does not render email, Organization scope, or Sign Out in the persistent header row by default " +
      "(header-decrowding: these now live inside the account dropdown, closed by default)",
    async () => {
      vi.mocked(resolveShellUserDisplay).mockResolvedValueOnce({
        displayName: "Jane Doe",
        email: "jane@example.com",
        activeRoleKeys: ["warehouse_staff"],
        organizationScope: "Acme Trading Co.",
      } as never);

      render(
        <ShellChrome>
          <div>page</div>
        </ShellChrome>,
      );

      // Wait for the async resolveShellUserDisplay() effect to settle via
      // the account-menu trigger (always present), then assert the
      // formerly-inline fields are not in the document until the dropdown
      // is opened.
      //
      // EXPECTED FAILURE (RED): today ShellChrome has no dropdown at all --
      // this trigger testid does not exist, so `findByTestId` throws.
      await screen.findByTestId("account-menu-trigger");

      expect(screen.queryByText("jane@example.com")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Acme Trading Co."),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /sign out/i }),
      ).not.toBeInTheDocument();
    },
  );

  it("renders the resolved session's email inside the account dropdown once opened (R5.1)", async () => {
    vi.mocked(resolveShellUserDisplay).mockResolvedValueOnce({
      displayName: "Jane Doe",
      email: "jane@example.com",
      activeRoleKeys: ["warehouse_staff"],
      organizationScope: null,
    });
    const user = userEvent.setup();

    render(
      <ShellChrome>
        <div>page</div>
      </ShellChrome>,
    );

    // EXPECTED FAILURE (RED): ShellChrome does not render an
    // "account-menu-trigger" element today -- the avatar is a plain Link to
    // /profile, not a dropdown trigger.
    const trigger = await screen.findByTestId("account-menu-trigger");
    await user.click(trigger);

    const popup = await screen.findByTestId("account-popup");
    expect(within(popup).getByText("jane@example.com")).toBeInTheDocument();
  });

  it("renders a Sign Out control inside the account dropdown once opened (design.md §4 AccountControl)", async () => {
    vi.mocked(resolveShellUserDisplay).mockResolvedValueOnce({
      displayName: "Jane Doe",
      email: "jane@example.com",
      activeRoleKeys: ["warehouse_staff"],
      organizationScope: null,
    });
    const user = userEvent.setup();

    render(
      <ShellChrome>
        <div>page</div>
      </ShellChrome>,
    );

    // EXPECTED FAILURE (RED): no account-menu trigger exists to open, and no
    // Sign Out button/link exists anywhere in ShellChrome today.
    const trigger = await screen.findByTestId("account-menu-trigger");
    await user.click(trigger);

    const popup = await screen.findByTestId("account-popup");
    const signOutControl = within(popup).getByRole("button", {
      name: /sign out/i,
    });
    expect(signOutControl).toBeInTheDocument();
  });

  it("invokes signOutAction when the Sign Out control inside the account dropdown is activated (R5.1)", async () => {
    vi.mocked(resolveShellUserDisplay).mockResolvedValueOnce({
      displayName: "Jane Doe",
      email: "jane@example.com",
      activeRoleKeys: ["warehouse_staff"],
      organizationScope: null,
    });
    const user = userEvent.setup();

    render(
      <ShellChrome>
        <div>page</div>
      </ShellChrome>,
    );

    // EXPECTED FAILURE (RED): findByTestId throws first, since no dropdown
    // trigger exists yet -- proving the Sign Out control (and signOutAction
    // wiring) is unreachable via the new account-dropdown contract.
    const trigger = await screen.findByTestId("account-menu-trigger");
    await user.click(trigger);

    const popup = await screen.findByTestId("account-popup");
    const signOutControl = within(popup).getByRole("button", {
      name: /sign out/i,
    });
    await user.click(signOutControl);

    expect(signOutAction).toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------
// RED TESTS: Organization scope display (design.md §4 AppHeader ->
// AccountControl; requirements.md R2.1 "...active Organization scope...";
// tasks.md §5 "Implement account controls with safe display (displayName,
// email, Organization scope) and Sign Out action.")
//
// Follow-up to the "Scope note" above: email and Sign Out are now
// implemented/covered; Organization scope was the deliberately-deferred
// third field and is covered here.
//
// Design decision (task-owner, this RED step): most internal staff
// (scopeKind: "global", empty partyScopes) have no single organization to
// display -- for them `organizationScope` resolves to `null` and NO
// organization-scope text should render (not "None"/"Global" clutter).
// Organization Portal users (assigned_party scope) have one or more
// partyScopes entries, resolved server-side (app/(authenticated)/actions.ts)
// to a party name string -- ShellChrome only needs to render whatever
// non-null string `resolveShellUserDisplay()` resolves.
// -----------------------------------------------------------------------

// *** MODIFIED 2026-08-16 (header-decrowding follow-up) *** — same dropdown
// relocation as the account-controls describe block above: Organization
// scope now renders inside the account dropdown (opened via
// `account-menu-trigger`), not inline in the persistent header row.
describe("ShellChrome account controls — Organization scope (design.md §4 AccountControl, requirements.md R2.1)", () => {
  it("renders the resolved session's Organization scope inside the account dropdown once opened (R2.1)", async () => {
    vi.mocked(resolveShellUserDisplay).mockResolvedValueOnce({
      displayName: "Portal User",
      email: "portal@example.com",
      activeRoleKeys: ["portal_user"],
      organizationScope: "Acme Trading Co.",
    } as never);
    const user = userEvent.setup();

    render(
      <ShellChrome>
        <div>page</div>
      </ShellChrome>,
    );

    // EXPECTED FAILURE (RED): no account-menu trigger exists to open, and
    // ShellChrome does not render organizationScope anywhere today.
    const trigger = await screen.findByTestId("account-menu-trigger");
    await user.click(trigger);

    const popup = await screen.findByTestId("account-popup");
    expect(within(popup).getByText("Acme Trading Co.")).toBeInTheDocument();
  });

  it(
    "renders no organization-scope text inside the opened account dropdown when the resolved session has no " +
      "Organization scope (global-scoped internal staff — regression guard, R2.1 task-owner design decision)",
    async () => {
      vi.mocked(resolveShellUserDisplay).mockResolvedValueOnce({
        displayName: "Jane Doe",
        email: "jane@example.com",
        activeRoleKeys: ["warehouse_staff"],
        organizationScope: null,
      } as never);
      const user = userEvent.setup();

      render(
        <ShellChrome>
          <div>page</div>
        </ShellChrome>,
      );

      // EXPECTED FAILURE (RED): no account-menu trigger exists yet to open.
      const trigger = await screen.findByTestId("account-menu-trigger");
      await user.click(trigger);

      // Wait for the dropdown to settle by asserting on the email text
      // (already covered above), then assert no stray organization-scope
      // node was rendered alongside it inside the popup.
      const popup = await screen.findByTestId("account-popup");
      expect(
        within(popup).getByText("jane@example.com"),
      ).toBeInTheDocument();
      expect(
        within(popup).queryByTestId("account-organization-scope"),
      ).not.toBeInTheDocument();
    },
  );
});

// -----------------------------------------------------------------------
// RED TESTS: notifications bell (specs/14-notifications-and-alerts P1 MVP
// slice; requirements.md R3.1 "Authorized users SHALL have an in-app
// notification center with unread count, category/severity filters,
// timestamps, read state, and safe navigation links.")
//
// specs/00-steering/revision-log.md "`14` -- P1 MVP slice scoped" entry:
// this slice builds only the `notifications` table, list/unread-count/
// mark-read queries and actions, and a real bell UI in the shared shell
// header reading that table -- no event producers are wired yet, so the
// realistic default state is zero unread / empty list, not a mock full of
// fake data.
//
// Mount point / responsive contract (task-owner decision, this RED cycle):
// same "full version desktop, compact version mobile" pattern already
// established for the connectivity indicator this session, but unlike that
// indicator (distinct `connectivity-indicator` / `connectivity-indicator-
// mobile` testids), the bell uses ONE shared `data-testid="notification-
// bell"` for both the desktop (`lg:flex`) and mobile (`lg:hidden`) header
// trigger elements -- two real DOM elements, not one conditionally
// rendered/hidden element, so `getAllByTestId` is used to assert on both.
//
// Popup contract: same corrected non-`role="menu"` ARIA pattern as the
// account popup (`data-testid="account-popup"`, `aria-haspopup="dialog"`,
// `aria-expanded`) -- `data-testid="notification-panel"`, NOT
// `role="menu"`/`menuitem": a notification list is not an application menu
// (no roving focus/typeahead semantics), matching the account-popup ARIA
// correction recorded above in this same file.
//
// ShellChrome.tsx does not import/render any bell, badge, or notification
// panel today -- every test below is EXPECTED TO FAIL because the relevant
// data-testid/element does not exist in the current implementation.
// -----------------------------------------------------------------------

describe("ShellChrome notification bell (specs/14-notifications-and-alerts R3.1, P1 MVP slice)", () => {
  it(
    "renders a notification bell trigger in BOTH the desktop and mobile header regions (R3.1 -- shell-wide in-app notification center entry point)",
    async () => {
      render(
        <ShellChrome>
          <div>page</div>
        </ShellChrome>,
      );

      // EXPECTED FAILURE (RED): ShellChrome renders no element with this
      // testid at all today -- getAllByTestId throws ("Unable to find an
      // element by: [data-testid=\"notification-bell\"]").
      const bells = await screen.findAllByTestId("notification-bell");
      expect(bells.length).toBeGreaterThanOrEqual(2);
    },
  );

  it(
    "shows the resolved unread count as a badge on the notification bell when unread > 0 (R3.1 unread count)",
    async () => {
      vi.mocked(resolveShellNotifications).mockResolvedValueOnce({
        unreadCount: 4,
        notifications: [],
      });

      render(
        <ShellChrome>
          <div>page</div>
        </ShellChrome>,
      );

      // EXPECTED FAILURE (RED): no bell, and therefore no badge, exists yet.
      const badges = await screen.findAllByTestId("notification-badge");
      expect(badges.length).toBeGreaterThan(0);
      expect(badges[0]).toHaveTextContent("4");
    },
  );

  it(
    "hides the unread badge entirely when the unread count is 0 -- no badge showing literal \"0\" (R3.1, R7.7 no stray always-on cue)",
    async () => {
      vi.mocked(resolveShellNotifications).mockResolvedValueOnce({
        unreadCount: 0,
        notifications: [],
      });

      render(
        <ShellChrome>
          <div>page</div>
        </ShellChrome>,
      );

      // EXPECTED FAILURE (RED): findByTestId("notification-bell") throws
      // first, since no bell exists yet to anchor this assertion against.
      await screen.findAllByTestId("notification-bell");

      expect(screen.queryByTestId("notification-badge")).not.toBeInTheDocument();
    },
  );

  it(
    "opens a notification panel listing recent notification titles when a bell trigger is clicked (R3.1 in-app notification center)",
    async () => {
      vi.mocked(resolveShellNotifications).mockResolvedValueOnce({
        unreadCount: 2,
        notifications: [
          {
            id: "notif-1",
            title: "Approval request pending your review",
            createdAt: "2026-08-16T09:00:00Z",
          },
          {
            id: "notif-2",
            title: "Receiving discrepancy on WRR-0042",
            createdAt: "2026-08-16T08:30:00Z",
          },
        ],
      });
      const user = userEvent.setup();

      render(
        <ShellChrome>
          <div>page</div>
        </ShellChrome>,
      );

      // EXPECTED FAILURE (RED): no notification-bell trigger exists yet to
      // click.
      const [bell] = await screen.findAllByTestId("notification-bell");
      await user.click(bell);

      const panel = await screen.findByTestId("notification-panel");
      expect(
        within(panel).getByText("Approval request pending your review"),
      ).toBeInTheDocument();
      expect(
        within(panel).getByText("Receiving discrepancy on WRR-0042"),
      ).toBeInTheDocument();
    },
  );

  it(
    "does not use role=\"menu\"/menuitem for the notification panel -- a plain labeled popup, matching the account-popup ARIA correction (WAI-ARIA anti-pattern guard)",
    async () => {
      vi.mocked(resolveShellNotifications).mockResolvedValueOnce({
        unreadCount: 0,
        notifications: [],
      });
      const user = userEvent.setup();

      render(
        <ShellChrome>
          <div>page</div>
        </ShellChrome>,
      );

      // EXPECTED FAILURE (RED): no notification-bell trigger exists yet to
      // click.
      const [bell] = await screen.findAllByTestId("notification-bell");
      await user.click(bell);

      const panel = await screen.findByTestId("notification-panel");
      expect(panel).not.toHaveAttribute("role", "menu");
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    },
  );

  it(
    "renders an empty-state message inside the notification panel when there are no notifications (realistic default state -- no producers wired yet)",
    async () => {
      vi.mocked(resolveShellNotifications).mockResolvedValueOnce({
        unreadCount: 0,
        notifications: [],
      });
      const user = userEvent.setup();

      render(
        <ShellChrome>
          <div>page</div>
        </ShellChrome>,
      );

      // EXPECTED FAILURE (RED): no notification-bell trigger exists yet to
      // click.
      const [bell] = await screen.findAllByTestId("notification-bell");
      await user.click(bell);

      const panel = await screen.findByTestId("notification-panel");
      expect(within(panel).getByText(/no notifications/i)).toBeInTheDocument();
    },
  );

  // -------------------------------------------------------------------------
  // Regression guard (rbac-rls-reviewer follow-up, fix 4): clicking a
  // notification list item calls the already-real, already-RLS-tested
  // markNotificationReadAction and optimistically reflects the read state
  // locally (unread count decrements, item is visually de-emphasized)
  // without requiring a refetch of the whole list.
  // -------------------------------------------------------------------------
  it(
    "calls markNotificationReadAction and optimistically decrements the unread badge when a notification list item is clicked (R3.1 read state wiring)",
    async () => {
      vi.mocked(resolveShellNotifications).mockResolvedValueOnce({
        unreadCount: 2,
        notifications: [
          {
            id: "notif-1",
            title: "Approval request pending your review",
            createdAt: "2026-08-16T09:00:00Z",
            readAt: null,
          },
          {
            id: "notif-2",
            title: "Receiving discrepancy on WRR-0042",
            createdAt: "2026-08-16T08:30:00Z",
            readAt: null,
          },
        ],
      });
      const user = userEvent.setup();

      render(
        <ShellChrome>
          <div>page</div>
        </ShellChrome>,
      );

      const [bell] = await screen.findAllByTestId("notification-bell");
      await user.click(bell);

      const panel = await screen.findByTestId("notification-panel");
      const item = within(panel).getByText(
        "Approval request pending your review",
      );
      await user.click(item);

      expect(markNotificationReadAction).toHaveBeenCalledWith("notif-1");

      const badges = await screen.findAllByTestId("notification-badge");
      expect(badges[0]).toHaveTextContent("1");
    },
  );
});

// -----------------------------------------------------------------------
// RED TEST (tasks.md §4 / requirements.md R4.1, R5.5): real letter-mark
// logo asset in the mobile header, replacing the placeholder "DS" text
// badge.
//
// requirements.md R4.1 ("...real letter-mark logo asset (no diagonal-cut
// motif)."), tasks.md §4 ("...real letter-mark logo asset (no diagonal
// cut)."). A real logo file now exists at `public/logo.svg` (confirmed
// present, an actual SVG). Today ShellChrome.tsx's `lg:hidden` mobile
// header block (lines 196-201) renders a text `<span aria-hidden="true">
// DS</span>` initials badge as a placeholder, not a real asset. This RED
// test targets that block: it must render a real <img> element referencing
// the real asset, AND the literal placeholder text "DS" must no longer be
// present anywhere in the rendered header.
// -----------------------------------------------------------------------
describe("ShellChrome mobile header logo (requirements.md R4.1, tasks.md §4 real letter-mark logo asset)", () => {
  it("renders a real <img> logo asset referencing /logo.svg in the mobile header, not the placeholder 'DS' text badge (R4.1)", () => {
    render(
      <ShellChrome>
        <div>page</div>
      </ShellChrome>,
    );

    // EXPECTED FAILURE (RED): ShellChrome currently renders only a text
    // <span aria-hidden="true">DS</span> placeholder badge here -- no <img>
    // element exists at all today, so this query finds nothing.
    const logo = screen.getByRole("img", { name: /dyna-serv wims/i });
    expect(logo).toBeInTheDocument();
    expect(logo.tagName).toBe("IMG");
    expect(logo).toHaveAttribute("src", expect.stringContaining("/logo.svg"));
  });

  it("does not render the literal placeholder text 'DS' anywhere once the real logo asset is in place (R4.1 no diagonal-cut/placeholder motif)", () => {
    render(
      <ShellChrome>
        <div>page</div>
      </ShellChrome>,
    );

    // EXPECTED FAILURE (RED): the current implementation still renders the
    // "DS" text node inside the aria-hidden placeholder badge -- this
    // assertion fails until that placeholder is replaced by the real image.
    expect(screen.queryByText("DS")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2026-08-17: desktop (lg+) sidebar collapse/expand toggle. Distinct from
// the pre-existing mobile hamburger button above (that one only ever
// applies below lg, via useShellSidebar's isOpen/toggle/close). This is a
// new, separate piece of state (useDesktopSidebar, lib/shell/state.ts),
// defaulting open so existing behavior (desktop sidebar always visible) is
// unchanged until a user actually collapses it. See revision-log.md.
// ---------------------------------------------------------------------------

describe("ShellChrome desktop sidebar toggle (2026-08-17)", () => {
  it("renders a desktop navigation toggle button, expanded by default", () => {
    render(
      <ShellChrome>
        <div>page</div>
      </ShellChrome>,
    );
    const toggle = screen.getByRole("button", { name: /collapse navigation/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("ShellNavigation receives desktopOpen: true by default", () => {
    render(
      <ShellChrome>
        <div>page</div>
      </ShellChrome>,
    );
    expect(screen.getByTestId("shell-navigation")).toHaveAttribute(
      "data-desktop-open",
      "true",
    );
  });

  it("clicking the toggle collapses the sidebar: aria-expanded flips, label swaps to 'Expand navigation', and ShellNavigation receives desktopOpen: false", async () => {
    const user = userEvent.setup();
    render(
      <ShellChrome>
        <div>page</div>
      </ShellChrome>,
    );
    const toggle = screen.getByRole("button", { name: /collapse navigation/i });
    await user.click(toggle);

    const collapsedToggle = screen.getByRole("button", { name: /expand navigation/i });
    expect(collapsedToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByTestId("shell-navigation")).toHaveAttribute(
      "data-desktop-open",
      "false",
    );
  });

  it("clicking the toggle twice returns to the expanded state", async () => {
    const user = userEvent.setup();
    render(
      <ShellChrome>
        <div>page</div>
      </ShellChrome>,
    );
    const toggle = screen.getByRole("button", { name: /collapse navigation/i });
    await user.click(toggle);
    await user.click(screen.getByRole("button", { name: /expand navigation/i }));

    const reopenedToggle = screen.getByRole("button", { name: /collapse navigation/i });
    expect(reopenedToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("shell-navigation")).toHaveAttribute(
      "data-desktop-open",
      "true",
    );
  });
});
