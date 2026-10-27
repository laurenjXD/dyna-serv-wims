"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, FileSpreadsheet, PackagePlus, ShieldCheck, Trash2, Upload } from "@/components/ui/icons";
import { parseDraDocumentAction } from "../_actions";
import { matchItemAgainstCatalog } from "@/lib/parsers/item-matcher";
import { boxesToPieces, piecesToBoxes } from "@/lib/inventory/quantities";
import { MobileDataCard, MobileDataCardList } from "@/components/ui/MobileDataCard";

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
  totalUnits?: string;
};

export function MultiItemPickListDraft({
  stock,
  customers,
  endCustomers,
  createAction,
  overrideAction,
}: {
  stock: StockSource[];
  customers: Array<{ id: string; code: string; name: string; relationship: string }>;
  endCustomers: Array<{ id: string; code: string; name: string }>;
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
  const [customerPartyId, setCustomerPartyId] = useState("");
  const [endCustomerPartyId, setEndCustomerPartyId] = useState("");
  const [flowType, setFlowType] = useState<"" | "vmi" | "trading" | "supplies">("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [overrideReason, setOverrideReason] = useState("");
  const [importingDra, setImportingDra] = useState(false);
  const [importSummary, setImportSummary] = useState<{ type: "success" | "warning" | "error"; message: string } | null>(null);
  const visibleCustomers = useMemo(() => customers.filter((customer) =>
    flowType === "vmi"
      ? customer.relationship === "vmi_customer"
      : flowType === "trading"
        ? customer.relationship === "trading_customer"
        : false,
  ), [customers, flowType]);

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
    // SPQ is master-data packaging, not a per-pick override. Using the
    // catalog value here keeps the displayed boxes and server request aligned.
    const effectiveSpq = item?.spq ?? 1;
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

  const request = useMemo(() => {
    const effectiveCustomerPartyId = flowType === "vmi" ? organizationId : customerPartyId;
    if (!organizationId || !effectiveCustomerPartyId || !flowType || lineDetails.length === 0) return "";
    if (flowType === "vmi" && !endCustomerPartyId) return "";
    const recipientPartyId = flowType === "supplies"
      ? organizationId
      : flowType === "trading" ? customerPartyId : endCustomerPartyId;
    const prepared = lineDetails.map(({ line, item, source }) => ({
      itemId: line.itemId,
      lotId: source?.lotId,
      locationId: source?.locationId,
      qty: boxesToPieces(Number(line.qty), item?.spq ?? 1),
      itemCodeIsProvisional: false,
      valid: Boolean(
        item &&
          source &&
          Number.isInteger(Number(line.qty)) &&
          Number(line.qty) > 0 &&
          boxesToPieces(Number(line.qty), item.spq) <= source.availableQty,
      ),
    }));
    if (prepared.some((line) => !line.valid)) return "";
    return JSON.stringify({
      partyId: organizationId,
      customerPartyId: effectiveCustomerPartyId,
      endCustomerPartyId: recipientPartyId,
      flowType,
      lines: prepared.map(({ valid: _valid, ...line }) => line),
      enforceSourceSelection: true,
      idempotencyKey: crypto.randomUUID(),
    });
  }, [customerPartyId, endCustomerPartyId, flowType, lineDetails, organizationId]);

  const alternateLines = lineDetails.filter(({ source }) => (source?.priority ?? 1) > 1);
  const requiresOverride = alternateLines.length > 0;
  const canRequestOverride = requiresOverride && lines.length === 1 && alternateLines.length === 1;

  const overrideRequest = useMemo(() => {
    const alternate = alternateLines[0];
    const effectiveCustomerPartyId = flowType === "vmi" ? organizationId : customerPartyId;
    if (!canRequestOverride || !organizationId || !effectiveCustomerPartyId || !flowType || !alternate?.source) return "";
    if (flowType === "vmi" && !endCustomerPartyId) return "";
    const qty = Number(alternate.line.qty);
    if (
      !Number.isInteger(qty) ||
      qty <= 0 ||
      boxesToPieces(qty, alternate.item?.spq ?? 1) > alternate.source.availableQty
    ) return "";
    const recipientPartyId = flowType === "supplies"
      ? organizationId
      : flowType === "trading" ? customerPartyId : endCustomerPartyId;
    return JSON.stringify({
      partyId: organizationId,
      customerPartyId: effectiveCustomerPartyId,
      endCustomerPartyId: recipientPartyId,
      flowType,
      lines: [{ itemId: alternate.line.itemId, lotId: alternate.source.lotId, locationId: alternate.source.locationId, qty: boxesToPieces(qty, alternate.item?.spq ?? 1) }],
      idempotencyKey: crypto.randomUUID(),
    });
  }, [alternateLines, canRequestOverride, customerPartyId, endCustomerPartyId, flowType, organizationId]);

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
      setCustomerPartyId(availableFlows[0] === "vmi" || availableFlows[0] === "supplies" ? value : "");
      setEndCustomerPartyId(availableFlows[0] === "supplies" ? value : "");
    } else {
      setFlowType("");
      setCustomerPartyId("");
      setEndCustomerPartyId("");
    }
  };
  const handleFlow = (value: "" | "vmi" | "trading" | "supplies") => {
    setFlowType(value);
    resetDraft();
    if (value === "vmi" || value === "supplies") {
      setCustomerPartyId(organizationId);
      setEndCustomerPartyId(organizationId);
    } else {
      // Customer/end-customer selections are model-specific. Never carry a
      // valid selection from one model into another model's relationship.
      setCustomerPartyId("");
      setEndCustomerPartyId("");
    }
  };

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

    const { rows: draRows, header: draHeader } = res.parseResult;
    if (draRows.length === 0) {
      setImportSummary({ type: "warning", message: "No release line items were extracted from the document." });
      return;
    }

    let targetOrgId = organizationId;
    let targetFlow = flowType;

    const requestedOrganization = draHeader.requestingOrganization ?? draHeader.customerOrganization;
    if (!requestedOrganization && !targetOrgId) {
      setImportSummary({
        type: "warning",
        message: "DRA must identify the requesting Organization before items can be imported.",
      });
      return;
    }
    if (requestedOrganization && !targetOrgId) {
      const normalizedRequested = requestedOrganization.trim().toLowerCase();
      const organizationMatches = organizations.filter((organization) =>
        organization.name.trim().toLowerCase() === normalizedRequested,
      );
      if (organizationMatches.length !== 1) {
        setImportSummary({
          type: "warning",
          message: organizationMatches.length === 0
            ? `The DRA Organization “${requestedOrganization}” is not enrolled or is not present in current stock.`
            : `The DRA Organization “${requestedOrganization}” matched multiple records. Select the Organization manually before importing.`,
        });
        return;
      }
      targetOrgId = organizationMatches[0].id;
      setOrganizationId(targetOrgId);
    }

    if (!targetOrgId) {
      for (const draRow of draRows) {
        if (!draRow.itemCode && !draRow.customerItemCode) continue;
        const matchRes = matchItemAgainstCatalog(
          { itemCode: draRow.itemCode, customerItemCode: draRow.customerItemCode },
          stock.map((s) => ({
            id: s.itemId,
            code: s.itemCode,
            name: s.itemName,
            customerItemCode: s.customerItemCode,
            defaultSupplierPartyId: s.organizationId,
          }))
        );

        if (matchRes.bestMatch && matchRes.bestMatch.score >= 70) {
          const matchedStock = stock.find((s) => s.itemId === matchRes.bestMatch!.item.id);
          if (matchedStock && matchedStock.organizationId) {
            targetOrgId = matchedStock.organizationId;
            targetFlow = matchedStock.flowType;
            setOrganizationId(targetOrgId);
            setFlowType(targetFlow);
            break;
          }
        }
      }
    }

    if (targetOrgId && !targetFlow) {
      const organizationFlows = [...new Set(
        stock.filter((row) => row.organizationId === targetOrgId).map((row) => row.flowType),
      )];
      if (organizationFlows.length === 1) {
        targetFlow = organizationFlows[0];
        setFlowType(targetFlow);
      } else if (organizationFlows.length > 1) {
        setImportSummary({
          type: "warning",
          message: "The DRA Organization has more than one Inventory Model. Select the correct model before importing its lines.",
        });
        return;
      }
    }

    if (!targetOrgId || !targetFlow) {
      setImportSummary({
        type: "warning",
        message: "Please select Organization and Inventory Model first, or upload a DRA matching active stock.",
      });
      return;
    }

    if (targetFlow === "vmi" || targetFlow === "supplies") {
      setCustomerPartyId(targetOrgId);
    }

    const availableStock = stock.filter((s) => s.organizationId === targetOrgId && s.flowType === targetFlow);

    const newDraftLines: DraftLine[] = [];
    let mappedCount = 0;
    let totalBoxesAllocated = 0;
    const missingItems: string[] = [];

    for (const draRow of draRows) {
      const requestedBoxes = draRow.packageCount || draRow.requestedQty;
      if (!requestedBoxes) continue;

      const matchRes = matchItemAgainstCatalog(
        { itemCode: draRow.itemCode, customerItemCode: draRow.customerItemCode },
        availableStock.map((s) => ({
          id: s.itemId,
          code: s.itemCode,
          name: s.itemName,
          customerItemCode: s.customerItemCode,
        }))
      );

      const matchedItemId = matchRes.bestMatch && matchRes.bestMatch.score >= 65 ? matchRes.bestMatch.item.id : null;
      const candidateSources = matchedItemId
        ? availableStock.filter((s) => s.itemId === matchedItemId).sort((a, b) => a.priority - b.priority)
        : [];

      if (candidateSources.length === 0) {
        missingItems.push(draRow.customerItemCode || draRow.itemCode || "Unknown Item");
        continue;
      }

      let remainingQty = requestedBoxes;
      for (const source of candidateSources) {
        const availableInSource = Math.max(0, Math.floor(piecesToBoxes(source.availableQty, source.spq)));
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
    <div className="space-y-4">
      {/* Pick List Draft Builder Section */}
      <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-4 sm:p-5">
        {/* Header with Integrated Compact DRA Import */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-heading text-base font-bold text-slate-900">Create Pick List</h2>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-600">
                {lines.length} {lines.length === 1 ? "line" : "lines"}
              </span>
            </div>
            <p className="mt-0.5 font-body text-xs text-slate-500">
              Select organization and inventory model, or import a DRA file (.xlsx, .csv, .pdf) to auto-populate lines.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-label text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors">
              <Upload className="h-3.5 w-3.5 text-slate-500" />
              {importingDra ? "Parsing DRA..." : "Import DRA (Excel/PDF)"}
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,application/pdf,text/csv"
                className="sr-only"
                onChange={handleDraImport}
                disabled={importingDra}
              />
            </label>

            {lines.length > 0 && (
              <button
                type="button"
                onClick={resetDraft}
                className="font-label text-xs font-semibold text-rose-600 hover:text-rose-700 hover:underline px-1.5"
              >
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* DRA Import Feedback Banner */}
        {importSummary && (
          <div
            className={`flex items-center justify-between rounded-lg px-3 py-2 border font-body text-xs ${
              importSummary.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : importSummary.type === "warning"
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : "bg-rose-50 text-rose-800 border-rose-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {importSummary.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              )}
              <span>{importSummary.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setImportSummary(null)}
              className="ml-3 font-label text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid min-w-0 max-w-full gap-4 md:grid-cols-2">
          <label className="grid min-w-0 gap-1 font-label text-xs font-bold text-slate-700">
            Organization
            <select
              value={organizationId}
              onChange={(event) => handleOrganization(event.target.value)}
              className="h-11 min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
            >
              <option value="">Select organization…</option>
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>

          {flowType === "supplies" ? (
            <div className="grid gap-1 font-label text-xs font-bold text-slate-700">
              Internal Supplies Organization
              <div className="flex min-h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 font-body text-xs text-slate-700">
                {organizations.find((organization) => organization.id === organizationId)?.name ?? "Selected Internal Supplies Organization"}
              </div>
              <span className="font-body text-[11px] font-normal text-slate-500">Supplies issues are assigned to the selected Internal Supplies Organization.</span>
            </div>
          ) : flowType === "trading" ? (
            <div className="grid gap-1 font-label text-xs font-bold text-slate-700">
              Customer / Recipient
              <div className="flex min-h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 font-body text-xs text-slate-700">
                {customerPartyId
                  ? visibleCustomers.find((party) => party.id === customerPartyId)?.name ?? "Selected trading customer"
                  : "Select a trading customer below"}
              </div>
              <span className="font-body text-[11px] font-normal text-slate-500">Trading ships from Dyna-Serv to the selected trading customer.</span>
            </div>
          ) : (
            <label className="grid min-w-0 gap-1 font-label text-xs font-bold text-slate-700">
              End Customer / Recipient
              <select
                value={endCustomerPartyId}
                onChange={(event) => setEndCustomerPartyId(event.target.value)}
                disabled={!customerPartyId || flowType !== "vmi"}
                required={flowType === "vmi"}
                className="h-11 min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">Select end customer...</option>
                {endCustomers.map((party) => (
                  <option key={party.id} value={party.id}>{party.name} ({party.code})</option>
                ))}
              </select>
              <span className="font-body text-[11px] font-normal text-slate-500">VMI releases require the downstream end customer who will receive the stock.</span>
            </label>
          )}

          {flowType === "vmi" ? (
            <div className="grid min-w-0 gap-1 font-label text-xs font-bold text-slate-700">
              VMI Customer / Stock Owner
              <div className="flex h-11 min-w-0 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 font-body text-sm text-slate-700">
                {organizations.find((organization) => organization.id === organizationId)?.name ?? "Selected Organization"}
              </div>
              <span className="font-body text-[11px] font-normal text-slate-500">Inherited from Organization; the selected Organization owns the VMI stock.</span>
            </div>
          ) : (
            <label className="grid min-w-0 gap-1 font-label text-xs font-bold text-slate-700">
              {flowType === "supplies" ? "Internal Supplies Organization" : "Trading Customer / Recipient"}
              <select
                value={customerPartyId}
                onChange={(event) => {
                  const nextCustomerId = event.target.value;
                  setCustomerPartyId(nextCustomerId);
                  setEndCustomerPartyId(flowType === "trading" ? nextCustomerId : organizationId);
                }}
                required={flowType !== "supplies"}
                disabled={flowType === "supplies"}
                className="h-11 min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">Select customer…</option>
                {flowType === "supplies" && (
                  <option value={organizationId}>
                    {organizations.find((organization) => organization.id === organizationId)?.name ?? "Internal Supplies Organization"}
                  </option>
                )}
                {visibleCustomers.map((customer) => (
                  <option key={`${customer.id}:${customer.relationship}`} value={customer.id}>
                    {customer.name} — {customer.relationship === "trading_customer" ? "Customer · Trading" : "Customer"}
                  </option>
                ))}
              </select>
              <span className="font-body text-[11px] font-normal text-slate-500">
                {flowType === "supplies"
                  ? "The Internal Supplies Organization is the consuming recipient."
                  : "The trading customer is both the bill-to and delivery recipient."}
              </span>
            </label>
          )}

          <div className="grid min-w-0 gap-1 font-label text-xs font-bold text-slate-700">
            <div className="flex items-center justify-between">
              <span>Inventory Model</span>
              {flowType && organizationId && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  Auto-assigned: {flowType.toUpperCase()}
                </span>
              )}
            </div>
            <select
              value={flowType}
              onChange={(event) => handleFlow(event.target.value as typeof flowType)}
              disabled={!organizationId}
              className="h-11 min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50 disabled:text-slate-400"
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

        {/* Pick List: mobile cards */}
        <div className="md:hidden">
          {lines.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center">
              <FileSpreadsheet className="mx-auto h-8 w-8 text-slate-400" />
              <p className="mt-3 font-heading text-sm font-bold text-slate-700">No pick lines added yet</p>
              <p className="mt-1 font-body text-sm text-slate-500">Import a DRA document or add an item line below.</p>
            </div>
          ) : (
            <MobileDataCardList>
              {lineDetails.map(({ line, item, source, effectiveSpq, computedTotalUnits }) => (
                <MobileDataCard
                  key={line.id}
                  title={item?.itemCode || "Select an item"}
                  subtitle={item?.itemName || "Item line requires selection"}
                  badge={<button type="button" onClick={() => removeLine(line.id)} className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy" aria-label="Remove line"><Trash2 size={18} aria-hidden="true" /></button>}
                >
                  <div className="mt-3 grid min-w-0 gap-3">
                    <label className="grid min-w-0 gap-1 font-label text-xs font-bold text-slate-700">
                      Item Code
                      <select value={line.itemId} onChange={(event) => updateLine(line.id, { itemId: event.target.value, balanceId: "", qty: "" })} className="h-11 min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-base text-slate-900 outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10">
                        <option value="">Select item code…</option>
                        {catalog.map((candidate) => <option key={candidate.itemId} value={candidate.itemId}>{candidate.itemCode}</option>)}
                      </select>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="grid min-w-0 gap-1 font-label text-xs font-bold text-slate-700">
                        Qty (Units)
                        <input value={computedTotalUnits} onChange={(event) => handleTotalUnitsChange(line.id, event.target.value, effectiveSpq)} type="number" min="1" disabled={!source} className="h-11 min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 text-right font-mono text-base text-slate-900 outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50" placeholder="0" />
                      </label>
                      <label className="grid min-w-0 gap-1 font-label text-xs font-bold text-slate-700">
                        Packages
                        <input value={line.qty} onChange={(event) => handlePackagesChange(line.id, event.target.value, effectiveSpq)} type="number" min="1" max={source ? Math.floor(piecesToBoxes(source.availableQty, effectiveSpq)) : undefined} disabled={!source} className="h-11 min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 text-right font-mono text-base text-slate-900 outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50" placeholder="0" />
                      </label>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 font-body text-sm">
                      <div><dt className="text-slate-500">SPQ</dt><dd className="mt-1 font-mono font-bold text-slate-900">{item?.spq ?? "—"}</dd></div>
                      <div><dt className="text-slate-500">Customer PN</dt><dd className="mt-1 break-words font-mono text-slate-900">{item?.customerItemCode || "—"}</dd></div>
                      <div><dt className="text-slate-500">Lot</dt><dd className="mt-1 break-words font-mono text-slate-900">{source?.lotNumber || "—"}</dd></div>
                      <div><dt className="text-slate-500">Mfg. Date</dt><dd className="mt-1 font-mono text-slate-900">{source?.manufactureDate ? new Date(source.manufactureDate).toLocaleDateString() : "—"}</dd></div>
                    </dl>
                    <label className="grid min-w-0 gap-1 font-label text-xs font-bold text-slate-700">
                      Location
                      <select value={line.balanceId} disabled={!item} onChange={(event) => updateLine(line.id, { balanceId: event.target.value, qty: "" })} className="h-11 min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-base text-slate-900 outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50 disabled:text-slate-400">
                        <option value="">Select location…</option>
                        {item?.sources.map((candidate) => <option key={candidate.balanceId} value={candidate.balanceId}>{candidate.locationLabel} ({piecesToBoxes(candidate.availableQty, candidate.spq).toLocaleString(undefined, { maximumFractionDigits: 2 })} boxes{candidate.priority === 1 ? " · FIFO/FEFO" : " · override req"})</option>)}
                      </select>
                    </label>
                  </div>
                </MobileDataCard>
              ))}
            </MobileDataCardList>
          )}
        </div>

        {/* Pick List Table: desktop */}
        <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs md:block">
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
                lineDetails.map(({ line, item, source, effectiveSpq, computedTotalUnits }) => (
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
                        value={item ? String(item.spq) : ""}
                        type="number"
                        min="1"
                        disabled
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
                        max={source ? Math.floor(piecesToBoxes(source.availableQty, effectiveSpq)) : undefined}
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
                            {candidate.locationLabel} ({piecesToBoxes(candidate.availableQty, candidate.spq).toLocaleString(undefined, { maximumFractionDigits: 2 })} boxes{candidate.priority === 1 ? " · FIFO/FEFO" : " · override req"})
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
