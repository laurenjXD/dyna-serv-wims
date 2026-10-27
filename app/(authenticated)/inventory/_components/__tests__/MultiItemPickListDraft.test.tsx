// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MultiItemPickListDraft } from "../MultiItemPickListDraft";

vi.mock("../../_actions", () => ({
  parseDraDocumentAction: vi.fn(),
}));

const stock = [{
  itemId: "item-1",
  itemCode: "ITEM-1",
  itemName: "Test item",
  customerItemCode: null,
  organizationId: "party-vmi-owner",
  organizationName: "VMI Owner Organization",
  flowType: "vmi" as const,
  uom: "piece",
  spq: 1,
  balanceId: "balance-1",
  lotId: "lot-1",
  lotNumber: "LOT-1",
  locationId: "location-1",
  locationLabel: "A4-01",
  availableQty: 10,
  priority: 1,
}];

describe("MultiItemPickListDraft organization selection", () => {
  it("renders the organization linked to available stock and its inventory model", () => {
    render(
      <MultiItemPickListDraft
        stock={stock}
        customers={[{ id: "party-customer", code: "CUST-1", name: "Test customer", relationship: "vmi_customer" }]}
        endCustomers={[{ id: "party-end-customer", code: "END-1", name: "Test end customer" }]}
        createAction={vi.fn()}
        overrideAction={vi.fn()}
      />,
    );

    const organizationSelect = screen.getByLabelText("Organization");
    expect(screen.getByRole("option", { name: "VMI Owner Organization" })).toBeInTheDocument();

    fireEvent.change(organizationSelect, { target: { value: "party-vmi-owner" } });

    expect(screen.getByRole("option", { name: "VMI (Consignment)" })).toBeInTheDocument();
  });

  it("places required entry columns before inherited and reference columns", () => {
    render(
      <MultiItemPickListDraft
        stock={stock}
        customers={[{ id: "party-customer", code: "CUST-1", name: "Test customer", relationship: "vmi_customer" }]}
        endCustomers={[{ id: "party-end-customer", code: "END-1", name: "Test end customer" }]}
        createAction={vi.fn()}
        overrideAction={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "party-vmi-owner" } });

    const headers = within(screen.getByRole("table", { name: "Pick list lines" }))
      .getAllByRole("columnheader")
      .map((header) => header.textContent?.replace(/\s+/g, " ").trim());

    expect(headers.slice(0, 10)).toEqual([
      "Item Code",
      "SPQ",
      "Qty (Units)",
      "Number of Boxes",
      "Location",
      "Remaining",
      "Cust PN",
      "Item Description",
      "Lot Number",
      "Mfg Date",
    ]);
  });
});
