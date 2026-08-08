// RED test — PickListsPage does not exist yet.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R5.3  — On success, the system SHALL expose the selected lot/location
//             instructions to the floor workflow via the operational pick_list.
//     R5.7  — The resulting pick_list SHALL be operational; it is not an
//             unpriced withdrawal_slip.
//     §5 acceptance criterion — "Stage 1 commitment reserves stock without
//             decrementing inventory and creates exactly one operational pick_list."
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §3 (route)
//
// Surface: Office — list of committed pick lists with status filter.
// Expected failure mode: "Cannot find module '../page'" — page does not exist.

import { describe, it, expect } from "vitest";

describe("PickListsPage (app/(authenticated)/pick-lists/page.tsx)", () => {
  // R5.3, R5.7 — page module must exist and export a default Server Component
  // so committed pick lists can be listed and linked to for floor execution.
  it("AC R5.3/R5.7: exports a default component", async () => {
    const mod = await import("../page");
    expect(typeof mod.default).toBe("function");
  });

  // R5.3 — the page must render a recognizable heading so staff can identify
  // the pick-lists surface from the office navigation shell.
  it("AC R5.3: default export has a display name or function name identifying it as a page component", async () => {
    const mod = await import("../page");
    // Next.js Server Component pages export named async functions; the name
    // must be non-empty so the React DevTools and error boundaries can surface
    // the failing component by name rather than as "(anonymous)".
    expect(mod.default.name.length).toBeGreaterThan(0);
  });
});
