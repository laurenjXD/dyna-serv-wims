/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PdfPreviewModal } from "../PdfPreviewModal";
import { CustomReportBuilderModal } from "../CustomReportBuilderModal";
import { WarehouseReportsHub } from "../WarehouseReportsHub";

describe("reports modal smoke render", () => {
  afterEach(() => cleanup());

  it("renders the PDF preview when opened", () => {
    expect(() => render(<PdfPreviewModal isOpen onClose={vi.fn()} />)).not.toThrow();
  });

  it("renders the custom report builder when opened", () => {
    expect(() => render(<CustomReportBuilderModal isOpen onClose={vi.fn()} onBuildComplete={vi.fn()} />)).not.toThrow();
  });

  it("opens both report actions from the reports hub", () => {
    render(<WarehouseReportsHub />);
    fireEvent.click(screen.getByRole("button", { name: /Generate Full Inventory PDF/i }));
    expect(screen.getByRole("dialog", { name: /Consolidated Warehouse Valuation/i })).toBeInTheDocument();
  });

  it("opens the custom report builder from the reports hub", () => {
    render(<WarehouseReportsHub />);
    fireEvent.click(screen.getAllByRole("button", { name: /Custom Report Builder/i })[0]);
    expect(screen.getByRole("dialog", { name: /Executive Custom Report Builder/i })).toBeInTheDocument();
  });
});
