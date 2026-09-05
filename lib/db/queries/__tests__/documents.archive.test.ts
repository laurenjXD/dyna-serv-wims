/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import {
  listWrrArchiveDocuments,
  listPickListArchiveDocuments,
  listAcknowledgementReceiptArchiveDocuments,
  listStatementOfAccountArchiveDocuments,
  listPezaArchiveDocuments,
} from "../documents";

describe("lib/db/queries/documents archive query suite", () => {
  it("listWrrArchiveDocuments executes and maps database rows correctly", async () => {
    const mockRows = [
      {
        id: "wrr-1",
        wrrNumber: "WRR-2026-00001",
        commercialInvoiceNo: "CIPL-1001",
        ciplFileUrl: "https://storage/cipl-1001.pdf",
        pezaNumber: "PEZA-8105-01",
        ipNumber: "IP-001",
        mawbMblNumber: "MAWB-999",
        vendorPartyId: "vendor-1",
        vendorPartyName: "Acme Logistics",
        vendorPartyCode: "ACME",
        flowType: "vmi",
        status: "completed",
        stagedByUserName: "John Warehouse",
        confirmedAt: new Date("2026-08-01T10:00:00Z"),
        createdAt: new Date("2026-08-01T08:00:00Z"),
        itemCount: 5,
        totalQuantity: 250,
      },
    ];

    const mockDb: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue(mockRows),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const result = await listWrrArchiveDocuments(mockDb, {
      partyId: "vendor-1",
      search: "WRR-2026",
    });

    expect(result).toHaveLength(1);
    expect(result[0].wrrNumber).toBe("WRR-2026-00001");
    expect(result[0].vendorPartyName).toBe("Acme Logistics");
    expect(result[0].itemCount).toBe(5);
    expect(result[0].totalQuantity).toBe(250);
  });

  it("listPickListArchiveDocuments executes and maps database rows correctly", async () => {
    const mockRows = [
      {
        id: "gen-doc-1",
        pickListId: "pl-1",
        documentNumber: "PL-2026-000001",
        pickListNumber: "PL-2026-000001",
        customerPartyId: "cust-1",
        customerPartyName: "Nexus Distribution",
        customerPartyCode: "NEXUS",
        flowType: "trading",
        status: "ready",
        pickListStatus: "dispatched",
        snapshotHash: "hash123456",
        artifactPath: "pick-lists/pl-1/v1/pick-list.pdf",
        createdByName: "Alice Planner",
        generatedAt: new Date("2026-08-02T12:00:00Z"),
        createdAt: new Date("2026-08-02T11:00:00Z"),
        itemCount: 3,
        packageCount: 15,
        totalQuantity: 150,
      },
    ];

    const mockDb: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                leftJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockReturnValue({
                    orderBy: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        offset: vi.fn().mockResolvedValue(mockRows),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const result = await listPickListArchiveDocuments(mockDb, {
      search: "PL-2026",
    });

    expect(result).toHaveLength(1);
    expect(result[0].documentNumber).toBe("PL-2026-000001");
    expect(result[0].customerPartyName).toBe("Nexus Distribution");
    expect(result[0].packageCount).toBe(15);
  });

  it("listAcknowledgementReceiptArchiveDocuments executes and maps database rows correctly", async () => {
    const mockRows = [
      {
        id: "gen-doc-2",
        pickListId: "pl-2",
        documentNumber: "AR-2026-000001",
        pickListNumber: "PL-2026-000002",
        customerPartyId: "cust-1",
        customerPartyName: "Nexus Distribution",
        customerPartyCode: "NEXUS",
        flowType: "trading",
        currency: "PHP",
        status: "ready",
        snapshotHash: "hashar123",
        artifactPath: "acknowledgement-receipts/pl-2/v1/ack-receipt.pdf",
        dispatchedByName: "Bob Dispatcher",
        generatedAt: new Date("2026-08-03T14:00:00Z"),
        createdAt: new Date("2026-08-03T14:00:00Z"),
        itemCount: 4,
        totalQuantity: 200,
        totalAmount: 125000.5,
      },
    ];

    const mockDb: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            innerJoin: vi.fn().mockReturnValue({
              innerJoin: vi.fn().mockReturnValue({
                leftJoin: vi.fn().mockReturnValue({
                  where: vi.fn().mockReturnValue({
                    orderBy: vi.fn().mockReturnValue({
                      limit: vi.fn().mockReturnValue({
                        offset: vi.fn().mockResolvedValue(mockRows),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const result = await listAcknowledgementReceiptArchiveDocuments(mockDb, {
      search: "AR-2026",
    });

    expect(result).toHaveLength(1);
    expect(result[0].documentNumber).toBe("AR-2026-000001");
    expect(result[0].totalAmount).toBe(125000.5);
    expect(result[0].currency).toBe("PHP");
  });

  it("listStatementOfAccountArchiveDocuments executes and maps database rows correctly", async () => {
    const mockRows = [
      {
        id: "soa-1",
        periodNumber: "SOA-2026-06-NEXUS",
        partyId: "cust-1",
        partyName: "Nexus Distribution",
        partyCode: "NEXUS",
        periodStartDate: "2026-06-01",
        periodEndDate: "2026-06-30",
        storageChargeUsd: 1200.5,
        handlingInUsd: 300,
        handlingOutUsd: 400,
        documentationUsd: 50,
        deliveryUsd: 250,
        recurringFeesUsd: 100,
        adHocChargesUsd: 0,
        billingStatementTotalUsd: 2300.5,
        lockedExchangeRatePhp: 58.5,
        status: "issued",
        soaArtifactId: "art-1",
        closedByUserName: "Finance Manager",
        closedAt: new Date("2026-07-01T08:00:00Z"),
        createdAt: new Date("2026-07-01T08:00:00Z"),
      },
    ];

    const mockDb: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue(mockRows),
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const result = await listStatementOfAccountArchiveDocuments(mockDb, {
      partyId: "cust-1",
    });

    expect(result).toHaveLength(1);
    expect(result[0].periodNumber).toBe("SOA-2026-06-NEXUS");
    expect(result[0].billingStatementTotalUsd).toBe(2300.5);
    expect(result[0].lockedExchangeRatePhp).toBe(58.5);
  });

  it("listPezaArchiveDocuments executes and maps database rows correctly", async () => {
    const mockRows = [
      {
        id: "permit-1",
        permitNumber: "ELSE-LTP1-IE-007994-26E",
        itemScope: "Reel, carrier tape, tray",
        partyId: "cust-1",
        partyName: "Nexus Distribution",
        partyCode: "NEXUS",
        validFrom: new Date("2026-01-01"),
        validTo: new Date("2026-12-31"),
        isActive: true,
        createdAt: new Date("2026-01-01"),
      },
    ];

    const mockDb: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue(mockRows),
                }),
              }),
            }),
          }),
        }),
      }),
    };

    const result = await listPezaArchiveDocuments(mockDb, {
      status: "active",
    });

    expect(result).toHaveLength(1);
    expect(result[0].permitNumber).toBe("ELSE-LTP1-IE-007994-26E");
    expect(result[0].status).toBe("active");
  });
});
