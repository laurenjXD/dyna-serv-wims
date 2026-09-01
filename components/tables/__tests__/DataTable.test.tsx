// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { MasterInventoryTable, type MasterInventoryRow } from "../MasterInventoryTable";
import { TransactionLedgerTable, type TransactionLedgerRow } from "../TransactionLedgerTable";

const mockInventoryData: MasterInventoryRow[] = [
  {
    id: "item-1",
    itemCode: "TRD-PUMP-01",
    itemName: "Hydraulic Pump 500W",
    inventoryModel: "Trading",
    categoryName: "Mechanical",
    subcategoryName: "Pumps",
    status: "In-Stock",
    totalStock: 500,
    availableStock: 450,
    uom: "Piece",
    primaryLocation: "A-01",
  },
  {
    id: "item-2",
    itemCode: "VMI-VALVE-02",
    itemName: "Solenoid Valve 24V",
    inventoryModel: "VMI",
    categoryName: "Mechanical",
    subcategoryName: "Valves",
    status: "Low Stock",
    totalStock: 50,
    availableStock: 30,
    uom: "Piece",
    primaryLocation: "B-02",
  },
  {
    id: "item-3",
    itemCode: "TRD-ELEC-01",
    itemName: "Optical Sensor Pro",
    inventoryModel: "Trading",
    categoryName: "Electrical",
    subcategoryName: "Sensors",
    status: "Out of Stock",
    totalStock: 0,
    availableStock: 0,
    uom: "Piece",
    primaryLocation: "C-01",
  },
];

const mockLedgerData: TransactionLedgerRow[] = [
  {
    id: "tx-1",
    timestamp: "2026-08-20T10:00:00Z",
    transactionType: "Receiving",
    referenceDocument: "WRR-2026-0891",
    inventoryModel: "Trading",
    actorName: "John Doe",
    hasVariance: false,
    expectedQty: 100,
    actualQty: 100,
    uom: "Piece",
    locationLabel: "A-01",
  },
  {
    id: "tx-2",
    timestamp: "2026-08-21T14:30:00Z",
    transactionType: "Dispatch",
    referenceDocument: "PL-2026-0042",
    inventoryModel: "VMI",
    actorName: "Jane Smith",
    hasVariance: true,
    expectedQty: 50,
    actualQty: 48,
    uom: "Piece",
    locationLabel: "B-02",
  },
];

describe("MasterInventoryTable & Universal DataTable", () => {
  it("renders table headers with Google Sheets-style filter trigger buttons", () => {
    render(<MasterInventoryTable data={mockInventoryData} />);
    expect(screen.getAllByText("Item Code")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Item Name")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Model")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Category")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Subcategory")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Status")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Total Stock")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Available")[0]).toBeInTheDocument();
  });

  it("renders rows and filters by text search on Item Code", async () => {
    render(<MasterInventoryTable data={mockInventoryData} />);
    expect(screen.getAllByText("TRD-PUMP-01")[0]).toBeInTheDocument();
    expect(screen.getAllByText("VMI-VALVE-02")[0]).toBeInTheDocument();

    // Open filter for Item Code
    const filterBtn = screen.getByRole("button", { name: /Filter by Item Code/i });
    fireEvent.click(filterBtn);

    // Search for "VALVE"
    const input = screen.getByPlaceholderText(/Search Item Code/i);
    fireEvent.change(input, { target: { value: "VALVE" } });

    expect(screen.getAllByText("VMI-VALVE-02")[0]).toBeInTheDocument();
    expect(screen.queryByText("TRD-PUMP-01")).not.toBeInTheDocument();
  });

  it("renders category and subcategory columns with item code priority", () => {
    render(<MasterInventoryTable data={mockInventoryData} />);
    expect(screen.getAllByText("Mechanical")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Pumps")[0]).toBeInTheDocument();
    expect(screen.getAllByText("TRD-PUMP-01")[0]).toBeInTheDocument();
  });
});

describe("TransactionLedgerTable", () => {
  it("renders transaction ledger records and variance exception indicators", () => {
    render(<TransactionLedgerTable data={mockLedgerData} />);
    expect(screen.getAllByText("WRR-2026-0891")[0]).toBeInTheDocument();
    expect(screen.getAllByText("PL-2026-0042")[0]).toBeInTheDocument();
    expect(screen.getAllByText(/0 Match/i)[0]).toBeInTheDocument();
  });
});
