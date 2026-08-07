// RED-step schema tests for lib/db/schema/wrr.ts
// Traceability: specs/01-core-data-model/requirements.md Acceptance Criteria
// 5 (peza_number/commercial_invoice_no/ip_number on wrr_documents), 6
// (wrr_items.lot_number required, source of truth), 9 (cipl_file_url) and
// design.md §1.2 (`wrr_documents`, `wrr_items`, `wrr_inspection_logs`).
// Also covers the 2026-08-07 amendment adding `mawbMblNumber` to
// wrr_documents.
//
// Explicitly OUT OF SCOPE for this pass (per task instructions):
// `wrr_advance_notices` — separate, not-yet-independently-verified amendment
// (design.md §6), intentionally excluded here, matching the existing
// scaffolding note in lib/db/schema/wrr.ts.
import { describe, expect, it } from "vitest";
import { column, hasColumn, referencesTable, tableName } from "./helpers";

describe("wrr.ts — wrr_documents table (Req 5, 9)", () => {
  it("is named 'wrr_documents'", async () => {
    const { wrrDocuments } = await import("../wrr");
    expect(tableName(wrrDocuments)).toBe("wrr_documents");
  });

  it("has wrrNumber notNull + unique", async () => {
    const { wrrDocuments } = await import("../wrr");
    const wrrNumber = column(wrrDocuments, "wrrNumber");
    expect(wrrNumber.notNull).toBe(true);
    expect(wrrNumber.isUnique).toBe(true);
  });

  it("has nullable commercialInvoiceNo, ciplFileUrl, pezaNumber, ipNumber (Req 5, 9)", async () => {
    const { wrrDocuments } = await import("../wrr");
    for (const key of [
      "commercialInvoiceNo",
      "ciplFileUrl",
      "pezaNumber",
      "ipNumber",
    ]) {
      expect(hasColumn(wrrDocuments, key)).toBe(true);
      expect(column(wrrDocuments, key).notNull).toBe(false);
    }
  });

  it("has mawbMblNumber present and nullable (2026-08-07 amendment, mirrors pezaNumber/ipNumber)", async () => {
    const { wrrDocuments } = await import("../wrr");
    expect(hasColumn(wrrDocuments, "mawbMblNumber")).toBe(true);
    expect(column(wrrDocuments, "mawbMblNumber").notNull).toBe(false);
  });

  it("has vendorPartyId notNull referencing parties.id", async () => {
    const { wrrDocuments } = await import("../wrr");
    expect(column(wrrDocuments, "vendorPartyId").notNull).toBe(true);
    expect(
      referencesTable(wrrDocuments, "vendor_party_id", "parties", "id"),
    ).toBe(true);
  });

  it("has flowType notNull typed as flowTypeEnum", async () => {
    const { wrrDocuments } = await import("../wrr");
    const flowType = column(wrrDocuments, "flowType");
    expect(flowType.notNull).toBe(true);
    expect(flowType.enumValues).toEqual(["vmi", "trading", "supplies"]);
  });

  it("has status notNull default 'staged_pending_arrival' typed as wrrStatusEnum", async () => {
    const { wrrDocuments } = await import("../wrr");
    const status = column(wrrDocuments, "status");
    expect(status.notNull).toBe(true);
    expect(status.hasDefault).toBe(true);
    expect(status.enumValues).toEqual([
      "staged_pending_arrival",
      "receiving_in_progress",
      "confirmed",
      "cancelled",
    ]);
  });

  it("has stagedByUserId notNull; confirmedByUserId and confirmedAt nullable", async () => {
    const { wrrDocuments } = await import("../wrr");
    expect(column(wrrDocuments, "stagedByUserId").notNull).toBe(true);
    expect(column(wrrDocuments, "confirmedByUserId").notNull).toBe(false);
    expect(column(wrrDocuments, "confirmedAt").notNull).toBe(false);
  });

  it("has createdAt and updatedAt notNull with defaults", async () => {
    const { wrrDocuments } = await import("../wrr");
    for (const key of ["createdAt", "updatedAt"]) {
      const col = column(wrrDocuments, key);
      expect(col.notNull).toBe(true);
      expect(col.hasDefault).toBe(true);
    }
  });
});

describe("wrr.ts — wrr_items table (Req 6)", () => {
  it("is named 'wrr_items'", async () => {
    const { wrrItems } = await import("../wrr");
    expect(tableName(wrrItems)).toBe("wrr_items");
  });

  it("has wrrId notNull referencing wrr_documents.id", async () => {
    const { wrrItems, wrrDocuments } = await import("../wrr");
    expect(column(wrrItems, "wrrId").notNull).toBe(true);
    expect(
      referencesTable(wrrItems, "wrr_id", tableName(wrrDocuments), "id"),
    ).toBe(true);
  });

  it("has itemId nullable referencing items.id (CIPL may reference an unenrolled item)", async () => {
    const { wrrItems } = await import("../wrr");
    expect(hasColumn(wrrItems, "itemId")).toBe(true);
    expect(column(wrrItems, "itemId").notNull).toBe(false);
    expect(referencesTable(wrrItems, "item_id", "items", "id")).toBe(true);
  });

  it("has nullable itemCode and customerItemCode", async () => {
    const { wrrItems } = await import("../wrr");
    for (const key of ["itemCode", "customerItemCode"]) {
      expect(hasColumn(wrrItems, key)).toBe(true);
      expect(column(wrrItems, key).notNull).toBe(false);
    }
  });

  it("has lotNumber as notNull (Req 6: required for receipt confirmation)", async () => {
    const { wrrItems } = await import("../wrr");
    expect(column(wrrItems, "lotNumber").notNull).toBe(true);
  });

  it("has expectedQty notNull and scannedQty notNull default 0", async () => {
    const { wrrItems } = await import("../wrr");
    expect(column(wrrItems, "expectedQty").notNull).toBe(true);
    const scannedQty = column(wrrItems, "scannedQty");
    expect(scannedQty.notNull).toBe(true);
    expect(scannedQty.hasDefault).toBe(true);
  });

  it("has unitCbm and uom as notNull", async () => {
    const { wrrItems } = await import("../wrr");
    expect(column(wrrItems, "unitCbm").notNull).toBe(true);
    expect(column(wrrItems, "uom").notNull).toBe(true);
  });

  it("has createdAt notNull with default", async () => {
    const { wrrItems } = await import("../wrr");
    expect(column(wrrItems, "createdAt").notNull).toBe(true);
  });
});

describe("wrr.ts — wrr_inspection_logs table", () => {
  it("is named 'wrr_inspection_logs'", async () => {
    const { wrrInspectionLogs } = await import("../wrr");
    expect(tableName(wrrInspectionLogs)).toBe("wrr_inspection_logs");
  });

  it("has wrrId notNull referencing wrr_documents.id", async () => {
    const { wrrInspectionLogs, wrrDocuments } = await import("../wrr");
    expect(column(wrrInspectionLogs, "wrrId").notNull).toBe(true);
    expect(
      referencesTable(
        wrrInspectionLogs,
        "wrr_id",
        tableName(wrrDocuments),
        "id",
      ),
    ).toBe(true);
  });

  it("has wrrItemId nullable referencing wrr_items.id", async () => {
    const { wrrInspectionLogs, wrrItems } = await import("../wrr");
    expect(hasColumn(wrrInspectionLogs, "wrrItemId")).toBe(true);
    expect(column(wrrInspectionLogs, "wrrItemId").notNull).toBe(false);
    expect(
      referencesTable(
        wrrInspectionLogs,
        "wrr_item_id",
        tableName(wrrItems),
        "id",
      ),
    ).toBe(true);
  });

  it("has itemId notNull referencing items.id", async () => {
    const { wrrInspectionLogs } = await import("../wrr");
    expect(column(wrrInspectionLogs, "itemId").notNull).toBe(true);
    expect(referencesTable(wrrInspectionLogs, "item_id", "items", "id")).toBe(
      true,
    );
  });

  it("has vendorPartyId notNull referencing parties.id", async () => {
    const { wrrInspectionLogs } = await import("../wrr");
    expect(column(wrrInspectionLogs, "vendorPartyId").notNull).toBe(true);
    expect(
      referencesTable(wrrInspectionLogs, "vendor_party_id", "parties", "id"),
    ).toBe(true);
  });

  it("has inspectorUserId as notNull", async () => {
    const { wrrInspectionLogs } = await import("../wrr");
    expect(column(wrrInspectionLogs, "inspectorUserId").notNull).toBe(true);
  });

  it("has conformanceStatus notNull typed as conformanceStatusEnum", async () => {
    const { wrrInspectionLogs } = await import("../wrr");
    const conformanceStatus = column(wrrInspectionLogs, "conformanceStatus");
    expect(conformanceStatus.notNull).toBe(true);
    expect(conformanceStatus.enumValues).toEqual([
      "pending",
      "conformance",
      "non_conformance",
    ]);
  });

  it("has nullable nonConformanceReason typed as nonConformanceReasonEnum", async () => {
    const { wrrInspectionLogs } = await import("../wrr");
    const nonConformanceReason = column(
      wrrInspectionLogs,
      "nonConformanceReason",
    );
    expect(nonConformanceReason.notNull).toBe(false);
    expect(nonConformanceReason.enumValues).toEqual([
      "tdc_defect",
      "quantity_mismatch",
      "damaged_carton",
      "wrong_item_code",
      "missing_paperwork",
      "other",
    ]);
  });

  it("has nullable remarks, evidencePhotoUrl, actionTaken", async () => {
    const { wrrInspectionLogs } = await import("../wrr");
    for (const key of ["remarks", "evidencePhotoUrl", "actionTaken"]) {
      expect(hasColumn(wrrInspectionLogs, key)).toBe(true);
      expect(column(wrrInspectionLogs, key).notNull).toBe(false);
    }
  });

  it("has createdAt notNull with default", async () => {
    const { wrrInspectionLogs } = await import("../wrr");
    expect(column(wrrInspectionLogs, "createdAt").notNull).toBe(true);
  });
});
