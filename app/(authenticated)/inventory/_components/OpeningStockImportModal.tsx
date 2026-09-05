"use client";

import React, { useState, useRef } from "react";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  X,
  Download,
  Loader2,
  PackagePlus,
  ArrowRight,
} from "lucide-react";
import { parseOpeningStockFile, commitOpeningStockMigration, type ValidatedOpeningStockRow } from "@/lib/actions/inventory-migration";
import { TablePagination } from "@/components/ui/TablePagination";

export function OpeningStockImportModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [rows, setRows] = useState<ValidatedOpeningStockRow[]>([]);
  const [totalBoxes, setTotalBoxes] = useState(0);
  const [totalPcs, setTotalPcs] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setParsing(true);
    setError(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.set("file", selectedFile);

    try {
      const res = await parseOpeningStockFile(formData);
      setParsing(false);

      if (!res.ok && res.errors.length > 0) {
        setError(res.errors.join("; "));
        return;
      }

      setRows(res.rows);
      setTotalBoxes(res.totalBoxes);
      setTotalPcs(res.totalPcs);
    } catch (err: unknown) {
      setParsing(false);
      setError(err instanceof Error ? err.message : "Failed to parse file.");
    }
  }

  async function handleCommit() {
    if (rows.length === 0) return;
    setPosting(true);
    setError(null);

    try {
      const res = await commitOpeningStockMigration(
        {} as unknown as Parameters<typeof commitOpeningStockMigration>[0],
        rows,
        `Opening Balance Migration: ${file?.name || "Spreadsheet"}`
      );
      setPosting(false);

      if (!res.ok) {
        setError(res.errors.join("; "));
        return;
      }

      setSuccessMessage(
        `Successfully posted ${res.committedRows} opening stock items under receipt ${res.wrrNumber}. Warehouse inventory is now live!`
      );
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1500);
    } catch (err: unknown) {
      setPosting(false);
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    }
  }

  function downloadCsvTemplate() {
    const csvContent =
      "Item Code,Lot Number,Location Code,Boxes Count,SPQ,Manufacture Date,Expiry Date,Inventory Model,Remarks\n" +
      "VALVE-24V,LOT-2026-001,A-01-01,10,50,2026-01-15,2028-01-15,TRADING,Initial warehouse opening stock\n" +
      "SENSOR-OPT,LOT-2026-002,B-02-03,25,100,2026-02-01,2029-02-01,VMI,Initial VMI consignment stock\n";

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "opening_stock_migration_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const validCount = rows.filter((r) => r.isValid).length;
  const invalidCount = rows.filter((r) => !r.isValid).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-white/80 bg-[#FDFDFD] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#F9F9F6] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy text-surface-white shadow-sm">
              <PackagePlus size={20} />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold text-brand-navy">
                Bulk Opening Stock Migration
              </h2>
              <p className="font-body text-xs text-text-grey">
                Upload existing warehouse stock (Excel/CSV) and post directly to warehouse racks without scanning
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-grey hover:bg-slate-200 hover:text-slate-900 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Action Callout & Template Download */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-blue-900">
            <div>
              <p className="font-bold">Migrating existing inventory?</p>
              <p className="text-blue-800/80 mt-0.5">
                Download the migration template, fill in your item codes, lot numbers, locations, and boxes count, then upload below.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadCsvTemplate}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-white px-3 py-1.5 font-bold text-brand-navy shadow-sm hover:bg-blue-50 transition-colors"
            >
              <Download size={14} /> Download Template (.CSV)
            </button>
          </div>

          {/* Upload Dropzone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-6 text-center hover:border-brand-navy/60 hover:bg-slate-100/50 cursor-pointer transition-all"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelected}
              className="hidden"
            />
            {parsing ? (
              <div className="flex items-center gap-2 text-brand-navy font-bold text-xs">
                <Loader2 size={20} className="animate-spin" />
                Parsing spreadsheet & validating item master codes…
              </div>
            ) : file ? (
              <div className="flex items-center gap-3">
                <FileSpreadsheet size={28} className="text-emerald-600" />
                <div className="text-left">
                  <p className="text-xs font-bold text-slate-900">{file.name}</p>
                  <p className="text-[11px] text-text-grey">
                    {(file.size / 1024).toFixed(1)} KB · Click to change file
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-brand-navy">
                  <Upload size={18} />
                </div>
                <p className="text-xs font-bold text-slate-800">
                  Click to browse or drag & drop your Excel (.xlsx) or CSV file
                </p>
                <p className="text-[11px] text-text-grey">
                  Columns: Item Code, Lot Number, Location Code, Boxes Count, SPQ, Expiry Date
                </p>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 flex items-start gap-2">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-600" />
              <span className="font-semibold">{successMessage}</span>
            </div>
          )}

          {/* Parsed Summary & Validation Table */}
          {rows.length > 0 && (
            <div className="space-y-3">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                  <span className="text-[10px] uppercase font-bold text-text-grey block">Total Lines</span>
                  <span className="font-mono text-base font-bold text-slate-800">{rows.length}</span>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-center">
                  <span className="text-[10px] uppercase font-bold text-emerald-700 block">Valid Rows</span>
                  <span className="font-mono text-base font-bold text-emerald-700">{validCount}</span>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
                  <span className="text-[10px] uppercase font-bold text-brand-navy block">Total Boxes</span>
                  <span className="font-mono text-base font-bold text-brand-navy">{totalBoxes.toLocaleString()}</span>
                </div>
                <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-center">
                  <span className="text-[10px] uppercase font-bold text-blue-900 block">Total Qty (PCS)</span>
                  <span className="font-mono text-base font-bold text-blue-900">{totalPcs.toLocaleString()}</span>
                </div>
              </div>

              {/* Data Preview Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white text-xs">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 font-bold text-slate-700">
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Item Code</th>
                      <th className="px-3 py-2">Item Name</th>
                      <th className="px-3 py-2">Lot #</th>
                      <th className="px-3 py-2">Location</th>
                      <th className="px-3 py-2 text-right">Boxes</th>
                      <th className="px-3 py-2 text-right">SPQ</th>
                      <th className="px-3 py-2 text-right">Total Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize).map((row, idx) => (
                      <tr key={idx} className={row.isValid ? "hover:bg-slate-50" : "bg-rose-50/40"}>
                        <td className="px-3 py-2">
                          {row.isValid ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                              <CheckCircle2 size={12} /> Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700" title={row.error}>
                              <AlertTriangle size={12} /> Invalid
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-bold text-brand-navy">{row.itemCode}</td>
                        <td className="px-3 py-2 font-sans truncate max-w-[140px]" title={row.itemName}>
                          {row.itemName}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{row.lotNumber}</td>
                        <td className="px-3 py-2 font-bold text-slate-800">{row.locationCode}</td>
                        <td className="px-3 py-2 text-right text-slate-800">{row.boxes}</td>
                        <td className="px-3 py-2 text-right text-text-grey">{row.spqResolved}</td>
                        <td className="px-3 py-2 text-right font-bold text-brand-navy">
                          {row.totalQty.toLocaleString()} {row.uom}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <TablePagination
                  pageIndex={pageIndex}
                  pageSize={pageSize}
                  totalCount={rows.length}
                  pageCount={Math.ceil(rows.length / pageSize) || 1}
                  canPreviousPage={pageIndex > 0}
                  canNextPage={pageIndex < (Math.ceil(rows.length / pageSize) || 1) - 1}
                  onPageChange={(newPageIndex) => setPageIndex(newPageIndex)}
                  onPageSizeChange={(newPageSize) => {
                    setPageSize(newPageSize);
                    setPageIndex(0);
                  }}
                  pageSizeOptions={[5, 10, 20, 50]}
                />
              </div>

              {invalidCount > 0 && (
                <p className="text-[11px] text-rose-700 italic">
                  Note: {invalidCount} invalid row(s) will be skipped during import. Please verify item codes and location codes.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-[#F9F9F6] p-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
          >
            Cancel
          </button>

          {rows.length > 0 && validCount > 0 && (
            <button
              type="button"
              disabled={posting}
              onClick={handleCommit}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-navy px-5 py-2 text-xs font-bold text-surface-white hover:bg-brand-navy/90 transition-all shadow-md disabled:opacity-50"
            >
              {posting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Posting {validCount} Stock Items…
                </>
              ) : (
                <>
                  Post {validCount} Opening Stock Lines <ArrowRight size={14} />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
