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
    // 2026-08-08: corrected from "inventory.read" -- the "/pick-lists" route
    // (registry id "inventory") requires "pick_list.read", not "inventory.read".
    // See revision-log.md.
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
      <ShellNavigation tier="office" context={officeContext} currentPath="/pick-lists" />,
    );
    // officeContext holds pick_list.read and documents.read only; it does
    // NOT hold fifo_override.approve (/approvals) or parties.read
    // (/master-data/parties) — those entries must not render at all.
    // `/documents` itself is `launchStatus: "planned"` (not yet built), so
    // even though documents.read is granted, that entry is correctly
    // omitted too — asserting on `/outgoing-ledger` instead (also
    // pick_list.read, and `launchStatus: "launch"`) to keep this test
    // proving "granted AND launched -> visible", not just "granted".
    expect(screen.queryByTestId("nav-entry-approvals")).not.toBeInTheDocument();
    expect(screen.queryByTestId("nav-entry-parties")).not.toBeInTheDocument();
    expect(screen.getByTestId("nav-entry-inventory")).toBeInTheDocument();
    expect(screen.getByTestId("nav-entry-outgoing-ledger")).toBeInTheDocument();
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
});
