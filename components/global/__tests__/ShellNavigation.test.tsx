// @vitest-environment jsdom
//
// RED-step test for `components/global/ShellNavigation.tsx`, which does
// not exist yet. Covers: correct nav-entry set from
// `lib/shell/navigation.ts`, active-entry marking via
// `lib/shell/active-route.ts`, and the floor-vs-office presentation split
// from `lib/shell/surface.ts`.
//
// Traceability:
// - specs/05-ui-shell-and-navigation/design.md §4 (shell composition:
//   `DesktopSidebar` and `MobileFloorNavigation` are alternate
//   presentations of the same navigation registry) and §3.3 ("Floor
//   routes... The persistent desktop sidebar is not rendered").
// - specs/05-ui-shell-and-navigation/requirements.md R3.4 (navigation
//   visibility derived from server-provided effective capability
//   context), R3.6 (nested/dynamic-segment active matching), R3.7 (active
//   destination has a non-color signal), R4.1/R4.2 (office sidebar vs. no
//   persistent floor sidebar).
//
// Assumed component contract (RED-step decision):
//   export function ShellNavigation(props: {
//     tier: SessionPresentationTier; // "floor" | "office" | "party"
//     context: Pick<AuthorizationContext, "grants">;
//     currentPath: string;
//   }): JSX.Element
//   - tier === "floor": renders exactly one root marked
//     `data-testid="floor-tab-bar"`, and never renders any element with
//     `data-testid="desktop-sidebar"`.
//   - tier === "office" or "party": renders exactly one root marked
//     `data-testid="desktop-sidebar"`, and never renders
//     `data-testid="floor-tab-bar"`.
//   - Each visible NavigationEntry renders as a link
//     `data-testid={`nav-entry-${entry.id}`}`; the active entry (per
//     lib/shell/active-route.ts#resolveActiveRouteId) carries
//     `aria-current="page"` — a non-color signal per R3.7. Non-active
//     entries do not carry `aria-current`.
//   - `featureStatus: "planned"` entries (registry.ts) never render a
//     live link (design.md §5's registry rule), and entries whose
//     capability the context does not grant are omitted entirely (never
//     disabled-and-visible), per lib/shell/navigation.ts#filterVisibleRoutes.

import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AuthorizationContext } from "@/lib/rbac/session";
import { ShellNavigation } from "@/components/global/ShellNavigation";

const receivingOnlyContext: Pick<AuthorizationContext, "grants"> = {
  grants: [{ resource: "receiving", action: "view", scopeKind: "global" }],
};

const officeContext: Pick<AuthorizationContext, "grants"> = {
  grants: [
    // 2026-08-08: corrected from "inventory.read" -- the "/inventory" route
    // (registry id "inventory") requires "pick_list.read", not "inventory.read".
    // See revision-log.md. 2026-08-09: path restored to "/inventory" after
    // the standalone /pick-lists and /outgoing-ledger routes were merged
    // into inventory/page.tsx.
    { resource: "pick_list", action: "read", scopeKind: "global" },
    { resource: "documents", action: "read", scopeKind: "global" },
  ],
};

describe("ShellNavigation (surface.ts tier -> presentation split)", () => {
  it("renders the floor bottom tab bar, never the desktop sidebar, for tier='floor'", () => {
    render(
      <ShellNavigation
        tier="floor"
        context={receivingOnlyContext}
        currentPath="/receiving"
      />,
    );
    expect(screen.getByTestId("floor-tab-bar")).toBeInTheDocument();
    expect(screen.queryByTestId("desktop-sidebar")).not.toBeInTheDocument();
  });

  it("renders the desktop sidebar, never the floor tab bar, for tier='office'", () => {
    render(
      <ShellNavigation tier="office" context={officeContext} currentPath="/inventory" />,
    );
    expect(screen.getByTestId("desktop-sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("floor-tab-bar")).not.toBeInTheDocument();
  });

  it("keeps the desktop sidebar navigation fixed without an internal scroll region", () => {
    render(
      <ShellNavigation tier="office" context={officeContext} currentPath="/inventory" />,
    );

    const sidebar = screen.getByTestId("desktop-sidebar");
    expect(sidebar).toHaveClass("lg:fixed");
    expect(sidebar.querySelector(".overflow-y-auto")).toBeNull();
  });

  it("renders the desktop sidebar (office composition) for tier='party', per design.md §3.3", () => {
    render(
      <ShellNavigation
        tier="party"
        context={{ grants: [{ resource: "documents", action: "read", scopeKind: "global" }] }}
        currentPath="/portal/documents"
      />,
    );
    expect(screen.getByTestId("desktop-sidebar")).toBeInTheDocument();
    expect(screen.queryByTestId("floor-tab-bar")).not.toBeInTheDocument();
  });

  it("desktop sidebar defaults to expanded (lg:flex) when desktopOpen is omitted", () => {
    render(
      <ShellNavigation tier="office" context={officeContext} currentPath="/inventory" />,
    );
    const sidebar = screen.getByTestId("desktop-sidebar");
    expect(sidebar.className).toContain("lg:flex");
    expect(sidebar.className).not.toContain("lg:hidden");
    expect(sidebar).not.toHaveAttribute("aria-hidden", "true");
  });

  it("desktop sidebar switches to lg:hidden and aria-hidden when desktopOpen=false (2026-08-17 collapse toggle)", () => {
    render(
      <ShellNavigation
        tier="office"
        context={officeContext}
        currentPath="/inventory"
        desktopOpen={false}
      />,
    );
    const sidebar = screen.getByTestId("desktop-sidebar");
    expect(sidebar.className).toContain("lg:hidden");
    expect(sidebar).toHaveAttribute("aria-hidden", "true");
  });

  it("omits nav entries the context has no grant for (R3.4 — hidden, not disabled)", () => {
    render(
      <ShellNavigation tier="office" context={officeContext} currentPath="/inventory" />,
    );
    // officeContext holds pick_list.read and documents.read only; it does
    // NOT hold fifo_override.approve (/approvals) or parties.read
    // (/master-data/parties) — those entries must not render at all.
    // `/documents` itself is `launchStatus: "planned"` (not yet built), so
    // even though documents.read is granted, that entry is correctly
    // omitted too. `/inventory` (also pick_list.read, and
    // `launchStatus: "launch"`) is the sole remaining assertion proving
    // "granted AND launched -> visible" -- the former standalone
    // `/outgoing-ledger` route this test also asserted on was merged into
    // `/inventory`'s Ledger tab (2026-08-09) and no longer exists as its
    // own registry row.
    expect(screen.queryByTestId("nav-entry-approvals")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-entry-parties")).not.toBeInTheDocument();
    expect(screen.getByTestId("nav-entry-inventory")).toBeInTheDocument();
  });

  it("keeps Receiving highlighted for a dynamic receiving-detail route (R3.6/R3.7)", () => {
    const contextWithReceiving: Pick<AuthorizationContext, "grants"> = {
      grants: [{ resource: "receiving", action: "view", scopeKind: "global" }],
    };
    render(
      <ShellNavigation
        tier="floor"
        context={contextWithReceiving}
        currentPath="/receiving/wrr-123"
      />,
    );
    const receivingLink = screen.getByTestId("nav-entry-receiving");
    expect(receivingLink).toHaveAttribute("aria-current", "page");
  });

  it("gives the active office destination a persistent rail/icon treatment and inactive rows a hover affordance", () => {
    render(
      <ShellNavigation tier="office" context={officeContext} currentPath="/inventory" />,
    );

    const active = screen.getByTestId("nav-entry-inventory");
    const inactive = screen.getByTestId("nav-entry-root");

    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveAttribute("data-active", "true");
    expect(active.className).toContain("bg-accent-indigo-50");
    expect(active.className).toContain("before:bg-primary");
    expect(within(active).getByText("Master Inventory").previousElementSibling?.className).toContain("bg-primary");

    expect(inactive).not.toHaveAttribute("aria-current");
    expect(inactive).toHaveAttribute("data-active", "false");
    expect(inactive.className).toContain("hover:bg-accent-indigo-50");
  });

  it("keeps compact desktop navigation rows at the approved 44px office target", () => {
    render(
      <ShellNavigation tier="office" context={officeContext} currentPath="/inventory" />,
    );
    expect(screen.getByTestId("nav-entry-inventory").className).toContain("h-11");
  });

  it("never renders a live link for a featureStatus:'planned' registry entry (e.g. /documents)", () => {
    // 2026-08-17: /reports retired as the example here — it flipped
    // planned -> launch (confirmed fully wired to real data, stale flag).
    // 2026-08-24: /billing-pricing also flipped planned -> launch (real
    // query modules wired) — see revision-log.md. /documents is still
    // genuinely planned (10-pick-list-and-acknowledgement-receipt's own
    // backend hasn't landed).
    render(
      <ShellNavigation
        tier="office"
        context={{ grants: [{ resource: "documents", action: "read", scopeKind: "global" }] }}
        currentPath="/inventory"
      />,
    );
    expect(screen.queryByTestId("nav-entry-documents")).not.toBeInTheDocument();
  });

  it("renders a live link for /reports now that it's launchStatus: 'launch' (2026-08-17 stale-flag fix)", () => {
    render(
      <ShellNavigation
        tier="office"
        context={{ grants: [{ resource: "reporting", action: "read", scopeKind: "global" }] }}
        currentPath="/inventory"
      />,
    );
    expect(screen.getByTestId("nav-entry-reports")).toBeInTheDocument();
  });

  it("renders the office sidebar in grouped sections with a header per group (2026-08-09, sidebar reorganization)", () => {
    render(
      <ShellNavigation tier="office" context={officeContext} currentPath="/inventory" />,
    );
    // officeContext holds pick_list.read (-> "Main" group, per the
    // 2026-08-17 sidebar/IA restructure) and documents.read (route is
    // launchStatus:"planned", so it never contributes a visible entry or a
    // group). "System" also renders regardless of grants: /sync is
    // capability:"none" (unconditionally visible) and, as of the same-day
    // surface fix below, surface:"shared" rather than "floor" -- it was
    // never actually capability-gated, it was wrongly hidden from every
    // office session by a surface-tag bug (see revision-log.md, "outgoing
    // and sync surface fix"). "Master Data" correctly stays absent -- unlike
    // /sync, /enrollment and /billing-pricing both require capabilities this
    // context doesn't hold (parties.read / reporting.financial_read).
    expect(screen.getByTestId("nav-group-main")).toBeInTheDocument();
    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByTestId("nav-group-system")).toBeInTheDocument();
    // No empty-group headers for capabilities this context doesn't hold.
    expect(screen.queryByTestId("nav-group-master-data")).not.toBeInTheDocument();
  });

  it("never renders group headers for the floor bottom tab bar (grouping is office/party-only)", () => {
    render(
      <ShellNavigation tier="floor" context={receivingOnlyContext} currentPath="/receiving" />,
    );
    // The floor tab bar still renders the "Receiving" nav LINK itself (that's
    // correct, unrelated to grouping) — what must be absent is any
    // `nav-group-*` section-header wrapper around it.
    expect(screen.queryByTestId("nav-group-receiving")).not.toBeInTheDocument();
    expect(document.querySelector('[data-testid^="nav-group-"]')).toBeNull();
  });

  // ---------------------------------------------------------------------
  // Mobile drawer (office/party tiers) — design.md §6: "At narrow mobile
  // widths the sidebar collapses to a hamburger/drawer." ShellChrome owns
  // the open/close state (its header hamburger) and passes it down as
  // `mobileNavOpen`/`onCloseMobileNav`; previously nothing consumed this
  // state at all, so office/party users had no way to reach navigation
  // below the `lg` breakpoint. Fixed 2026-08-12.
  // ---------------------------------------------------------------------

  it("renders no drawer dialog for tier='office' when mobileNavOpen is false or omitted", () => {
    render(
      <ShellNavigation tier="office" context={officeContext} currentPath="/inventory" />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the grouped nav inside a dialog drawer for tier='office' when mobileNavOpen is true", () => {
    render(
      <ShellNavigation
        tier="office"
        context={officeContext}
        currentPath="/inventory"
        mobileNavOpen
        onCloseMobileNav={() => {}}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: /navigation menu/i });
    expect(dialog).toBeInTheDocument();
    // Same grouped content the desktop sidebar shows -- nothing reachable
    // on desktop is unreachable in the mobile drawer. (The desktop sidebar
    // itself stays mounted -- CSS `hidden` below `lg`, not removed from the
    // DOM -- so this assertion is scoped to inside the dialog specifically.)
    expect(within(dialog).getByTestId("nav-group-main")).toBeInTheDocument();
  });

  it("renders the drawer for tier='party' too, since party uses the office-shape sidebar (design.md §3.3)", () => {
    render(
      <ShellNavigation
        tier="party"
        context={{ grants: [{ resource: "documents", action: "read", scopeKind: "global" }] }}
        currentPath="/portal/documents"
        mobileNavOpen
        onCloseMobileNav={() => {}}
      />,
    );
    expect(screen.getByRole("dialog", { name: /navigation menu/i })).toBeInTheDocument();
  });

  it("calls onCloseMobileNav when the drawer's close button is activated", async () => {
    const onCloseMobileNav = vi.fn();
    const user = userEvent.setup();
    render(
      <ShellNavigation
        tier="office"
        context={officeContext}
        currentPath="/inventory"
        mobileNavOpen
        onCloseMobileNav={onCloseMobileNav}
      />,
    );
    await user.click(screen.getByRole("button", { name: /close navigation menu/i }));
    expect(onCloseMobileNav).toHaveBeenCalled();
  });

  it("calls onCloseMobileNav when a drawer nav entry is activated (navigate-then-close)", async () => {
    const onCloseMobileNav = vi.fn();
    const user = userEvent.setup();
    render(
      <ShellNavigation
        tier="office"
        context={officeContext}
        currentPath="/inventory"
        mobileNavOpen
        onCloseMobileNav={onCloseMobileNav}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: /navigation menu/i });
    await user.click(within(dialog).getByTestId("nav-entry-inventory"));
    expect(onCloseMobileNav).toHaveBeenCalled();
  });

  it("never renders the floor tab bar's 'More' overlay for tier='office' (that pattern is floor-only)", () => {
    render(
      <ShellNavigation
        tier="office"
        context={officeContext}
        currentPath="/inventory"
        mobileNavOpen
        onCloseMobileNav={() => {}}
      />,
    );
    expect(screen.queryByTestId("floor-tab-bar")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // Floor text-size floor: requirements.md R2 "Floor screens SHALL use no
  // text below 16px (`body-md` minimum)" (tasks.md §2 "Ensure no text
  // below 16px (`body-md` minimum) is rendered on floor screens"), also
  // restated in ui-ux-design-plan.md §7/§13. `text-mono-sm` resolves to
  // 14px in tailwind.config.ts and must never be used for floor nav-entry
  // labels; the 16px floor-appropriate token is `text-mono-md`.
  // ---------------------------------------------------------------------

  it("renders floor bottom-tab-bar entry labels at 16px minimum (text-mono-md), never the 14px text-mono-sm", () => {
    render(
      <ShellNavigation
        tier="floor"
        context={receivingOnlyContext}
        currentPath="/receiving"
      />,
    );
    const receivingLink = screen.getByTestId("nav-entry-receiving");
    const label = within(receivingLink).getByText("Receiving");
    expect(label.className).not.toContain("text-mono-sm");
    expect(label.className).toContain("text-mono-md");
  });

  // ---------------------------------------------------------------------
  // Floor text-size floor, "More" overlay case: the primary floor tab-bar
  // fix (above) only corrected the persistent bottom tab bar. The overlay
  // opened from that bar's "More" button reuses `GroupedSections` /
  // `MoreOverlay`, which today hardcode office-tier (14px) text
  // regardless of which tier opened them — the overlay's nav-entry
  // labels, section-group headers, and role-label all still render at
  // sub-16px even in a floor session. R7.4 (requirements.md) requires no
  // text below 16px on floor screens; tasks.md §2 requires this be
  // eliminated wherever floor sessions can reach it, not just on the
  // tab-bar's own primary entries.
  // ---------------------------------------------------------------------

  // Grants enough floor/shared-surface capabilities to produce more than 4
  // navigable floor entries (root, receiving, outgoing, sync, profile), so
  // the "More" button renders. "outgoing" (surface shared, group "Main") is
  // used as the overlay nav-entry under test since it's guaranteed present
  // past the primary 4.
  const floorManyEntriesContext: Pick<AuthorizationContext, "grants"> = {
    grants: [
      { resource: "receiving", action: "view", scopeKind: "global" },
      { resource: "pick_list", action: "execute", scopeKind: "global" },
      { resource: "inspection", action: "perform", scopeKind: "global" },
      { resource: "transfer", action: "view", scopeKind: "global" },
    ],
  };

  it("renders the floor 'More' overlay's nav-entry labels at 16px minimum (text-mono-md), never the 14px text-label, when opened from a floor session (R7.4)", async () => {
    const user = userEvent.setup();
    render(
      <ShellNavigation tier="floor" context={floorManyEntriesContext} currentPath="/receiving" />,
    );
    await user.click(screen.getByRole("button", { name: /more navigation options/i }));
    const dialog = screen.getByRole("dialog", { name: /navigation menu/i });
    const entryLink = within(dialog).getByTestId("nav-entry-outgoing");
    const label = within(entryLink).getByText("Outgoing");
    expect(label.className).not.toContain("text-label");
    expect(label.className).toContain("text-mono-md");
  });

  it("renders the floor 'More' overlay's section-group header at 16px minimum (text-body-md/text-mono-md), never the 14px text-mono-sm, when opened from a floor session (R7.4)", async () => {
    const user = userEvent.setup();
    render(
      <ShellNavigation tier="floor" context={floorManyEntriesContext} currentPath="/receiving" />,
    );
    await user.click(screen.getByRole("button", { name: /more navigation options/i }));
    const dialog = screen.getByRole("dialog", { name: /navigation menu/i });
    const groupHeader = within(dialog).getByTestId("nav-group-main");
    expect(groupHeader.className).not.toContain("text-mono-sm");
    expect(groupHeader.className).toContain("text-mono-md");
  });

  it("renders the floor 'More' overlay's role-label at 16px minimum (text-body-md), never the 14px text-body-sm, when opened from a floor session (R7.4)", async () => {
    const user = userEvent.setup();
    render(
      <ShellNavigation tier="floor" context={floorManyEntriesContext} currentPath="/receiving" />,
    );
    await user.click(screen.getByRole("button", { name: /more navigation options/i }));
    const dialog = screen.getByRole("dialog", { name: /navigation menu/i });
    // Role-label sits in the same header row as the display-name; select
    // it via its sibling text node (roleDisplayLabel([]) resolves to a
    // non-empty string per lib/shell/surface.ts).
    const header = dialog.querySelector('[class*="border-b"]');
    expect(header).not.toBeNull();
    const roleLabelEl = header!.querySelector("p.truncate.font-body");
    expect(roleLabelEl).not.toBeNull();
    expect(roleLabelEl!.className).not.toContain("text-body-sm");
    expect(roleLabelEl!.className).toContain("text-body-md");
  });

  it("still allows the office desktop sidebar's grouped section text at 14px (office-only, not floor-reachable)", () => {
    render(
      <ShellNavigation tier="office" context={officeContext} currentPath="/inventory" />,
    );
    const groupHeader = screen.getByTestId("nav-group-main");
    expect(groupHeader.className).toContain("text-mono-sm");
  });

  // ---------------------------------------------------------------------
  // Scan-loop navigation suppression: requirements.md R4.3 ("During an
  // active scan-driven floor flow, navigation SHALL be completely hidden
  // ... Bottom tabs appear only between scan steps.") and tasks.md §4
  // ("Implement mobile/floor navigation: bottom tab bar between steps,
  // completely hidden navigation during active scan loops.").
  //
  // Confirmed 2026-08-16 decision: hides for the ENTIRE duration one of
  // the 5 scan-flow pages is open (pure route-based check via
  // lib/shell/scan-loop.ts#isScanLoopRoute, not per-scan-step state), and
  // reappears once the user navigates away to any other page. Tested here
  // only for tier="floor" -- the floor bottom tab bar is the surface this
  // rule applies to.
  // ---------------------------------------------------------------------

  const scanLoopPaths = [
    "/receiving/wrr-123/receive",
    "/pick-lists/PL-2026-777/pick",
    "/pick-lists/PL-2026-777/dispatch",
    "/transfers/TR-2026-004/execute",
    "/transfers/TR-2026-004/inspect",
  ];

  it.each(scanLoopPaths)(
    "does not render the floor tab bar at all for tier='floor' while on the scan-flow route %s (R4.3)",
    (scanLoopPath) => {
      render(
        <ShellNavigation
          tier="floor"
          context={floorManyEntriesContext}
          currentPath={scanLoopPath}
        />,
      );
      expect(screen.queryByTestId("floor-tab-bar")).not.toBeInTheDocument();
    },
  );

  it("still renders the floor tab bar for tier='floor' on an ordinary floor path that is not a scan-flow route (regression guard)", () => {
    render(
      <ShellNavigation tier="floor" context={receivingOnlyContext} currentPath="/receiving" />,
    );
    expect(screen.getByTestId("floor-tab-bar")).toBeInTheDocument();
  });

  it("still renders the floor tab bar for tier='floor' on a receiving detail page that has not yet entered the receive scan flow (near-miss regression guard)", () => {
    render(
      <ShellNavigation
        tier="floor"
        context={receivingOnlyContext}
        currentPath="/receiving/wrr-123"
      />,
    );
    expect(screen.getByTestId("floor-tab-bar")).toBeInTheDocument();
  });
});

// -----------------------------------------------------------------------
// RED TEST (tasks.md §4 / requirements.md R4.1, R5.5): real letter-mark
// logo asset in the desktop sidebar.
//
// requirements.md R4.1 ("Office screens SHALL provide the approved desktop
// sidebar using White or Cream White background, Deep Navy (#0F172A) active
// text, Slate (#64748B) inactive text, Vibrant Blue (#2563EB) active
// indicator, and real letter-mark logo asset (no diagonal-cut motif)."),
// tasks.md §4 ("Implement desktop sidebar using ... and real letter-mark
// logo asset (no diagonal cut).").
//
// A real logo file now exists at `public/logo.svg` (spec gap this cycle:
// only a text brand label "Dyna-Serv WIMS" is rendered in the sidebar
// today -- no image/logo mark at all, confirmed via read of
// ShellNavigation.tsx lines 317-319). This RED test targets the desktop
// sidebar (`data-testid="desktop-sidebar"`) rendering a real <img> element
// referencing the real asset, alongside (not instead of) the existing
// "Dyna-Serv WIMS" text label -- additive, not a replacement.
// -----------------------------------------------------------------------
describe("ShellNavigation desktop sidebar logo (requirements.md R4.1, tasks.md §4 real letter-mark logo asset)", () => {
  it("renders a real <img> logo asset referencing /logo.svg inside the desktop sidebar, alongside the 'Dyna-Serv WIMS' brand text (R4.1)", () => {
    render(
      <ShellNavigation tier="office" context={officeContext} currentPath="/inventory" />,
    );

    const sidebar = screen.getByTestId("desktop-sidebar");

    // EXPECTED FAILURE (RED): ShellNavigation.tsx currently renders only a
    // <p> text brand label in the sidebar header block -- no <img>/logo
    // element exists at all today, so this query finds nothing.
    const logo = within(sidebar).getByRole("img", { name: /dyna-serv wims/i });
    expect(logo).toBeInTheDocument();
    expect(logo.tagName).toBe("IMG");
    expect(logo).toHaveAttribute("src", expect.stringContaining("/logo.svg"));

    // Additive, not a replacement: the existing text brand label must still
    // be present alongside the new logo image.
    expect(within(sidebar).getByText("Dyna-Serv WIMS")).toBeInTheDocument();
  });
});
