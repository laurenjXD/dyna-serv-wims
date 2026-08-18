// @vitest-environment jsdom
//
// RED-step test for `app/(authenticated)/_components/OfficeLanding.tsx`,
// which does not exist yet. `OfficeLanding` is currently an unexported
// inline function inside `app/(authenticated)/page.tsx` (876 lines) — this
// test asserts the presentational-component extraction the checklist items
// below require, tested directly with mock props rather than through the
// full page's server-side DB-fetching layer.
//
// Traceability:
//   specs/05-ui-shell-and-navigation/tasks.md §7 — "Implement office &
//     Organization Portal presentation: per-queue summary cards (Receiving,
//     Picking, Inspection, open/today counts), Recent Activity feed,
//     Approval monitoring badge with Pending Approval count, Weekly
//     transaction line graph (outgoing qty, sales, CBM), and Monthly
//     outgoing KPI summary."
//   specs/05-ui-shell-and-navigation/requirements.md
//     R11.3 — `/` SHALL aggregate read-only summary counts, Quick Actions,
//       Open Work Queue, Approval monitoring badge with Pending Approval
//       count, Weekly transaction line graph (outgoing qty, sales, CBM),
//       and Monthly outgoing KPI summary.
//     R11.5 — `/` SHALL NOT display financial/margin KPI cards (that rule
//       is reserved for `/reports`); the "sales" ($) series named in R11.3
//       is superseded for `/` by this session's confirmed scope decision
//       below — do not implement or test for a $ series on `/`.
//     R11.2 — floor vs. office summary shape per resolved surface.
//
// This session's confirmed decisions (do not relitigate):
//   - The per-queue KPI strip, activity heatmap (gated reporting.read), and
//     3 Action Queue panels already exist on the current inline OfficeLanding
//     and are NOT re-tested here. Only the four missing pieces below, plus
//     the Low Stock Items capability-gate fix, are under test.
//   - Weekly line graph scope is 2 series only: outgoing quantity and CBM
//     (both have real backing data — items.volumeCbm and
//     lib/analytics/queries/outbound.ts's getPickListVolumeTrend). The
//     "sales" ($ revenue) series is deliberately OUT of scope (no
//     pricing/billing backend exists yet). The graph must never render a
//     "$" character or a "sales"-labeled series — this is a scope-creep
//     regression guard, not just an absence check.
//   - The existing "Low Stock Items" KPI card is currently gated by
//     reporting.financial_read (the wrong capability for an operational
//     stock-count metric). It must gate on plain reporting.read instead.
//     OfficeLanding's prop contract gains `hasReportingAccess: boolean`
//     (independent of the pre-existing `hasFinancialAccess` prop) to drive
//     this. No prior test in this repo asserted the old
//     reporting.financial_read gate (no app/(authenticated)/__tests__/
//     page.test.tsx existed before this file), so there is nothing else to
//     update — this is a new correct-gate assertion, not a migration of an
//     existing one.
//
// Assumed component contract (RED-step decision):
//   export function OfficeLanding(props: {
//     ...all pre-existing props unchanged (dateString, openWrrs,
//       openPickLists, pendingTransfers, openInspections, pendingApprovals,
//       inventoryKpis, hasReceivingAccess, hasPickListAccess,
//       hasTransferAccess, hasInspectionAccess, hasApprovalAccess,
//       hasFinancialAccess, heatmapData, heatmapFilter, openWrrRows,
//       openPickListRows, openInspectionRows, pendingApprovalRows,
//       inventoryPreview),
//     hasReportingAccess: boolean;   // NEW — drives the Low Stock gate fix
//     recentActivity: Array<{ id: string; description: string; timestamp: string }>;
//     weeklyTrend: Array<{ period: string; qty: number; cbm: number }>;
//     monthlyOutgoingQty: number;
//   }): JSX.Element
//   - `data-testid="landing-recent-activity"` section renders each
//     recentActivity item's `description`.
//   - `data-testid="landing-weekly-trend"` chart/graph element renders from
//     `weeklyTrend`, with no "$" character and no "sales"-labeled series
//     anywhere in its rendered output.
//   - `data-testid="landing-monthly-kpi"` element renders `monthlyOutgoingQty`.
//   - Low Stock Items KPI card shows the real value when `hasReportingAccess`
//     is true (even if `hasFinancialAccess` is false), and shows "—" when
//     `hasReportingAccess` is false (even if `hasFinancialAccess` is true).
//   - Expected failure mode if the module does not exist:
//     "Cannot find module '../_components/OfficeLanding'".

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { OfficeLanding } from "../_components/OfficeLanding";

const baseProps = {
  dateString: "Sunday, August 16, 2026",
  openWrrs: 5,
  openPickLists: 3,
  pendingTransfers: 2,
  openInspections: 1,
  pendingApprovals: 4,
  inventoryKpis: { totalLotsInStock: 120, totalCommittedQty: 40, lowStockItemsCount: 7 },
  hasReceivingAccess: true,
  hasPickListAccess: true,
  hasTransferAccess: true,
  hasInspectionAccess: true,
  hasApprovalAccess: true,
  hasFinancialAccess: false,
  hasReportingAccess: true,
  heatmapData: null,
  heatmapFilter: "all" as const,
  openWrrRows: [],
  openPickListRows: [],
  openInspectionRows: [],
  pendingApprovalRows: [],
  inventoryPreview: [],
  recentActivity: [
    { id: "txn-1", description: "Received WRR-00042 from Acme Trading", timestamp: "2026-08-16T08:15:00Z" },
    { id: "txn-2", description: "Dispatched Pick List PL-00110", timestamp: "2026-08-16T09:02:00Z" },
  ],
  weeklyTrend: [
    { period: "2026-08-10", qty: 120, cbm: 34.5 },
    { period: "2026-08-11", qty: 98, cbm: 28.2 },
  ],
  monthlyOutgoingQty: 5420,
  dispatchRate: { dispatched: 18, notDispatched: 2 },
  flowActivity: [
    { flowType: "vmi", count: 12 },
    { flowType: "trading", count: 7 },
    { flowType: "supplies", count: 3 },
  ],
};

describe("OfficeLanding (specs/05-ui-shell-and-navigation/tasks.md §7 — Recent Activity, Weekly trend, Monthly KPI, Low Stock gate)", () => {
  // R11.3 — Recent Activity feed is one of the required office summary
  // elements; it does not exist on the current page.tsx.
  it("AC R11.3: renders a landing-recent-activity section listing each item's description", () => {
    render(<OfficeLanding {...baseProps} />);
    const section = screen.getByTestId("landing-recent-activity");
    expect(within(section).getByText("Received WRR-00042 from Acme Trading")).toBeInTheDocument();
    expect(within(section).getByText("Dispatched Pick List PL-00110")).toBeInTheDocument();
  });

  // R11.3 — Weekly transaction line graph is a required office summary
  // element; it does not exist on the current page.tsx.
  it("AC R11.3: renders a landing-weekly-trend chart element", () => {
    render(<OfficeLanding {...baseProps} />);
    expect(screen.getByTestId("landing-weekly-trend")).toBeInTheDocument();
  });

  // R11.5 + this session's confirmed scope decision — regression guard
  // against scope creep: the weekly trend graph must be quantity+CBM only,
  // never a dollar figure or a "sales" series, since no pricing/billing
  // backend exists yet.
  it("AC R11.5 (scope guard): weekly trend graph renders no dollar sign or 'sales' label", () => {
    render(<OfficeLanding {...baseProps} />);
    const chart = screen.getByTestId("landing-weekly-trend");
    expect(chart.textContent ?? "").not.toMatch(/\$/);
    expect((chart.textContent ?? "").toLowerCase()).not.toMatch(/sales/);
  });

  // R11.3 — Monthly outgoing KPI summary is a required office summary
  // element; it does not exist on the current page.tsx.
  it("AC R11.3: renders a landing-monthly-kpi element showing the monthly outgoing total", () => {
    render(<OfficeLanding {...baseProps} />);
    const kpi = screen.getByTestId("landing-monthly-kpi");
    // 2026-08-17 restyle: displayed via toLocaleString() (thousands
    // separator) as part of the bold stat-block treatment.
    expect(kpi).toHaveTextContent("5,420");
  });

  // R11.5 — Low Stock Items is an operational stock-count metric, not a
  // financial/margin KPI; it must gate on reporting.read, not
  // reporting.financial_read. Positive case: user has reporting.read but
  // NOT reporting.financial_read — the card must still show the real count.
  it("AC R11.5 (gate fix): Low Stock Items card shows the real count when hasReportingAccess is true, even without hasFinancialAccess", () => {
    render(
      <OfficeLanding
        {...baseProps}
        hasReportingAccess={true}
        hasFinancialAccess={false}
      />,
    );
    const card = screen.getByLabelText(/Low Stock Items: 7/i);
    expect(card).toBeInTheDocument();
  });

  // R11.5 — negative case: without reporting.read, the card must show the
  // safe "—" placeholder even if the (now-irrelevant) hasFinancialAccess
  // happens to be true, proving the gate switched capabilities rather than
  // just being loosened to "either".
  it("AC R11.5 (gate fix): Low Stock Items card shows '—' when hasReportingAccess is false, even with hasFinancialAccess true", () => {
    render(
      <OfficeLanding
        {...baseProps}
        hasReportingAccess={false}
        hasFinancialAccess={true}
      />,
    );
    const card = screen.getByLabelText(/Low Stock Items: —/i);
    expect(card).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 2026-08-17 dashboard restyle — dispatch-rate ring, flow-type activity bar
// chart, and the capability-gated omission behavior for both (same pattern
// as the pre-existing heatmap: null -> omitted entirely, no locked
// placeholder).
// ---------------------------------------------------------------------------

describe("OfficeLanding (2026-08-17 restyle — dispatch rate ring, flow-type activity)", () => {
  it("renders the Dispatch Rate ring with the computed percentage when dispatchRate is provided", () => {
    render(<OfficeLanding {...baseProps} />);
    // 18 dispatched / 20 total = 90%
    expect(screen.getByText("90")).toBeInTheDocument();
    // DonutChart legitimately renders "Dispatched" twice (legend + sr-only
    // accessible table) — assert presence, not uniqueness.
    expect(screen.getAllByText("Dispatched").length).toBeGreaterThan(0);
  });

  it("omits the Dispatch Rate ring entirely when dispatchRate is null (no pick_list.read)", () => {
    render(<OfficeLanding {...baseProps} hasPickListAccess={false} dispatchRate={null} />);
    expect(screen.queryByText("Dispatched")).not.toBeInTheDocument();
    expect(screen.getByText("Dispatch rate unavailable")).toBeInTheDocument();
  });

  it("renders the Activity by Flow Type bar chart with a bar per flow", () => {
    render(<OfficeLanding {...baseProps} />);
    const chart = screen.getByLabelText("Activity by Flow Type");
    // BarChart legitimately renders each label twice (visible bar label +
    // sr-only accessible table row) — assert presence, not uniqueness.
    expect(within(chart).getAllByText("VMI").length).toBeGreaterThan(0);
    expect(within(chart).getAllByText("Trading").length).toBeGreaterThan(0);
    expect(within(chart).getAllByText("Supplies").length).toBeGreaterThan(0);
  });

  it("omits the flow-type bar chart entirely when flowActivity is null (no pick_list.read)", () => {
    render(<OfficeLanding {...baseProps} hasPickListAccess={false} flowActivity={null} />);
    expect(screen.queryByLabelText("Activity by Flow Type")).not.toBeInTheDocument();
  });

  it("renders the Monthly Outgoing Qty stat block with the same value and testid as before the restyle", () => {
    render(<OfficeLanding {...baseProps} />);
    const kpi = screen.getByTestId("landing-monthly-kpi");
    expect(kpi).toHaveTextContent("5,420");
  });
});
