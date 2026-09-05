/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import {
  requestDocumentReprint,
  retryDocumentGeneration,
} from "../documents";

const authorizedResolver: any = {
  getContext: vi.fn().mockResolvedValue({
    kind: "authorized",
    context: {
      session: { userId: "user-123", email: "staff@dyna-serv.com" },
      grants: [{ resource: "documents", action: "read", scopeKind: "global" }],
    },
  }),
};

const unauthorizedResolver: any = {
  getContext: vi.fn().mockResolvedValue({
    kind: "authorized",
    context: {
      session: { userId: "user-456", email: "guest@dyna-serv.com" },
      grants: [{ resource: "receiving", action: "view", scopeKind: "global" }],
    },
  }),
};

describe("lib/actions/documents server actions suite", () => {
  it("requestDocumentReprint rejects unauthorized caller", async () => {
    const result = await requestDocumentReprint(unauthorizedResolver, {
      documentId: "doc-1",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("PERMISSION_DENIED");
    }
  });

  it("requestDocumentReprint fails if document not found", async () => {
    const mockDb: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    };

    const result = await requestDocumentReprint(
      authorizedResolver,
      { documentId: "doc-missing" },
      mockDb,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("DOCUMENT_NOT_FOUND");
    }
  });

  it("requestDocumentReprint logs document_events and returns watermark when ready", async () => {
    const mockDoc = {
      id: "doc-1",
      documentNumber: "PL-2026-000001",
      documentType: "pick_list",
      status: "ready",
      artifactPath: "pick-lists/pl-1/v1/pick-list.pdf",
    };

    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue({}),
    });

    const mockDb: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockDoc]),
          }),
        }),
      }),
      insert: mockInsert,
    };

    const result = await requestDocumentReprint(
      authorizedResolver,
      { documentId: "doc-1", reason: "Damaged paper copy" },
      mockDb,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.documentNumber).toBe("PL-2026-000001");
      expect(result.data.watermarkText).toContain("REPRINT —");
    }
    expect(mockInsert).toHaveBeenCalled();
  });

  it("retryDocumentGeneration updates status to pending and logs retry event", async () => {
    const mockDoc = {
      id: "doc-failed",
      documentNumber: "AR-2026-000001",
      status: "failed",
    };

    const mockUpdate = vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      }),
    });

    const mockInsert = vi.fn().mockReturnValue({
      values: vi.fn().mockResolvedValue({}),
    });

    const mockDb: any = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockDoc]),
          }),
        }),
      }),
      update: mockUpdate,
      insert: mockInsert,
    };

    const result = await retryDocumentGeneration(
      authorizedResolver,
      "doc-failed",
      mockDb,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.status).toBe("pending");
    }
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
  });
});
