import { describe, expect, it, vi } from "vitest";
import { listPartyOrganizationNames } from "../parties";

describe("listPartyOrganizationNames", () => {
  it("returns the complete sorted organization directory without duplicates or blanks", async () => {
    const orderBy = vi.fn().mockResolvedValue([
      { name: "UBoT Incorporated Limited" },
      { name: "TIPI" },
      { name: "UBoT Incorporated Limited" },
      { name: "  " },
      { name: null },
    ]);
    const from = vi.fn(() => ({ orderBy }));
    const select = vi.fn(() => ({ from }));

    await expect(listPartyOrganizationNames({ select })).resolves.toEqual([
      "TIPI",
      "UBoT Incorporated Limited",
    ]);
  });
});
