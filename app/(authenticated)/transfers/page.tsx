// Transfer Queue — superseded entry point.
//
// Sidebar/IA decision locked 2026-08-17 (see traceability below): Transfers
// and Inspection are no longer separate pages. The standalone "/transfers"
// list page no longer has its own sidebar entry — the merged Inspection tab
// of Master Inventory (`/inventory?tab=inspection`) is the real, current
// implementation of this queue (see
// app/(authenticated)/inventory/_components/InspectionTab.tsx and
// lib/db/queries/transfers.ts's listInspectionAndTransferQueue). This route
// is kept reachable (old bookmarks/deep links, and it remains the base path
// for the still-real /transfers/new, /transfers/[transferId],
// /transfers/[transferId]/execute, and /transfers/[transferId]/inspect
// routes) but no longer renders its own duplicate list — it forwards
// straight to the merged queue.
//
// Traceability:
//   specs/00-steering/ui-implementation-plan.md P4 — "Sidebar/IA decision
//     locked 2026-08-17: Transfers and Inspection are no longer separate
//     pages. ... `/transfers` and `/inspection` retire as top-level pages,
//     becoming `redirect()`s into `/inventory?tab=inspection` (same pattern
//     already used for `/master-data/*` -> `/enrollment`), and both lose
//     their `lib/shell/registry.ts` nav entries."
//   specs/00-steering/multi-agent-work-division.md "Sidebar structure —
//     confirmed target (2026-08-17)"
//   specs/11-transfer-and-inspection/requirements.md R2.2

import { redirect } from "next/navigation";

export default async function TransferListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await searchParams;

  redirect("/inventory?tab=inspection");
}
