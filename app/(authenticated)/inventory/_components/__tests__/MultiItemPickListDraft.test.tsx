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
  receivedAt: new Date("2026-01-01T00:00:00Z"),
  expiryDate: null,
  isPerishable: false,
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

    expect(screen.getByRole("status", { name: "Inventory Model" })).toHaveTextContent("VMI (Consignment)");
    expect(screen.getByText("Inherited from organization")).toBeInTheDocument();
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
    const recipientSelect = screen.getByRole("combobox", { name: "End Customer / Recipient" });
    fireEvent.change(recipientSelect, { target: { value: "party-end-customer" } });
    expect(recipientSelect).toHaveValue("party-end-customer");

    const itemSearch = screen.getAllByRole("combobox", { name: "Search item code" })[0];
    fireEvent.change(itemSearch, { target: { value: "SUP-ITEM" } });

    expect(screen.getByText("SUP-ITEM-1")).toBeInTheDocument();
    expect(screen.getByText("SPQ: 1")).toBeInTheDocument();
    expect(screen.getByText("UOM: piece")).toBeInTheDocument();
    expect(screen.getByText("CBM: 0.125")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /SUP-ITEM-1/ }));
    expect(itemSearch).toHaveValue("SUP-ITEM-1");
  });

  it("uses the displayed VMI item code when no separate supplier code is enrolled", () => {
    const stockWithoutSupplierCode = [{ ...stock[0], supplierItemCode: null }];

    render(
      <MultiItemPickListDraft
        stock={stockWithoutSupplierCode}
        customers={[{ id: "party-customer", code: "CUST-1", name: "Test customer", relationship: "vmi_customer" }]}
        endCustomers={[{ id: "party-end-customer", code: "END-1", name: "Test end customer" }]}
        createAction={vi.fn()}
        overrideAction={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "party-vmi-owner" } });
    fireEvent.change(screen.getByRole("combobox", { name: "End Customer / Recipient" }), { target: { value: "party-end-customer" } });

    const itemSearch = screen.getAllByRole("combobox", { name: "Search item code" })[0];
    fireEvent.change(itemSearch, { target: { value: "ITEM-1" } });

    const recommendation = screen.getByRole("button", { name: /ITEM-1/ });
    expect(recommendation).toBeEnabled();
    expect(within(recommendation).getByText("Available")).toBeInTheDocument();

    fireEvent.click(recommendation);
    expect(itemSearch).toHaveValue("ITEM-1");
    fireEvent.change(screen.getByLabelText("Qty (Boxes)"), { target: { value: "1" } });
    expect(screen.getByRole("button", { name: /Generate Pick List/i })).toBeEnabled();
  });

  it("defaults the requested boxes to the first FIFO location", () => {
    const stockWithSplitFifo = [
      { ...stock[0], availableQty: 10, balanceId: "balance-1", locationId: "location-1", locationLabel: "C1-10" },
      { ...stock[0], availableQty: 20, balanceId: "balance-2", locationId: "location-2", locationLabel: "C1-11" },
    ];

    render(
      <MultiItemPickListDraft
        stock={stockWithSplitFifo}
        customers={[{ id: "party-customer", code: "CUST-1", name: "Test customer", relationship: "vmi_customer" }]}
        endCustomers={[{ id: "party-end-customer", code: "END-1", name: "Test end customer" }]}
        createAction={vi.fn()}
        overrideAction={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "party-vmi-owner" } });
    fireEvent.change(screen.getByRole("combobox", { name: "End Customer / Recipient" }), { target: { value: "party-end-customer" } });
    const itemSearch = screen.getAllByRole("combobox", { name: "Search item code" })[0];
    fireEvent.change(itemSearch, { target: { value: "SUP-ITEM" } });
    fireEvent.click(screen.getByRole("button", { name: /SUP-ITEM-1/ }));
    fireEvent.change(screen.getAllByLabelText("Qty (Boxes)")[0], { target: { value: "5" } });

    expect(screen.getAllByLabelText("Boxes from C1-10").every((input) => (input as HTMLInputElement).value === "5")).toBe(true);
    expect(screen.queryByLabelText("Boxes from C1-11")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Allocated/).some((element) => element.parentElement?.textContent?.includes("5 / 5 boxes"))).toBe(true);
  });

  it("does not request approval when a split follows the normal FIFO plan", () => {
    const stockWithSplitFifo = [
      { ...stock[0], availableQty: 10, balanceId: "balance-1", locationId: "location-1", locationLabel: "C1-10" },
      { ...stock[0], availableQty: 20, balanceId: "balance-2", locationId: "location-2", locationLabel: "C1-11" },
    ];

    render(
      <MultiItemPickListDraft
        stock={stockWithSplitFifo}
        customers={[{ id: "party-customer", code: "CUST-1", name: "Test customer", relationship: "vmi_customer" }]}
        endCustomers={[{ id: "party-end-customer", code: "END-1", name: "Test end customer" }]}
        createAction={vi.fn()}
        overrideAction={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "party-vmi-owner" } });
    fireEvent.change(screen.getByRole("combobox", { name: "End Customer / Recipient" }), { target: { value: "party-end-customer" } });
    const itemSearch = screen.getAllByRole("combobox", { name: "Search item code" })[0];
    fireEvent.change(itemSearch, { target: { value: "SUP-ITEM" } });
    fireEvent.click(screen.getByRole("button", { name: /SUP-ITEM-1/ }));
    fireEvent.change(screen.getAllByLabelText("Qty (Boxes)")[0], { target: { value: "15" } });
    fireEvent.change(screen.getAllByLabelText("Add location within FIFO lot")[0], { target: { value: "balance-2" } });
    fireEvent.change(screen.getAllByLabelText("Boxes from C1-11")[0], { target: { value: "5" } });

    expect(screen.getAllByLabelText("Boxes from C1-10")[0]).toHaveValue(10);
    expect(screen.getAllByLabelText("Boxes from C1-11")[0]).toHaveValue(5);
    expect(screen.queryByText(/Supervisor approval required/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate Pick List/i })).toBeEnabled();
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
    fireEvent.change(screen.getByRole("combobox", { name: "End Customer / Recipient" }), { target: { value: "party-end-customer" } });

    const itemSearch = screen.getAllByRole("combobox", { name: "Search item code" })[0];
    fireEvent.change(itemSearch, { target: { value: "SUP-ITEM" } });
    fireEvent.click(screen.getByRole("button", { name: /SUP-ITEM-1/ }));

    fireEvent.change(screen.getByLabelText("Qty (Boxes)"), { target: { value: "20" } });
    fireEvent.change(screen.getAllByLabelText("Boxes from A4-01")[0], { target: { value: "20" } });

    expect(screen.getAllByText("2000")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Generate Pick List/i })).toBeEnabled();
    const request = screen.getByDisplayValue(/party-vmi-owner/) as HTMLInputElement;
    expect(JSON.parse(request.value).lines[0].qty).toBe(2000);
  });

  it("explains why VMI generation stays disabled until an end customer is selected", () => {
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

    expect(screen.getByRole("button", { name: /Generate Pick List/i })).toBeDisabled();
    expect(screen.getByText(/Required: select the downstream End Customer/)).toBeInTheDocument();
  });

  it("limits quantity to on-hand boxes, exposes source locations, and preserves Customer PN input", () => {
    const stockWithSources = [
      { ...stock[0], availableQty: 10, balanceId: "balance-1", locationId: "location-1", locationLabel: "A4-01" },
      { ...stock[0], availableQty: 5, balanceId: "balance-2", locationId: "location-2", locationLabel: "B2-05" },
    ];

    const { container } = render(
      <MultiItemPickListDraft
        stock={stockWithSources}
        customers={[{ id: "party-customer", code: "CUST-1", name: "Test customer", relationship: "vmi_customer" }]}
        endCustomers={[{ id: "party-end-customer", code: "END-1", name: "Test end customer" }]}
        createAction={vi.fn()}
        overrideAction={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "party-vmi-owner" } });
    fireEvent.change(screen.getByRole("combobox", { name: "End Customer / Recipient" }), { target: { value: "party-end-customer" } });

    const itemSearch = screen.getAllByRole("combobox", { name: "Search item code" })[0];
    fireEvent.change(itemSearch, { target: { value: "SUP-ITEM" } });
    fireEvent.click(screen.getByRole("button", { name: /SUP-ITEM-1/ }));

    const quantityInputs = screen.getAllByLabelText("Qty (Boxes)");
    fireEvent.change(quantityInputs[0], { target: { value: "20" } });
    expect(quantityInputs[0]).toHaveValue(15);

    expect(screen.getAllByRole("button", { name: "Use fixed location" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Use fixed location" })[0]);

    const locationSelectors = Array.from(container.querySelectorAll("select")).filter((select) =>
      select.textContent?.includes("Select a fixed location"),
    );
    expect(locationSelectors.length).toBeGreaterThan(0);
    expect(locationSelectors[0].textContent).toContain("A4-01");
    expect(locationSelectors[0].textContent).toContain("B2-05");

    fireEvent.change(locationSelectors[0], { target: { value: "balance-2" } });
    expect(quantityInputs[0]).toHaveValue(5);
    expect(screen.getAllByText(/Supervisor approval required for this source/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Insufficient/)).not.toBeInTheDocument();

    fireEvent.change(locationSelectors[0], { target: { value: "" } });

    const customerPnInputs = screen.getAllByTitle("Customer part number snapshot");
    fireEvent.change(customerPnInputs[0], { target: { value: "CUSTOMER-PN-42" } });

    const request = screen.getByDisplayValue(/party-vmi-owner/) as HTMLInputElement;
    expect(JSON.parse(request.value).lines[0].customerItemCode).toBe("CUSTOMER-PN-42");
  });

  it("lets the operator split one line across multiple locations with explicit box quantities", () => {
    const stockWithSources = [
      { ...stock[0], availableQty: 10, balanceId: "balance-1", locationId: "location-1", locationLabel: "A4-01" },
      { ...stock[0], availableQty: 5, balanceId: "balance-2", locationId: "location-2", locationLabel: "B2-05" },
    ];

    render(
      <MultiItemPickListDraft
        stock={stockWithSources}
        customers={[{ id: "party-customer", code: "CUST-1", name: "Test customer", relationship: "vmi_customer" }]}
        endCustomers={[{ id: "party-end-customer", code: "END-1", name: "Test end customer" }]}
        createAction={vi.fn()}
        overrideAction={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "party-vmi-owner" } });
    fireEvent.change(screen.getByRole("combobox", { name: "End Customer / Recipient" }), { target: { value: "party-end-customer" } });

    const itemSearch = screen.getAllByRole("combobox", { name: "Search item code" })[0];
    fireEvent.change(itemSearch, { target: { value: "SUP-ITEM" } });
    fireEvent.click(screen.getByRole("button", { name: /SUP-ITEM-1/ }));
    fireEvent.change(screen.getAllByLabelText("Qty (Boxes)")[0], { target: { value: "2" } });

    fireEvent.change(screen.getAllByLabelText("Add location within FIFO lot")[0], { target: { value: "balance-2" } });
    const firstLocationBoxes = screen.getAllByLabelText("Boxes from A4-01")[0];
    const secondLocationBoxes = screen.getAllByLabelText("Boxes from B2-05")[0];
    fireEvent.change(firstLocationBoxes, { target: { value: "1" } });
    fireEvent.change(secondLocationBoxes, { target: { value: "1" } });

    const request = screen.getByDisplayValue(/party-vmi-owner/) as HTMLInputElement;
    expect(JSON.parse(request.value).lines.map((line: { locationId: string; qty: number }) => [line.locationId, line.qty])).toEqual([
      ["location-1", 1],
      ["location-2", 1],
    ]);
  });

  it("keeps the starter row disabled until the required recipient is selected, then uses Add item line for line two", () => {
    render(
      <MultiItemPickListDraft
        stock={stock}
        customers={[{ id: "party-customer", code: "CUST-1", name: "Test customer", relationship: "vmi_customer" }]}
        endCustomers={[{ id: "party-end-customer", code: "END-1", name: "Test end customer" }]}
        createAction={vi.fn()}
        overrideAction={vi.fn()}
      />,
    );

    const itemSearch = screen.getAllByRole("combobox", { name: "Search item code" })[0];
    expect(itemSearch).toBeDisabled();
    expect(screen.getByRole("button", { name: /Add item line/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "party-vmi-owner" } });
    fireEvent.change(screen.getByRole("combobox", { name: "End Customer / Recipient" }), { target: { value: "party-end-customer" } });

    expect(screen.getAllByRole("combobox", { name: "Search item code" })[0]).toBeEnabled();
    expect(screen.getByRole("button", { name: /Add item line/i })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: /Add item line/i }));
    expect(screen.getByText("2 lines")).toBeInTheDocument();
  });
});
