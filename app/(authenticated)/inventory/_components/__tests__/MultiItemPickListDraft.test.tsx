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
  supplierItemCode: "SUP-ITEM-1",
  customerItemCode: null,
  organizationId: "party-vmi-owner",
  organizationName: "VMI Owner Organization",
  flowType: "vmi" as const,
  uom: "piece",
  volumeCbm: "0.125",
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
    expect(screen.queryByText("VMI Customer / Stock Owner")).not.toBeInTheDocument();
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
      "Qty (Boxes)",
      "Qty (Units)",
      "Location",
      "Remaining",
      "Cust PN",
      "Item Description",
      "Lot Number",
      "Mfg Date",
    ]);
  });

  it("searches pick-list items and shows the enrolled item details", () => {
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
    fireEvent.click(screen.getByRole("button", { name: /Add item line/i }));

    const itemSearch = screen.getAllByRole("combobox", { name: "Search item code" })[0];
    fireEvent.change(itemSearch, { target: { value: "SUP-ITEM" } });

    expect(screen.getByText("SUP-ITEM-1")).toBeInTheDocument();
    expect(screen.getByText("SPQ: 1")).toBeInTheDocument();
    expect(screen.getByText("UOM: piece")).toBeInTheDocument();
    expect(screen.getByText("CBM: 0.125")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /SUP-ITEM-1/ }));
    expect(itemSearch).toHaveValue("SUP-ITEM-1");
  });

  it("accepts boxes and derives the base-unit quantity from SPQ", () => {
    const boxedStock = [{ ...stock[0], spq: 100, availableQty: 2000 }];

    render(
      <MultiItemPickListDraft
        stock={boxedStock}
        customers={[{ id: "party-customer", code: "CUST-1", name: "Test customer", relationship: "vmi_customer" }]}
        endCustomers={[{ id: "party-end-customer", code: "END-1", name: "Test end customer" }]}
        createAction={vi.fn()}
        overrideAction={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "party-vmi-owner" } });
    fireEvent.change(screen.getAllByRole("combobox")[1], { target: { value: "party-end-customer" } });
    fireEvent.click(screen.getByRole("button", { name: /Add item line/i }));

    const itemSearch = screen.getAllByRole("combobox", { name: "Search item code" })[0];
    fireEvent.change(itemSearch, { target: { value: "SUP-ITEM" } });
    fireEvent.click(screen.getByRole("button", { name: /SUP-ITEM-1/ }));

    fireEvent.change(screen.getByLabelText("Qty (Boxes)"), { target: { value: "20" } });

    expect(screen.getAllByText("2000")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Generate Pick List/i })).toBeEnabled();
    const request = screen.getByDisplayValue(/party-vmi-owner/) as HTMLInputElement;
    expect(JSON.parse(request.value).lines[0].qty).toBe(2000);
  });
});
