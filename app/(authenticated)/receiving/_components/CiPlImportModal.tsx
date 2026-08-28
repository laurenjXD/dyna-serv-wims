"use client";

import { useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, X, Check } from "lucide-react";
import type { WrrItemOption } from "@/lib/db/queries/items";
import type { CiplParseResult } from "@/lib/parsers/cipl-parser";
import { uploadAndParseCiplDocument } from "@/lib/actions/receiving";

interface CiPlImportModalProps {
  wrrId: string;
  itemOptions: WrrItemOption[];
  onClose: () => void;
  onApply: (
    header: CiplParseResult["header"],
    lines: {
      itemId: string;
      customerItemCode: string;
      lotNumber: string;
      mfgDate: string;
      expiryDate: string;
      expectedQty: string;
      uom: string;
      remarks: string;
      disposition: "store" | "inspect";
    }[]
  ) => void;
}

export function CiPlImportModal({ wrrId, itemOptions, onClose, onApply }: CiPlImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<CiplParseResult | null>(null);
  const [editedRows, setEditedRows] = useState<
    {
      itemId: string;
      itemCodeDisplay: string;
      customerItemCode: string;
      lotNumber: string;
      mfgDate: string;
      expiryDate: string;
      expectedQty: string;
      uom: string;
      remarks: string;
      disposition: "store" | "inspect";
    }[]
  >([]);

  async function handleFileSelect(selectedFile: File) {
    setFile(selectedFile);
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("file", selectedFile);

    const res = await uploadAndParseCiplDocument(wrrId, formData);
    setLoading(false);

    if (!res.ok || !res.parseResult) {
      setError(res.error || "Failed to process document.");
      return;
    }

    setParseResult(res.parseResult);

    // Map extracted rows to form lines and attempt item code matching
    const mapped = res.parseResult.rows.map((row) => {
      const match = itemOptions.find(
        (opt) =>
          (row.itemCode && (opt.code.toLowerCase() === row.itemCode.toLowerCase() || opt.supplierItemCode?.toLowerCase() === row.itemCode.toLowerCase())) ||
          (row.customerItemCode && opt.code.toLowerCase() === row.customerItemCode.toLowerCase())
      );

      return {
        itemId: match ? match.id : "",
        itemCodeDisplay: row.itemCode || "",
        customerItemCode: row.customerItemCode || "",
        lotNumber: row.lotNumber || "",
        mfgDate: row.mfgDate || "",
        expiryDate: row.expiryDate || "",
        expectedQty: row.expectedQty ? String(row.expectedQty) : "",
        uom: row.uom || "BOX",
        remarks: row.remarks || "",
        disposition: row.disposition || "store",
      };
    });

    setEditedRows(mapped);
  }

  function handleRowChange(index: number, field: string, value: string) {
    setEditedRows((prev) => {
      const copy = [...prev];
      if (field === "itemId") {
        const item = itemOptions.find((i) => i.id === value);
        copy[index] = { ...copy[index], itemId: value, itemCodeDisplay: item ? item.code : copy[index].itemCodeDisplay };
      } else {
        copy[index] = { ...copy[index], [field]: value };
      }
      return copy;
    });
  }

  function handleApply() {
    if (!parseResult) return;
    onApply(
      parseResult.header,
      editedRows.map((r) => ({
        itemId: r.itemId,
        customerItemCode: r.customerItemCode,
        lotNumber: r.lotNumber,
        mfgDate: r.mfgDate,
        expiryDate: r.expiryDate,
        expectedQty: r.expectedQty,
        uom: r.uom,
        remarks: r.remarks,
        disposition: r.disposition,
      }))
    );
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-surface-white shadow-elevation-3">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-navy/10 text-brand-navy">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-title-md font-bold text-on-surface">Import CIPL Document</h2>
              <p className="font-body text-body-xs text-text-grey">Upload Excel (.xlsx, .csv) or PDF (.pdf) Commercial Invoice & Packing List</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-text-grey hover:bg-surface-variant">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!parseResult ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant p-8 text-center bg-surface-variant/20">
              <Upload className="mb-4 h-12 w-12 text-brand-navy/60" />
              <h3 className="font-heading text-title-sm font-semibold text-on-surface">Choose CIPL File to Upload</h3>
              <p className="mt-1 font-body text-body-xs text-text-grey">Supports Excel (.xlsx, .xls, .csv) and PDF documents up to 10MB</p>
              
              <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-navy px-5 py-2.5 font-label text-label-md text-surface-white hover:opacity-90 transition-opacity">
                {loading ? "Parsing Document..." : "Select File"}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileSelect(f);
                  }}
                  disabled={loading}
                />
              </label>

              {error && (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-status-alert/10 p-3 text-status-alert font-body text-body-xs">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header metadata summary */}
              {parseResult.header.ciplReference && (
                <div className="rounded-lg bg-brand-navy/5 p-4 border border-brand-navy/10 flex items-center justify-between">
                  <div>
                    <span className="font-label text-label-xs text-text-grey">Detected CIPL Reference:</span>
                    <p className="font-mono text-title-xs font-bold text-brand-navy">{parseResult.header.ciplReference}</p>
                  </div>
                  {parseResult.header.invoiceDate && (
                    <div>
                      <span className="font-label text-label-xs text-text-grey">Invoice Date:</span>
                      <p className="font-body text-body-sm font-medium text-on-surface">{parseResult.header.invoiceDate}</p>
                    </div>
                  )}
                </div>
              )}

              {parseResult.warnings.length > 0 && (
                <div className="rounded-lg bg-amber-500/10 p-3 border border-amber-500/20 text-amber-800 font-body text-body-xs">
                  {parseResult.warnings.map((w, idx) => (
                    <p key={idx}>• {w}</p>
                  ))}
                </div>
              )}

              {/* Table preview */}
              <div>
                <h4 className="font-heading text-title-xs font-semibold text-on-surface mb-3">Extracted Line Items ({editedRows.length})</h4>
                <div className="overflow-x-auto rounded-lg border border-outline-variant/40">
                  <table className="w-full text-left border-collapse text-body-xs">
                    <thead>
                      <tr className="bg-surface-variant/40 border-b border-outline-variant/40 font-label text-label-xs text-text-grey">
                        <th className="p-3">Status</th>
                        <th className="p-3">Item Code (Master Data)</th>
                        <th className="p-3">Shipping Lot</th>
                        <th className="p-3">Expected Qty</th>
                        <th className="p-3">UOM</th>
                        <th className="p-3">Disposition</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {editedRows.map((row, idx) => {
                        const isMapped = Boolean(row.itemId);

                        return (
                          <tr key={idx} className={isMapped ? "bg-surface-white" : "bg-amber-500/5"}>
                            <td className="p-3">
                              {isMapped ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                                  <CheckCircle2 className="h-4 w-4" /> Matched
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                                  <AlertTriangle className="h-4 w-4" /> Unmapped
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              <select
                                value={row.itemId}
                                onChange={(e) => handleRowChange(idx, "itemId", e.target.value)}
                                className="w-full rounded border border-outline-variant/50 bg-surface-white px-2 py-1 text-on-surface font-body text-body-xs"
                              >
                                <option value="">-- Select Master Item ({row.itemCodeDisplay || "Extracted"}) --</option>
                                {itemOptions.map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.code} - {opt.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="p-3">
                              <input
                                type="text"
                                value={row.lotNumber}
                                onChange={(e) => handleRowChange(idx, "lotNumber", e.target.value)}
                                className="w-28 rounded border border-outline-variant/50 px-2 py-1 font-mono text-body-xs"
                              />
                            </td>
                            <td className="p-3">
                              <input
                                type="number"
                                value={row.expectedQty}
                                onChange={(e) => handleRowChange(idx, "expectedQty", e.target.value)}
                                className="w-20 rounded border border-outline-variant/50 px-2 py-1 font-mono text-body-xs"
                              />
                            </td>
                            <td className="p-3">
                              <input
                                type="text"
                                value={row.uom}
                                onChange={(e) => handleRowChange(idx, "uom", e.target.value)}
                                className="w-16 rounded border border-outline-variant/50 px-2 py-1 font-mono text-body-xs"
                              />
                            </td>
                            <td className="p-3">
                              <select
                                value={row.disposition}
                                onChange={(e) => handleRowChange(idx, "disposition", e.target.value as "store" | "inspect")}
                                className="rounded border border-outline-variant/50 bg-surface-white px-2 py-1 font-body text-body-xs"
                              >
                                <option value="store">Store</option>
                                <option value="inspect">Inspect</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {parseResult && (
          <div className="flex items-center justify-between border-t border-outline-variant/30 px-6 py-4 bg-surface-variant/10">
            <button
              onClick={() => setParseResult(null)}
              className="rounded-lg px-4 py-2 font-label text-label-sm text-text-grey hover:bg-surface-variant"
            >
              Upload Different File
            </button>
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="rounded-lg px-4 py-2 font-label text-label-sm text-text-grey hover:bg-surface-variant">
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={editedRows.filter((r) => Boolean(r.itemId)).length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-5 py-2 font-label text-label-sm text-surface-white hover:opacity-90 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Apply Lines to WRR Form
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
