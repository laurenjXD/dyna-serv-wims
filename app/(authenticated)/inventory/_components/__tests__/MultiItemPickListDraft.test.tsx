// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseDraDocumentAction } from "../../_actions";
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

    expect(headers.slice(0, 11)).toEqual([
      "Item Code",
      "SPQ",
      "Qty (Boxes)",
      "Qty (Units)",
      "Location",
      "Cust PN",
      "Item Description",
      "Lot Number",
      "Mfg Date",
      "Actions",
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
    expect(screen.getAllByLabelText("Allocation summary").some((element) => element.textContent?.includes("Allocated: 5"))).toBe(true);
  });

  it("tops up existing FIFO locations when demand increases", () => {
    const splitStock = [
      { ...stock[0], availableQty: 10, balanceId: "balance-1", locationId: "location-1", locationLabel: "C1-10" },
      { ...stock[0], availableQty: 20, balanceId: "balance-2", locationId: "location-2", locationLabel: "C1-11" },
    ];
    render(<MultiItemPickListDraft stock={splitStock} customers={[{ id: "party-customer", code: "CUST-1", name: "Test customer", relationship: "vmi_customer" }]} endCustomers={[{ id: "party-end-customer", code: "END-1", name: "Test end customer" }]} createAction={vi.fn()} overrideAction={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Organization"), { target: { value: "party-vmi-owner" } });
    fireEvent.change(screen.getByRole("combobox", { name: "End Customer / Recipient" }), { target: { value: "party-end-customer" } });
    const search = screen.getAllByRole("combobox", { name: "Search item code" })[0];
    fireEvent.change(search, { target: { value: "SUP-ITEM" } });
    fireEvent.click(screen.getByRole("button", { name: /SUP-ITEM-1/ }));
    const qty = screen.getByLabelText("Qty (Boxes)");
    fireEvent.change(qty, { target: { value: "3" } });
    fireEvent.change(screen.getAllByLabelText("Boxes from C1-10")[0], { target: { value: "3" } });
    fireEvent.change(qty, { target: { value: "30" } });
    expect(screen.getAllByLabelText("Boxes from C1-10").every((input) => (input as HTMLInputElement).value === "10")).toBe(true);
    expect(screen.getAllByLabelText("Boxes from C1-11").every((input) => (input as HTMLInputElement).value === "20")).toBe(true);
  });

  it("allocates FEFO lot-first across locations and only uses the later lot for the remainder", () => {
    const perishableStock = [
      { ...stock[0], isPerishable: true, expiryDate: "2026-05-01", receivedAt: new Date("2026-10-20T09:30:00Z"), availableQty: 2, balanceId: "early-1", lotId: "lot-early", lotNumber: "LOT-EARLY", locationId: "loc-z", locationLabel: "Z1-01" },
      { ...stock[0], isPerishable: true, expiryDate: "2026-05-01", receivedAt: new Date("2026-10-20T09:30:00Z"), availableQty: 3, balanceId: "early-2", lotId: "lot-early", lotNumber: "LOT-EARLY", locationId: "loc-a", locationLabel: "A1-01" },
      { ...stock[0], isPerishable: true, expiryDate: "2026-06-01", receivedAt: new Date("2026-10-20T09:30:00Z"), availableQty: 10, balanceId: "late-1", lotId: "lot-late", lotNumber: "LOT-LATE", locationId: "loc-b", locationLabel: "B1-01" },
    ];

    render(
      <MultiItemPickListDraft
        stock={perishableStock}
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
    fireEvent.change(screen.getAllByLabelText("Qty (Boxes)")[0], { target: { value: "12" } });

    expect(screen.getAllByLabelText("Boxes from A1-01")[0]).toHaveValue(3);
    expect(screen.getAllByLabelText("Boxes from Z1-01")[0]).toHaveValue(2);
    expect(screen.getAllByLabelText("Boxes from B1-01")[0]).toHaveValue(7);
    expect(screen.getByRole("button", { name: /Generate Pick List/i })).toBeEnabled();
  });

  it("automatically fills the next FIFO location when the requested quantity exceeds the first location", () => {
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

  it("preserves requested quantity when a fixed location is too small and recovers through FIFO split", () => {
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
    fireEvent.change(quantityInputs[0], { target: { value: "12" } });
    expect(quantityInputs[0]).toHaveValue(12);

    expect(screen.getAllByRole("button", { name: "Use fixed location" }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: "Use fixed location" })[0]);

    const locationSelectors = Array.from(container.querySelectorAll("select")).filter((select) =>
      select.textContent?.includes("Select a fixed location"),
    );
    expect(locationSelectors.length).toBeGreaterThan(0);
    expect(locationSelectors[0].textContent).toContain("A4-01");
    expect(locationSelectors[0].textContent).toContain("B2-05");

    fireEvent.change(locationSelectors[0], { target: { value: "balance-2" } });
    expect(quantityInputs[0]).toHaveValue(12);
    expect(screen.getAllByRole("alert").some((alert) => alert.textContent?.includes("This location has 5 boxes"))).toBe(true);
    expect(screen.getByRole("button", { name: /Generate Pick List/i })).toBeDisabled();
    fireEvent.click(screen.getAllByRole("button", { name: "Split quantities manually" })[0]);
    expect(quantityInputs[0]).toHaveValue(12);
    expect(screen.getAllByLabelText("Boxes from A4-01")[0]).toHaveValue(10);
    expect(screen.getAllByLabelText("Boxes from B2-05")[0]).toHaveValue(2);
    expect(screen.queryByText(/Insufficient/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate Pick List/i })).toBeEnabled();

    fireEvent.change(locationSelectors[0], { target: { value: "" } });

    const customerPnInputs = screen.getAllByTitle("Customer part number snapshot");
    fireEvent.change(customerPnInputs[0], { target: { value: "CUSTOMER-PN-42" } });

    expect(customerPnInputs[0]).toHaveValue("CUSTOMER-PN-42");
    const request = screen.getByDisplayValue(/party-vmi-owner/) as HTMLInputElement;
    expect(JSON.parse(request.value).lines.reduce((sum: number, line: { qty: number }) => sum + line.qty, 0)).toBe(12);
    expect(JSON.parse(request.value).lines.every((line: { customerItemCode: string }) => line.customerItemCode === "CUSTOMER-PN-42")).toBe(true);
  });

  it("groups split lot records by lot number and edits exact location allocations inside the plan", () => {
    const stockWithSources = [
      { ...stock[0], availableQty: 10, balanceId: "balance-1", locationId: "location-1", locationLabel: "A4-01" },
      { ...stock[0], availableQty: 5, lotId: "lot-1-split", balanceId: "balance-2", locationId: "location-2", locationLabel: "B2-05" },
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

    const plan = screen.getAllByLabelText("FIFO lot and location plan")[0];
    const lot = within(plan).getByRole("group", { name: "Lot LOT-1" });
    expect(within(lot).getByText("A4-01")).toBeInTheDocument();
    expect(within(lot).getByText("B2-05")).toBeInTheDocument();
    expect(screen.queryByLabelText("Add location within FIFO lot")).not.toBeInTheDocument();
    fireEvent.change(within(lot).getByLabelText("Boxes from A4-01"), { target: { value: "1" } });
    fireEvent.click(within(lot).getByRole("checkbox", { name: "Select location B2-05 from lot LOT-1" }));
    expect(within(lot).getByLabelText("Boxes from B2-05")).toHaveValue(1);
    expect(within(lot).getByText("2 allocated · 15 available")).toBeInTheDocument();
    expect(screen.getByLabelText("Qty (Boxes)")).toHaveValue(2);

    const request = screen.getByDisplayValue(/party-vmi-owner/) as HTMLInputElement;
    expect(JSON.parse(request.value).lines.map((line: { lotId: string; locationId: string; qty: number }) => [line.lotId, line.locationId, line.qty])).toEqual([
      ["lot-1", "location-1", 1],
      ["lot-1-split", "location-2", 1],
    ]);
    fireEvent.click(within(lot).getByRole("checkbox", { name: "Select location B2-05 from lot LOT-1" }));
    expect(within(lot).queryByLabelText("Boxes from B2-05")).not.toBeInTheDocument();
    expect(within(lot).getByText("1 allocated · 15 available")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate Pick List/i })).toBeDisabled();
    expect(screen.getByLabelText("Qty (Boxes)")).toHaveValue(2);
  });

  it("keeps a DRA shortage line in the draft and shows a clear resolution", async () => {
    vi.mocked(parseDraDocumentAction).mockResolvedValue({
      ok: true,
      parseResult: {
        rows: [
          { itemCode: "SUP-ITEM-1", customerItemCode: "SUP-ITEM-1", itemDescription: "Test item", requestedQty: 20, packageCount: 20, spq: 1 },
          { itemDescription: "Test item", requestedQty: 1 },
          { itemCode: "SUP-ITEM-1", requestedQty: 0 },
        ],
        header: { requestingOrganization: "VMI Owner Organization" },
        errors: [],
        warnings: [],
        ok: true,
        fileName: "release.csv",
      },
    });

    render(
      <MultiItemPickListDraft
        stock={stock}
        customers={[{ id: "party-customer", code: "CUST-1", name: "Test customer", relationship: "vmi_customer" }]}
        endCustomers={[{ id: "party-end-customer", code: "END-1", name: "Test end customer" }]}
        createAction={vi.fn()}
        overrideAction={vi.fn()}
      />,
    );

    const file = new File(["dra"], "release.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText(/Import DRA/), { target: { files: [file] } });

    expect(await screen.findByText(/Imported 1 line/)).toBeInTheDocument();
    expect(screen.getByLabelText("Qty (Boxes)")).toHaveValue(20);
    expect(screen.getByText(/requested 20, available 10, short 10 boxes/i)).toBeInTheDocument();
    expect(screen.getAllByLabelText("Allocation summary").some((element) => /Requested:\s*20/.test(element.textContent ?? "") && /Available:\s*10/.test(element.textContent ?? "") && /Allocated:\s*10/.test(element.textContent ?? "") && /Stock short:\s*10/.test(element.textContent ?? ""))).toBe(true);
    expect(screen.getByRole("list", { name: "DRA rows to review" })).toHaveTextContent(/description alone is not a unique identifier/i);
    expect(screen.getByRole("list", { name: "DRA rows to review" })).toHaveTextContent(/unit quantity is invalid/i);
    expect(screen.getByRole("button", { name: /Generate Pick List/i })).toBeDisabled();
  });

  it("shows the same grouped receipt-date hierarchy for DRA-imported allocations", async () => {
    vi.mocked(parseDraDocumentAction).mockResolvedValue({
      ok: true,
      parseResult: {
        rows: [{ itemCode: "SUP-ITEM-1", customerItemCode: "SUP-ITEM-1", itemDescription: "Test item", requestedQty: 5, packageCount: 5, spq: 1 }],
        header: { requestingOrganization: "VMI Owner Organization" },
        errors: [], warnings: [], ok: true, fileName: "release.csv",
      },
    });
    const importedStock = [
      { ...stock[0], balanceId: "a1", lotId: "lot-a", lotNumber: "LOT-A", locationId: "loc-a1", locationLabel: "A1-01", availableQty: 2, receivedAt: new Date("2026-10-20T08:00:00Z") },
      { ...stock[0], balanceId: "a2", lotId: "lot-a-split", lotNumber: "LOT-A", locationId: "loc-a2", locationLabel: "A1-02", availableQty: 2, receivedAt: new Date("2026-10-20T08:00:00Z") },
      { ...stock[0], balanceId: "b1", lotId: "lot-b", lotNumber: "LOT-B", locationId: "loc-b1", locationLabel: "B1-01", availableQty: 3, receivedAt: new Date("2026-10-20T15:00:00Z") },
      { ...stock[0], balanceId: "c1", lotId: "lot-c", lotNumber: "LOT-C", locationId: "loc-c1", locationLabel: "C1-01", availableQty: 4, receivedAt: new Date("2026-10-21T08:00:00Z") },
    ];
    render(
      <MultiItemPickListDraft
        stock={importedStock}
        customers={[{ id: "party-customer", code: "CUST-1", name: "Test customer", relationship: "vmi_customer" }]}
        endCustomers={[{ id: "party-end-customer", code: "END-1", name: "Test end customer" }]}
        createAction={vi.fn()}
        overrideAction={vi.fn()}
      />,
    );
    const file = new File(["dra"], "release.csv", { type: "text/csv" });
    fireEvent.change(screen.getByLabelText(/Import DRA/), { target: { files: [file] } });

    expect(await screen.findByText(/Imported 1 line/)).toBeInTheDocument();
    const plan = screen.getAllByLabelText("FIFO lot and location plan")[0];
    expect(plan.textContent).toContain("FIFO #1");
    expect(plan.textContent).toContain("Lot LOT-A");
    expect(plan.textContent).toContain("Lot LOT-B");
    expect(plan.textContent).toContain("FIFO #2");
    expect(plan.textContent).toContain("Lot LOT-C");
    const lot = within(plan).getByRole("group", { name: "Lot LOT-A" });
    expect(within(lot).getByText("A1-01")).toBeInTheDocument();
    expect(within(lot).getByText("A1-02")).toBeInTheDocument();
    fireEvent.click(within(lot).getByRole("checkbox", { name: "Select location A1-02 from lot LOT-A" }));
    expect(within(lot).getByText("2 allocated · 4 available")).toBeInTheDocument();
    fireEvent.change(within(plan).getByLabelText("Boxes from B1-01"), { target: { value: "3" } });
    expect(screen.getByLabelText("Qty (Boxes)")).toHaveValue(5);
    expect(screen.getAllByLabelText("Allocation summary")[0]).toHaveTextContent(/Allocated:\s*5/);
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
