import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseOpeningStockFile, commitOpeningStockMigration, type ValidatedOpeningStockRow } from "../inventory-migration";
import type { AuthorizationContext, AuthorizationResolution, RequestAuthorizationResolver } from "@/lib/rbac/session";
import { mockRlsDeps } from "@/lib/db/__tests__/helpers/mock-rls";

function makeResolver(resolution: AuthorizationResolution): RequestAuthorizationResolver {
  return {
    getContext: vi.fn(async () => resolution),
  };
}

const confirmContext: AuthorizationContext = {
  userId: "user-uuid-admin",
  profileStatus: "active",
  activeRoleKeys: ["administrator"],
  grants: [
    { resource: "receiving", action: "confirm", scopeKind: "global" },
    { resource: "receiving", action: "scan", scopeKind: "global" },
  ],
  partyScopes: [],
};

const unauthorizedContext: AuthorizationContext = {
  userId: "user-uuid-viewer",
  profileStatus: "active",
  activeRoleKeys: ["viewer"],
  grants: [
    { resource: "inventory", action: "read", scopeKind: "global" },
  ],
  partyScopes: [],
};

describe("Opening Stock Migration (Excel/CSV Bulk Import)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses valid CSV opening stock file and validates boxes and SPQ", async () => {
    const csvContent =
      "Item Code,Lot Number,Location Code,Boxes Count,SPQ,Expiry Date\n" +
      "ITEM-001,LOT-A,LOC-01,10,50,2028-01-01\n" +
      "ITEM-002,LOT-B,LOC-02,5,20,2029-05-15\n";

    const file = new File([csvContent], "opening_stock.csv", { type: "text/csv" });
    const formData = new FormData();
    formData.set("file", file);

    const result = await parseOpeningStockFile(formData);
    expect(result.fileName).toBe("opening_stock.csv");
    expect(result.rows.length).toBe(2);
    expect(result.rows[0].itemCode).toBe("ITEM-001");
    expect(result.rows[0].locationCode).toBe("LOC-01");
    expect(result.rows[0].boxes).toBe(10);
    expect(result.rows[0].spq).toBe(50);
  });

  it("handles unsupported file extensions gracefully", async () => {
    const file = new File(["dummy"], "opening_stock.txt", { type: "text/plain" });
    const formData = new FormData();
    formData.set("file", file);

    const result = await parseOpeningStockFile(formData);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("Unsupported file format");
  });

  it("handles missing file gracefully", async () => {
    const formData = new FormData();
    const result = await parseOpeningStockFile(formData);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("No file uploaded");
  });

  it("commits valid opening stock lines transactionally and creates WRR document", async () => {
    const resolver = makeResolver({ kind: "authenticated", context: confirmContext });

    const mockRows: ValidatedOpeningStockRow[] = [
      {
        itemCode: "VALVE-01",
        itemName: "Solenoid Valve",
        itemId: "item-uuid-1",
        lotNumber: "LOT-2026-X",
        locationCode: "A-01-01",
        locationId: "loc-uuid-1",
        boxes: 12,
        spq: 50,
        spqResolved: 50,
        totalQty: 600,
        uom: "PCS",
        isValid: true,
        flowType: "trading",
      },
    ];

    const mockTx = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue({}),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue({}),
        }),
      }),
      transaction: vi.fn(),
    };

    const { deps: rlsDeps } = mockRlsDeps(mockTx, { userId: "user-uuid-admin" });

    const result = await commitOpeningStockMigration(
      resolver,
      mockRows,
      "Test Opening Stock",
      rlsDeps
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.wrrNumber).toContain("WRR-INIT-");
      expect(result.committedRows).toBe(1);
    }
  });

  it("rejects unauthorized users from committing opening stock", async () => {
    const resolver = makeResolver({ kind: "authenticated", context: unauthorizedContext });

    const result = await commitOpeningStockMigration(
      resolver,
      [],
      "Test",
      {} as unknown as Parameters<typeof commitOpeningStockMigration>[3]
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toContain("Forbidden");
    }
  });
});
