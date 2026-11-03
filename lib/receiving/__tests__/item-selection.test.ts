import { describe, expect, it } from "vitest";
import type { WrrItemOption } from "@/lib/db/queries/items";
import { filterReceivingItemOptions } from "@/lib/receiving/item-selection";

const item = (id: string, defaultSupplierPartyId: string | null): WrrItemOption => ({
  id,
  defaultSupplierPartyId,
  code: id,
  name: `Item ${id}`,
  description: null,
  supplierItemCode: null,
  customerItemCode: null,
  dsgcItemNumber: null,
  uom: "piece",
  volumeCbm: "0.0010",
  spq: 1,
  isPerishable: false,
});

describe("filterReceivingItemOptions", () => {
  it("keeps items assigned to the selected organization and legacy unassigned items", () => {
    const result = filterReceivingItemOptions([
      item("assigned", "vendor-1"),
      item("other-vendor", "vendor-2"),
      item("unassigned", null),
    ], "vendor-1");

    expect(result.map((entry) => entry.id)).toEqual(["assigned", "unassigned"]);
  });

  it("returns no items until an organization is selected", () => {
    expect(filterReceivingItemOptions([item("unassigned", null)], "")).toEqual([]);
  });
});
