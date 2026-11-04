import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseDraDocumentAction } from "../_actions";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { parseDraDocument } from "@/lib/parsers/dra-parser";

vi.mock("@/lib/auth/page-resolver", () => ({ createPageResolver: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/actions/withdrawals", () => ({ commitWithdrawal: vi.fn() }));
vi.mock("@/lib/parsers/dra-parser", () => ({ parseDraDocument: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const parsed = {
  ok: true, fileName: "release.csv", header: {}, rows: [{ itemCode: "ABC-123", requestedQty: 20, uom: "PCS" }], errors: [], warnings: [],
};

function upload(name = "release.csv", contents: BlobPart = "Item Code,Requested Qty\nABC-123,20"): FormData {
  const data = new FormData();
  data.set("file", new File([contents], name));
  return data;
}

describe("R1.8 authorized DRA file import boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createPageResolver).mockResolvedValue({ actorId: "actor-1" } as never);
    vi.mocked(requirePermission).mockResolvedValue({ kind: "authorized" } as never);
    vi.mocked(parseDraDocument).mockResolvedValue(parsed);
  });

  it("requires pick-list generation permission before processing an uploaded document", async () => {
    vi.mocked(requirePermission).mockResolvedValueOnce({ kind: "forbidden" } as never);
    const result = await parseDraDocumentAction(upload());

    expect(result.ok).toBe(false);
    expect(requirePermission).toHaveBeenCalledWith(expect.anything(), "pick_list.generate");
    expect(parseDraDocument).not.toHaveBeenCalled();
  });

  it.each([
    ["empty.csv", ""],
    ["release.exe", "content"],
    ["release.xlsx", new Uint8Array(10 * 1024 * 1024 + 1)],
  ])("rejects an empty, unsupported, or oversized upload (%s) before parsing", async (name, contents) => {
    const result = await parseDraDocumentAction(upload(name, contents));
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(parseDraDocument).not.toHaveBeenCalled();
  });

  it("passes the reviewed sheet/header/column mappings to the parser", async () => {
    const data = upload();
    const options = { sheetName: "Release", headerRowIndex: 2, columnMap: { itemCode: 0, packageCount: 4 } };
    data.set("options", JSON.stringify(options));

    const result = await parseDraDocumentAction(data);

    expect(result.ok).toBe(true);
    expect(parseDraDocument).toHaveBeenCalledWith(expect.any(Buffer), "release.csv", options);
  });

  it.each([
    "not json",
    JSON.stringify({ headerRowIndex: -1 }),
    JSON.stringify({ columnMap: { requestedQty: -1 } }),
    JSON.stringify({ columnMap: { requestedQty: 1.2 } }),
  ])("rejects invalid mapping options instead of parsing with guessed defaults", async (options) => {
    const data = upload();
    data.set("options", options);
    const result = await parseDraDocumentAction(data);

    expect(result.ok).toBe(false);
    expect(parseDraDocument).not.toHaveBeenCalled();
  });

  it("retains spreadsheet review metadata after parser rejection without claiming a successful import", async () => {
    const rejected = {
      ...parsed, ok: false, rows: [], errors: ["Choose item and quantity columns."],
      spreadsheet: { sheetNames: ["Release"], sheetName: "Release", headerRowIndex: 0, columns: [{ index: 0, label: "Reference" }], columnMap: {} },
    };
    vi.mocked(parseDraDocument).mockResolvedValueOnce(rejected);

    const result = await parseDraDocumentAction(upload());

    expect(result.ok).toBe(false);
    expect(result.parseResult).toEqual(rejected);
    expect(result.error).toBeTruthy();
  });

  it("returns a useful safe failure without exposing an internal exception", async () => {
    vi.mocked(parseDraDocument).mockRejectedValueOnce(new Error("postgres://secret:password@internal-host 28P01"));
    const result = await parseDraDocumentAction(upload());

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error).not.toMatch(/secret|password|internal-host|28P01|postgres/i);
  });
});
