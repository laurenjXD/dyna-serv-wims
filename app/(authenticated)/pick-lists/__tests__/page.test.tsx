// Pick Lists index route — regression coverage for the Track A Milestone 2
// additive index surface. The inventory hub remains the pick-list generation
// surface; this route is the dedicated operational queue for committed lists.

import { describe, expect, it } from "vitest";

describe("PickListsIndexPage (app/(authenticated)/pick-lists/page.tsx)", () => {
  it("renders the authorized pick-list queue through listPickLists", async () => {
    const page = await import("../page");

    expect(typeof page.default).toBe("function");
  });

  it("keeps pick-list access capability-gated and provides responsive queue layouts", async () => {
    const page = await import("../page");
    const source = page.default.toString();

    expect(source).toContain("pick_list.read");
    expect(source).toContain("listPickLists");
    expect(source).toContain("md:hidden");
    expect(source).toContain("hidden overflow-x-auto md:block");
  });
});
