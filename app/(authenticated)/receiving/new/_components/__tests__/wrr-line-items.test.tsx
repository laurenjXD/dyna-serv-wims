// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WrrLineItems } from "../wrr-line-items";

const assignedItem = {
  id: "item-1",
  defaultSupplierPartyId: "vendor-1",
  code: "ITEM-1",
  name: "Test material",
  description: "Test material description",
  supplierItemCode: "SUP-ITEM-1",
  customerItemCode: "CUST-ITEM-1",
  dsgcItemNumber: "DSGC-ITEM-1",
  uom: "piece",
  volumeCbm: "0.0010",
  spq: 100,
  isPerishable: false,
};

describe("WrrLineItems mobile item selection", () => {
  it("shows an assigned material and applies its enrolled values", () => {
    render(
      <WrrLineItems
        flowType="trading"
        vendorPartyId="vendor-1"
        itemOptions={[assignedItem]}
      />,
    );

    const input = screen.getByPlaceholderText(/Type item code/i);
    fireEvent.focus(input);

    expect(screen.getByText("DSGC-ITEM-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /DSGC-ITEM-1/ }));

    expect(input).toHaveValue("DSGC-ITEM-1");
    expect(screen.getByDisplayValue("Test material description")).toBeInTheDocument();
    expect(screen.getByDisplayValue("piece")).toBeInTheDocument();
  });

  it("keeps a typed CIPL code so unresolved lines can be staged for enrollment", () => {
    render(
      <WrrLineItems
        flowType="vmi"
        vendorPartyId="vendor-1"
        itemOptions={[]}
      />,
    );

    const input = screen.getByPlaceholderText(/Type item code/i);
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "SUP-NEW-001" } });

    fireEvent.click(screen.getByRole("button", { name: /Use “SUP-NEW-001” as CIPL code/i }));

    expect(input).toHaveValue("SUP-NEW-001");
    expect(document.querySelector('input[name="line_0_itemId"]')).toHaveValue("");
    expect(document.querySelector('input[name="line_0_itemCode"]')).toHaveValue("SUP-NEW-001");
  });

  it("offers a refresh action when no assigned materials are loaded", () => {
    const reload = vi.fn();

    render(
      <WrrLineItems
        flowType="vmi"
        vendorPartyId="vendor-1"
        itemOptions={[]}
        onRefresh={reload}
      />,
    );

    fireEvent.focus(screen.getByPlaceholderText(/Type item code/i));
    fireEvent.click(screen.getByRole("button", { name: "Refresh assigned materials" }));

    expect(reload).toHaveBeenCalledOnce();
  });
});
