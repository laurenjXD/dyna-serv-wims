// @vitest-environment jsdom
//
// RED-step test for `app/(authenticated)/inventory/_components/InspectionTab.tsx`,
// which does not exist yet. The Master Inventory "Daily Inspection" tab is
// currently an unexported inline `DailyInspectionTab` server component inside
// `app/(authenticated)/inventory/page.tsx` that only renders
// `listInspectionCases` output. This test asserts the extraction into a
// presentational component driven by the merged
// `listInspectionAndTransferQueue` row shape (`lib/db/queries/transfers.ts`),
// tested directly with mock props rather than through the page's server-side
// DB-fetching layer — the same extraction pattern already used for
// `FloorLanding`/`OfficeLanding` earlier this session
// (app/(authenticated)/__tests__/FloorLanding.test.tsx).
//
// Traceability:
//   specs/11-transfer-and-inspection/requirements.md
//     Terminology Alignment §12 / Acceptance criteria — "User-facing UI
//       labels use ... Inspection exclusively" (Inspection replaces Daily
//       Inspection in UI labels) — AC-terminology.
//     R2.2 — Daily Inspection is initiated directly from the Stock View
//       (`/inventory`) dashboard.
//     R2.3 — the inspection queue displays candidate lots and status; here
//       merged with the transfer queue per
//       specs/00-steering/multi-agent-work-division.md "Sidebar structure —
//       confirmed target (2026-08-17)" and
//       specs/00-steering/ui-implementation-plan.md P4.
//   lib/db/queries/transfers.ts `listInspectionAndTransferQueue` — row shape
//     `{ id, type: "transfer" | "inspection", title, status, createdAt, href }`.
//
// This session's confirmed decisions (do not relitigate):
//   - TabKey's "daily-inspection" renames to "inspection"; tab label becomes
//     "Inspection".
//   - The tab body becomes the merged `listInspectionAndTransferQueue`
//     output: one list, each row showing a `type` badge/icon distinguishing
//     "Transfer" vs "Inspection" (not color alone — matches the pattern
//     already established in app/(authenticated)/inspection/page.tsx,
//     app/(authenticated)/transfers/[transferId]/execute/page.tsx, and
//     app/(authenticated)/receiving/[wrrId]/receive/page.tsx), plus
//     `title`/`status`/link to `href`.
//   - `includeTransfers`/`includeInspections` gating happens at the data
//     layer (page.tsx calling listInspectionAndTransferQueue) — this
//     component only needs to render whatever `rows` prop it is handed,
//     including a rows array containing only one type.
//
// Assumed component contract (RED-step decision):
//   export function InspectionTab(props: {
//     rows: InspectionAndTransferQueueRow[];
//   }): JSX.Element
//   - `data-testid="inspection-transfer-queue"` wraps the list/table.
//   - Each row renders a visible, non-color-only type distinguisher: text
//     content "Transfer" or "Inspection" (not just a CSS color class) plus
//     the row's `title` and `status`, and an `<a>` (or Next Link, which
//     renders as `<a>` in jsdom) with `href` equal to the row's `href`.
//   - Empty state (`rows.length === 0`) renders a message indicating no
//     open transfer or inspection items, distinguishable from the loaded
//     table (i.e. `queryByTestId("inspection-transfer-queue")` behavior is
//     up to the implementation, but an accessible empty-state message must
//     be present).
//   - Expected failure mode if the module does not exist:
//     "Cannot find module '../InspectionTab'" (or similar resolve error).

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { InspectionTab } from "../InspectionTab";
import type { InspectionAndTransferQueueRow } from "@/lib/db/queries/transfers";

const mixedRows: InspectionAndTransferQueueRow[] = [
  {
    id: "t-1",
    type: "transfer",
    title: "Transfer Bay-A1 → Bay-B2",
    status: "pending",
    createdAt: new Date("2026-08-10T08:00:00Z"),
    href: "/transfers/t-1",
  },
  {
    id: "c-1",
    type: "inspection",
    title: "Rice 25kg — Lot LOT-0042",
    status: "open",
    createdAt: new Date("2026-08-11T09:00:00Z"),
    href: "/inspection/c-1",
  },
];

const inspectionOnlyRows: InspectionAndTransferQueueRow[] = [
  {
    id: "c-2",
    type: "inspection",
    title: "Cooking Oil 5L — Lot LOT-0099",
    status: "open",
    createdAt: new Date("2026-08-12T10:00:00Z"),
    href: "/inspection/c-2",
  },
];

describe("InspectionTab (app/(authenticated)/inventory/_components/InspectionTab.tsx)", () => {
  // AC-terminology — "Inspection" replaces "Daily Inspection" in UI labels;
  // this component owns the tab body, so its heading/label text must not
  // regress to the retired "Daily Inspection" wording.
  it("AC-terminology (R11-transfer-and-inspection §Terminology Alignment): does not render the retired 'Daily Inspection' label", () => {
    render(<InspectionTab rows={mixedRows} />);
    expect(screen.queryByText(/daily inspection/i)).not.toBeInTheDocument();
  });

  // R2.3 — merged queue rows render, each with a visible type distinguisher
  // that is not color-only (text content check, per the established
  // 3-component / non-color-alone pattern used elsewhere in this codebase).
  it("AC R2.3: renders both transfer and inspection rows with a text type distinguisher, title, status, and link", () => {
    render(<InspectionTab rows={mixedRows} />);
    const container = screen.getByTestId("inspection-transfer-queue");

    expect(within(container).getByText(/transfer/i)).toBeInTheDocument();
    expect(within(container).getByText(/inspection/i)).toBeInTheDocument();

    expect(within(container).getByText("Transfer Bay-A1 → Bay-B2")).toBeInTheDocument();
    expect(within(container).getByText("Rice 25kg — Lot LOT-0042")).toBeInTheDocument();

    expect(within(container).getByText(/pending/i)).toBeInTheDocument();
    expect(within(container).getByText(/open/i)).toBeInTheDocument();

    const transferLink = within(container).getByRole("link", { name: /Transfer Bay-A1 → Bay-B2/i });
    expect(transferLink).toHaveAttribute("href", "/transfers/t-1");

    const inspectionLink = within(container).getByRole("link", { name: /Rice 25kg/i });
    expect(inspectionLink).toHaveAttribute("href", "/inspection/c-1");
  });

  // R2.3 — a caller without transfer.view (includeTransfers: false at the
  // data layer) hands this component rows containing only type
  // "inspection"; the component must render those rows normally rather than
  // assuming both types are always present.
  it("AC R2.3: renders correctly when rows contain only type 'inspection' (no transfer.view capability)", () => {
    render(<InspectionTab rows={inspectionOnlyRows} />);
    const container = screen.getByTestId("inspection-transfer-queue");

    expect(within(container).getByText("Cooking Oil 5L — Lot LOT-0099")).toBeInTheDocument();
    expect(within(container).queryByText(/transfer/i)).not.toBeInTheDocument();
    const link = within(container).getByRole("link", { name: /Cooking Oil 5L/i });
    expect(link).toHaveAttribute("href", "/inspection/c-2");
  });

  // R2.3 — empty state: no rows (e.g. a user with neither transfer.view nor
  // inspection.perform, or simply an empty queue) renders an appropriate
  // empty message instead of an empty table shell.
  it("AC R2.3: renders an empty-state message when rows is empty", () => {
    render(<InspectionTab rows={[]} />);
    expect(
      screen.getByText(/no (open )?(transfer|inspection)/i),
    ).toBeInTheDocument();
  });
});
