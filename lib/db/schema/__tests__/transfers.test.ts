// RED-step schema tests for lib/db/schema/transfers.ts
// Traceability: specs/11-transfer-and-inspection/requirements.md Acceptance Criteria
// AC1 (transfer request with exact item/lot/quantity/source/destination context)
// AC2 (approval-required transfers: requiresApproval, approvalRequestId, version)
// AC3 (transfer inspection distinct from inbound inspection via contextType)
// AC9 (party/flow scope enforced via FK constraints and flowType)
//
// Schema defined in design.md §2 (Transfer-owned persistence + Shared inspection records).
// Source ref pattern on inspection_cases is polymorphic (no DB FK); tested via hasColumn only.
import { describe, expect, it } from "vitest";
import { column, hasColumn, referencesTable, tableName } from "./helpers";

// ---------------------------------------------------------------------------
// transfer_requests
// AC1: "A valid internal location transfer can be requested with exact
//       item/lot/quantity/source/destination context."
// AC2: "Approval-required transfers cannot execute until a current, exact
//       approval is consumed." — requiresApproval, approvalRequestId, version
// ---------------------------------------------------------------------------

describe("transfers.ts — transfer_requests table (AC1, AC2)", () => {
  it("is named 'transfer_requests'", async () => {
    const { transferRequests } = await import("../transfers");
    expect(tableName(transferRequests)).toBe("transfer_requests");
  });

  it("has fromLocationId notNull referencing locations.id (AC1)", async () => {
    const { transferRequests } = await import("../transfers");
    expect(column(transferRequests, "fromLocationId").notNull).toBe(true);
    expect(
      referencesTable(transferRequests, "from_location_id", "locations", "id"),
    ).toBe(true);
  });

  it("has toLocationId notNull referencing locations.id (AC1)", async () => {
    const { transferRequests } = await import("../transfers");
    expect(column(transferRequests, "toLocationId").notNull).toBe(true);
    expect(
      referencesTable(transferRequests, "to_location_id", "locations", "id"),
    ).toBe(true);
  });

  it("has flowType notNull with enum values vmi/trading/supplies (AC1, AC9)", async () => {
    const { transferRequests } = await import("../transfers");
    const flowType = column(transferRequests, "flowType");
    expect(flowType.notNull).toBe(true);
    expect(flowType.enumValues).toEqual(["vmi", "trading", "supplies"]);
  });

  it("has status notNull with default 'staged' (AC1)", async () => {
    const { transferRequests } = await import("../transfers");
    const status = column(transferRequests, "status");
    expect(status.notNull).toBe(true);
    expect(status.hasDefault).toBe(true);
  });

  it("has status column present (CHECK staged|in_progress|completed|cancelled) (AC1)", async () => {
    const { transferRequests } = await import("../transfers");
    expect(hasColumn(transferRequests, "status")).toBe(true);
  });

  it("has reference nullable (AC1)", async () => {
    const { transferRequests } = await import("../transfers");
    expect(hasColumn(transferRequests, "reference")).toBe(true);
    expect(column(transferRequests, "reference").notNull).toBe(false);
  });

  it("has reason nullable (AC1)", async () => {
    const { transferRequests } = await import("../transfers");
    expect(hasColumn(transferRequests, "reason")).toBe(true);
    expect(column(transferRequests, "reason").notNull).toBe(false);
  });

  it("has requiresApproval notNull with default false (AC2)", async () => {
    const { transferRequests } = await import("../transfers");
    const requiresApproval = column(transferRequests, "requiresApproval");
    expect(requiresApproval.notNull).toBe(true);
    expect(requiresApproval.hasDefault).toBe(true);
  });

  it("has approvalRequestId nullable referencing approval_requests.id (AC2)", async () => {
    const { transferRequests } = await import("../transfers");
    expect(hasColumn(transferRequests, "approvalRequestId")).toBe(true);
    expect(column(transferRequests, "approvalRequestId").notNull).toBe(false);
    expect(
      referencesTable(
        transferRequests,
        "approval_request_id",
        "approval_requests",
        "id",
      ),
    ).toBe(true);
  });

  it("has version notNull with default 1 (AC2)", async () => {
    const { transferRequests } = await import("../transfers");
    const version = column(transferRequests, "version");
    expect(version.notNull).toBe(true);
    expect(version.hasDefault).toBe(true);
  });

  it("has requestedBy notNull (AC1, AC9)", async () => {
    const { transferRequests } = await import("../transfers");
    expect(column(transferRequests, "requestedBy").notNull).toBe(true);
  });

  it("has createdAt notNull with default (AC1)", async () => {
    const { transferRequests } = await import("../transfers");
    const createdAt = column(transferRequests, "createdAt");
    expect(createdAt.notNull).toBe(true);
    expect(createdAt.hasDefault).toBe(true);
  });

  it("has updatedAt notNull with default (AC1)", async () => {
    const { transferRequests } = await import("../transfers");
    const updatedAt = column(transferRequests, "updatedAt");
    expect(updatedAt.notNull).toBe(true);
    expect(updatedAt.hasDefault).toBe(true);
  });

  it("has correlationId nullable (AC1)", async () => {
    const { transferRequests } = await import("../transfers");
    expect(hasColumn(transferRequests, "correlationId")).toBe(true);
    expect(column(transferRequests, "correlationId").notNull).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// transfer_lines
// AC1: "A valid internal location transfer can be requested with exact
//       item/lot/quantity/source/destination context."
// AC3: "Transfer inspection is distinct from inbound WRR inspection" —
//       inspectionCaseId links a line into the shared inspection tables
// ---------------------------------------------------------------------------

describe("transfers.ts — transfer_lines table (AC1, AC3)", () => {
  it("is named 'transfer_lines'", async () => {
    const { transferLines } = await import("../transfers");
    expect(tableName(transferLines)).toBe("transfer_lines");
  });

  it("has transferRequestId notNull referencing transfer_requests.id (AC1)", async () => {
    const { transferLines } = await import("../transfers");
    expect(column(transferLines, "transferRequestId").notNull).toBe(true);
    expect(
      referencesTable(
        transferLines,
        "transfer_request_id",
        "transfer_requests",
        "id",
      ),
    ).toBe(true);
  });

  it("has lotId notNull referencing lots.id (AC1)", async () => {
    const { transferLines } = await import("../transfers");
    expect(column(transferLines, "lotId").notNull).toBe(true);
    expect(referencesTable(transferLines, "lot_id", "lots", "id")).toBe(true);
  });

  it("has itemId notNull referencing items.id (AC1)", async () => {
    const { transferLines } = await import("../transfers");
    expect(column(transferLines, "itemId").notNull).toBe(true);
    expect(referencesTable(transferLines, "item_id", "items", "id")).toBe(true);
  });

  it("has qtyRequested notNull (AC1)", async () => {
    const { transferLines } = await import("../transfers");
    expect(column(transferLines, "qtyRequested").notNull).toBe(true);
  });

  it("has qtyTransferred notNull with default 0 (AC1)", async () => {
    const { transferLines } = await import("../transfers");
    const qtyTransferred = column(transferLines, "qtyTransferred");
    expect(qtyTransferred.notNull).toBe(true);
    expect(qtyTransferred.hasDefault).toBe(true);
  });

  it("has status notNull with default 'pending' (AC1)", async () => {
    const { transferLines } = await import("../transfers");
    const status = column(transferLines, "status");
    expect(status.notNull).toBe(true);
    expect(status.hasDefault).toBe(true);
  });

  it("has status column present (CHECK pending|in_transit|completed|cancelled) (AC1)", async () => {
    const { transferLines } = await import("../transfers");
    expect(hasColumn(transferLines, "status")).toBe(true);
  });

  it("has inspectionCaseId nullable (AC3 — set when line enters transfer inspection)", async () => {
    const { transferLines } = await import("../transfers");
    expect(hasColumn(transferLines, "inspectionCaseId")).toBe(true);
    expect(column(transferLines, "inspectionCaseId").notNull).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// inspection_cases
// AC3: "Transfer inspection is distinct from inbound WRR inspection and blocks
//       unsafe completion." — contextType field distinguishes contexts
// AC9: "Party/flow scope, RLS, stale-state, concurrency, and evidence access
//       tests pass." — partyId FK, flowType enum
// ---------------------------------------------------------------------------

describe("transfers.ts — inspection_cases table (AC3, AC9)", () => {
  it("is named 'inspection_cases'", async () => {
    const { inspectionCases } = await import("../transfers");
    expect(tableName(inspectionCases)).toBe("inspection_cases");
  });

  it("has contextType notNull (CHECK inbound|transfer distinguishes contexts) (AC3)", async () => {
    const { inspectionCases } = await import("../transfers");
    expect(hasColumn(inspectionCases, "contextType")).toBe(true);
    expect(column(inspectionCases, "contextType").notNull).toBe(true);
  });

  it("has sourceRefType notNull (CHECK wrr_item|transfer_line) (AC3)", async () => {
    const { inspectionCases } = await import("../transfers");
    expect(hasColumn(inspectionCases, "sourceRefType")).toBe(true);
    expect(column(inspectionCases, "sourceRefType").notNull).toBe(true);
  });

  it("has sourceRefId notNull (polymorphic — no DB FK, validated at app layer) (AC3)", async () => {
    const { inspectionCases } = await import("../transfers");
    expect(hasColumn(inspectionCases, "sourceRefId")).toBe(true);
    expect(column(inspectionCases, "sourceRefId").notNull).toBe(true);
  });

  it("has lotId notNull referencing lots.id (AC3)", async () => {
    const { inspectionCases } = await import("../transfers");
    expect(column(inspectionCases, "lotId").notNull).toBe(true);
    expect(
      referencesTable(inspectionCases, "lot_id", "lots", "id"),
    ).toBe(true);
  });

  it("has itemId notNull referencing items.id (AC3)", async () => {
    const { inspectionCases } = await import("../transfers");
    expect(column(inspectionCases, "itemId").notNull).toBe(true);
    expect(
      referencesTable(inspectionCases, "item_id", "items", "id"),
    ).toBe(true);
  });

  it("has partyId notNull referencing parties.id (AC9 — party scope)", async () => {
    const { inspectionCases } = await import("../transfers");
    expect(column(inspectionCases, "partyId").notNull).toBe(true);
    expect(
      referencesTable(inspectionCases, "party_id", "parties", "id"),
    ).toBe(true);
  });

  it("has flowType notNull with enum values vmi/trading/supplies (AC9 — flow scope)", async () => {
    const { inspectionCases } = await import("../transfers");
    const flowType = column(inspectionCases, "flowType");
    expect(flowType.notNull).toBe(true);
    expect(flowType.enumValues).toEqual(["vmi", "trading", "supplies"]);
  });

  it("has status notNull with default 'open' (AC3)", async () => {
    const { inspectionCases } = await import("../transfers");
    const status = column(inspectionCases, "status");
    expect(status.notNull).toBe(true);
    expect(status.hasDefault).toBe(true);
  });

  it("has status column present (CHECK open|passed|failed|cancelled) (AC3)", async () => {
    const { inspectionCases } = await import("../transfers");
    expect(hasColumn(inspectionCases, "status")).toBe(true);
  });

  it("has openedBy notNull (AC3, AC9)", async () => {
    const { inspectionCases } = await import("../transfers");
    expect(column(inspectionCases, "openedBy").notNull).toBe(true);
  });

  it("has openedAt notNull with default (AC3)", async () => {
    const { inspectionCases } = await import("../transfers");
    const openedAt = column(inspectionCases, "openedAt");
    expect(openedAt.notNull).toBe(true);
    expect(openedAt.hasDefault).toBe(true);
  });

  it("has resolvedBy nullable (AC3 — null until inspection resolved)", async () => {
    const { inspectionCases } = await import("../transfers");
    expect(hasColumn(inspectionCases, "resolvedBy")).toBe(true);
    expect(column(inspectionCases, "resolvedBy").notNull).toBe(false);
  });

  it("has resolvedAt nullable (AC3 — null until inspection resolved)", async () => {
    const { inspectionCases } = await import("../transfers");
    expect(hasColumn(inspectionCases, "resolvedAt")).toBe(true);
    expect(column(inspectionCases, "resolvedAt").notNull).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// inspection_evidence
// AC3: evidence capture for transfer (and inbound) inspection cases
// AC9: evidence access tests pass — inspectionCaseId FK enforces boundary
// ---------------------------------------------------------------------------

describe("transfers.ts — inspection_evidence table (AC3, AC9)", () => {
  it("is named 'inspection_evidence'", async () => {
    const { inspectionEvidence } = await import("../transfers");
    expect(tableName(inspectionEvidence)).toBe("inspection_evidence");
  });

  it("has inspectionCaseId notNull referencing inspection_cases.id (AC3, AC9)", async () => {
    const { inspectionEvidence } = await import("../transfers");
    expect(column(inspectionEvidence, "inspectionCaseId").notNull).toBe(true);
    expect(
      referencesTable(
        inspectionEvidence,
        "inspection_case_id",
        "inspection_cases",
        "id",
      ),
    ).toBe(true);
  });

  it("has evidenceType notNull (CHECK photo|note|measurement) (AC3)", async () => {
    const { inspectionEvidence } = await import("../transfers");
    expect(hasColumn(inspectionEvidence, "evidenceType")).toBe(true);
    expect(column(inspectionEvidence, "evidenceType").notNull).toBe(true);
  });

  it("has payload notNull (AC3 — URL for photo, text for note, JSON for measurement)", async () => {
    const { inspectionEvidence } = await import("../transfers");
    expect(column(inspectionEvidence, "payload").notNull).toBe(true);
  });

  it("has capturedBy notNull (AC9 — actor attribution)", async () => {
    const { inspectionEvidence } = await import("../transfers");
    expect(column(inspectionEvidence, "capturedBy").notNull).toBe(true);
  });

  it("has capturedAt notNull with default (AC3)", async () => {
    const { inspectionEvidence } = await import("../transfers");
    const capturedAt = column(inspectionEvidence, "capturedAt");
    expect(capturedAt.notNull).toBe(true);
    expect(capturedAt.hasDefault).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// inspection_dispositions
// AC3: "Transfer-specific non-conformance SHALL block completion or route to
//       an approved exception/resolution path using inspection_dispositions."
// AC9: lotLocationBalanceId FK enforces inventory boundary; appliedBy audit
// ---------------------------------------------------------------------------

describe("transfers.ts — inspection_dispositions table (AC3, AC9)", () => {
  it("is named 'inspection_dispositions'", async () => {
    const { inspectionDispositions } = await import("../transfers");
    expect(tableName(inspectionDispositions)).toBe("inspection_dispositions");
  });

  it("has inspectionCaseId notNull referencing inspection_cases.id (AC3)", async () => {
    const { inspectionDispositions } = await import("../transfers");
    expect(
      column(inspectionDispositions, "inspectionCaseId").notNull,
    ).toBe(true);
    expect(
      referencesTable(
        inspectionDispositions,
        "inspection_case_id",
        "inspection_cases",
        "id",
      ),
    ).toBe(true);
  });

  it("has dispositionType notNull (CHECK store|quarantine|return_to_party|hold|write_off|return_to_stock|reject|return_to_origin) (AC3)", async () => {
    const { inspectionDispositions } = await import("../transfers");
    expect(hasColumn(inspectionDispositions, "dispositionType")).toBe(true);
    expect(
      column(inspectionDispositions, "dispositionType").notNull,
    ).toBe(true);
  });

  it("has quantityAffected notNull (AC3 — split-disposition quantities must be exact)", async () => {
    const { inspectionDispositions } = await import("../transfers");
    expect(column(inspectionDispositions, "quantityAffected").notNull).toBe(
      true,
    );
  });

  it("has lotLocationBalanceId nullable referencing lot_location_balances.id (AC9)", async () => {
    const { inspectionDispositions } = await import("../transfers");
    expect(
      hasColumn(inspectionDispositions, "lotLocationBalanceId"),
    ).toBe(true);
    expect(
      column(inspectionDispositions, "lotLocationBalanceId").notNull,
    ).toBe(false);
    expect(
      referencesTable(
        inspectionDispositions,
        "lot_location_balance_id",
        "lot_location_balances",
        "id",
      ),
    ).toBe(true);
  });

  it("has notes nullable (AC3)", async () => {
    const { inspectionDispositions } = await import("../transfers");
    expect(hasColumn(inspectionDispositions, "notes")).toBe(true);
    expect(column(inspectionDispositions, "notes").notNull).toBe(false);
  });

  it("has appliedBy notNull (AC9 — actor attribution for disposition)", async () => {
    const { inspectionDispositions } = await import("../transfers");
    expect(column(inspectionDispositions, "appliedBy").notNull).toBe(true);
  });

  it("has appliedAt notNull with default (AC3, AC9)", async () => {
    const { inspectionDispositions } = await import("../transfers");
    const appliedAt = column(inspectionDispositions, "appliedAt");
    expect(appliedAt.notNull).toBe(true);
    expect(appliedAt.hasDefault).toBe(true);
  });
});
