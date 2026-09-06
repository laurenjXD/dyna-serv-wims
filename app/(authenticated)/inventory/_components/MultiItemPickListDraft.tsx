"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, FileSpreadsheet, PackagePlus, ShieldCheck, Trash2, Upload } from "lucide-react";
import { parseDraDocumentAction } from "../_actions";

type StockSource = {
  itemId: string;
  itemCode: string;
  itemName: string;
  customerItemCode: string | null;
  organizationId: string | null;
  organizationName: string | null;
  flowType: "vmi" | "trading" | "supplies";
  uom: string;
  spq: number;
  spqMeter?: string | number | null;
  manufactureDate?: string | null;
  balanceId: string;
  lotId: string;
  lotNumber: string;
  locationId: string;
  locationLabel: string;
  availableQty: number;
  priority: number;
};

type DraftLine = {
  id: string;
  itemId: string;
  balanceId: string;
  qty: string;
  customSpq?: string;
  totalUnits?: string;
};

export function MultiItemPickListDraft({
  stock,
  createAction,
  overrideAction,
}: {
  stock: StockSource[];
  createAction: (formData: FormData) => void;
  overrideAction: (formData: FormData) => void;
}) {
  const organizations = useMemo(() => {
    const unique = new Map<string, string>();
    stock.forEach((row) => {
      if (row.organizationId) unique.set(row.organizationId, row.organizationName ?? row.organizationId);
    });
    return [...unique].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [stock]);

  const [organizationId, setOrganizationId] = useState("");
  const [flowType, setFlowType] = useState<"" | "vmi" | "trading" | "supplies">("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [overrideReason, setOverrideReason] = useState("");
  const [importingDra, setImportingDra] = useState(false);
  const [importSummary, setImportSummary] = useState<{ type: "success" | "warning" | "error"; message: string } | null>(null);

  const catalog = useMemo(() => {
    const grouped = new Map<string, StockSource[]>();
    stock
      .filter((row) => row.organizationId === organizationId && row.flowType === flowType)
      .forEach((row) => grouped.set(row.itemId, [...(grouped.get(row.itemId) ?? []), row]));
    return [...grouped.values()].map((sources) => ({
      itemId: sources[0].itemId,
      itemCode: sources[0].itemCode,
      itemName: sources[0].itemName,
      customerItemCode: sources[0].customerItemCode,
      uom: sources[0].uom,
      spq: sources[0].spq,
      spqMeter: sources[0].spqMeter,
      sources: sources
        .sort((a, b) => a.priority - b.priority)
        .map((source, index) => ({ ...source, priority: index + 1 })),
    }));
  }, [flowType, organizationId, stock]);

  const lineDetails = lines.map((line) => {
    const item = catalog.find((candidate) => candidate.itemId === line.itemId);
    const source = item?.sources.find((candidate) => candidate.balanceId === line.balanceId);
    const effectiveSpq = Number(line.customSpq) > 0 ? Number(line.customSpq) : (item?.spq ?? 1);
    const numBoxes = Number(line.qty) || 0;
    const computedTotalUnits = line.totalUnits !== undefined && line.totalUnits !== ""
      ? line.totalUnits
      : (numBoxes > 0 ? String(numBoxes * effectiveSpq) : "");
    return { line, item, source, effectiveSpq, numBoxes, computedTotalUnits };
  });

  const handlePackagesChange = (lineId: string, val: string, effectiveSpq: number) => {
    const boxes = Number(val) || 0;
    updateLine(lineId, {
      qty: val,
      totalUnits: val === "" ? "" : String(boxes * effectiveSpq),
    });
  };

  const handleTotalUnitsChange = (lineId: string, val: string, effectiveSpq: number) => {
    const units = Number(val) || 0;
    const boxes = val === "" ? "" : String(Math.max(1, Math.ceil(units / (effectiveSpq || 1))));
    updateLine(lineId, {
      totalUnits: val,
      qty: boxes,
    });
  };

  const handleSpqChange = (lineId: string, val: string, currentBoxes: number) => {
    const spqVal = Number(val) || 1;
    updateLine(lineId, {
      customSpq: val,
      totalUnits: currentBoxes > 0 ? String(currentBoxes * spqVal) : "",
    });
  };

  const request = useMemo(() => {
    if (!organizationId || !flowType || lineDetails.length === 0) return "";
    const prepared = lineDetails.map(({ line, item, source }) => ({
      itemId: line.itemId,
      lotId: source?.lotId,
      locationId: source?.locationId,
      qty: Number(line.qty),
      itemCodeIsProvisional: false,
      valid: Boolean(item && source && Number.isInteger(Number(line.qty)) && Number(line.qty) > 0 && Number(line.qty) <= (source?.availableQty ?? 0)),
    }));
    if (prepared.some((line) => !line.valid)) return "";
    return JSON.stringify({
      partyId: organizationId,
      flowType,
      lines: prepared.map(({ valid: _valid, ...line }) => line),
      enforceSourceSelection: true,
      idempotencyKey: crypto.randomUUID(),
    });
  }, [flowType, lineDetails, organizationId]);

  const alternateLines = lineDetails.filter(({ source }) => (source?.priority ?? 1) > 1);
  const requiresOverride = alternateLines.length > 0;
  const canRequestOverride = requiresOverride && lines.length === 1 && alternateLines.length === 1;

  const overrideRequest = useMemo(() => {
    const alternate = alternateLines[0];
    if (!canRequestOverride || !organizationId || !flowType || !alternate?.source) return "";
    const qty = Number(alternate.line.qty);
    if (!Number.isInteger(qty) || qty <= 0 || qty > alternate.source.availableQty) return "";
    return JSON.stringify({
      partyId: organizationId,
      flowType,
      lines: [{ itemId: alternate.line.itemId, lotId: alternate.source.lotId, locationId: alternate.source.locationId, qty }],
      idempotencyKey: crypto.randomUUID(),
    });
  }, [alternateLines, canRequestOverride, flowType, organizationId]);

  const addLine = () => setLines((current) => [...current, { id: crypto.randomUUID(), itemId: "", balanceId: "", qty: "" }]);
  const updateLine = (id: string, patch: Partial<DraftLine>) => setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  const removeLine = (id: string) => setLines((current) => current.filter((line) => line.id !== id));
  const resetDraft = () => setLines([]);
  const handleOrganization = (value: string) => {
    setOrganizationId(value);
    resetDraft();
    if (!value) {
      setFlowType("");
      return;
    }
    const availableFlows = (["vmi", "trading", "supplies"] as const).filter((flow) =>
      stock.some((row) => row.organizationId === value && row.flowType === flow)
    );
    if (availableFlows.length > 0) {
      setFlowType(availableFlows[0]);
    } else {
      setFlowType("");
    }
  };
  const handleFlow = (value: "" | "vmi" | "trading" | "supplies") => { setFlowType(value); resetDraft(); };

  async function handleDraImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingDra(true);
    setImportSummary(null);

    const formData = new FormData();
    formData.set("file", file);

    const res = await parseDraDocumentAction(formData);
    setImportingDra(false);

    if (!res.ok || !res.parseResult) {
      setImportSummary({ type: "error", message: res.error || "Failed to process DRA document." });
      return;
    }

    const { rows: draRows } = res.parseResult;
    if (draRows.length === 0) {
      setImportSummary({ type: "warning", message: "No release line items were extracted from the document." });
      return;
    }

    let targetOrgId = organizationId;
    let targetFlow = flowType;

    if (!targetOrgId) {
      for (const draRow of draRows) {
        if (!draRow.itemCode) continue;
        const matchedStock = stock.find(
          (s) =>
            s.itemCode.toLowerCase() === draRow.itemCode!.toLowerCase() ||
            (s.customerItemCode && s.customerItemCode.toLowerCase() === draRow.itemCode!.toLowerCase())
        );
        if (matchedStock && matchedStock.organizationId) {
          targetOrgId = matchedStock.organizationId;
          targetFlow = matchedStock.flowType;
          setOrganizationId(targetOrgId);
          setFlowType(targetFlow);
          break;
        }
      }
    }

    if (!targetOrgId || !targetFlow) {
      setImportSummary({
        type: "warning",
        message: "Please select Organization and Inventory Model first, or upload a DRA matching active stock.",
      });
      return;
    }

    const availableStock = stock.filter((s) => s.organizationId === targetOrgId && s.flowType === targetFlow);

    const newDraftLines: DraftLine[] = [];
    let mappedCount = 0;
    let totalBoxesAllocated = 0;
    const missingItems: string[] = [];

    for (const draRow of draRows) {
      if (!draRow.itemCode || !draRow.requestedQty) continue;

      const requestedItemCode = draRow.itemCode.toLowerCase();
      const candidateSources = availableStock
        .filter(
          (s) =>
            s.itemCode.toLowerCase() === requestedItemCode ||
            (s.customerItemCode && s.customerItemCode.toLowerCase() === requestedItemCode)
        )
        .sort((a, b) => a.priority - b.priority);

      if (candidateSources.length === 0) {
        missingItems.push(draRow.itemCode);
        continue;
      }

      let remainingQty = draRow.requestedQty;
      for (const source of candidateSources) {
        const availableInSource = Math.max(0, source.availableQty);
        if (availableInSource <= 0) continue;

        const take = Math.min(remainingQty, availableInSource);
        if (take > 0) {
          newDraftLines.push({
            id: crypto.randomUUID(),
            itemId: source.itemId,
            balanceId: source.balanceId,
            qty: String(take),
          });
          remainingQty -= take;
          totalBoxesAllocated += take;
          mappedCount++;
        }
        if (remainingQty <= 0) break;
      }

      if (remainingQty > 0) {
        missingItems.push(`${draRow.itemCode} (shortage of ${remainingQty} boxes)`);
      }
    }

    if (newDraftLines.length > 0) {
      setLines(newDraftLines);
      let summaryMsg = `Successfully mapped ${mappedCount} line(s) (${totalBoxesAllocated} boxes total) into Pick List draft.`;
      if (missingItems.length > 0) {
        summaryMsg += ` Items with shortages/unmatched: ${missingItems.join(", ")}.`;
      }
      setImportSummary({
        type: missingItems.length > 0 ? "warning" : "success",
        message: summaryMsg,
      });
    } else {
      setImportSummary({
        type: "error",
        message: `Could not match any items in the DRA document against available stock for this organization. Unmatched: ${missingItems.join(", ")}`,
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* DRA Excel / CSV / PDF Import Card */}
      <section className="rounded-2xl border border-slate-200/80 bg-[#F8FAFC] p-5 shadow-xs md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-surface-white shadow-xs">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-heading text-base font-bold text-slate-900">
                Import Delivery Release Advice (DRA)
              </h2>
              <p className="mt-0.5 font-body text-xs text-slate-500">
                Upload your client&apos;s DRA file (.xlsx, .csv, .pdf) to automatically map release items into the Pick List below.
              </p>
            </div>
          </div>

          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 font-label text-xs font-bold text-white shadow-xs hover:bg-brand-navy/90 transition-colors">
            <Upload className="h-4 w-4" />
            {importingDra ? "Parsing DRA..." : "Import DRA (Excel/PDF)"}
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.pdf,application/pdf,text/csv"
              className="sr-only"
              onChange={handleDraImport}
              disabled={importingDra}
            />
          </label>
        </div>

        {importSummary && (
          <div
            className={`mt-4 flex items-center justify-between rounded-xl p-3.5 border font-body text-xs ${
              importSummary.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : importSummary.type === "warning"
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : "bg-rose-50 text-rose-800 border-rose-200"
            }`}
          >
            <div className="flex items-start gap-2">
              {importSummary.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              )}
              <span>{importSummary.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setImportSummary(null)}
              className="ml-4 font-label text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              Dismiss
            </button>
          </div>
        )}
      </section>

      {/* Pick List Draft Builder Section */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="font-heading text-lg font-bold text-slate-900">Create Pick List</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-xs font-bold text-slate-700">
                {lines.length} {lines.length === 1 ? "line" : "lines"}
              </span>
            </div>
            <p className="mt-1 font-body text-xs text-slate-500">
              Select an organization and inventory model to manually add pick lines, or use the DRA Import card above to auto-populate.
            </p>
          </div>
          {lines.length > 0 && (
            <button
              type="button"
              onClick={resetDraft}
              className="font-label text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline"
            >
              Clear All Lines
            </button>
          )}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <label className="grid gap-1.5 font-label text-xs font-bold text-slate-700">
            Organization
            <select
              value={organizationId}
              onChange={(event) => handleOrganization(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
            >
              <option value="">Select organization…</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-1.5 font-label text-xs font-bold text-slate-700">
            <div className="flex items-center justify-between">
              <span>Inventory Model</span>
              {flowType && organizationId && (
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  Auto-assigned: {flowType.toUpperCase()}
                </span>
              )}
            </div>
            <select
              value={flowType}
              onChange={(event) => handleFlow(event.target.value as typeof flowType)}
              disabled={!organizationId}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value="">Select inventory model…</option>
              {(["vmi", "trading", "supplies"] as const)
                .filter((flow) => stock.some((row) => row.organizationId === organizationId && row.flowType === flow))
                .map((flow) => (
                  <option key={flow} value={flow}>
                    {flow === "vmi" ? "VMI (Consignment)" : flow === "trading" ? "Trading (Owned)" : "Supplies"}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Pick List Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="border-b border-slate-200 bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <th className="py-3 pl-4 pr-2 text-right w-24">Qty (Units)</th>
                <th className="py-3 px-2 text-right w-20">SPQ</th>
                <th className="py-3 px-2 text-right w-24">No. of Pkgs</th>
                <th className="py-3 px-3 min-w-[180px]">Item Code</th>
                <th className="py-3 px-3 min-w-[130px]">Cust PN</th>
                <th className="py-3 px-3 min-w-[200px]">Item Description</th>
                <th className="py-3 px-3 min-w-[130px]">Lot Number</th>
                <th className="py-3 px-3 min-w-[110px]">Mfg Date</th>
                <th className="py-3 px-3 min-w-[200px]">Location</th>
                <th className="py-3 pr-4 pl-2 w-10 text-center"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 px-4 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 mb-3">
                      <FileSpreadsheet className="h-6 w-6" />
                    </div>
                    <p className="font-heading text-sm font-bold text-slate-700">No pick lines added yet</p>
                    <p className="mt-1 font-body text-xs text-slate-400 max-w-md mx-auto">
                      Import a DRA document above or click &ldquo;+ Add item line&rdquo; below to manually build this pick list.
                    </p>
                  </td>
                </tr>
              ) : (
                lineDetails.map(({ line, item, source, effectiveSpq, numBoxes, computedTotalUnits }) => (
                  <tr key={line.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* Qty (Total Units input) */}
                    <td className="py-2.5 pl-4 pr-2 align-middle">
                      <input
                        value={computedTotalUnits}
                        onChange={(event) => handleTotalUnitsChange(line.id, event.target.value, effectiveSpq)}
                        type="number"
                        min="1"
                        disabled={!source}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-right font-mono text-xs font-semibold text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50 disabled:text-slate-400"
                        placeholder="0"
                        title="Total Units (Pieces)"
                      />
                    </td>

                    {/* SPQ (Standard Packaging Quantity input) */}
                    <td className="py-2.5 px-2 align-middle">
                      <input
                        value={line.customSpq ?? (item ? String(item.spq) : "")}
                        onChange={(event) => handleSpqChange(line.id, event.target.value, numBoxes)}
                        type="number"
                        min="1"
                        disabled={!item}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-right font-mono text-xs font-semibold text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50 disabled:text-slate-400"
                        placeholder="1"
                        title="Standard Packaging Quantity (SPQ)"
                      />
                    </td>

                    {/* No. of Pckgs (Box / Package count input) */}
                    <td className="py-2.5 px-2 align-middle">
                      <input
                        value={line.qty}
                        onChange={(event) => handlePackagesChange(line.id, event.target.value, effectiveSpq)}
                        type="number"
                        min="1"
                        max={source?.availableQty}
                        disabled={!source}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-right font-mono text-xs font-semibold text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50 disabled:text-slate-400"
                        placeholder="0"
                        title="Number of Packages (Boxes)"
                      />
                    </td>

                    {/* ITEM CODE */}
                    <td className="py-2.5 px-3 align-middle">
                      <select
                        value={line.itemId}
                        onChange={(event) => updateLine(line.id, { itemId: event.target.value, balanceId: "", qty: "" })}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-body text-xs text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
                      >
                        <option value="">Select item code…</option>
                        {catalog.map((candidate) => (
                          <option key={candidate.itemId} value={candidate.itemId}>
                            {candidate.itemCode}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* CUST PN */}
                    <td className="py-2.5 px-3 align-middle">
                      <span className="font-mono text-xs text-slate-700 block truncate max-w-[130px]" title={item?.customerItemCode ?? undefined}>
                        {item?.customerItemCode || <span className="text-slate-400">—</span>}
                      </span>
                    </td>

                    {/* ITEM DESCRIPTION */}
                    <td className="py-2.5 px-3 align-middle">
                      <span className="font-body text-xs text-slate-800 block truncate max-w-[200px]" title={item?.itemName ?? undefined}>
                        {item?.itemName || <span className="text-slate-400">—</span>}
                      </span>
                    </td>

                    {/* LOT NUMBER */}
                    <td className="py-2.5 px-3 align-middle">
                      <span className="font-mono text-xs text-slate-700 block truncate max-w-[130px]" title={source?.lotNumber ?? undefined}>
                        {source?.lotNumber || <span className="text-slate-400">—</span>}
                      </span>
                    </td>

                    {/* MFG DATE */}
                    <td className="py-2.5 px-3 align-middle">
                      <span className="font-mono text-xs text-slate-600 block">
                        {source?.manufactureDate ? new Date(source.manufactureDate).toLocaleDateString() : <span className="text-slate-400">—</span>}
                      </span>
                    </td>

                    {/* LOCATION */}
                    <td className="py-2.5 px-3 align-middle">
                      <select
                        value={line.balanceId}
                        disabled={!item}
                        onChange={(event) => updateLine(line.id, { balanceId: event.target.value, qty: "" })}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 font-body text-xs text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        <option value="">Select location…</option>
                        {item?.sources.map((candidate) => (
                          <option key={candidate.balanceId} value={candidate.balanceId}>
                            {candidate.locationLabel} ({candidate.availableQty} pckgs{candidate.priority === 1 ? " · FIFO/FEFO" : " · override req"})
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Action */}
                    <td className="py-2.5 pr-4 pl-2 align-middle text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        aria-label="Remove line"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            disabled={!organizationId || !flowType}
            onClick={addLine}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-label text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white transition-colors"
          >
            <PackagePlus size={16} aria-hidden="true" />
            Add item line
          </button>
          <form action={requiresOverride ? overrideAction : createAction}>
            <input type="hidden" name="request" value={requiresOverride ? overrideRequest : request} />
            {requiresOverride && <input type="hidden" name="reason" value={overrideReason} />}
            <button
              type="submit"
              disabled={requiresOverride ? !canRequestOverride || !overrideRequest || overrideReason.trim().length < 10 : !request}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-navy px-5 font-label text-xs font-bold text-white shadow-sm hover:bg-brand-navy/95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              {requiresOverride ? "Request Approval" : "Generate Pick List"}
              {requiresOverride ? <ShieldCheck size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
            </button>
          </form>
        </div>

        {requiresOverride && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-heading text-sm font-bold text-slate-900">FIFO/FEFO override approval required</p>
                <p className="mt-0.5 font-body text-xs text-slate-600">
                  This source is not the recommended location. An approved request is locked to the selected item, lot, location, and box quantity.
                </p>
              </div>
            </div>
            {canRequestOverride ? (
              <label className="mt-3.5 grid gap-1.5 font-label text-xs font-bold text-slate-700">
                Reason for choosing this location
                <textarea
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  minLength={10}
                  rows={3}
                  placeholder="Explain why the recommended source cannot be used."
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-body text-sm font-normal text-slate-900 outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
                />
                <span className="font-body text-xs font-normal text-slate-500">At least 10 characters are required.</span>
              </label>
            ) : (
              <p className="mt-3 font-body text-xs text-rose-600 font-medium">
                Request an approval for one alternate source at a time before adding other draft lines.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
