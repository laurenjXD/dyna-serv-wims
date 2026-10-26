"use client";

import React, { useState } from "react";
import {
  DollarSign,
  Activity,
  Archive,
  CheckCircle2,
  AlertCircle,
  Flame,
} from "lucide-react";
import type {
  DateHorizon,
  VmiBillingRow,
  ReportArchiveItem,
  PreBuiltTemplate,
  ReportFormat,
  ReportCategory,
  TradingMarginRow,
  TradingCategoryPerformance,
  MovementThroughputDatum,
  DeliverySlaDatum,
  CustomReportPreviewRow,
} from "./types";
import type { HeatmapCellDatum } from "@/components/dashboard/types";
import { ReportsHeader } from "./ReportsHeader";
import { ReportKpis, type ReportKpisProps } from "./ReportKpis";
import { VmiBillingTable } from "./VmiBillingTable";
import { TradingMarginSection } from "./TradingMarginSection";
import { ThroughputSection } from "./ThroughputSection";
import { DeliveryPerformanceReport } from "./DeliveryPerformanceReport";
import { MonthlyHeatmap } from "@/components/dashboard/MonthlyHeatmap";
import { TemplateCardGrid } from "./TemplateCardGrid";
import { ReportArchiveTable } from "./ReportArchiveTable";
import { PdfPreviewModal } from "./PdfPreviewModal";
import { CustomReportBuilderModal } from "./CustomReportBuilderModal";
import { VmiAuditModal } from "./VmiAuditModal";
import { exportRawTransactionsCsvAction, generateCustomReportAction } from "@/lib/actions/reports";
import type { DocumentTemplate } from "@/lib/documents/document-template";

export interface WarehouseReportsHubProps {
  kpis?: ReportKpisProps["kpis"];
  vmiBillingRows?: VmiBillingRow[];
  tradingMargin?: {
    marginHistory: TradingMarginRow[];
    categoryBreakdown: TradingCategoryPerformance[];
  };
  throughput?: MovementThroughputDatum[];
  deliverySla?: DeliverySlaDatum[];
  archiveItems?: ReportArchiveItem[];
  heatmap?: HeatmapCellDatum[][];
  canReadFinancial?: boolean;
  documentTemplate?: DocumentTemplate;
}

export function WarehouseReportsHub({
  kpis,
  vmiBillingRows,
  tradingMargin,
  throughput,
  deliverySla,
  archiveItems,
  heatmap,
  canReadFinancial = true,
  documentTemplate,
}: WarehouseReportsHubProps) {
  const today = new Date();
  const toInputDate = (date: Date) => date.toISOString().slice(0, 10);
  const defaultEndDate = toInputDate(today);
  const defaultStartDate = toInputDate(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000));
  const [horizon, setHorizon] = useState<DateHorizon>("30D");
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [activeSection, setActiveSection] = useState<"all" | "financial" | "operations" | "heatmap" | "archive">("all");
  const [isSectionPending, startSectionTransition] = React.useTransition();

  // Report sections contain charts, tables, and responsive layout measurements.
  // Keep the navigation click itself responsive while React swaps that heavier
  // subtree in the background.
  const handleSectionChange = (section: "all" | "financial" | "operations" | "heatmap" | "archive") => {
    startSectionTransition(() => setActiveSection(section));
  };

  const handleHorizonChange = (h: DateHorizon) => {
    const end = new Date();
    setHorizon(h);
    if (h === "7D") {
      setStartDate(toInputDate(new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000)));
      setEndDate(toInputDate(end));
    } else if (h === "30D") {
      setStartDate(toInputDate(new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000)));
      setEndDate(toInputDate(end));
    } else if (h === "90D") {
      setStartDate(toInputDate(new Date(end.getTime() - 89 * 24 * 60 * 60 * 1000)));
      setEndDate(toInputDate(end));
    }
  };

  // ── Reactive Filtering based on Horizon & Warehouse 1 Storage Zones ─────
  const activeKpis = kpis;

  const activeThroughput = React.useMemo(() => {
    if (!throughput || throughput.length === 0) return throughput;
    if (horizon === "7D") {
      return throughput.slice(-7);
    }
    return throughput;
  }, [throughput, horizon]);

  const activeTradingMargin = React.useMemo(() => {
    if (!tradingMargin) return undefined;
    if (horizon === "7D") {
      return {
        ...tradingMargin,
        marginHistory: tradingMargin.marginHistory.slice(-2),
      };
    }
    return tradingMargin;
  }, [tradingMargin, horizon]);

  const activeDeliverySla = React.useMemo(() => {
    if (!deliverySla || deliverySla.length === 0) return deliverySla;
    if (horizon === "7D") {
      return deliverySla.slice(-7);
    }
    return deliverySla;
  }, [deliverySla, horizon]);

  const activeVmiBillingRows = vmiBillingRows;
  const customReportPreviewData = React.useMemo<Record<string, CustomReportPreviewRow[]>>(
    () => ({
      "Consignor / Vendor Organization": (activeVmiBillingRows ?? []).map((row) => ({
        name: row.clientName,
        flow: "VMI",
        cbm: row.occupiedCbm,
        valuation: null,
        marginPct: null,
        volumeQty: null,
        otifPct: null,
        dwellDays: row.unbilledDays,
        accrualUsd: row.mtdAccruedStorage,
      })),
    }),
    [activeVmiBillingRows]
  );

  // Modal States
  const [isPdfPreviewOpen, setIsPdfPreviewOpen] = useState(false);
  const [pdfModalTitle, setPdfModalTitle] = useState("Master Stock Position & Financial Valuation Summary");
  const [pdfModalSubtitle, setPdfModalSubtitle] = useState("Official Consolidated WMS Balance Sheet & CBM Space Reconciliation");
  const [pdfModalRef, setPdfModalRef] = useState("DS-RPT-2026-0831-VAL");

  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [auditRow, setAuditRow] = useState<VmiBillingRow | null>(null);

  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isReportOverlayOpen = isPdfPreviewOpen || isBuilderOpen || isAuditModalOpen;

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setErrorMessage(null);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setToastMessage(null);
    setTimeout(() => {
      setErrorMessage(null);
    }, 4500);
  };

  // Quick PDF Generator
  const handleQuickGeneratePdf = () => {
    setPdfModalTitle("Consolidated Warehouse Valuation & Inventory Position");
    setPdfModalSubtitle("Executive overview of all active lots across VMI and Trading accounts");
    setPdfModalRef("DS-RPT-VAL-MTD");
    setIsPdfPreviewOpen(true);
  };

  // VMI Billing Row PDF
  const handleGenerateInvoicePdf = (row: VmiBillingRow) => {
    setPdfModalTitle(`Statement of Account — ${row.clientName}`);
    setPdfModalSubtitle(`CBM Storage & Consignment Handling for Period (${row.unbilledDays} Unbilled Days)`);
    setPdfModalRef(`SOA-${row.clientCode}-202608`);
    setIsPdfPreviewOpen(true);
  };

  const handleAuditDwellTime = (row: VmiBillingRow) => {
    setAuditRow(row);
    setIsAuditModalOpen(true);
  };

  const handleRunTemplate = (template: PreBuiltTemplate, format: ReportFormat) => {
    if (format === "PDF") {
      setPdfModalTitle(template.title);
      setPdfModalSubtitle(template.description);
      setPdfModalRef(`DS-TPL-${template.id.toUpperCase()}`);
      setIsPdfPreviewOpen(true);
    } else {
      showError(`${format} export for this template is not connected to a live report query yet.`);
    }
  };

  const handleScheduleTemplate = (template: PreBuiltTemplate) => {
    showError(`Scheduling for "${template.title}" is not available until the report job contract is connected.`);
  };

  const handleDownloadReport = (item: ReportArchiveItem) => {
    if (!item.downloadUrl) {
      showError(`The archived artifact for ${item.reportName} is not available.`);
      return;
    }
    const link = document.createElement("a");
    link.href = item.downloadUrl;
    link.download = item.reportName;
    link.target = "_blank";
    link.rel = "noreferrer";
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast(`Download started for ${item.reportName}.`);
  };

  const handleShareReport = async (item: ReportArchiveItem) => {
    if (!item.downloadUrl) {
      showError(`The archived artifact for ${item.reportName} is not available to share.`);
      return;
    }
    try {
      await navigator.clipboard.writeText(new URL(item.downloadUrl, window.location.origin).toString());
      showToast(`Secure link for ${item.reportName} copied to clipboard.`);
    } catch {
      showError("The secure link could not be copied. Please use Download instead.");
    }
  };

  const handlePreviewReport = (item: ReportArchiveItem) => {
    if (!item.downloadUrl) {
      showError(`The archived artifact for ${item.reportName} is not available.`);
      return;
    }
    window.open(item.downloadUrl, "_blank", "noopener,noreferrer");
  };

  // Live Raw Ledger Export Action
  const handleExportRawData = async (format: "csv" | "xlsx") => {
    try {
      const res = await exportRawTransactionsCsvAction(format);
      if (res.success && (res.csvContent || res.fileContentBase64)) {
        const fileContentBase64 = res.fileContentBase64;
        const blob = fileContentBase64
          ? new Blob([
              Uint8Array.from(atob(fileContentBase64), (character) => character.charCodeAt(0)),
            ], { type: res.mimeType })
          : new Blob([res.csvContent ?? ""], { type: res.mimeType || "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", res.filename || "dyna-serv-ledger.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast(res.message);
      } else {
        showError(res.message || "Failed to export raw transactions.");
      }
    } catch (err) {
      console.error(err);
      showError("Error exporting raw transaction data.");
    }
  };

  const handleCustomBuildComplete = async (config: {
    title: string;
    category: ReportCategory;
    format: ReportFormat;
    metrics: string[];
    dimensions: string[];
  }) => {
    try {
      const res = await generateCustomReportAction(config);
      if (res.success) {
        showToast(res.message);
        if (config.format === "PDF") {
          setPdfModalTitle(config.title);
          setPdfModalSubtitle(`Custom ${config.category} Query · ${config.dimensions.join(", ")}`);
          setPdfModalRef(`DS-CUST-${Date.now().toString().slice(-6)}`);
          setIsPdfPreviewOpen(true);
        }
      } else {
        showError(res.message);
      }
    } catch (err) {
      console.error(err);
      showError("Failed to build custom report.");
    }
  };

  return (
    <div className="space-y-5">
      {/* ── 1. Global Header & Control Toolbar ────────────────────────────── */}
      <ReportsHeader
        horizon={horizon}
        startDate={startDate}
        endDate={endDate}
        onHorizonChange={handleHorizonChange}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onOpenReportBuilder={() => setIsBuilderOpen(true)}
        onQuickGeneratePdf={handleQuickGeneratePdf}
        onExportRawData={handleExportRawData}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-900 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-emerald-700 hover:text-emerald-950 font-mono text-[11px] underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error Toast */}
      {errorMessage && (
        <div className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-900 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-rose-700 hover:text-rose-950 font-mono text-[11px] underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── 2. Executive Reporting & Settlement KPIs (Bento Row) ───────────── */}
      {!isReportOverlayOpen && <>
      <ReportKpis kpis={activeKpis} />

      {/* ── Section Quick Navigation Filter Bar ───────────────────────────── */}
      <div
        className="overflow-x-auto border-b border-slate-200/80 pb-2"
        aria-busy={isSectionPending}
      >
        <div className="flex min-w-max items-center gap-1.5 font-label text-xs font-semibold">
          <button
            type="button"
            onClick={() => handleSectionChange("all")}
            className={`rounded-xl px-3.5 py-1.5 transition-all ${
              activeSection === "all"
                ? "bg-brand-navy text-white font-bold shadow-2xs"
                : "text-slate-600 hover:text-slate-900 bg-slate-100"
            }`}
          >
            All Reports &amp; Analytics
          </button>

          {canReadFinancial && (
            <button
              type="button"
              onClick={() => handleSectionChange("financial")}
              className={`rounded-xl px-3.5 py-1.5 transition-all flex items-center gap-1.5 ${
                activeSection === "financial"
                  ? "bg-brand-navy text-white font-bold shadow-2xs"
                  : "text-slate-600 hover:text-slate-900 bg-slate-100"
              }`}
            >
              <DollarSign size={13} />
              <span>Financial Settlement &amp; Margins</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleSectionChange("operations")}
            className={`rounded-xl px-3.5 py-1.5 transition-all flex items-center gap-1.5 ${
              activeSection === "operations"
                ? "bg-brand-navy text-white font-bold shadow-2xs"
                : "text-slate-600 hover:text-slate-900 bg-slate-100"
            }`}
          >
            <Activity size={13} />
            <span>Throughput &amp; OTIF SLA</span>
          </button>

          <button
            type="button"
            onClick={() => handleSectionChange("heatmap")}
            className={`rounded-xl px-3.5 py-1.5 transition-all flex items-center gap-1.5 ${
              activeSection === "heatmap"
                ? "bg-brand-navy text-white font-bold shadow-2xs"
                : "text-slate-600 hover:text-slate-900 bg-slate-100"
            }`}
          >
            <Flame size={13} />
            <span>Location Heatmap</span>
          </button>

          <button
            type="button"
            onClick={() => handleSectionChange("archive")}
            className={`rounded-xl px-3.5 py-1.5 transition-all flex items-center gap-1.5 ${
              activeSection === "archive"
                ? "bg-brand-navy text-white font-bold shadow-2xs"
                : "text-slate-600 hover:text-slate-900 bg-slate-100"
            }`}
          >
            <Archive size={13} />
            <span>Report Archive &amp; Templates</span>
          </button>
        </div>
      </div>

      {/* ── 3. Dedicated Financial Settlement & Margin Reports ─────────────── */}
      {canReadFinancial && (activeSection === "all" || activeSection === "financial") && (
        <section className="space-y-5">
          {/* A. VMI Client Storage & CBM Billing Reconciliation */}
          <VmiBillingTable
            initialData={activeVmiBillingRows}
            onGenerateInvoicePdf={handleGenerateInvoicePdf}
            onAuditDwellTime={handleAuditDwellTime}
          />

          {/* B & C. Trading Revenue, COGS, Margin Realization & Product Line Margin Table */}
          <TradingMarginSection initialData={activeTradingMargin} />
        </section>
      )}

      {/* ── 4. Throughput, Delivery & Storage Reports ──────────────────────── */}
      {(activeSection === "all" || activeSection === "operations") && (
        <section className="space-y-5">
          {/* A & C. Movement Volume Throughput & Location Occupancy */}
          <ThroughputSection initialData={activeThroughput} />

          {/* B. Delivery SLA & OTIF Fulfillment Report */}
          <DeliveryPerformanceReport initialData={activeDeliverySla} />
        </section>
      )}

      {/* ── 5. Monthly Location Intelligence Heatmap (31-Day View) ────────── */}
      {(activeSection === "all" || activeSection === "heatmap") && (
        <section>
          <MonthlyHeatmap initialGrid={heatmap} />
        </section>
      )}

      {/* ── 6 & 7. Templates Grid & Reports Archive Log ───────────────────── */}
      {(activeSection === "all" || activeSection === "archive") && (
        <section className="space-y-5">
          {/* Pre-built Templates Grid */}
          <TemplateCardGrid
            onRunTemplate={handleRunTemplate}
            onScheduleTemplate={handleScheduleTemplate}
          />

          {/* Generated Reports Archive */}
          <ReportArchiveTable
            initialData={archiveItems}
            onDownloadReport={handleDownloadReport}
            onShareReport={handleShareReport}
            onPreviewReport={handlePreviewReport}
          />
        </section>
      )}

      {/* ── 8. Live In-Browser PDF Preview Dialog ─────────────────────────── */}
      </>}

      <PdfPreviewModal
        isOpen={isPdfPreviewOpen}
        onClose={() => setIsPdfPreviewOpen(false)}
        reportTitle={pdfModalTitle}
        reportSubtitle={pdfModalSubtitle}
        reportRefNumber={pdfModalRef}
        documentTemplate={documentTemplate}
      />

      {/* ── 9. Interactive Custom Report Builder Modal ────────────────────── */}
      <CustomReportBuilderModal
        isOpen={isBuilderOpen}
        onClose={() => setIsBuilderOpen(false)}
        onBuildComplete={handleCustomBuildComplete}
        previewData={customReportPreviewData}
      />

      {/* ── 10. VMI Daily CBM & Dwell Time Audit Modal ────────────────────── */}
      <VmiAuditModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        row={auditRow}
      />
    </div>
  );
}
