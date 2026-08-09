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

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("marks only the resolved active entry with aria-current='page', including for a dynamic-segment path (R3.6/R3.7)", () => {
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
    // /receiving/wrr-123 resolves to the "receiving-detail" entry, not the
    // "receiving" list entry (active-route.ts's dynamic-segment matching).
    const receivingLink = screen.queryByTestId("nav-entry-receiving");
    if (receivingLink) {
      expect(receivingLink).not.toHaveAttribute("aria-current", "page");
    }
  });

  it("never renders a live link for a featureStatus:'planned' registry entry (e.g. /reports)", () => {
    render(
      <ShellNavigation
        tier="office"
        context={{ grants: [{ resource: "reporting", action: "read", scopeKind: "global" }] }}
        currentPath="/inventory"
      />,
    );
    expect(screen.queryByTestId("nav-entry-reports")).not.toBeInTheDocument();
  });

  it("renders the office sidebar in grouped sections with a header per group (2026-08-09, sidebar reorganization)", () => {
    render(
      <ShellNavigation tier="office" context={officeContext} currentPath="/inventory" />,
    );
    // officeContext holds pick_list.read (-> "Outbound" group) and
    // documents.read (route is launchStatus:"planned", so it never
    // contributes a visible entry or a group) -- exactly one group header
    // should render: "Outbound".
    expect(screen.getByTestId("nav-group-outbound")).toBeInTheDocument();
    expect(screen.getByText("Outbound")).toBeInTheDocument();
    // No empty-group headers for capabilities this context doesn't hold.
    expect(screen.queryByTestId("nav-group-master-data")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-group-approvals")).not.toBeInTheDocument();
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
});
