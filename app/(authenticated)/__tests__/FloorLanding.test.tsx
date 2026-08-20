// @vitest-environment jsdom
//
// RED-step test for `app/(authenticated)/_components/FloorLanding.tsx`,
// which does not exist yet. `FloorLanding` is currently an unexported inline
// function inside `app/(authenticated)/page.tsx` (876 lines) — this test
// asserts the presentational-component extraction the checklist item below
// requires, tested directly with mock props rather than through the full
// page's server-side DB-fetching layer.
//
// Traceability:
//   specs/05-ui-shell-and-navigation/tasks.md §7 — "Implement floor summary
//     presentation: greeting, 'TODAY' task-count summary card (Receiving,
//     Picking, Inspection counts), Quick Actions list, one full-width
//     open-work-queue CTA."
//   specs/05-ui-shell-and-navigation/requirements.md
//     R11.2 — floor vs. office summary shape per resolved surface.
//     R11.3 — `/` SHALL aggregate read-only summary counts, Quick Actions,
//       Open Work Queue, Approval monitoring badge, Weekly transaction line
//       graph, and Monthly outgoing KPI summary. (Quick Actions is the piece
//       under test here — this file does not re-test the existing greeting,
//       Shift Overview counts, or full-width CTA, which are already
//       implemented and covered by the confirmed-richer-replacement decision
//       recorded in this session.)
//
// This session's confirmed decisions (do not relitigate):
//   - Floor already has greeting, a 4-card Shift Overview, and a full-width
//     CTA. Only the Quick Actions list is missing — that is the sole gap
//     this file tests.
//   - Quick Actions link to real, already-existing routes: `/receiving/new`
//     (create WRR — app/(authenticated)/receiving/new/page.tsx),
//     `/transfers/new` (create transfer request —
//     app/(authenticated)/transfers/new/page.tsx), `/outgoing` (floor pick
//     list execution — app/(authenticated)/outgoing/page.tsx), and
//     `/inspection` (inspection queue — no dedicated "new" route exists;
//     Daily Inspection is initiated from the Master Inventory dashboard per
//     the 2026-08-06 amendment, so Quick Actions links to the queue itself).
//
// Assumed component contract (RED-step decision):
//   export function FloorLanding(props: {
//     firstName: string;
//     greeting: string;
//     dateString: string;
//     openWrrs: number;
//     openPickLists: number;
//     pendingTransfers: number;
//     openInspections: number;
//   }): JSX.Element
//   - Renders everything the current inline page.tsx FloorLanding renders
//     (greeting, Shift Overview, full-width CTA — untouched by this test),
//     PLUS a new Quick Actions section:
//     `data-testid="landing-quick-actions"` wrapping a small (3-4 item)
//     list of `<a>` links, each with an accessible name and an `href`
//     pointing at one of the real routes above.
//   - Expected failure mode if the module does not exist:
//     "Cannot find module '../_components/FloorLanding'".

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { FloorLanding } from "../_components/FloorLanding";

const baseProps = {
  firstName: "Jade",
  greeting: "morning",
  dateString: "Sunday, August 16, 2026",
  openWrrs: 3,
  openPickLists: 2,
  pendingTransfers: 1,
  openInspections: 4,
};

describe("FloorLanding (specs/05-ui-shell-and-navigation/tasks.md §7 — Quick Actions list)", () => {
  // R11.3 — Quick Actions is one of the five required elements of the floor
  // summary presentation; it does not exist on the current page.tsx.
  it("AC R11.3: renders a landing-quick-actions section", () => {
    render(<FloorLanding {...baseProps} />);
    expect(screen.getByTestId("landing-quick-actions")).toBeInTheDocument();
  });

  // R11.3 — Quick Actions must be a small, purposeful list (not the full
  // route registry): 3-4 links to real floor-relevant creation/queue routes.
  it("AC R11.3: renders between 3 and 4 quick-action links", () => {
    render(<FloorLanding {...baseProps} />);
    const container = screen.getByTestId("landing-quick-actions");
    const links = within(container).getAllByRole("link");
    expect(links.length).toBeGreaterThanOrEqual(3);
    expect(links.length).toBeLessThanOrEqual(4);
  });

  // R11.3 — each quick action must link to a route that actually exists in
  // this codebase (verified via Glob against app/(authenticated)/**/page.tsx
  // before writing this assertion), not a placeholder/planned route.
  it("AC R11.3: quick-action links point at real, existing routes", () => {
    render(<FloorLanding {...baseProps} />);
    const container = screen.getByTestId("landing-quick-actions");
    const links = within(container).getAllByRole("link");
    const hrefs = links.map((link) => link.getAttribute("href"));

    const validRoutes = new Set([
      "/receiving/new",
      "/transfers/new",
      "/outgoing",
      "/inspection",
    ]);
    for (const href of hrefs) {
      expect(href).not.toBeNull();
      expect(validRoutes.has(href as string)).toBe(true);
    }
  });

  // R11.3 — Quick Actions must include at least the receiving-creation
  // route, since "Receive Shipment" is the canonical floor-primary next
  // action per the existing full-width CTA's own target (/receiving).
  it("AC R11.3: includes a link into creating a new WRR (/receiving/new)", () => {
    render(<FloorLanding {...baseProps} />);
    const container = screen.getByTestId("landing-quick-actions");
    const links = within(container).getAllByRole("link");
    const hrefs = links.map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/receiving/new");
  });
});
