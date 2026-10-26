import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const { mockDb, mockCreatePageResolver, mockRequirePermission } = vi.hoisted(() => ({
  mockDb: { select: vi.fn() },
  mockCreatePageResolver: vi.fn(),
  mockRequirePermission: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ db: mockDb }));
vi.mock("@/lib/auth/page-resolver", () => ({ createPageResolver: mockCreatePageResolver }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mockRequirePermission }));

import { exportRawTransactionsCsvAction, generateCustomReportAction } from "../reports";

describe("report export actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreatePageResolver.mockResolvedValue({});
    mockRequirePermission.mockResolvedValue({ kind: "authorized" });
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([{
            txNumber: "TX,001",
            movementType: "IN",
            flowType: "VMI",
            qty: 4,
            commercialInvoiceNo: 'INV-"A',
            arReferenceNo: null,
            createdAt: new Date("2026-10-26T00:00:00.000Z"),
          }]),
        }),
      }),
    });
  });

  it("returns escaped CSV with a CSV filename", async () => {
    const result = await exportRawTransactionsCsvAction("csv");

    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/\.csv$/);
    expect(result.csvContent).toContain('"TX,001"');
    expect(result.csvContent).toContain('"INV-""A"');
    expect(result.mimeType).toBe("text/csv;charset=utf-8;");
  });

  it("returns an actual XLSX workbook when the workbook format is requested", async () => {
    const result = await exportRawTransactionsCsvAction("xlsx");

    expect(result.success).toBe(true);
    expect(result.filename).toMatch(/\.xlsx$/);
    expect(result.csvContent).toBeUndefined();
    expect(result.fileContentBase64).toBeTruthy();

    const workbook = XLSX.read(Buffer.from(result.fileContentBase64!, "base64"), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<string[]>(workbook.Sheets.Transactions, { header: 1 });
    expect(rows[0]).toEqual([
      "Transaction Number",
      "Movement Type",
      "Flow Type",
      "Quantity",
      "Commercial Invoice",
      "AR Reference",
      "Timestamp",
    ]);
    expect(rows[1]?.[0]).toBe("TX,001");
  });

  it("does not claim custom report generation succeeded without artifact persistence", async () => {
    const result = await generateCustomReportAction({
      title: "Test report",
      category: "Operational",
      format: "PDF",
      metrics: ["Volume"],
      dimensions: ["Item"],
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/artifact persistence/i);
  });
});
