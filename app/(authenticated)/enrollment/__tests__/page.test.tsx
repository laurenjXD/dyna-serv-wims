// Test — EnrollmentPage (app/(authenticated)/enrollment/page.tsx).
//
// ─── TDD GAP NOTICE ──────────────────────────────────────────────────────────
// app/(authenticated)/enrollment/page.tsx already existed as a real tab shell
// (not a stub) before this test file was written — confirmed by audit per
// docs/superpowers/plans/2026-08-12-frontend-ui-ux-implementation-plan.md §7's
// explicit instruction not to assume either "done" or "not started" state.
// These tests are therefore retroactive regression protection for an
// already-working implementation, not the RED step that should have preceded
// it. They anchor the plan's §7 field/capability contract so a future edit
// cannot silently regress tab structure, capability gating, or real-query
// wiring back toward mock data or a merged single-capability gate.
//
// ─── Traceability ─────────────────────────────────────────────────────────────
// specs/06-party-and-item-enrollment/design.md §7 (list, search, pagination)
// specs/00-steering/revision-log.md (2026-08-11 Master Data nav consolidation
//   — /enrollment is the SOLE Master Data nav entry; the standalone
//   /master-data/parties|items|locations list pages no longer have their own
//   sidebar row and now simply forward into this hub)
// docs/superpowers/plans/2026-08-12-frontend-ui-ux-implementation-plan.md §7
//   ("Master Data group") — three tabs (Parties/Items/Locations), each
//   rendering that section's real list view inline; read gated
//   `parties.read` (all three internal roles) at the page level with each
//   tab additionally re-checking its own `items.read`/`locations.read`;
//   write gated per-tab (`parties.manage`/`items.manage`/`locations.manage`,
//   Administrator only) — a Supervisor must see all three tabs' data but
//   never a create/edit affordance on any of them.
// lib/shell/registry.ts — id: "enrollment", surface: "office",
//   capability: "parties.read" (single nav entry, launchStatus: "launch")
//
// Surface: Office. Permission gate: parties.read (page-level).
// Expected failure mode if page were absent: "Cannot find module '../page'".

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function pageSource(): string {
  return readFileSync(resolve(__dirname, "../page.tsx"), "utf8");
}

describe("EnrollmentPage (app/(authenticated)/enrollment/page.tsx)", () => {
  // ── Structural existence ──────────────────────────────────────────────────
  it("exports a default component", async () => {
    const mod = await import("../page");
    expect(typeof mod.default).toBe("function");
  });

  it("default export has a non-empty function name", async () => {
    const mod = await import("../page");
    expect(mod.default.name.length).toBeGreaterThan(0);
  });

  it("page module exports only the default component (no mutation side-exports)", async () => {
    const mod = await import("../page");
    expect(Object.keys(mod)).toEqual(["default"]);
  });

  // ── Tab shell structure — plan §7 / resolution note ──────────────────────
  it("renders three tabs: Organizations, Items, Locations", () => {
    // 2026-08-17: tab label renamed Parties -> Organizations (terminology
    // sweep, party->organization is UI-facing only; the "parties" tab KEY,
    // route paths, and capability strings stay unchanged — see revision-log.md).
    const source = pageSource();
    expect(source).toContain('"parties"');
    expect(source).toContain('"items"');
    expect(source).toContain('"locations"');
    expect(source).toContain("Organizations");
    expect(source).toContain("Items");
    expect(source).toContain("Locations");
  });

  // ── Real backend, not mock data ───────────────────────────────────────────
  it("wires real query functions for all three tabs, not mock data", () => {
    const source = pageSource();
    expect(source).toContain("listParties");
    expect(source).toContain("listItems");
    expect(source).toContain("listLocations");
    expect(source).not.toContain("MOCK_");
    expect(source).not.toContain("TODO: wire");
  });

  // ── Capability gates — plan §7: read is parties.read page-level, each tab
  // also re-checks its own read capability; write is per-tab .manage, never
  // a single blanket gate that would let e.g. items.manage double as
  // locations write access. ──────────────────────────────────────────────
  it("gates the whole page read on parties.read", () => {
    const source = pageSource();
    expect(source).toContain('"parties.read"');
  });

  it("gates the Items tab's own read on items.read (independent of the page-level gate)", () => {
    const source = pageSource();
    expect(source).toContain('"items.read"');
  });

  it("gates the Locations tab's own read on locations.read (independent of the page-level gate)", () => {
    const source = pageSource();
    expect(source).toContain('"locations.read"');
  });

  it("gates each tab's write/create affordance on its own .manage capability, not a shared one", () => {
    const source = pageSource();
    expect(source).toContain('"parties.manage"');
    expect(source).toContain('"items.manage"');
    expect(source).toContain('"locations.manage"');
  });

  // ── Entry points still land on the real /master-data/* routes — the tab
  // shell renders these sections inline for read, but create/detail/edit
  // stay on their existing sibling routes, per the plan's resolution note. ──
  it("New Party/Item/Location links point into the real /master-data/*/new routes", () => {
    const source = pageSource();
    expect(source).toContain("/master-data/parties/new");
    expect(source).toContain("/master-data/items/new");
    expect(source).toContain("/master-data/locations/new");
  });

  it("row View links point into the real /master-data/*/[id] detail routes", () => {
    const source = pageSource();
    expect(source).toContain("/master-data/parties/${party.id}");
    expect(source).toContain("/master-data/items/${item.id}");
    expect(source).toContain("/master-data/locations/${loc.id}");
  });

  // ── Not the office/floor-glassmorphism confusion — this is an office
  // surface, dense tables are correct here. ─────────────────────────────────
  it("uses office-surface elevation tokens (solid surface-white, shadow-elevation-1), not floor glassmorphism", () => {
    const source = pageSource();
    expect(source).toContain("bg-surface-white");
    expect(source).toContain("shadow-elevation-1");
    expect(source).not.toContain("backdrop-blur");
  });
});

describe("Superseded /master-data/*/page.tsx list routes forward into /enrollment", () => {
  function moduleSource(path: string): string {
    return readFileSync(resolve(__dirname, path), "utf8");
  }

  it("/master-data/parties/page.tsx redirects into /enrollment?tab=parties", () => {
    const source = moduleSource("../../master-data/parties/page.tsx");
    expect(source).toContain("redirect(");
    expect(source).toContain("/enrollment?");
    expect(source).toContain('tab: "parties"');
  });

  it("/master-data/items/page.tsx redirects into /enrollment?tab=items", () => {
    const source = moduleSource("../../master-data/items/page.tsx");
    expect(source).toContain("redirect(");
    expect(source).toContain("/enrollment?");
    expect(source).toContain('tab: "items"');
  });

  it("/master-data/locations/page.tsx redirects into /enrollment?tab=locations", () => {
    const source = moduleSource("../../master-data/locations/page.tsx");
    expect(source).toContain("redirect(");
    expect(source).toContain("/enrollment?");
    expect(source).toContain('tab: "locations"');
  });
});
