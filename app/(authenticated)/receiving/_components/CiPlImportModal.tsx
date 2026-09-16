"use client";

import { useState } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, X, Check } from "lucide-react";
import type { WrrItemOption } from "@/lib/db/queries/items";
import type { CiplParseResult } from "@/lib/parsers/cipl-parser";
import { uploadAndParseCiplDocument } from "@/lib/actions/receiving";

export interface ImportedCiplLine {
  itemId: string;
  customerItemCode: string;
  description?: string;
  lotNumber: string;
  mfgDate: string;
  expiryDate: string;
  expectedQty: string;
  unitCbm?: string;
  uom: string;
  remarks: string;
  disposition: "store" | "inspect";
}

interface CiPlImportModalProps {
  wrrId: string;
  itemOptions: WrrItemOption[];
  onClose: () => void;
  onApply: (
    header: CiplParseResult["header"],
    lines: ImportedCiplLine[]
  ) => void;
}

export function CiPlImportModal({ wrrId, itemOptions, onClose, onApply }: CiPlImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<CiplParseResult | null>(null);
  const [editedHeader, setEditedHeader] = useState<{
    ciplReference: string;
    invoiceDate: string;
    ipNumber: string;
    mawbMbl: string;
  }>({
    ciplReference: "",
    invoiceDate: "",
    ipNumber: "",
    mawbMbl: "",
  });
  const [editedRows, setEditedRows] = useState<
    {
      itemId: string;
      itemCodeDisplay: string;
      customerItemCode: string;
      description: string;
      lotNumber: string;
      mfgDate: string;
      expiryDate: string;
      expectedQty: string;
      unitCbm: string;
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
    setEditedHeader({
      ciplReference: res.parseResult.header.ciplReference || "",
      invoiceDate: res.parseResult.header.invoiceDate || "",
      ipNumber: res.parseResult.header.ipNumber || "",
      mawbMbl: res.parseResult.header.mawbMbl || "",
    });

    // Map extracted rows to form lines and attempt item code matching
    const mapped = res.parseResult.rows.map((row) => {
      const match = itemOptions.find((opt) => {
        const itemCodeMatch =
          row.itemCode &&
          (opt.code.toLowerCase() === row.itemCode.toLowerCase() ||
            opt.supplierItemCode?.toLowerCase() === row.itemCode.toLowerCase() ||
            opt.dsgcItemNumber?.toLowerCase() === row.itemCode.toLowerCase());

        const custCodeMatch =
          row.customerItemCode &&
          (opt.code.toLowerCase() === row.customerItemCode.toLowerCase() ||
            opt.customerItemCode?.toLowerCase() === row.customerItemCode.toLowerCase());

        return itemCodeMatch || custCodeMatch;
      });

      return {
        itemId: match ? match.id : "",
        itemCodeDisplay: row.itemCode || (match ? match.code : ""),
        customerItemCode: row.customerItemCode || (match ? match.customerItemCode ?? "" : ""),
        description: row.description || (match ? match.name : ""),
        lotNumber: row.lotNumber || "",
        mfgDate: row.mfgDate || "",
        expiryDate: row.expiryDate || "",
        expectedQty: row.expectedQty ? String(row.expectedQty) : "",
        unitCbm: row.cbm ? String(row.cbm) : (match ? match.volumeCbm : "0.001"),
        uom: row.uom || (match ? match.uom : "BOX"),
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
        copy[index] = {
          ...copy[index],
          itemId: value,
          itemCodeDisplay: item ? item.code : copy[index].itemCodeDisplay,
          description: item ? item.name : copy[index].description,
          customerItemCode: copy[index].customerItemCode || (item ? item.customerItemCode ?? "" : ""),
          unitCbm: item ? item.volumeCbm : copy[index].unitCbm,
          uom: copy[index].uom || (item ? item.uom : "BOX"),
        };
      } else {
        copy[index] = { ...copy[index], [field]: value };
      }
      return copy;
    });
  }

  function handleApply() {
    if (!parseResult) return;
    onApply(
      {
        ...parseResult.header,
        ciplReference: editedHeader.ciplReference || parseResult.header.ciplReference,
        invoiceDate: editedHeader.invoiceDate || parseResult.header.invoiceDate,
        ipNumber: editedHeader.ipNumber || parseResult.header.ipNumber,
        mawbMbl: editedHeader.mawbMbl || parseResult.header.mawbMbl,
      },
      editedRows.map((r) => ({
        itemId: r.itemId,
        customerItemCode: r.customerItemCode,
        description: r.description,
        lotNumber: r.lotNumber,
        mfgDate: r.mfgDate,
        expiryDate: r.expiryDate,
        expectedQty: r.expectedQty,
        unitCbm: r.unitCbm,
        uom: r.uom,
        remarks: r.remarks,
        disposition: r.disposition,
      }))
    );
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col rounded-xl bg-surface-white shadow-elevation-3">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-navy/10 text-brand-navy">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-title-md font-bold text-on-surface">Import CIPL Document</h2>
              <p className="font-body text-body-xs text-text-grey">Upload Excel (.xlsx, .xls, .csv) or PDF (.pdf) Commercial Invoice & Packing List</p>
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
              {/* Header metadata summary & edit cards */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-brand-navy/10 bg-brand-navy/5 p-4">
                <div>
                  <label className="block font-label text-[10px] uppercase font-bold text-text-grey">Detected CIPL Ref:</label>
                  <input
                    type="text"
                    value={editedHeader.ciplReference}
                    onChange={(e) => setEditedHeader((prev) => ({ ...prev, ciplReference: e.target.value }))}
                    placeholder="Invoice #"
                    className="mt-1 w-full rounded border border-outline-variant/40 bg-surface-white px-2.5 py-1 font-mono text-body-xs font-bold text-brand-navy"
                  />
                </div>
                <div>
                  <label className="block font-label text-[10px] uppercase font-bold text-text-grey">Invoice Date:</label>
                  <input
                    type="text"
                    value={editedHeader.invoiceDate}
                    onChange={(e) => setEditedHeader((prev) => ({ ...prev, invoiceDate: e.target.value }))}
                    placeholder="YYYY-MM-DD"
                    className="mt-1 w-full rounded border border-outline-variant/40 bg-surface-white px-2.5 py-1 font-mono text-body-xs text-on-surface"
                  />
                </div>
                <div>
                  <label className="block font-label text-[10px] uppercase font-bold text-text-grey">Import Permit (IP #):</label>
                  <input
                    type="text"
                    value={editedHeader.ipNumber}
                    onChange={(e) => setEditedHeader((prev) => ({ ...prev, ipNumber: e.target.value }))}
                    placeholder="IP Number"
                    className="mt-1 w-full rounded border border-outline-variant/40 bg-surface-white px-2.5 py-1 font-mono text-body-xs text-on-surface"
                  />
                </div>
                <div>
                  <label className="block font-label text-[10px] uppercase font-bold text-text-grey">MAWB / MBL #:</label>
                  <input
                    type="text"
                    value={editedHeader.mawbMbl}
                    onChange={(e) => setEditedHeader((prev) => ({ ...prev, mawbMbl: e.target.value }))}
                    placeholder="Waybill / BL #"
                    className="mt-1 w-full rounded border border-outline-variant/40 bg-surface-white px-2.5 py-1 font-mono text-body-xs text-on-surface"
                  />
                </div>
              </div>

              {parseResult.warnings.length > 0 && (
                <div className="rounded-lg bg-amber-500/10 p-3 border border-amber-500/20 text-amber-800 font-body text-body-xs">
                  {parseResult.warnings.map((w, idx) => (
                    <p key={idx}>• {w}</p>
                  ))}
                </div>
              )}

              {/* Table preview */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-heading text-title-xs font-semibold text-on-surface">Extracted Line Items ({editedRows.length})</h4>
                  <span className="text-[11px] text-text-grey font-mono">Review and confirm item code mappings</span>
                </div>
                <div className="overflow-x-auto rounded-lg border border-outline-variant/40 max-h-[50vh]">
                  <table className="w-full text-left border-collapse text-body-xs min-w-[900px]">
                    <thead className="sticky top-0 bg-surface-variant/80 backdrop-blur z-10">
                      <tr className="border-b border-outline-variant/40 font-label text-label-xs text-text-grey">
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5 min-w-[200px]">Item Code (Master Data)</th>
                        <th className="p-2.5 min-w-[120px]">Cust Part #</th>
                        <th className="p-2.5 min-w-[180px]">Item Description</th>
                        <th className="p-2.5 min-w-[110px]">Shipping Lot</th>
                        <th className="p-2.5 min-w-[100px]">MFD</th>
                        <th className="p-2.5 min-w-[80px]">Unit CBM</th>
                        <th className="p-2.5 min-w-[85px] text-right">Expected Qty</th>
                        <th className="p-2.5 min-w-[65px]">UOM</th>
                        <th className="p-2.5 min-w-[90px]">Disposition</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20">
                      {editedRows.map((row, idx) => {
                        const isMapped = Boolean(row.itemId);

                        return (
                          <tr key={idx} className={isMapped ? "bg-surface-white hover:bg-slate-50" : "bg-amber-500/5 hover:bg-amber-500/10"}>
                            <td className="p-2.5 whitespace-nowrap">
                              {isMapped ? (
                                <span className="inline-flex items-center gap-1 text-emerald-600 font-medium text-[11px]">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Matched
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-600 font-medium text-[11px]">
                                  <AlertTriangle className="h-3.5 w-3.5" /> Unmapped
                                </span>
                              )}
                            </td>
                            <td className="p-2.5">
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
                            <td className="p-2.5">
                              <input
                                type="text"
                                value={row.customerItemCode}
                                onChange={(e) => handleRowChange(idx, "customerItemCode", e.target.value)}
                                placeholder="Cust P/N"
                                className="w-full rounded border border-outline-variant/50 px-2 py-1 font-mono text-[11px]"
                              />
                            </td>
                            <td className="p-2.5">
                              <input
                                type="text"
                                value={row.description}
                                onChange={(e) => handleRowChange(idx, "description", e.target.value)}
                                placeholder="Description"
                                className="w-full rounded border border-outline-variant/50 px-2 py-1 text-[11px]"
                              />
                            </td>
                            <td className="p-2.5">
                              <input
                                type="text"
                                value={row.lotNumber}
                                onChange={(e) => handleRowChange(idx, "lotNumber", e.target.value)}
                                placeholder="Lot #"
                                className="w-full rounded border border-outline-variant/50 px-2 py-1 font-mono text-[11px]"
                              />
                            </td>
                            <td className="p-2.5">
                              <input
                                type="text"
                                value={row.mfgDate}
                                onChange={(e) => handleRowChange(idx, "mfgDate", e.target.value)}
                                placeholder="YYYY-MM-DD"
                                className="w-full rounded border border-outline-variant/50 px-2 py-1 font-mono text-[11px]"
                              />
                            </td>
                            <td className="p-2.5">
                              <input
                                type="text"
                                value={row.unitCbm}
                                onChange={(e) => handleRowChange(idx, "unitCbm", e.target.value)}
                                placeholder="CBM"
                                className="w-full rounded border border-outline-variant/50 px-2 py-1 font-mono text-[11px]"
                              />
                            </td>
                            <td className="p-2.5 text-right">
                              <input
                                type="number"
                                value={row.expectedQty}
                                onChange={(e) => handleRowChange(idx, "expectedQty", e.target.value)}
                                className="w-20 rounded border border-outline-variant/50 px-2 py-1 font-mono text-body-xs text-right"
                              />
                            </td>
                            <td className="p-2.5">
                              <input
                                type="text"
                                value={row.uom}
                                onChange={(e) => handleRowChange(idx, "uom", e.target.value)}
                                className="w-14 rounded border border-outline-variant/50 px-2 py-1 font-mono text-[11px] uppercase"
                              />
                            </td>
                            <td className="p-2.5">
                              <select
                                value={row.disposition}
                                onChange={(e) => handleRowChange(idx, "disposition", e.target.value)}
                                className="rounded border border-outline-variant/50 px-2 py-1 text-[11px]"
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
