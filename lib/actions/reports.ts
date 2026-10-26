"use server";

// lib/actions/reports.ts
//
// Server actions for report generation, dynamic CSV export, and report archive management.

import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { inventoryTransactions } from "@/lib/db/schema/transactions";
import { desc } from "drizzle-orm";
import * as XLSX from "xlsx";

export interface ExportReportResult {
  success: boolean;
  message: string;
  csvContent?: string;
  fileContentBase64?: string;
  mimeType?: string;
  filename?: string;
  downloadUrl?: string;
}

/**
 * 1. Live Raw Transactions CSV Export Action
 */
export async function exportRawTransactionsCsvAction(format: "csv" | "xlsx" = "csv"): Promise<ExportReportResult> {
  try {
    const resolver = await createPageResolver();
    const perm = await requirePermission(resolver, "reporting.read");
    if (perm.kind !== "authorized") {
      return { success: false, message: "Unauthorized: reporting.read capability required." };
    }

    const txRows = await db
      .select({
        txNumber: inventoryTransactions.transactionNumber,
        movementType: inventoryTransactions.movementType,
        flowType: inventoryTransactions.flowType,
        qty: inventoryTransactions.qty,
        commercialInvoiceNo: inventoryTransactions.commercialInvoiceNo,
        arReferenceNo: inventoryTransactions.arReferenceNo,
        createdAt: inventoryTransactions.createdAt,
      })
      .from(inventoryTransactions)
      .orderBy(desc(inventoryTransactions.createdAt))
      .limit(1000);

    const headers = ["Transaction Number", "Movement Type", "Flow Type", "Quantity", "Commercial Invoice", "AR Reference", "Timestamp"];
    const escapeCsv = (value: string | number) => {
      const normalized = String(value);
      return `"${normalized.replaceAll('"', '""')}"`;
    };
    const rows = txRows.map((r) => [
      r.txNumber,
      r.movementType,
      r.flowType,
      r.qty,
      r.commercialInvoiceNo || "",
      r.arReferenceNo || "",
      r.createdAt?.toISOString() || "",
    ]);
    const csvLines = [headers.map(escapeCsv).join(",")];

    for (const row of rows) csvLines.push(row.map(escapeCsv).join(","));

    const csvContent = csvLines.join("\n");
    const filename = `dyna-serv-transactions-${Date.now()}.${format}`;

    if (format === "xlsx") {
      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
      return {
        success: true,
        message: `Exported ${txRows.length} transaction records successfully.`,
        fileContentBase64: XLSX.write(workbook, { bookType: "xlsx", type: "base64" }),
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename,
      };
    }

    return {
      success: true,
      message: `Exported ${txRows.length} transaction records successfully.`,
      csvContent,
      mimeType: "text/csv;charset=utf-8;",
      filename,
    };
  } catch (error) {
    console.error("Error exporting raw transactions CSV:", error);
    return {
      success: false,
      message: "Failed to export raw transaction ledger.",
    };
  }
}

/**
 * 2. Generate Custom Report Server Action
 */
export async function generateCustomReportAction(_config: {
  title: string;
  category: string;
  format: string;
  metrics: string[];
  dimensions: string[];
}): Promise<ExportReportResult> {
  try {
    const resolver = await createPageResolver();
    const perm = await requirePermission(resolver, "reporting.read");
    if (perm.kind !== "authorized") {
      return { success: false, message: "Unauthorized: reporting.read capability required." };
    }

    return {
      success: false,
      message: "Custom report generation is unavailable until report artifact persistence and audit recording are enabled.",
    };
  } catch (error) {
    console.error("Error generating custom report:", error);
    return {
      success: false,
      message: "Failed to build custom report.",
    };
  }
}
