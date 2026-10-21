import { describe, expect, it, vi } from "vitest";
import { listPartyOrganizationNames } from "../parties";

describe("listPartyOrganizationNames", () => {
  it("returns the complete sorted organization directory without duplicates or blanks", async () => {
    const orderBy = vi.fn().mockResolvedValue([
      { name: "UBoT Incorporated Limited", role: "supplier" },
      { name: "TIPI", role: "end_customer" },
      { name: "UBoT Incorporated Limited", role: "supplier" },
      { name: "Customer Co.", role: "customer" },
      { name: "  ", role: null },
      { name: null, role: null },
    ]);
    const leftJoin = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ leftJoin }));
    const select = vi.fn(() => ({ from }));

    await expect(listPartyOrganizationNames({ select })).resolves.toEqual([
      "Customer Co.",
      "UBoT Incorporated Limited",
    ]);
  });
});
