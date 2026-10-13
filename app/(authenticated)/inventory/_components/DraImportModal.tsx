"use client";

import { useState } from "react";
import { Upload, FileSpreadsheet, AlertTriangle, X, Check, CheckCircle2, Sparkles } from "lucide-react";
import type { DraParseResult } from "@/lib/parsers/dra-parser";
import { matchItemAgainstCatalog } from "@/lib/parsers/item-matcher";
import { parseDraDocumentAction } from "../_actions";

interface DraImportModalProps {
  itemCode: string;
  availableStock: number;
  onClose: () => void;
  onApplyQuantity: (parsedQuantity: number) => void;
}

export function DraImportModal({ itemCode, availableStock, onClose, onApplyQuantity }: DraImportModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<DraParseResult | null>(null);
  const [matchedQty, setMatchedQty] = useState<number | null>(null);
  const [matchedRowIndex, setMatchedRowIndex] = useState<number | null>(null);
  const [matchExplanation, setMatchExplanation] = useState<string | null>(null);

  async function handleFileSelect(file: File) {
    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.set("file", file);

    const res = await parseDraDocumentAction(formData);
    setLoading(false);

    if (!res.ok || !res.parseResult) {
      setError(res.error || "Failed to process DRA document.");
      return;
    }

    setParseResult(res.parseResult);

    // Fuzzy match each extracted row against target itemCode
    let bestRowIdx = -1;
    let bestRowScore = 0;
    let bestReason = "";

    const targetCatalog = [
      {
        id: "target",
        code: itemCode,
        customerItemCode: itemCode,
        supplierItemCode: itemCode,
        dsgcItemNumber: itemCode,
      },
    ];

    for (let i = 0; i < res.parseResult.rows.length; i++) {
      const r = res.parseResult.rows[i];
      const matchRes = matchItemAgainstCatalog(
        { itemCode: r.itemCode, customerItemCode: r.customerItemCode },
        targetCatalog
      );

      if (matchRes.bestMatch && matchRes.bestMatch.score > bestRowScore) {
        bestRowScore = matchRes.bestMatch.score;
        bestRowIdx = i;
        bestReason = matchRes.bestMatch.matchReason;
      }
    }

    if (bestRowIdx !== -1 && bestRowScore >= 70) {
      const matchedRow = res.parseResult.rows[bestRowIdx];
      setMatchedRowIndex(bestRowIdx);
      setMatchedQty(matchedRow.requestedQty ?? matchedRow.packageCount ?? 0);
      setMatchExplanation(`${bestReason} (${bestRowScore}%)`);
    } else {
      setMatchedRowIndex(null);
      setMatchedQty(null);
      setMatchExplanation(null);
    }
  }

  function handleSelectRow(idx: number) {
    if (!parseResult) return;
    const row = parseResult.rows[idx];
    if (row) {
      setMatchedRowIndex(idx);
      setMatchedQty(row.requestedQty ?? row.packageCount ?? 0);
      setMatchExplanation("Manually selected from document");
    }
  }

  function handleApply() {
    if (matchedQty && matchedQty > 0) {
      onApplyQuantity(matchedQty);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-surface-white shadow-elevation-3">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-navy/10 text-brand-navy">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-title-md font-bold text-on-surface">Import DRA Document</h2>
              <p className="font-body text-body-xs text-text-grey">Upload Delivery Release Advice (.xlsx, .csv, .pdf) for {itemCode}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-text-grey hover:bg-surface-variant">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {!parseResult ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-outline-variant p-8 text-center bg-surface-variant/20">
              <Upload className="mb-4 h-12 w-12 text-brand-navy/60" />
              <h3 className="font-heading text-title-sm font-semibold text-on-surface">Choose DRA File to Upload</h3>
              <p className="mt-1 font-body text-body-xs text-text-grey">Supports Excel (.xlsx, .xls, .csv) and PDF documents</p>

              <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand-navy px-5 py-2.5 font-label text-label-md text-surface-white hover:opacity-90 transition-opacity">
                {loading ? "Parsing DRA..." : "Select File"}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,.pdf,application/pdf,text/csv"
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
            <div className="space-y-4">
              {parseResult.header.draReference && (
                <div className="rounded-lg bg-brand-navy/5 p-4 border border-brand-navy/10 flex items-center justify-between">
                  <div>
                    <span className="font-label text-label-xs text-text-grey">DRA Reference:</span>
                    <p className="font-mono text-title-xs font-bold text-brand-navy">{parseResult.header.draReference}</p>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-outline-variant/40 p-4 space-y-3 bg-surface-white">
                <h4 className="font-heading text-title-xs font-semibold text-on-surface">Release Advice Quantity Breakdown</h4>

                <div className="grid grid-cols-2 gap-4 text-body-xs">
                  <div className="rounded border p-3 bg-surface-variant/20">
                    <span className="text-text-grey font-label text-label-xs">Target Item Code:</span>
                    <p className="font-mono font-bold text-on-surface">{itemCode}</p>
                  </div>
                  <div className="rounded border p-3 bg-surface-variant/20">
                    <span className="text-text-grey font-label text-label-xs">Available Stock:</span>
                    <p className="font-mono font-bold text-emerald-600">{availableStock} Units</p>
                  </div>
                </div>

                {matchedRowIndex !== null && matchExplanation ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        Matched Document Line {matchedRowIndex + 1}
                      </span>
                      <span className="text-[11px] font-mono font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                        {matchExplanation}
                      </span>
                    </div>
                    <p className="text-xs text-emerald-900/80">
                      Extracted Code: <span className="font-mono font-bold">{parseResult.rows[matchedRowIndex]?.itemCode || parseResult.rows[matchedRowIndex]?.customerItemCode || "N/A"}</span>
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                      <span>Item not automatically matched with high confidence.</span>
                    </div>
                    <p className="text-xs text-amber-900/80">
                      Please pick the corresponding line below from the uploaded document:
                    </p>
                  </div>
                )}

                {/* Document Line Selector */}
                <div className="space-y-1">
                  <label className="block font-label text-label-xs text-text-grey">
                    Document Line Items ({parseResult.rows.length}):
                  </label>
                  <select
                    value={matchedRowIndex ?? ""}
                    onChange={(e) => {
                      if (e.target.value !== "") {
                        handleSelectRow(Number(e.target.value));
                      } else {
                        setMatchedRowIndex(null);
                        setMatchedQty(null);
                        setMatchExplanation(null);
                      }
                    }}
                    className="w-full rounded border border-outline-variant/50 bg-surface-white px-3 py-2 text-on-surface font-body text-body-xs"
                  >
                    <option value="">-- Choose document line item --</option>
                    {parseResult.rows.map((row, idx) => (
                      <option key={idx} value={idx}>
                        Line {idx + 1}: {row.itemCode || row.customerItemCode || "Item"} (Qty: {row.requestedQty ?? row.packageCount ?? 0} {row.uom || "BOX"})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-2">
                  <label className="block font-label text-label-xs text-text-grey mb-1">Requested Release Quantity to Apply:</label>
                  <input
                    type="number"
                    value={matchedQty ?? ""}
                    onChange={(e) => setMatchedQty(e.target.value ? Number(e.target.value) : null)}
                    max={availableStock}
                    min={1}
                    placeholder="Enter or select quantity"
                    className="w-full h-11 rounded border border-outline-variant/50 bg-surface-white px-3 font-mono text-on-surface"
                  />
                </div>

                {matchedQty && matchedQty > availableStock && (
                  <div className="flex items-center gap-2 rounded bg-status-alert/10 p-3 text-status-alert font-body text-body-xs">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Requested quantity ({matchedQty}) exceeds available stock ({availableStock}). Max {availableStock} can be picked.</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {parseResult && (
          <div className="flex items-center justify-between border-t border-outline-variant/30 px-6 py-4 bg-surface-variant/10">
            <button onClick={() => setParseResult(null)} className="rounded-lg px-4 py-2 font-label text-label-sm text-text-grey hover:bg-surface-variant">
              Choose Another File
            </button>
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="rounded-lg px-4 py-2 font-label text-label-sm text-text-grey hover:bg-surface-variant">
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={!matchedQty || matchedQty <= 0}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-navy px-5 py-2 font-label text-label-sm text-surface-white hover:opacity-90 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Fill Pick List Quantity
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
