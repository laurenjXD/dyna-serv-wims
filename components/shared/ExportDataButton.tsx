"use client";

import React, { useState, useRef, useEffect } from "react";
import { Download, FileSpreadsheet, FileText, ChevronDown } from "@/components/ui/icons";
import * as XLSX from "xlsx";

export interface ExportColumnDef<T> {
  header: string;
  key?: keyof T | string;
  format?: (row: T) => string | number | boolean | null | undefined;
}

interface ExportDataButtonProps<T> {
  data: T[];
  filename: string;
  columns?: ExportColumnDef<T>[];
  sheetName?: string;
  buttonLabel?: string;
}

export function ExportDataButton<T extends object>({
  data,
  filename,
  columns,
  sheetName = "Sheet1",
  buttonLabel = "Export",
}: ExportDataButtonProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function formatDataForExport(): Record<string, unknown>[] {
    if (!data || data.length === 0) return [];

    if (!columns || columns.length === 0) {
      // Direct raw data cleanup (strip complex objects/react nodes)
      return data.map((row) => {
        const clean: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(row)) {
          if (val instanceof Date) {
            clean[key] = val.toISOString().split("T")[0];
          } else if (typeof val === "object" && val !== null) {
            clean[key] = JSON.stringify(val);
          } else {
            clean[key] = val;
          }
        }
        return clean;
      });
    }

    return data.map((row) => {
      const formattedRow: Record<string, unknown> = {};
      for (const col of columns) {
        if (col.format) {
          formattedRow[col.header] = col.format(row) ?? "";
        } else if (col.key) {
          const val: unknown = row[col.key as keyof T];
          if (val instanceof Date) {
            formattedRow[col.header] = val.toISOString().split("T")[0];
          } else if (typeof val === "object" && val !== null) {
            formattedRow[col.header] = Array.isArray(val) ? val.join(", ") : JSON.stringify(val);
          } else {
            formattedRow[col.header] = val ?? "";
          }
        }
      }
      return formattedRow;
    });
  }

  function handleExportExcel() {
    try {
      const exportRows = formatDataForExport();
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `${filename}.xlsx`, { bookType: "xlsx" });
    } catch (err) {
      console.error("Failed to export Excel file:", err);
    } finally {
      setIsOpen(false);
    }
  }

  function handleExportCsv() {
    try {
      const exportRows = formatDataForExport();
      const ws = XLSX.utils.json_to_sheet(exportRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `${filename}.csv`, { bookType: "csv" });
    } catch (err) {
      console.error("Failed to export CSV file:", err);
    } finally {
      setIsOpen(false);
    }
  }

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        disabled={data.length === 0}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-surface-white px-3 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:cursor-not-allowed disabled:opacity-50 transition-all"
      >
        <Download size={14} className="text-slate-500" />
        <span>{buttonLabel}</span>
        <ChevronDown size={13} className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-1.5 w-48 origin-top-right rounded-xl border border-slate-200 bg-white py-1.5 shadow-elevation-2 animate-in fade-in zoom-in-95">
          <div className="px-3 py-1 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Export {data.length} records
          </div>
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-brand-navy text-left transition-colors"
          >
            <FileSpreadsheet size={15} className="text-emerald-600 shrink-0" />
            <span>Excel Spreadsheet (.xlsx)</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-brand-navy text-left transition-colors"
          >
            <FileText size={15} className="text-blue-600 shrink-0" />
            <span>CSV Document (.csv)</span>
          </button>
        </div>
      )}
    </div>
  );
}
