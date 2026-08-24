// Retired pick-execution route — retained only to redirect old bookmarks.
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

describe("Retired pick route (app/(authenticated)/pick-lists/[pickListId]/pick/page.tsx)", () => {
  it("AC R7.1/R7.2: exports a default component", async () => {
    const mod = await import("../page");
    expect(typeof mod.default).toBe("function");
  });

  // R7.1 — the component must be named (not anonymous) so server error
  // boundaries surface it correctly on the floor where errors need fast triage.
  it("AC R7.1: default export has a non-empty function name", async () => {
    const mod = await import("../page");
    expect(mod.default.name.length).toBeGreaterThan(0);
  });

  it("redirects legacy pick URLs to the direct Dispatch route", () => {
    const source = pageSource();
    expect(source).toContain('redirect(`/pick-lists/${pickListId}/dispatch`)');
    expect(source).not.toContain("Stage pick list");
    expect(source).not.toContain("Confirm boxes staged");
  });
});
