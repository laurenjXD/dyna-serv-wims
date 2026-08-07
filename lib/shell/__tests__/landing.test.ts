// RED-step unit tests for lib/shell/landing.ts (does not exist yet).
//
// Traceability: specs/05-ui-shell-and-navigation/requirements.md R11
// (general landing page) and design.md §3.2's `/` route amendment prose
// (mockup.md §1 -- floor shell default route; §3 -- office shell
// dashboard/review route).
//
// Backing acceptance criteria (requirements.md §4):
//   - "'/' renders the correct per-surface summary (floor task-count/
//     quick-actions/work-queue CTA, or office per-queue cards/recent-
//     activity feed) for a floor, office, and 'party' session, requires no
//     capability, and never displays 16's KPI cards or financial metrics."
//     (R11.2, R11.5)
//   - "'/'s office-surface rendering (office and 'party' sessions)
//     additionally displays the 16-reporting-and-analytics <ActivityHeatmap>
//     widget only when the session holds reporting.read; the widget is
//     absent for any session without that capability, including all
//     floor-shell sessions, and never appears in the floor summary
//     presentation." (R11.6)
//
// This file tests the PURE content-shape resolution function only -- not
// actual React rendering of the `/` page or the <ActivityHeatmap> component
// itself (that requires a rendering/browser pass and is deferred, per this
// task's instructions, to a later E2E cycle once such tooling exists in this
// repo). The critical behavior under test is that widget presence is driven
// STRICTLY by the `reporting.read` boolean input, never by the tier alone,
// and that the floor variant structurally has no heatmap field at all (not
// merely a `false` flag) -- proving R11.6's "never appears in the floor
// summary presentation under any circumstance" at the data-shape level.
//
// ---------------------------------------------------------------------------
// Expected module contract for lib/shell/landing.ts (for frontend-builder):
//
//   export interface LandingPageSummaryData {
//     taskCounts: { receiving: number; picking: number; inspection: number };
//     quickActions: readonly string[];
//     workQueueCta: { label: string; href: string };
//     queueCards: readonly {
//       queue: "receiving" | "picking" | "inspection";
//       openCount: number;
//       todayCount: number;
//     }[];
//     recentActivity: readonly { id: string; description: string }[];
//   }
//
//   export type LandingPageContent =
//     | {
//         kind: "floor";
//         taskCounts: LandingPageSummaryData["taskCounts"];
//         quickActions: LandingPageSummaryData["quickActions"];
//         workQueueCta: LandingPageSummaryData["workQueueCta"];
//         // NOTE: deliberately NO `activityHeatmap` field at all on this
//         // variant -- R11.6 requires the widget never appear in the floor
//         // presentation "under any circumstance", modeled here as a
//         // structural absence, not a false flag.
//       }
//     | {
//         kind: "office";
//         queueCards: LandingPageSummaryData["queueCards"];
//         recentActivity: LandingPageSummaryData["recentActivity"];
//         activityHeatmap: boolean; // true only when reporting.read is held
//       };
//
//   export function resolveLandingPageContent(
//     tier: "floor" | "office" | "party", // from lib/shell/surface.ts's
//       // resolveSessionPresentationTier
//     hasReportingRead: boolean,
//     data: LandingPageSummaryData,
//   ): LandingPageContent;
//   // tier "party" maps to the SAME "office" content shape as tier
//   // "office", per R11.2 ("office summary presentation for an office or
//   // 'party' session") and design.md's explicit note that a 'party'
//   // session with reporting.read also sees the heatmap widget.
// ---------------------------------------------------------------------------

import { describe, expect, it } from "vitest";

const sampleData = {
  taskCounts: { receiving: 3, picking: 5, inspection: 1 },
  quickActions: ["Scan WRR", "Start pick list"],
  workQueueCta: { label: "Open work queue", href: "/inspection" },
  queueCards: [
    { queue: "receiving" as const, openCount: 3, todayCount: 1 },
    { queue: "picking" as const, openCount: 5, todayCount: 2 },
    { queue: "inspection" as const, openCount: 1, todayCount: 0 },
  ],
  recentActivity: [{ id: "evt-1", description: "WRR-2026-001 received" }],
};

describe("lib/shell/landing — resolveLandingPageContent (R11.2, R11.5, R11.6)", () => {
  it("returns the floor content shape (task counts, quick actions, work-queue CTA) for tier 'floor'", async () => {
    const { resolveLandingPageContent } = await import("../landing");
    const content = resolveLandingPageContent("floor", false, sampleData);

    expect(content.kind).toBe("floor");
    if (content.kind !== "floor") throw new Error("expected floor content");
    expect(content.taskCounts).toEqual(sampleData.taskCounts);
    expect(content.quickActions).toEqual(sampleData.quickActions);
    expect(content.workQueueCta).toEqual(sampleData.workQueueCta);
  });

  it("the floor content shape has NO activityHeatmap property at all, even when hasReportingRead is (hypothetically) true -- R11.6's 'under any circumstance' guarantee", async () => {
    const { resolveLandingPageContent } = await import("../landing");
    const content = resolveLandingPageContent("floor", true, sampleData);

    expect(content.kind).toBe("floor");
    expect(content).not.toHaveProperty("activityHeatmap");
  });

  it("returns the office content shape (queue cards, recent activity) for tier 'office'", async () => {
    const { resolveLandingPageContent } = await import("../landing");
    const content = resolveLandingPageContent("office", false, sampleData);

    expect(content.kind).toBe("office");
    if (content.kind !== "office") throw new Error("expected office content");
    expect(content.queueCards).toEqual(sampleData.queueCards);
    expect(content.recentActivity).toEqual(sampleData.recentActivity);
  });

  it("sets activityHeatmap: true for the office tier only when hasReportingRead is true", async () => {
    const { resolveLandingPageContent } = await import("../landing");
    const withRead = resolveLandingPageContent("office", true, sampleData);
    const withoutRead = resolveLandingPageContent("office", false, sampleData);

    if (withRead.kind !== "office" || withoutRead.kind !== "office") {
      throw new Error("expected office content");
    }
    expect(withRead.activityHeatmap).toBe(true);
    expect(withoutRead.activityHeatmap).toBe(false);
  });

  it("maps tier 'party' to the SAME office content shape as tier 'office' (R11.2)", async () => {
    const { resolveLandingPageContent } = await import("../landing");
    const content = resolveLandingPageContent("party", true, sampleData);

    expect(content.kind).toBe("office");
    if (content.kind !== "office") throw new Error("expected office content");
    expect(content.activityHeatmap).toBe(true);
    expect(content.queueCards).toEqual(sampleData.queueCards);
  });

  it("a 'party' session without reporting.read gets the office shape but activityHeatmap: false, exactly like an office session without it", async () => {
    const { resolveLandingPageContent } = await import("../landing");
    const content = resolveLandingPageContent("party", false, sampleData);

    expect(content.kind).toBe("office");
    if (content.kind !== "office") throw new Error("expected office content");
    expect(content.activityHeatmap).toBe(false);
  });

  it("never includes KPI-card or financial-metric-shaped fields on either variant (R11.5 -- '/' is distinct from 16's /reports dashboard)", async () => {
    const { resolveLandingPageContent } = await import("../landing");
    const floorContent = resolveLandingPageContent("floor", false, sampleData);
    const officeContent = resolveLandingPageContent("office", true, sampleData);

    for (const content of [floorContent, officeContent]) {
      expect(content).not.toHaveProperty("kpiCards");
      expect(content).not.toHaveProperty("financialMetrics");
      expect(content).not.toHaveProperty("marginMetrics");
    }
  });
});
