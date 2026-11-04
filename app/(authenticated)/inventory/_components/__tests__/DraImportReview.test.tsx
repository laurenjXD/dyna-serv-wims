// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseDraDocumentAction } from "../../_actions";
import { DraImportReview } from "../DraImportReview";
import type { DraParseResult } from "@/lib/parsers/dra-parser";

vi.mock("../../_actions", () => ({ parseDraDocumentAction: vi.fn() }));

const stock = [{
  itemId: "item-1",
  itemCode: "ITEM-1",
  itemName: "Test item",
  supplierItemCode: "SUP-ITEM-1",
  dsgcItemNumber: "DSGC-1",
  customerItemCode: "CUSTOMER-1",
  organizationId: "owner-1",
  organizationName: "VMI Owner",
  flowType: "vmi" as const,
  uom: "PCS",
  spq: 10,
  balanceId: "balance-1",
  lotId: "lot-1",
  lotNumber: "LOT-1",
  locationId: "location-1",
  locationLabel: "A-01",
  availableQty: 20,
  receivedAt: new Date("2026-01-01T00:00:00Z"),
  expiryDate: null,
  isPerishable: false,
}];

function renderReview(onApply = vi.fn()) {
  render(<DraImportReview
    file={new File(["DRA"], "release.csv", { type: "text/csv" })}
    stock={stock}
    customers={[{ id: "owner-1", code: "OWNER", name: "VMI Owner", relationship: "vmi_customer" }]}
    endCustomers={[{ id: "recipient-1", code: "END", name: "End Customer" }, { id: "recipient-2", code: "END-2", name: "Second End Customer" }]}
    initialOrganizationId="owner-1"
    initialFlowType="vmi"
    initialCustomerPartyId="owner-1"
    initialEndCustomerPartyId="recipient-1"
    onApply={onApply}
    onCancel={vi.fn()}
  />);
  return onApply;
}

describe("DRA import review — spec 08 R1.8", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stages parsed rows for explicit review without applying or reserving stock", async () => {
    vi.mocked(parseDraDocumentAction).mockResolvedValue({ ok: true, parseResult: {
      ok: true, fileName: "release.csv", header: {},
      rows: [{ itemCode: "SUP-ITEM-1", requestedQty: 20, uom: "PCS" }],
      errors: [], warnings: [],
    } });
    const onApply = renderReview();

    expect(await screen.findByRole("dialog", { name: "Review DRA import" })).toBeInTheDocument();
    const apply = await screen.findByRole("button", { name: "Use reviewed lines" });
    await waitFor(() => expect(apply).toBeEnabled());
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(apply);

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: "owner-1", flowType: "vmi", endCustomerPartyId: "recipient-1",
      fileName: "release.csv", excludedCount: 0,
      rows: [{ itemId: "item-1", boxes: 2, customerItemCode: "" }],
    }));
  });

  it("retains unmatched rows and blocks applying until they are mapped or explicitly excluded", async () => {
    vi.mocked(parseDraDocumentAction).mockResolvedValue({ ok: true, parseResult: {
      ok: true, fileName: "release.csv", header: {},
      rows: [
        { itemCode: "SUP-ITEM-1", requestedQty: 10, uom: "PCS" },
        { itemCode: "UNMATCHED-99", requestedQty: 10, uom: "PCS" },
      ], errors: [], warnings: [],
    } });
    const onApply = renderReview();

    expect(await screen.findByText("UNMATCHED-99")).toBeInTheDocument();
    const apply = screen.getByRole("button", { name: "Use reviewed lines" });
    expect(apply).toBeDisabled();
    expect(screen.getByLabelText("Enrolled item for row 2")).toHaveValue("");
    fireEvent.click(screen.getByLabelText("Exclude row 2"));
    expect(apply).toBeEnabled();
    fireEvent.click(apply);

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      excludedCount: 1,
      rows: [{ itemId: "item-1", boxes: 1, customerItemCode: "" }],
    }));
  });

  it("uses enrolled SPQ for unit conversion and keeps full requested demand above available stock", async () => {
    vi.mocked(parseDraDocumentAction).mockResolvedValue({ ok: true, parseResult: {
      ok: true, fileName: "release.csv", header: {},
      rows: [{ itemCode: "SUP-ITEM-1", requestedQty: 50, uom: "PCS" }],
      errors: [], warnings: [],
    } });
    const onApply = renderReview();

    const quantity = await screen.findByLabelText("Requested quantity for row 1");
    expect(quantity).toHaveValue(50);
    expect(screen.getByLabelText("Quantity unit for row 1")).toHaveValue("units");
    const apply = screen.getByRole("button", { name: "Use reviewed lines" });
    await waitFor(() => expect(apply).toBeEnabled());
    fireEvent.click(apply);

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      rows: [{ itemId: "item-1", boxes: 5, customerItemCode: "" }],
    }));
  });

  it("requires an explicit checked correction when document SPQ and quantities disagree with enrollment", async () => {
    vi.mocked(parseDraDocumentAction).mockResolvedValue({ ok: true, parseResult: {
      ok: true, fileName: "release.csv", header: {},
      rows: [{ itemCode: "SUP-ITEM-1", requestedQty: 30, packageCount: 2, spq: 15, uom: "PCS" }],
      errors: [], warnings: [],
    } });
    const onApply = renderReview();
    const quantity = await screen.findByLabelText("Requested quantity for row 1");
    const apply = screen.getByRole("button", { name: "Use reviewed lines" });
    expect(apply).toBeDisabled();
    fireEvent.change(quantity, { target: { value: "3" } });
    expect(apply).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Use corrected quantity for row 1"));
    expect(apply).toBeEnabled();
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      rows: [{ itemId: "item-1", boxes: 3, customerItemCode: "" }],
    }));
  });

  it("blocks stale row values after a column mapping change until the file is re-read", async () => {
    const parsed: DraParseResult = {
      ok: true, fileName: "release.csv", header: {},
      rows: [{ itemCode: "SUP-ITEM-1", requestedQty: 20, uom: "PCS" }], errors: [], warnings: [],
      spreadsheet: {
        sheetNames: ["Release"], sheetName: "Release", headerRowIndex: 0,
        columns: [{ index: 0, label: "Item" }, { index: 1, label: "Ordered" }, { index: 2, label: "To release" }],
        columnMap: { itemCode: 0, requestedQty: 1 },
      },
    };
    vi.mocked(parseDraDocumentAction)
      .mockResolvedValueOnce({ ok: true, parseResult: parsed })
      .mockResolvedValueOnce({ ok: true, parseResult: {
        ...parsed, rows: [{ itemCode: "SUP-ITEM-1", requestedQty: 30, uom: "PCS" }],
        spreadsheet: { ...parsed.spreadsheet!, columnMap: { itemCode: 0, requestedQty: 2 } },
      } });
    const onApply = renderReview();
    await screen.findByLabelText("Requested quantity for row 1");
    const apply = screen.getByRole("button", { name: "Use reviewed lines" });
    expect(apply).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Requested quantity column"), { target: { value: "2" } });
    expect(apply).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Re-read columns" }));
    await waitFor(() => expect(screen.getByLabelText("Requested quantity for row 1")).toHaveValue(30));
    expect(JSON.parse(String(vi.mocked(parseDraDocumentAction).mock.calls[1][0].get("options")))).toMatchObject({ columnMap: { requestedQty: 2 } });
    expect(apply).toBeEnabled();
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ rows: [{ itemId: "item-1", boxes: 3, customerItemCode: "" }] }));
  });

  it("requires Organization conflict review again after another worksheet is read", async () => {
    const parsed: DraParseResult = {
      ok: true, fileName: "release.csv", header: { requestingOrganization: "Different Organization" },
      rows: [{ itemCode: "SUP-ITEM-1", requestedQty: 10, uom: "PCS" }], errors: [], warnings: [],
      spreadsheet: {
        sheetNames: ["First", "Second"], sheetName: "First", headerRowIndex: 0,
        columns: [{ index: 0, label: "Item" }, { index: 1, label: "Qty" }], columnMap: { itemCode: 0, requestedQty: 1 },
      },
    };
    vi.mocked(parseDraDocumentAction)
      .mockResolvedValueOnce({ ok: true, parseResult: parsed })
      .mockResolvedValueOnce({ ok: true, parseResult: { ...parsed, spreadsheet: { ...parsed.spreadsheet!, sheetName: "Second" } } });
    const onApply = renderReview();
    const acknowledgement = await screen.findByRole("checkbox", { name: /I reviewed the document requester/ });
    const apply = screen.getByRole("button", { name: "Use reviewed lines" });
    expect(apply).toBeDisabled();
    fireEvent.click(acknowledgement);
    expect(apply).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Worksheet"), { target: { value: "Second" } });
    await waitFor(() => expect(acknowledgement).not.toBeChecked());
    expect(apply).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it("clears a previous recipient when the DRA names an unknown recipient", async () => {
    vi.mocked(parseDraDocumentAction).mockResolvedValue({ ok: true, parseResult: {
      ok: true, fileName: "release.csv", header: { recipientOrganization: "UNKNOWN RECIPIENT" },
      rows: [{ itemCode: "SUP-ITEM-1", requestedQty: 10, uom: "PCS" }], errors: [], warnings: [],
    } });
    const onApply = renderReview();
    const recipient = await screen.findByRole("combobox", { name: "End Customer" });
    expect(recipient).toHaveValue("");
    expect(screen.getByRole("button", { name: "Use reviewed lines" })).toBeDisabled();
    expect(onApply).not.toHaveBeenCalled();
    fireEvent.change(recipient, { target: { value: "recipient-1" } });
    expect(screen.getByRole("button", { name: "Use reviewed lines" })).toBeEnabled();
  });

  it("requires correcting an oversized Customer item code before it can reach the pick-list snapshot", async () => {
    vi.mocked(parseDraDocumentAction).mockResolvedValue({ ok: true, parseResult: {
      ok: true, fileName: "release.csv", header: {},
      rows: [{ itemCode: "SUP-ITEM-1", customerItemCode: "C".repeat(101), requestedQty: 10, uom: "PCS" }], errors: [], warnings: [],
    } });
    const onApply = renderReview();
    await screen.findByLabelText("Requested quantity for row 1");
    const apply = screen.getByRole("button", { name: "Use reviewed lines" });
    expect(apply).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Customer item code for row 1"), { target: { value: "CORRECTED-PN" } });
    expect(apply).toBeEnabled();
    fireEvent.click(apply);
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ rows: [{ itemId: "item-1", boxes: 1, customerItemCode: "CORRECTED-PN" }] }));
  });

  it("clears a previous worksheet recipient when the newly read worksheet names an unknown recipient", async () => {
    const parsed: DraParseResult = {
      ok: true, fileName: "release.csv", header: { recipientOrganization: "End Customer" },
      rows: [{ itemCode: "SUP-ITEM-1", requestedQty: 10, uom: "PCS" }], errors: [], warnings: [],
      spreadsheet: {
        sheetNames: ["First", "Second"], sheetName: "First", headerRowIndex: 0,
        columns: [{ index: 0, label: "Item" }, { index: 1, label: "Qty" }], columnMap: { itemCode: 0, requestedQty: 1 },
      },
    };
    vi.mocked(parseDraDocumentAction)
      .mockResolvedValueOnce({ ok: true, parseResult: parsed })
      .mockResolvedValueOnce({ ok: true, parseResult: {
        ...parsed, header: { recipientOrganization: "UNKNOWN RECIPIENT" },
        spreadsheet: { ...parsed.spreadsheet!, sheetName: "Second" },
      } });
    renderReview();
    const recipient = await screen.findByRole("combobox", { name: "End Customer" });
    expect(recipient).toHaveValue("recipient-1");
    fireEvent.change(screen.getByLabelText("Worksheet"), { target: { value: "Second" } });
    await waitFor(() => expect(recipient).toHaveValue(""));
    expect(screen.getByRole("button", { name: "Use reviewed lines" })).toBeDisabled();
  });

  it("uses an explicit matching recipient from a new worksheet when the first worksheet had none", async () => {
    const parsed: DraParseResult = {
      ok: true, fileName: "release.csv", header: {},
      rows: [{ itemCode: "SUP-ITEM-1", requestedQty: 10, uom: "PCS" }], errors: [], warnings: [],
      spreadsheet: {
        sheetNames: ["First", "Second"], sheetName: "First", headerRowIndex: 0,
        columns: [{ index: 0, label: "Item" }, { index: 1, label: "Qty" }], columnMap: { itemCode: 0, requestedQty: 1 },
      },
    };
    vi.mocked(parseDraDocumentAction)
      .mockResolvedValueOnce({ ok: true, parseResult: parsed })
      .mockResolvedValueOnce({ ok: true, parseResult: {
        ...parsed, header: { recipientOrganization: "END-2" },
        spreadsheet: { ...parsed.spreadsheet!, sheetName: "Second" },
      } });
    renderReview();
    const recipient = await screen.findByRole("combobox", { name: "End Customer" });
    expect(recipient).toHaveValue("recipient-1");
    fireEvent.change(screen.getByLabelText("Worksheet"), { target: { value: "Second" } });
    await waitFor(() => expect(recipient).toHaveValue("recipient-2"));
    expect(screen.getByRole("button", { name: "Use reviewed lines" })).toBeEnabled();
  });
});
