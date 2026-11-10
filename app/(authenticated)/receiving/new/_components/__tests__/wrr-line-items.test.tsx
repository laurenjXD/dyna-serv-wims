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
    expect(screen.getByLabelText(/Shipment SPQ \(units\/carton\)/i)).toHaveValue(100);
  });

  it("derives total quantity from the CIPL carton quantity", () => {
    render(
      <WrrLineItems
        flowType="trading"
        vendorPartyId="vendor-1"
        itemOptions={[assignedItem]}
      />,
    );

    const itemInput = screen.getByPlaceholderText(/Type item code/i);
    fireEvent.focus(itemInput);
    fireEvent.click(screen.getByRole("button", { name: /DSGC-ITEM-1/ }));

    fireEvent.change(screen.getByLabelText(/Carton Qty \(CIPL\)/i), {
      target: { value: "5" },
    });

    expect(screen.getByDisplayValue("500")).toBeInTheDocument();
    expect(screen.getByLabelText(/Total Quantity \(CIPL\)/i)).toHaveValue(500);
    expect(screen.queryByText(/Carton QR Labels/i)).not.toBeInTheDocument();
  });

  it("keeps imported total and carton quantities from the CIPL", () => {
    render(
      <WrrLineItems
        flowType="trading"
        vendorPartyId="vendor-1"
        itemOptions={[assignedItem]}
        importedLines={[{
          itemId: assignedItem.id,
          itemCode: assignedItem.dsgcItemNumber,
          customerItemCode: assignedItem.customerItemCode,
          description: assignedItem.description,
          lotNumber: "LOT-A1",
          mfgDate: "",
          expiryDate: "",
          expectedQty: "13500",
          packageCount: "9",
          spq: "1500",
          unitCbm: assignedItem.volumeCbm,
          uom: assignedItem.uom,
          remarks: "",
          disposition: "store",
        }]}
      />,
    );

    expect(screen.getByLabelText(/Total Quantity \(CIPL\)/i)).toHaveValue(13500);
    expect(screen.getByLabelText(/Carton Qty \(CIPL\)/i)).toHaveValue(9);
    expect(screen.queryByText(/Carton QR Labels/i)).not.toBeInTheDocument();
  });

  it("keeps CIPL-populated lines editable for receiving corrections", () => {
    render(
      <WrrLineItems
        flowType="trading"
        vendorPartyId="vendor-1"
        itemOptions={[assignedItem]}
        importedLines={[{
          itemId: assignedItem.id,
          itemCode: assignedItem.dsgcItemNumber,
          customerItemCode: assignedItem.customerItemCode,
          description: assignedItem.description,
          lotNumber: "LOT-A1",
          mfgDate: "",
          expiryDate: "",
          expectedQty: "13500",
          packageCount: "9",
          spq: "1500",
          unitCbm: assignedItem.volumeCbm,
          uom: assignedItem.uom,
          remarks: "",
          disposition: "store",
        }]}
      />,
    );

    expect(screen.queryByText(/Locked/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Lot Number/i), { target: { value: "LOT-CORRECTED" } });
    fireEvent.change(screen.getByLabelText(/Shipment SPQ \(units\/carton\)/i), { target: { value: "1000" } });
    fireEvent.change(screen.getByLabelText(/Total Quantity \(CIPL\)/i), { target: { value: "15000" } });
    fireEvent.change(screen.getByLabelText(/Unit CBM \(Per Carton\)/i), { target: { value: "0.0020" } });

    expect(screen.getByLabelText(/Lot Number/i)).toHaveValue("LOT-CORRECTED");
    expect(screen.getByLabelText(/Total Quantity \(CIPL\)/i)).toHaveValue(15000);
    expect(screen.getByLabelText(/Carton Qty \(CIPL\)/i)).toHaveValue(15);
    expect(screen.getByLabelText(/Shipment SPQ \(units\/carton\)/i)).toHaveValue(1000);
    expect(screen.getByLabelText(/Unit CBM \(Per Carton\)/i)).toHaveValue(0.002);
  });

  it("shows a legacy catalog material with no organization assignment", () => {
    render(
      <WrrLineItems
        flowType="vmi"
        vendorPartyId="vendor-1"
        itemOptions={[{ ...assignedItem, defaultSupplierPartyId: null }]}
      />,
    );

    fireEvent.focus(screen.getByPlaceholderText(/Type item code/i));

    expect(screen.getByText("SUP-ITEM-1")).toBeInTheDocument();
    expect(screen.getByText("Legacy item")).toBeInTheDocument();
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

  it("offers a refresh action when no catalog materials are loaded", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Refresh item catalog" }));

    expect(reload).toHaveBeenCalledOnce();
  });
});
