// @vitest-environment jsdom
//
// RED-step test for `components/global/LandingPage.tsx`, which does not
// exist yet. Renders per `lib/shell/landing.ts`'s already-tested
// content-shape resolution; mounts/omits the `16-reporting-and-analytics`
// `<ActivityHeatmap>` slot per that decision (its internals are mocked —
// not under test here).
//
// Traceability:
// - specs/05-ui-shell-and-navigation/requirements.md R11.2 (floor summary
//   vs. office summary presentation per resolved surface), R11.5 (never
//   KPI cards/financial metrics on `/`), R11.6 (office/"party" +
//   reporting.read -> <ActivityHeatmap>; never for floor, under any
//   circumstance).
// - specs/05-ui-shell-and-navigation/design.md §3.2's `/` route amendment
//   prose (floor: task-count summary, Quick Actions, one full-width
//   work-queue CTA; office: per-queue summary cards, Recent Activity feed,
//   optional <ActivityHeatmap>).
//
// Assumed component contract (RED-step decision):
//   export function LandingPage(props: {
//     tier: SessionPresentationTier;
//     hasReportingRead: boolean;
//     data: LandingPageSummaryData;
//   }): JSX.Element
//   - Internally calls lib/shell/landing.ts#resolveLandingPageContent and
//     renders purely from its result — this test does not re-derive that
//     decision, only proves the shell mounts the right DOM for it.
//   - floor content: data-testid="landing-task-counts",
//     "landing-quick-actions", "landing-work-queue-cta". Never renders
//     "activity-heatmap-slot" under any circumstance (R11.6).
//   - office content: data-testid="landing-queue-cards",
//     "landing-recent-activity". Renders "activity-heatmap-slot" iff
//     resolveLandingPageContent(...).activityHeatmap === true.
//   - Never renders "landing-kpi-cards" or "landing-financial-metrics"
//     testids (R11.5) — this test asserts their absence as a guard against
//     accidental scope creep, not because the component is expected to
//     define them.

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { LandingPageSummaryData } from "@/lib/shell/landing";

// Per the task instructions: mock the actual 16-reporting-and-analytics
// component import. We are not testing that component's internals here,
// only that the shell correctly mounts or omits it.
vi.mock("@/components/reporting/ActivityHeatmap", () => ({
  ActivityHeatmap: () => <div data-testid="activity-heatmap-slot" />,
}));

import { LandingPage } from "@/components/global/LandingPage";

const sampleData: LandingPageSummaryData = {
  taskCounts: { receiving: 2, picking: 5, inspection: 1 },
  quickActions: ["Scan next receiving item", "Continue pick list #42"],
  workQueueCta: { label: "Open work queue", href: "/receiving" },
  queueCards: [
    { queue: "receiving", openCount: 2, todayCount: 4 },
    { queue: "picking", openCount: 5, todayCount: 9 },
    { queue: "inspection", openCount: 1, todayCount: 1 },
  ],
  recentActivity: [{ id: "a1", description: "WRR #100 received" }],
};

describe("LandingPage (requirements.md R11.2/R11.5/R11.6)", () => {
  it("renders the floor summary shape for tier='floor' and never the office shape", () => {
    render(<LandingPage tier="floor" hasReportingRead={false} data={sampleData} />);
    expect(screen.getByTestId("landing-task-counts")).toBeInTheDocument();
    expect(screen.getByTestId("landing-quick-actions")).toBeInTheDocument();
    expect(screen.getByTestId("landing-work-queue-cta")).toBeInTheDocument();
    expect(screen.queryByTestId("landing-queue-cards")).not.toBeInTheDocument();
    expect(screen.queryByTestId("landing-recent-activity")).not.toBeInTheDocument();
  });

  it("never renders the ActivityHeatmap for tier='floor', even if hasReportingRead is (incorrectly) true", () => {
    render(<LandingPage tier="floor" hasReportingRead={true} data={sampleData} />);
    expect(screen.queryByTestId("activity-heatmap-slot")).not.toBeInTheDocument();
  });

  it("renders the office summary shape for tier='office' and never the floor shape", () => {
    render(<LandingPage tier="office" hasReportingRead={false} data={sampleData} />);
    expect(screen.getByTestId("landing-queue-cards")).toBeInTheDocument();
    expect(screen.getByTestId("landing-recent-activity")).toBeInTheDocument();
    expect(screen.queryByTestId("landing-task-counts")).not.toBeInTheDocument();
    expect(screen.queryByTestId("landing-work-queue-cta")).not.toBeInTheDocument();
  });

  it("renders <ActivityHeatmap> for tier='office' only when hasReportingRead is true", () => {
    render(<LandingPage tier="office" hasReportingRead={false} data={sampleData} />);
    expect(screen.queryByTestId("activity-heatmap-slot")).not.toBeInTheDocument();

    render(<LandingPage tier="office" hasReportingRead={true} data={sampleData} />);
    expect(screen.getByTestId("activity-heatmap-slot")).toBeInTheDocument();
  });

  it("treats tier='party' identically to 'office' (landing.ts's documented office-shape reuse)", () => {
    render(<LandingPage tier="party" hasReportingRead={true} data={sampleData} />);
    expect(screen.getByTestId("landing-queue-cards")).toBeInTheDocument();
    expect(screen.getByTestId("activity-heatmap-slot")).toBeInTheDocument();
  });

  it("never renders KPI cards or financial metrics on / for any tier (R11.5)", () => {
    for (const tier of ["floor", "office", "party"] as const) {
      const { unmount } = render(
        <LandingPage tier={tier} hasReportingRead={true} data={sampleData} />,
      );
      expect(screen.queryByTestId("landing-kpi-cards")).not.toBeInTheDocument();
      expect(screen.queryByTestId("landing-financial-metrics")).not.toBeInTheDocument();
      unmount();
    }
  });
});
