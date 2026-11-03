// Pick-list review/approval route. Physical barcode scanning remains on the
// separate Dispatch route after the allocated list becomes picked.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R7.1  — The floor workflow SHALL present one current pick/scan task at a
//             time, with item, lot, location, quantity, and safe exception feedback.
//     R7.2  — A scan SHALL verify the expected pick list, item/barcode, lot,
//             location, and quantity before acceptance.
//     §5 acceptance criterion — "After all pick scans are accepted, dispatch is
//             direct and has no pre-dispatch inspection route or state."
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §3 (route),
//     §7 (Stage 2 physical execution)
//   specs/00-steering/brand-design-system.md §3 (floor surface rules: mobile-first
//     375px base, 64px primary CTAs, active: not hover:, no glassmorphism,
//     solid backgrounds, one primary action per screen)
//
// Surface: FLOOR — scanner-ready pick execution at 375px viewport.
// Expected failure mode: "Cannot find module '../page'" — page does not exist.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pageSource = () => readFileSync(resolve(__dirname, "../page.tsx"), "utf8");

describe("Pick-list approval route (app/(authenticated)/pick-lists/[pickListId]/pick/page.tsx)", () => {
  it("exports a default component", async () => {
    const mod = await import("../page");
    expect(typeof mod.default).toBe("function");
  });

  it("has a named default export", async () => {
    const mod = await import("../page");
    expect(mod.default.name.length).toBeGreaterThan(0);
  });

  it("keeps approval and dispatch as separate phases", () => {
    const source = pageSource();
    expect(source).toContain("Pick List Approval Gate");
    expect(source).toContain("approvePickList");
    expect(source).toContain("Approve &amp; Move to Dispatch");
    expect(source).not.toContain("Scan QR for dispatch");
  });
});
