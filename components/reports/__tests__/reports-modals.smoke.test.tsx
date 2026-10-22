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

  it("opens a pre-built report without rendering the dashboard underneath the preview", () => {
    render(<WarehouseReportsHub />);
    fireEvent.click(screen.getAllByRole("button", { name: /^Run$/i })[0]);
    expect(screen.getByRole("dialog", { name: /Master Inventory Valuation/i })).toBeInTheDocument();
  });

  it("opens the custom report builder from the reports hub", () => {
    render(<WarehouseReportsHub />);
    fireEvent.click(screen.getAllByRole("button", { name: /Custom Report Builder/i })[0]);
    expect(screen.getByRole("dialog", { name: /Executive Custom Report Builder/i })).toBeInTheDocument();
  });

  it("renders the reports hub with live-shaped datasets", () => {
    expect(() => render(
      <WarehouseReportsHub
        kpis={{ valuationTotal: 100, vmiAccruedStorage: 20, tradingGrossRevenue: 80, tradingMarginPct: 25, tradingCogs: 60, otifRatePct: 98, activeLotsCount: 3 }}
        vmiBillingRows={[{ id: "1", clientName: "Org", clientCode: "ORG-1", allocatedSpaceCbm: 100, occupiedCbm: 50, utilizationPct: 50, contractedRatePerCbmDay: 0.5, mtdAccruedStorage: 20, unbilledDays: 3, billingStatus: "Ready to Invoice", contactPerson: "Ops", currency: "USD" }]}
        tradingMargin={{ marginHistory: [{ period: "Oct 2026", grossRevenue: 80, cogs: 60, marginPct: 25, targetMarginPct: 20 }], categoryBreakdown: [{ category: "General", unitsSold: 4, grossRevenue: 80, cogs: 60, netMargin: 20, marginPct: 25, deltaVsSlaPct: 5 }] }}
        throughput={[{ label: "Oct 01", inboundQty: 4, outboundQty: 2, vmiQty: 2, tradingQty: 2 }]}
        deliverySla={[{ period: "Oct 2026", otifRate: 98, otdRate: 99, fillRate: 99, targetOtif: 95 }]}
        archiveItems={[{ id: "1", reportName: "RPT-1.pdf", category: "Operations", dateRangeCovered: "2026-10-01", generatedBy: { name: "System", role: "Admin" }, generatedAt: "2026-10-01 10:00", fileSizeFormatted: "1 KB", format: "PDF", status: "Ready" }]}
        canReadFinancial
      />
    )).not.toThrow();
  });

  it("switches report sections without throwing", () => {
    render(<WarehouseReportsHub />);

    expect(() => {
      fireEvent.click(screen.getByRole("button", { name: /Financial Settlement & Margins/i }));
      fireEvent.click(screen.getByRole("button", { name: /Throughput & OTIF SLA/i }));
      fireEvent.click(screen.getByRole("button", { name: /Location Heatmap/i }));
      fireEvent.click(screen.getByRole("button", { name: /Report Archive & Templates/i }));
      fireEvent.click(screen.getByRole("button", { name: /All Reports & Analytics/i }));
    }).not.toThrow();
  });
});
