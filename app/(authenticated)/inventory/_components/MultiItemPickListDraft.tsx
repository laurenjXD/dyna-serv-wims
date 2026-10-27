"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, FileSpreadsheet, PackagePlus, Search, Trash2, Upload } from "@/components/ui/icons";
import { parseDraDocumentAction } from "../_actions";
import { matchItemAgainstCatalog } from "@/lib/parsers/item-matcher";
import { boxesToPieces, exactCartonCount, piecesToBoxes } from "@/lib/inventory/quantities";
import { MobileDataCard, MobileDataCardList } from "@/components/ui/MobileDataCard";

type StockSource = {
  itemId: string;
  itemCode: string;
  itemName: string;
  supplierItemCode?: string | null;
  dsgcItemNumber?: string | null;
  customerItemCode: string | null;
  organizationId: string | null;
  organizationName: string | null;
  flowType: "vmi" | "trading" | "supplies";
  uom: string;
  volumeCbm?: string | number | null;
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
  totalUnits: string;
};

type FifoBoxAllocation = {
  source: StockSource;
  boxes: number;
  availableBoxes: number;
  remainingBoxes: number;
};

type CatalogItem = {
  itemId: string;
  itemCode: string;
  itemName: string;
  supplierItemCode?: string | null;
  dsgcItemNumber?: string | null;
  customerItemCode: string | null;
  uom: string;
  spq: number;
  volumeCbm?: string | number | null;
  sources: StockSource[];
};

function itemCodeFor(item: Pick<CatalogItem, "itemCode" | "supplierItemCode" | "dsgcItemNumber">, flowType: string) {
  return flowType === "trading"
    ? (item.dsgcItemNumber ?? item.itemCode)
    : (item.supplierItemCode ?? item.itemCode);
}

function PickListItemSearch({
  catalog,
  flowType,
  selectedItemId,
  onSelectItem,
  disabled = false,
}: {
  catalog: CatalogItem[];
  flowType: string;
  selectedItemId: string;
  onSelectItem: (itemId: string) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selectedItem = catalog.find((item) => item.itemId === selectedItemId);

  useEffect(() => {
    setInputValue(selectedItem ? itemCodeFor(selectedItem, flowType) : "");
  }, [flowType, selectedItem]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const query = inputValue.trim().toLowerCase();
  const filteredItems = catalog.filter((item) => {
    if (!query) return true;
    return [
      itemCodeFor(item, flowType),
      item.itemCode,
      item.itemName,
      item.customerItemCode,
      item.supplierItemCode,
      item.dsgcItemNumber,
    ].some((value) => value?.toLowerCase().includes(query));
  });

  useEffect(() => {
    if (!isOpen) {
      setDropdownPosition(null);
      return;
    }

    const updateDropdownPosition = () => {
      const anchor = dropdownRef.current?.getBoundingClientRect();
      if (!anchor) return;

      const viewportPadding = 8;
      const minWidth = 280;
      const width = Math.min(
        Math.max(anchor.width, minWidth),
        Math.max(minWidth, window.innerWidth - viewportPadding * 2),
      );
      const left = Math.min(
        anchor.left,
        Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
      );
      const estimatedHeight = Math.min(320, Math.max(96, filteredItems.length * 82 + 48));
      const top = anchor.bottom + estimatedHeight <= window.innerHeight - viewportPadding
        ? anchor.bottom + 4
        : Math.max(viewportPadding, anchor.top - estimatedHeight - 4);

      setDropdownPosition({ top, left, width });
    };

    updateDropdownPosition();
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);
    return () => {
      window.removeEventListener("resize", updateDropdownPosition);
      window.removeEventListener("scroll", updateDropdownPosition, true);
    };
  }, [filteredItems.length, isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative flex items-center">
        <Search className="absolute left-3 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        <input
          type="text"
          disabled={disabled}
          value={inputValue}
          role="combobox"
          aria-label="Search item code"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          onFocus={() => {
            if (!disabled) setIsOpen(true);
          }}
          onChange={(event) => {
            const value = event.target.value;
            setInputValue(value);
            if (selectedItem && value !== itemCodeFor(selectedItem, flowType)) onSelectItem("");
            if (!isOpen && !disabled) setIsOpen(true);
          }}
          placeholder={disabled ? "Select organization and model first" : "Type item code, description, or customer code…"}
          className={`h-9 w-full rounded-lg border pl-8 pr-8 font-body text-xs text-slate-900 shadow-2xs outline-none transition-colors focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 ${
            disabled ? "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400" : "border-slate-200 bg-white"
          }`}
        />
        <ChevronDown
          onClick={() => {
            if (!disabled) setIsOpen((open) => !open);
          }}
          className={`absolute right-2.5 h-4 w-4 text-slate-500 transition-transform ${isOpen ? "rotate-180" : ""} ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
          aria-hidden="true"
        />
      </div>

      {isOpen && !disabled && dropdownPosition && createPortal(
        <div
          className="fixed z-[100] max-h-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          style={{ top: dropdownPosition.top, left: dropdownPosition.left, width: dropdownPosition.width }}
        >
          <div className="border-b border-slate-100 bg-[#F0F4FF] px-3 py-2">
            <p className="truncate font-label text-[10px] uppercase tracking-wider text-slate-500">
              Available Item Recommendations ({filteredItems.length})
            </p>
          </div>
          <div id={listboxId} role="listbox" className="max-h-64 overflow-y-auto divide-y divide-slate-100 p-1">
            {filteredItems.length > 0 ? filteredItems.map((item) => {
              const formattedCode = itemCodeFor(item, flowType);
              const isSelected = item.itemId === selectedItemId;
              const availableBoxes = item.sources.reduce(
                (sum, source) => sum + Math.max(0, Math.floor(piecesToBoxes(source.availableQty, source.spq))),
                0,
              );
              return (
                <button
                  key={item.itemId}
                  type="button"
                  onClick={() => {
                    onSelectItem(item.itemId);
                    setInputValue(formattedCode);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-start justify-between gap-3 rounded-lg p-2.5 text-left transition-colors ${isSelected ? "bg-brand-navy/10 text-brand-navy" : "text-slate-900 hover:bg-slate-50"}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-mono text-xs font-bold text-brand-navy">{formattedCode}</span>
                      {item.customerItemCode && <span className="truncate font-mono text-[10px] text-slate-500">(Cust: {item.customerItemCode})</span>}
                      <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 font-label text-[10px] font-bold uppercase tracking-wide text-emerald-800">Available</span>
                    </div>
                    <p className="mt-0.5 truncate font-body text-xs text-slate-700">{item.itemName}</p>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-slate-500">
                      <span>SPQ: {item.spq}</span>
                      <span aria-hidden="true">•</span>
                      <span>UOM: {item.uom}</span>
                      <span aria-hidden="true">•</span>
                      <span>CBM: {item.volumeCbm ?? "—"}</span>
                      <span aria-hidden="true">•</span>
                      <span>{availableBoxes} boxes available</span>
                    </div>
                  </div>
                  {isSelected && <Check className="mt-1 h-4 w-4 shrink-0 text-brand-navy" aria-hidden="true" />}
                </button>
              );
            }) : (
              <div className="p-4 text-center">
                <AlertCircle className="mx-auto h-7 w-7 text-rose-400" aria-hidden="true" />
                <p className="mt-2 font-body text-xs font-semibold text-slate-800">No available item found</p>
                <p className="mt-0.5 font-body text-[11px] text-slate-500">Try another item code, description, or customer code.</p>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function allocateFifoBoxes(sources: StockSource[], requestedBoxes: number): FifoBoxAllocation[] {
  if (!Number.isInteger(requestedBoxes) || requestedBoxes <= 0) return [];

  let remaining = requestedBoxes;
  const allocations: FifoBoxAllocation[] = [];
  for (const source of [...sources].sort((a, b) => a.priority - b.priority)) {
    if (remaining <= 0) break;
    const availableBoxes = Math.max(0, Math.floor(piecesToBoxes(source.availableQty, source.spq)));
    const boxes = Math.min(remaining, availableBoxes);
    if (boxes <= 0) continue;
    allocations.push({
      source,
      boxes,
      availableBoxes,
      remainingBoxes: availableBoxes - boxes,
    });
    remaining -= boxes;
  }
  return allocations;
}

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
  // Kept in the component contract for callers that also expose the shared
  // FIFO-override action. This draft now derives only the standard FIFO/FEFO
  // source plan, so alternate-source approval is not offered from this UI.
  void overrideAction;

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
    return [...grouped.values()].map((sources): CatalogItem => ({
      itemId: sources[0].itemId,
      itemCode: sources[0].itemCode,
      itemName: sources[0].itemName,
      supplierItemCode: sources[0].supplierItemCode,
      dsgcItemNumber: sources[0].dsgcItemNumber,
      customerItemCode: sources[0].customerItemCode,
      uom: sources[0].uom,
      spq: sources[0].spq,
      volumeCbm: sources[0].volumeCbm,
      sources: sources
        .sort((a, b) => a.priority - b.priority)
        .map((source, index) => ({ ...source, priority: index + 1 })),
    }));
  }, [flowType, organizationId, stock]);

  const lineDetails = lines.map((line) => {
    const item = catalog.find((candidate) => candidate.itemId === line.itemId);
    const effectiveSpq = item?.spq ?? 0;
    const requestedUnits = Number(line.totalUnits);
    const requestedBoxes = item && Number.isInteger(requestedUnits) && requestedUnits > 0
      ? exactCartonCount(requestedUnits, effectiveSpq)
      : null;
    const fifoAllocations = item && requestedBoxes ? allocateFifoBoxes(item.sources, requestedBoxes) : [];
    const allocatedBoxes = fifoAllocations.reduce((sum, allocation) => sum + allocation.boxes, 0);
    const totalAvailableBoxes = item?.sources.reduce(
      (sum, source) => sum + Math.max(0, Math.floor(piecesToBoxes(source.availableQty, source.spq))),
      0,
    ) ?? 0;
    const hasWholeCartonQuantity = requestedBoxes !== null;
    const hasEnoughStock = requestedBoxes !== null && allocatedBoxes === requestedBoxes;
    return {
      line,
      item,
      effectiveSpq,
      requestedUnits,
      requestedBoxes,
      fifoAllocations,
      allocatedBoxes,
      totalAvailableBoxes,
      hasWholeCartonQuantity,
      hasEnoughStock,
    };
  });

  const handleTotalUnitsChange = (lineId: string, val: string) => {
    updateLine(lineId, { totalUnits: val });
  };

  const request = useMemo(() => {
    const effectiveCustomerPartyId = flowType === "vmi" ? organizationId : customerPartyId;
    if (!organizationId || !effectiveCustomerPartyId || !flowType || lineDetails.length === 0) return "";
    if (flowType === "vmi" && !endCustomerPartyId) return "";
    const recipientPartyId = flowType === "supplies"
      ? organizationId
      : flowType === "trading" ? customerPartyId : endCustomerPartyId;
    const prepared = lineDetails.flatMap(({ line, item, requestedBoxes, fifoAllocations, hasWholeCartonQuantity, hasEnoughStock }) =>
      fifoAllocations.map(({ source, boxes }) => ({
        itemId: line.itemId,
        lotId: source.lotId,
        locationId: source.locationId,
        qty: boxesToPieces(boxes, item?.spq ?? 1),
        itemCodeIsProvisional: false,
        valid: Boolean(item && requestedBoxes !== null && hasWholeCartonQuantity && hasEnoughStock),
      })),
    );
    if (
      prepared.length === 0 ||
      lineDetails.some(({ item, requestedBoxes, hasWholeCartonQuantity, hasEnoughStock }) =>
        !item || requestedBoxes === null || !hasWholeCartonQuantity || !hasEnoughStock,
      ) ||
      prepared.some((line) => !line.valid)
    ) return "";
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

  const addLine = () => setLines((current) => [...current, { id: crypto.randomUUID(), itemId: "", totalUnits: "" }]);
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

    // Delivery To identifies the recipient, not the stock-owning Organization.
    // If the DRA has no explicit requester, the operator must choose the stock
    // Organization in this form rather than inferring it from the recipient.
    const requestedOrganization = draHeader.requestingOrganization;
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

    // The sample DRA has a Delivery To organization. Use it only to suggest
    // the recipient/customer; it never changes the stock Organization.
    const recipientName = draHeader.recipientOrganization?.trim().toLowerCase();
    if (recipientName) {
      if (targetFlow === "vmi") {
        const recipientMatches = endCustomers.filter((customer) =>
          customer.name.trim().toLowerCase() === recipientName || customer.code.trim().toLowerCase() === recipientName,
        );
        if (recipientMatches.length === 1) setEndCustomerPartyId(recipientMatches[0].id);
      } else if (targetFlow === "trading") {
        const recipientMatches = visibleCustomers.filter((customer) =>
          customer.name.trim().toLowerCase() === recipientName || customer.code.trim().toLowerCase() === recipientName,
        );
        if (recipientMatches.length === 1) setCustomerPartyId(recipientMatches[0].id);
      }
    }

    const availableStock = stock.filter((s) => s.organizationId === targetOrgId && s.flowType === targetFlow);

    const newDraftLines: DraftLine[] = [];
    let mappedCount = 0;
    let totalBoxesAllocated = 0;
    const reviewItems: string[] = [];
    const importRequests = new Map<string, { itemId: string; spq: number; requestedBoxes: number; labels: string[] }>();

    for (const draRow of draRows) {
      const documentQty = draRow.requestedQty == null ? null : Number(draRow.requestedQty);
      const documentBoxes = draRow.packageCount == null ? null : Number(draRow.packageCount);
      const documentSpq = draRow.spq == null ? null : Number(draRow.spq);
      const rowLabel = draRow.customerItemCode || draRow.itemCode || draRow.itemDescription || "Unknown Item";
      if (documentBoxes !== null && (!Number.isInteger(documentBoxes) || documentBoxes <= 0)) {
        reviewItems.push(`${rowLabel} (invalid number of boxes)`);
        continue;
      }
      if (documentQty !== null && (!Number.isInteger(documentQty) || documentQty <= 0)) {
        reviewItems.push(`${rowLabel} (invalid quantity)`);
        continue;
      }

      const matchRes = matchItemAgainstCatalog(
        {
          itemCode: draRow.itemCode,
          customerItemCode: draRow.customerItemCode,
          description: draRow.itemDescription,
        },
        availableStock.map((s) => ({
          id: s.itemId,
          code: s.itemCode,
          name: s.itemName,
          customerItemCode: s.customerItemCode,
          supplierItemCode: s.supplierItemCode,
          dsgcItemNumber: s.dsgcItemNumber,
        }))
      );

      const bestScore = matchRes.bestMatch?.score ?? 0;
      const topCandidates = matchRes.bestMatch
        ? matchRes.candidates.filter((candidate) => candidate.score === matchRes.bestMatch?.score)
        : [];
      const descriptionOnlyMatch = matchRes.bestMatch?.matchedField === "name";
      if (!matchRes.bestMatch || bestScore < 65 || topCandidates.length > 1 || descriptionOnlyMatch) {
        reviewItems.push(`${rowLabel} (select the enrolled item manually${descriptionOnlyMatch ? "; description is not a unique identifier" : ""})`);
        continue;
      }

      const matchedItemId = matchRes.bestMatch.item.id;
      const candidateSources = matchedItemId
        ? availableStock.filter((s) => s.itemId === matchedItemId).sort((a, b) => a.priority - b.priority)
        : [];

      if (candidateSources.length === 0) {
        reviewItems.push(`${rowLabel} (no available stock for the selected Organization/model)`);
        continue;
      }

      const spq = candidateSources[0].spq;
      const spqMismatch = documentSpq !== null && documentSpq !== spq;
      const quantityBoxMismatch = documentQty !== null && documentBoxes !== null && documentQty !== documentBoxes * spq;
      const requestedBoxes = documentBoxes ?? (
        documentQty !== null && documentQty % spq === 0 ? documentQty / spq : null
      );
      if (spqMismatch || quantityBoxMismatch || requestedBoxes === null || !Number.isInteger(requestedBoxes) || requestedBoxes <= 0) {
        reviewItems.push(`${rowLabel} (QTY, SPQ, and number of boxes do not agree with enrolled SPQ ${spq})`);
        continue;
      }

      const existingRequest = importRequests.get(matchedItemId);
      if (existingRequest) {
        existingRequest.requestedBoxes += requestedBoxes;
        existingRequest.labels.push(rowLabel);
      } else {
        importRequests.set(matchedItemId, {
          itemId: matchedItemId,
          spq,
          requestedBoxes,
          labels: [rowLabel],
        });
      }
    }

    // Validate duplicate DRA rows together. PO/business-unit columns are not
    // part of the pick-list identity, so repeated item rows become one total
    // demand line before FIFO/FEFO source allocation.
    for (const request of importRequests.values()) {
      const candidateSources = availableStock
        .filter((source) => source.itemId === request.itemId)
        .sort((a, b) => a.priority - b.priority);
      const availableBoxes = candidateSources.reduce(
        (sum, source) => sum + Math.max(0, Math.floor(piecesToBoxes(source.availableQty, source.spq))),
        0,
      );
      if (availableBoxes < request.requestedBoxes) {
        reviewItems.push(`${request.labels.join(" + ")} (shortage of ${request.requestedBoxes - availableBoxes} boxes)`);
        continue;
      }
      newDraftLines.push({
        id: crypto.randomUUID(),
        itemId: request.itemId,
        totalUnits: String(request.requestedBoxes * request.spq),
      });
      totalBoxesAllocated += request.requestedBoxes;
      mappedCount++;
    }

    if (newDraftLines.length > 0) {
      setLines(newDraftLines);
      let summaryMsg = `Successfully mapped ${mappedCount} line(s) (${totalBoxesAllocated} boxes total) into Pick List draft.`;
      if (reviewItems.length > 0) {
        summaryMsg += ` Rows requiring review: ${reviewItems.join(", ")}.`;
      }
      setImportSummary({
        type: reviewItems.length > 0 ? "warning" : "success",
        message: summaryMsg,
      });
    } else {
      setImportSummary({
        type: "error",
        message: `No DRA lines were ready to import. Review manually: ${reviewItems.join(", ") || "select the Organization, model, and enrolled item codes first."}`,
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

          {flowType === "vmi" ? null : (
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
              {lineDetails.map(({ line, item, requestedBoxes, fifoAllocations, hasWholeCartonQuantity, hasEnoughStock, totalAvailableBoxes }) => (
                <MobileDataCard
                  key={line.id}
                  title={item ? itemCodeFor(item, flowType) : "Select an item"}
                  subtitle={item?.itemName || "Item line requires selection"}
                  badge={<button type="button" onClick={() => removeLine(line.id)} className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy" aria-label="Remove line"><Trash2 size={18} aria-hidden="true" /></button>}
                >
                  <div className="mt-3 grid min-w-0 gap-3">
                    <label className="grid min-w-0 gap-1 font-label text-xs font-bold text-slate-700">
                      Item Code
                      <PickListItemSearch
                        catalog={catalog}
                        flowType={flowType}
                        selectedItemId={line.itemId}
                        onSelectItem={(itemId) => updateLine(line.id, { itemId, totalUnits: "" })}
                        disabled={!organizationId || !flowType}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="grid min-w-0 gap-1 font-label text-xs font-bold text-slate-700">
                        Qty (Units)
                        <input value={line.totalUnits} onChange={(event) => handleTotalUnitsChange(line.id, event.target.value)} type="number" min="1" disabled={!item} className="h-11 min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 text-right font-mono text-base text-slate-900 outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50" placeholder="0" />
                      </label>
                      <label className="grid min-w-0 gap-1 font-label text-xs font-bold text-slate-700">
                        Number of Boxes
                        <div className="flex h-11 items-center justify-end rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-base font-semibold text-slate-900">
                          {requestedBoxes ?? "—"}
                        </div>
                      </label>
                    </div>
                    <label className="grid min-w-0 gap-1 font-label text-xs font-bold text-slate-700">
                      Location
                      <div className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 font-body text-base text-slate-900">
                        {fifoAllocations.length > 0 ? fifoAllocations.map(({ source, boxes }) => (
                          <div key={source.balanceId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            <span className="truncate">{source.locationLabel} <span className="text-sm text-slate-500">({source.lotNumber})</span></span>
                            <span className="font-mono text-sm font-semibold text-brand-navy">{boxes} boxes</span>
                          </div>
                        )) : <span className="text-slate-400">{!item ? "Select item code first" : !hasWholeCartonQuantity ? `Qty must be a complete multiple of SPQ (${item.spq})` : "No FIFO source can fulfill this quantity"}</span>}
                      </div>
                    </label>
                    <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 font-body text-sm">
                      <div><dt className="text-slate-500">SPQ</dt><dd className="mt-1 font-mono font-bold text-slate-900">{item?.spq ?? "—"}</dd></div>
                      <div><dt className="text-slate-500">Remaining</dt><dd className="mt-1 font-mono font-bold text-slate-900">{Math.max(0, totalAvailableBoxes - (requestedBoxes ?? 0))} boxes</dd></div>
                      <div><dt className="text-slate-500">Customer PN</dt><dd className="mt-1 break-words font-mono text-slate-900">{item?.customerItemCode || "—"}</dd></div>
                      <div><dt className="text-slate-500">Lot</dt><dd className="mt-1 break-words font-mono text-slate-900">{[...new Set(fifoAllocations.map(({ source }) => source.lotNumber))].join(", ") || "—"}</dd></div>
                      <div><dt className="text-slate-500">Mfg. Date</dt><dd className="mt-1 font-mono text-slate-900">{fifoAllocations[0]?.source.manufactureDate ? new Date(fifoAllocations[0].source.manufactureDate).toLocaleDateString() : "—"}</dd></div>
                    </dl>
                    {item && requestedBoxes !== null && !hasEnoughStock && <p className="text-sm font-medium text-rose-600">Only {totalAvailableBoxes} boxes are available across FIFO locations.</p>}
                  </div>
                </MobileDataCard>
              ))}
            </MobileDataCardList>
          )}
        </div>

        {/* Pick List Table: desktop */}
        <div className="hidden min-w-0 max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-2xs md:block">
          <table aria-label="Pick list lines" className="w-full min-w-[1180px] table-fixed border-collapse text-left">
            <caption className="sr-only">Pick list lines and selected inventory sources</caption>
            <colgroup>
              <col className="w-[175px]" />
              <col className="w-[78px]" />
              <col className="w-[100px]" />
              <col className="w-[112px]" />
              <col className="w-[230px]" />
              <col className="w-[110px]" />
              <col className="w-[125px]" />
              <col className="w-[190px]" />
              <col className="w-[135px]" />
              <col className="w-[112px]" />
              <col className="w-[52px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-wider text-slate-600">
                <th scope="col" className="py-3 px-3">Item Code</th>
                <th scope="col" className="py-3 px-2 text-right">SPQ</th>
                <th scope="col" className="py-3 pl-4 pr-2 text-right">Qty (Units)</th>
                <th scope="col" className="py-3 px-2 text-right">Number of Boxes</th>
                <th scope="col" className="py-3 px-3">Location</th>
                <th scope="col" className="py-3 px-3">Remaining</th>
                <th scope="col" className="py-3 px-3">Cust PN</th>
                <th scope="col" className="py-3 px-3">Item Description</th>
                <th scope="col" className="py-3 px-3">Lot Number</th>
                <th scope="col" className="py-3 px-3">Mfg Date</th>
                <th scope="col" className="py-3 pr-4 pl-2 text-center"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 px-4 text-center">
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
                lineDetails.map(({ line, item, requestedBoxes, fifoAllocations, hasWholeCartonQuantity, hasEnoughStock, totalAvailableBoxes }) => (
                  <tr key={line.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* ITEM CODE */}
                    <td className="py-2.5 px-3 align-middle">
                      <PickListItemSearch
                        catalog={catalog}
                        flowType={flowType}
                        selectedItemId={line.itemId}
                        onSelectItem={(itemId) => updateLine(line.id, { itemId, totalUnits: "" })}
                        disabled={!organizationId || !flowType}
                      />
                    </td>

                    {/* SPQ (inherited from item enrollment; never manually adjusted) */}
                    <td className="py-2.5 px-2 align-middle">
                      <span className="block rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-right font-mono text-xs font-semibold text-slate-900" title="Standard Packaging Quantity (SPQ)">
                        {item?.spq ?? "—"}
                      </span>
                    </td>

                    {/* Qty (Total Units input) */}
                    <td className="py-2.5 pl-4 pr-2 align-middle">
                      <input
                        value={line.totalUnits}
                        onChange={(event) => handleTotalUnitsChange(line.id, event.target.value)}
                        type="number"
                        min="1"
                        disabled={!item}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-right font-mono text-xs font-semibold text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50 disabled:text-slate-400"
                        placeholder="0"
                        title="Total Units (Pieces)"
                      />
                    </td>

                    {/* Number of Boxes (derived from Qty ÷ SPQ) */}
                    <td className="py-2.5 px-2 align-middle">
                      <span className="block rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-right font-mono text-xs font-semibold text-slate-900">
                        {requestedBoxes ?? "—"}
                      </span>
                    </td>

                    {/* LOCATION */}
                    <td className="py-2.5 px-3 align-middle">
                      <div className="min-h-9 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-body text-xs text-slate-900">
                        {fifoAllocations.length > 0 ? fifoAllocations.map(({ source, boxes }) => (
                          <div key={source.balanceId} className="flex items-center justify-between gap-2 leading-5">
                            <span className="truncate" title={`${source.locationLabel} · ${source.lotNumber}`}>{source.locationLabel}</span>
                            <span className="shrink-0 font-mono font-semibold text-brand-navy">{boxes} boxes</span>
                          </div>
                        )) : <span className="text-slate-400">{!item ? "Select item" : !hasWholeCartonQuantity ? `Qty ÷ SPQ must be whole (${item.spq})` : "No FIFO source"}</span>}
                      </div>
                    </td>

                    {/* REMAINING (after this FIFO allocation) */}
                    <td className="py-2.5 px-2 align-middle">
                      <div className="space-y-0.5 font-mono text-xs text-slate-700">
                        {fifoAllocations.length > 0 ? fifoAllocations.map(({ source, remainingBoxes }) => (
                          <div key={source.balanceId}>{remainingBoxes} boxes</div>
                        )) : <span className="text-slate-400">{item ? `${Math.max(0, totalAvailableBoxes - (requestedBoxes ?? 0))} boxes` : "—"}</span>}
                      </div>
                      {item && requestedBoxes !== null && !hasEnoughStock && <p className="mt-1 text-[10px] font-semibold text-rose-600">Insufficient</p>}
                    </td>

                    {/* CUST PN */}
                    <td className="py-2.5 px-3 align-middle">
                      <span className="block truncate font-mono text-xs text-slate-700" title={item?.customerItemCode ?? undefined}>
                        {item?.customerItemCode || <span className="text-slate-400">—</span>}
                      </span>
                    </td>

                    {/* ITEM DESCRIPTION */}
                    <td className="py-2.5 px-3 align-middle">
                      <span className="block truncate font-body text-xs text-slate-800" title={item?.itemName ?? undefined}>
                        {item?.itemName || <span className="text-slate-400">—</span>}
                      </span>
                    </td>

                    {/* LOT NUMBER */}
                    <td className="py-2.5 px-3 align-middle">
                      <span className="block truncate font-mono text-xs text-slate-700" title={fifoAllocations.map(({ source }) => source.lotNumber).join(", ") || undefined}>
                        {[...new Set(fifoAllocations.map(({ source }) => source.lotNumber))].join(", ") || <span className="text-slate-400">—</span>}
                      </span>
                    </td>

                    {/* MFG DATE */}
                    <td className="py-2.5 px-3 align-middle">
                      <span className="font-mono text-xs text-slate-600 block">
                        {fifoAllocations[0]?.source.manufactureDate ? new Date(fifoAllocations[0].source.manufactureDate).toLocaleDateString() : <span className="text-slate-400">—</span>}
                      </span>
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
          <form action={createAction}>
            <input type="hidden" name="request" value={request} />
            <button
              type="submit"
              disabled={!request}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-navy px-5 font-label text-xs font-bold text-white shadow-sm hover:bg-brand-navy/95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            >
              Generate Pick List
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
