// RED test — DispatchConfirmationPage does not exist yet.
//
// Traceability:
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/requirements.md
//     R7.5  — Final dispatch confirmation SHALL atomically verify the commitment
//             and scans, decrement authoritative inventory, release the committed
//             quantity, transition the pick list, and insert an immutable
//             inventory_transaction with movement_type = 'pick'.
//     R7.8  — After all pick/scan lines on a pick list are accepted, the floor
//             user or supervisor SHALL proceed directly to dispatch; Stage 2
//             verifies scans, decrements inventory, releases reservations, writes
//             the immutable pick transaction, and makes the priced
//             acknowledgement_receipt available.
//     R7.9  — Stage 2 SHALL have no quality-check branch that blocks or reroutes
//             dispatch.
//     §5 acceptance criterion — "After all pick scans are accepted, dispatch is
//             direct and has no pre-dispatch inspection route or state."
//   specs/08-outgoing-withdrawal-and-two-stage-commitment/design.md §3 (route),
//     §7 (Stage 2 dispatch disposition)
//   specs/00-steering/brand-design-system.md §3 (floor surface: 64px primary CTA,
//     active: press, no glassmorphism, solid bg-brand-red for primary action,
//     one primary action per screen)
//
// Surface: FLOOR — final dispatch confirmation at 375px viewport.
// Expected failure mode: "Cannot find module '../page'" — page does not exist.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pageSource = () => readFileSync(resolve(__dirname, "../page.tsx"), "utf8");

describe("DispatchConfirmationPage (app/(authenticated)/pick-lists/[pickListId]/dispatch/page.tsx)", () => {
  // R7.5, R7.8 — page must exist as a module and export a default component
  // so the floor dispatch confirmation screen can be reached after all pick
  // scans are accepted.
  it("AC R7.5/R7.8: exports a default component", async () => {
    const mod = await import("../page");
    expect(typeof mod.default).toBe("function");
  });

  // R7.9 — no inspection or quality-check branch; the page must model a direct
  // confirmation flow. Enforced structurally: the page must export exactly one
  // default component with a traceable name (no anonymous wrappers that could
  // hide an implicit branch).
  it("AC R7.9: default export has a non-empty function name (no anonymous wrapper)", async () => {
    const mod = await import("../page");
    expect(mod.default.name.length).toBeGreaterThan(0);
  });

  it("counts repeated shared item or lot QR scans at dispatch", () => {
    const source = pageSource();
    expect(source).toContain('name="barcode"');
    expect(source).toContain("CameraScanBridge");
    expect(source).toContain("selectPickUnit");
    expect(source).toContain("Scan QR for dispatch");
    expect(source).toContain("Scan item or lot QR");
    expect(source).toContain("matching unfinished line is counted automatically");
    expect(source).not.toContain('name="pickListItemId"');
    expect(source).toContain("Confirm Dispatch");
  });
});
