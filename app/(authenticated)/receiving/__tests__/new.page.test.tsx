// Test — NewWrrPage (app/(authenticated)/receiving/new/page.tsx).
//
// ─── TDD GAP — IMPLEMENTATION ALREADY EXISTS ─────────────────────────────────
//
// app/(authenticated)/receiving/new/page.tsx, its client subcomponent
// (new/_components/wrr-line-items.tsx), and its backing action (lib/actions/
// receiving.ts createWrr) were all built WITHOUT a prior failing test. This
// violates the project's TDD protocol (specs/00-steering/testing.md). These
// tests are retroactive regression protection, NOT the RED step that should
// have preceded implementation. The structural existence tests below will PASS
// immediately because the page already exists.
//
// ─── Implementation gaps found during this test-writing pass ─────────────────
//
//   GAP 1 — Capability mismatch on the create form:
//     new/page.tsx calls requirePermission(resolver, "receiving.confirm").
//     The task specification requires "receiving.create". If `receiving.confirm`
//     is deliberately reused as the create gate, this must be reconciled with
//     specs/02-rbac-roles/design.md §3.2 before the task can be signed off.
//
// ─── Traceability ─────────────────────────────────────────────────────────────
//
//   specs/07-incoming-receiving/requirements.md
//     R1.1  — An authorized back-office user SHALL be able to create a WRR
//              from an external CIPL/packing-list reference.
//     R1.2  — The WRR SHALL capture header references: WRR number, CIPL/
//              attachment, invoice reference, source party, flow_type, and
//              optional regulatory references (PEZA, IP, MAWB/MBL).
//     R1.3  — Each expected line SHALL carry: item, lot_number, expected qty,
//              UOM, unit CBM, and inbound disposition (store | inspect).
//     R10.1 — All staging reads/writes SHALL use the capability/scope contract
//              from 02-rbac-roles; the UI MAY hide unavailable actions but
//              server enforcement is authoritative.
//   specs/07-incoming-receiving/design.md
//     §5    — Pre-receiving WRR design (office form, draft validation before
//              save, explicit transition to staged status).
//     §5.1  — Expected line fields table (all required WrrLineItems inputs).
//   specs/00-steering/brand-design-system.md
//     §6    — Office surface: glassmorphism Level 1 cards (bg-surface-white
//             ), not solid dark-navy floor surfaces.
//     §3    — Touch targets h-11 (44 px) for office; 64 px for floor.
//
// Surface: Office. Permission gate: receiving.confirm (currently; see GAP 1).
// Expected failure mode if page were absent: "Cannot find module '../new/page'".

import { describe, it, expect } from "vitest";

describe("NewWrrPage (app/(authenticated)/receiving/new/page.tsx)", () => {
  // R1.1 — the page module must exist and export a default Server Component
  // so the office pre-receiving form is reachable through the authenticated
  // route shell. Without this export, Next.js cannot render the route.
  it("AC R1.1: exports a default component", async () => {
    const mod = await import("../new/page");
    expect(typeof mod.default).toBe("function");
  });

  // R1.1 — the component must be named (not anonymous) so React error
  // boundaries surface the failing component by name, enabling fast triage
  // when the create form fails during office hours.
  it("AC R1.1: default export has a non-empty function name", async () => {
    const mod = await import("../new/page");
    expect(mod.default.name.length).toBeGreaterThan(0);
  });

  // R10.1 — the create-WRR page is a command-entry surface; the createWrr
  // server action lives in lib/actions/receiving (design.md §4 command
  // boundary), not as a named export on the page module itself. Only
  // `default` must be exported from the page.
  it("AC R10.1: page module exports only the default component (no mutation side-exports)", async () => {
    const mod = await import("../new/page");
    expect(Object.keys(mod)).toEqual(["default"]);
  });

  // R1.3 / design.md §5.1 — the createWrr server action that the form posts
  // to must be callable from lib/actions/receiving. This verifies the module
  // contract the form depends on; a missing export here would break form
  // submission even if the page itself renders.
  it("AC R1.3: createWrr action is exported from lib/actions/receiving", async () => {
    const actions = await import("@/lib/actions/receiving");
    expect(typeof actions.createWrr).toBe("function");
  });
});
