"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { createPortal } from "react-dom";
import { AlertCircle, AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, FileSpreadsheet, PackagePlus, Search, Trash2, Upload } from "@/components/ui/icons";
import { parseDraDocumentAction } from "../_actions";
import { matchItemAgainstCatalog } from "@/lib/parsers/item-matcher";
import { boxesToPieces, piecesToBoxes } from "@/lib/inventory/quantities";
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
  boxes: string;
  sourceBalanceId: string;
  manualSplit: boolean;
  manualAllocations: Array<{ balanceId: string; boxes: string }>;
  customerItemCode: string;
};

function blankDraftLine(id: string): DraftLine {
  return {
    id,
    itemId: "",
    boxes: "",
    sourceBalanceId: "",
    manualSplit: true,
    manualAllocations: [],
    customerItemCode: "",
  };
}

function PendingActionButton({
  children,
  pendingLabel,
  disabled = false,
  className,
}: {
  children: ReactNode;
  pendingLabel: string;
  disabled?: boolean;
  className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={className}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

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
  const enrolledCode = flowType === "vmi" ? item.supplierItemCode : item.dsgcItemNumber;
  return enrolledCode?.trim() || item.itemCode;
}

function hasRequiredItemCode(item: Pick<CatalogItem, "itemCode" | "supplierItemCode" | "dsgcItemNumber">, flowType: string): boolean {
  const requiredCode = flowType === "vmi" ? (item.supplierItemCode?.trim() || item.itemCode) : item.dsgcItemNumber;
  return Boolean(requiredCode?.trim());
}

function availableBoxesForSource(source: Pick<StockSource, "availableQty" | "spq">): number {
  return Math.max(0, Math.floor(piecesToBoxes(source.availableQty, source.spq)));
}

function formatStockDate(value?: string | null): string | null {
  if (!value) return null;
  const dateOnly = value.slice(0, 10);
  const date = new Date(`${dateOnly}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? dateOnly
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const listboxId = useId();
  const selectedItem = catalog.find((item) => item.itemId === selectedItemId);

  useEffect(() => {
    setInputValue(selectedItem ? itemCodeFor(selectedItem, flowType) : "");
  }, [flowType, selectedItem]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // The desktop line list scrolls horizontally. Render the menu at document
  // level so that the table's overflow container cannot clip the choices.
  useEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
      return;
    }

    function syncMenuPosition() {
      const bounds = dropdownRef.current?.getBoundingClientRect();
      if (!bounds) return;
      setMenuPosition({
        top: bounds.bottom + 4,
        left: bounds.left,
        width: bounds.width,
      });
    }

    syncMenuPosition();
    window.addEventListener("resize", syncMenuPosition);
    window.addEventListener("scroll", syncMenuPosition, true);
    return () => {
      window.removeEventListener("resize", syncMenuPosition);
      window.removeEventListener("scroll", syncMenuPosition, true);
    };
  }, [isOpen]);

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
          placeholder={disabled ? "Complete organization and recipient first" : "Type item code, description, or customer code…"}
          className={`h-10 w-full rounded-xl border pl-9 pr-9 font-body text-sm text-slate-900 shadow-2xs outline-none transition-colors focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 ${
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

      {isOpen && !disabled && menuPosition && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[100] max-h-80 min-w-0 max-w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
          style={menuPosition}
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
              const codeIsProvisional = !hasRequiredItemCode(item, flowType);
              const availableBoxes = item.sources.reduce(
                (sum, source) => sum + availableBoxesForSource(source),
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
                  className={`flex w-full items-start justify-between gap-3 rounded-lg p-2.5 text-left transition-colors ${isSelected ? "bg-brand-navy/10 text-brand-navy" : codeIsProvisional ? "bg-amber-50/50 text-slate-900 hover:bg-amber-50" : "text-slate-900 hover:bg-slate-50"}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-mono text-xs font-bold text-brand-navy">{formattedCode}</span>
                      {item.customerItemCode && <span className="truncate font-mono text-[10px] text-slate-500">(Cust: {item.customerItemCode})</span>}
                      <span className={`shrink-0 rounded px-1.5 py-0.5 font-label text-[10px] font-bold uppercase tracking-wide ${codeIsProvisional ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"}`}>{codeIsProvisional ? "Needs item code" : "Available"}</span>
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

function allocateDefaultFifoLocation(
  sources: StockSource[],
  requestedBoxes: number,
): DraftLine["manualAllocations"] {
  const firstSource = [...sources].sort((a, b) => a.priority - b.priority)[0];
  if (!firstSource || !Number.isInteger(requestedBoxes) || requestedBoxes <= 0) return [];
  return [{
    balanceId: firstSource.balanceId,
    boxes: String(Math.min(requestedBoxes, availableBoxesForSource(firstSource))),
  }];
}

function allocationsMatchFifoPlan(
  selected: FifoBoxAllocation[],
  fifoPlan: FifoBoxAllocation[],
): boolean {
  const selectedByBalance = new Map(selected.map(({ source, boxes }) => [source.balanceId, boxes]));
  const fifoByBalance = new Map(fifoPlan.map(({ source, boxes }) => [source.balanceId, boxes]));
  const balanceIds = new Set([...selectedByBalance.keys(), ...fifoByBalance.keys()]);
  return [...balanceIds].every((balanceId) => (
    selectedByBalance.get(balanceId) ?? 0
  ) === (
    fifoByBalance.get(balanceId) ?? 0
  ));
}

function rebalanceManualAllocations(
  sources: StockSource[],
  existing: DraftLine["manualAllocations"],
  requestedBoxes: number,
): DraftLine["manualAllocations"] {
  if (existing.length === 0) return allocateDefaultFifoLocation(sources, requestedBoxes);

  let remaining = requestedBoxes;
  const existingByBalanceId = new Map(existing.map((allocation) => [allocation.balanceId, allocation]));
  const sortedSources = [...sources].sort((a, b) => a.priority - b.priority);
  const allocations: DraftLine["manualAllocations"] = [];

  // Preserve the operator's selected locations first, while filling each one
  // up to its on-hand quantity and the requested line quantity.
  for (const source of sortedSources) {
    const current = existingByBalanceId.get(source.balanceId);
    if (!current) continue;
    const availableBoxes = availableBoxesForSource(source);
    const parsedBoxes = Number(current.boxes);
    const boxes = Number.isInteger(parsedBoxes)
      ? Math.min(Math.max(0, parsedBoxes), availableBoxes, Math.max(0, remaining))
      : 0;
    allocations.push({ balanceId: source.balanceId, boxes: String(boxes) });
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
  // Keep one starter row visible from the beginning. It remains disabled until
  // the organization, model, and required recipient are selected; additional
  // rows are added only after the first row becomes available for entry.
  const [lines, setLines] = useState<DraftLine[]>(() => [blankDraftLine("draft-line-1")]);
  const [importingDra, setImportingDra] = useState(false);
  const [importSummary, setImportSummary] = useState<{ type: "success" | "warning" | "error"; message: string } | null>(null);
  const visibleCustomers = useMemo(() => customers.filter((customer) =>
    flowType === "vmi"
      ? customer.relationship === "vmi_customer"
      : flowType === "trading"
        ? customer.relationship === "trading_customer"
        : false,
  ), [customers, flowType]);

  const canEditLines = Boolean(
    organizationId &&
    flowType &&
    (flowType === "vmi" ? endCustomerPartyId : flowType === "trading" ? customerPartyId : true),
  );

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
    const itemHasRequiredCode = Boolean(item && hasRequiredItemCode(item, flowType));
    const effectiveSpq = item?.spq ?? 0;
    const requestedBoxes = item && Number.isInteger(Number(line.boxes)) && Number(line.boxes) > 0
      ? Number(line.boxes)
      : null;
    const requestedUnits = requestedBoxes !== null ? boxesToPieces(requestedBoxes, effectiveSpq) : null;
    const totalAvailableBoxes = item?.sources.reduce(
      (sum, source) => sum + availableBoxesForSource(source),
      0,
    ) ?? 0;
    const selectedSource = item?.sources.find((source) => source.balanceId === line.sourceBalanceId) ?? null;
    const maxRequestBoxes = selectedSource && !line.manualSplit ? availableBoxesForSource(selectedSource) : totalAvailableBoxes;
    const allocationSources = selectedSource && !line.manualSplit ? [selectedSource] : item?.sources ?? [];
    const manualAllocations = line.manualSplit && item
      ? line.manualAllocations.flatMap(({ balanceId, boxes }) => {
          const source = item.sources.find((candidate) => candidate.balanceId === balanceId);
          const parsedBoxes = Number(boxes);
          if (!source || !Number.isInteger(parsedBoxes) || parsedBoxes <= 0) return [];
          const availableBoxes = availableBoxesForSource(source);
          return [{
            source,
            boxes: Math.min(parsedBoxes, availableBoxes),
            availableBoxes,
            remainingBoxes: Math.max(0, availableBoxes - parsedBoxes),
          }];
        })
      : null;
    const fifoPlan = item && requestedBoxes ? allocateFifoBoxes(item.sources, requestedBoxes) : [];
    const fifoAllocations = manualAllocations ?? (item && requestedBoxes ? allocateFifoBoxes(allocationSources, requestedBoxes) : []);
    const allocatedBoxes = fifoAllocations.reduce((sum, allocation) => sum + allocation.boxes, 0);
    const hasWholeCartonQuantity = requestedBoxes !== null;
    const hasEnoughStock = requestedBoxes !== null && allocatedBoxes === requestedBoxes;
    const requiresOverride = line.manualSplit
      ? !allocationsMatchFifoPlan(fifoAllocations, fifoPlan)
      : Boolean(selectedSource && selectedSource.priority > 1);
    return {
      line,
      item,
      effectiveSpq,
      requestedUnits,
      requestedBoxes,
      fifoAllocations,
      allocatedBoxes,
      totalAvailableBoxes,
      maxRequestBoxes,
      selectedSource,
      manualAllocations,
      requiresOverride,
      itemHasRequiredCode,
      hasWholeCartonQuantity,
      hasEnoughStock,
    };
  });

  const handleBoxesChange = (lineId: string, val: string) => {
    const detail = lineDetails.find(({ line }) => line.id === lineId);
    const parsed = Number(val);
    const nextValue = val !== "" && Number.isFinite(parsed) && parsed > (detail?.maxRequestBoxes ?? Number.MAX_SAFE_INTEGER)
      ? String(detail?.maxRequestBoxes ?? parsed)
      : val;
    const nextRequestedBoxes = Number(nextValue);
    let manualAllocationsPatch: DraftLine["manualAllocations"] | undefined;
    if (detail?.line.manualSplit && detail.item && Number.isInteger(nextRequestedBoxes) && nextRequestedBoxes > 0) {
      manualAllocationsPatch = rebalanceManualAllocations(detail.item.sources, detail.line.manualAllocations, nextRequestedBoxes);
    } else if (nextValue === "" && detail?.line.manualSplit) {
      manualAllocationsPatch = [];
    }
    updateLine(lineId, {
      boxes: nextValue,
      ...(manualAllocationsPatch ? { manualAllocations: manualAllocationsPatch } : {}),
    });
  };

  const handleSourceChange = (lineId: string, sourceBalanceId: string) => {
    const detail = lineDetails.find(({ line }) => line.id === lineId);
    const nextSource = detail?.item?.sources.find((source) => source.balanceId === sourceBalanceId);
    const maxBoxes = nextSource ? availableBoxesForSource(nextSource) : detail?.totalAvailableBoxes ?? 0;
    const currentBoxes = Number(detail?.line.boxes ?? "");
    updateLine(lineId, {
      sourceBalanceId,
      manualSplit: false,
      manualAllocations: [],
      boxes: Number.isInteger(currentBoxes) && currentBoxes > maxBoxes ? String(maxBoxes) : detail?.line.boxes ?? "",
    });
  };

  const handleManualSplitToggle = (lineId: string) => {
    const detail = lineDetails.find(({ line }) => line.id === lineId);
    if (!detail) return;

    if (detail.line.manualSplit) {
      const fixedSource = detail.item?.sources[0] ?? null;
      const maxBoxes = fixedSource ? availableBoxesForSource(fixedSource) : detail.totalAvailableBoxes;
      const currentBoxes = Number(detail.line.boxes);
      updateLine(lineId, {
        manualSplit: false,
        manualAllocations: [],
        sourceBalanceId: fixedSource?.balanceId ?? "",
        boxes: Number.isInteger(currentBoxes) && currentBoxes > maxBoxes ? String(maxBoxes) : detail.line.boxes,
      });
      return;
    }

    updateLine(lineId, {
      manualSplit: true,
      sourceBalanceId: "",
      manualAllocations: detail.fifoAllocations.map(({ source, boxes }) => ({
        balanceId: source.balanceId,
        boxes: String(boxes),
      })),
    });
  };

  const handleManualLocationToggle = (lineId: string, balanceId: string) => {
    const detail = lineDetails.find(({ line }) => line.id === lineId);
    const currentAllocations = detail?.line.manualAllocations ?? [];
    const isSelected = currentAllocations.some((allocation) => allocation.balanceId === balanceId);
    updateLine(lineId, {
      manualAllocations: isSelected
        ? currentAllocations.filter((allocation) => allocation.balanceId !== balanceId)
        : [...currentAllocations, { balanceId, boxes: "" }],
    });
  };

  const handleManualAllocationChange = (lineId: string, balanceId: string, value: string) => {
    const detail = lineDetails.find(({ line }) => line.id === lineId);
    const source = detail?.item?.sources.find((candidate) => candidate.balanceId === balanceId);
    const parsed = Number(value);
    const otherAllocatedBoxes = (detail?.line.manualAllocations ?? [])
      .filter((allocation) => allocation.balanceId !== balanceId)
      .reduce((sum, allocation) => sum + (Number.isInteger(Number(allocation.boxes)) ? Number(allocation.boxes) : 0), 0);
    const remainingLineBoxes = Math.max(0, (detail?.requestedBoxes ?? Number.MAX_SAFE_INTEGER) - otherAllocatedBoxes);
    const nextValue = value === ""
      ? ""
      : Number.isFinite(parsed)
        ? String(Math.min(Math.max(0, Math.floor(parsed)), source ? availableBoxesForSource(source) : 0, remainingLineBoxes))
        : "";
    const currentAllocations = detail?.line.manualAllocations ?? [];
    updateLine(lineId, {
      manualAllocations: currentAllocations.some((allocation) => allocation.balanceId === balanceId)
        ? currentAllocations.map((allocation) => allocation.balanceId === balanceId ? { ...allocation, boxes: nextValue } : allocation)
        : [...currentAllocations, { balanceId, boxes: nextValue }],
    });
  };

  const buildRequest = (details: typeof lineDetails) => {
    const effectiveCustomerPartyId = flowType === "vmi" ? organizationId : customerPartyId;
    if (!organizationId || !effectiveCustomerPartyId || !flowType || details.length === 0) return "";
    if (flowType === "vmi" && !endCustomerPartyId) return "";
    const recipientPartyId = flowType === "supplies"
      ? organizationId
      : flowType === "trading" ? customerPartyId : endCustomerPartyId;
    const prepared = details.flatMap(({ line, item, itemHasRequiredCode, requestedBoxes, fifoAllocations, hasWholeCartonQuantity, hasEnoughStock }) =>
      fifoAllocations.map(({ source, boxes }) => ({
        itemId: line.itemId,
        lotId: source.lotId,
        locationId: source.locationId,
        qty: boxesToPieces(boxes, item?.spq ?? 1),
        customerItemCode: line.customerItemCode.trim() || source.customerItemCode || null,
        itemCodeIsProvisional: false,
        valid: Boolean(item && itemHasRequiredCode && requestedBoxes !== null && hasWholeCartonQuantity && hasEnoughStock),
      })),
    );
    if (
      prepared.length === 0 ||
      details.some(({ item, itemHasRequiredCode, requestedBoxes, hasWholeCartonQuantity, hasEnoughStock }) =>
        !item || !itemHasRequiredCode || requestedBoxes === null || !hasWholeCartonQuantity || !hasEnoughStock,
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
  };

  const request = useMemo(
    () => lineDetails.some(({ requiresOverride }) => requiresOverride) ? "" : buildRequest(lineDetails),
    [customerPartyId, endCustomerPartyId, flowType, lineDetails, organizationId],
  );

  const overrideDetails = lineDetails.filter(({ requiresOverride }) => requiresOverride);
  const overrideDetail = overrideDetails[0] ?? null;
  const overrideRequest = useMemo(
    () => overrideDetails.length === 1 && overrideDetail ? buildRequest([overrideDetail]) : "",
    [customerPartyId, endCustomerPartyId, flowType, lineDetails, organizationId, overrideDetail, overrideDetails.length],
  );
  const [overrideReason, setOverrideReason] = useState("");
  const generationBlocker = !organizationId
    ? "Select an organization."
    : !flowType
      ? "Select an inventory model."
      : flowType === "vmi" && !endCustomerPartyId
        ? endCustomers.length === 0
          ? "No active End Customer is enrolled. Complete End Customer enrollment before generating a pick list."
          : "Select an End Customer / Recipient before generating a VMI pick list."
        : flowType === "trading" && !customerPartyId
          ? "Select a Trading Customer / Recipient before generating a pick list."
        : lines.length === 0
          ? "Add at least one item line."
          : lineDetails.some(({ item }) => !item)
            ? "Choose an item code for every line."
            : lineDetails.some(({ itemHasRequiredCode }) => !itemHasRequiredCode)
              ? "This item needs its enrolled supplier/DSGC item code before a pick list can be created."
            : lineDetails.some(({ requestedBoxes }) => requestedBoxes === null)
              ? "Enter a positive whole-box quantity for every line."
              : lineDetails.some(({ line, requestedBoxes, allocatedBoxes }) => line.manualSplit && requestedBoxes !== null && allocatedBoxes !== requestedBoxes)
                ? "In manual split mode, allocate the full line quantity across the selected locations."
              : lineDetails.some(({ hasEnoughStock }) => !hasEnoughStock)
                ? "Reduce the quantity to the on-hand boxes shown for this line."
                : null;

  const addLine = () => setLines((current) => [...current, blankDraftLine(crypto.randomUUID())]);
  const updateLine = (id: string, patch: Partial<DraftLine>) => setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  const removeLine = (id: string) => setLines((current) => current.filter((line) => line.id !== id));
  const resetDraft = () => setLines([blankDraftLine(crypto.randomUUID())]);
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
    const importRequests = new Map<string, { itemId: string; spq: number; requestedBoxes: number; labels: string[]; customerItemCode: string }>();

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
        if (!existingRequest.customerItemCode && draRow.customerItemCode) {
          existingRequest.customerItemCode = draRow.customerItemCode.trim();
        }
      } else {
        importRequests.set(matchedItemId, {
          itemId: matchedItemId,
          spq,
          requestedBoxes,
          labels: [rowLabel],
          customerItemCode: draRow.customerItemCode?.trim() ?? "",
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
        boxes: String(request.requestedBoxes),
        sourceBalanceId: "",
        manualSplit: true,
        manualAllocations: allocateDefaultFifoLocation(candidateSources, request.requestedBoxes),
        customerItemCode: request.customerItemCode,
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

          <div className="grid min-w-0 gap-1 font-label text-xs font-bold text-slate-700">
            <div className="flex items-center justify-between gap-2">
              <span>Inventory Model <span className="text-rose-600">*</span></span>
              {flowType && organizationId && (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                  Inherited from organization
                </span>
              )}
            </div>
            <p className="font-body text-[11px] font-normal leading-4 text-slate-500">
              The Inventory Model is inherited from the organization&apos;s active receiving relationship and cannot be overridden here.
            </p>
            <div
              role="status"
              aria-label="Inventory Model"
              className="flex h-11 min-w-0 items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 font-body text-sm text-slate-900"
            >
              <span>{flowType === "vmi" ? "VMI (Consignment)" : flowType === "trading" ? "Trading (Owned)" : flowType === "supplies" ? "Supplies" : "Select an organization first"}</span>
              {flowType && <span className="font-label text-[10px] font-bold text-emerald-700">AUTO</span>}
            </div>
          </div>

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
                aria-label="End Customer / Recipient"
                value={endCustomerPartyId}
                onChange={(event) => setEndCustomerPartyId(event.target.value)}
                disabled={!customerPartyId || flowType !== "vmi"}
                required={flowType === "vmi"}
                aria-invalid={flowType === "vmi" && !endCustomerPartyId}
                className="h-11 min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 shadow-2xs outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50 disabled:text-slate-400"
              >
                <option value="">Select end customer...</option>
                {endCustomers.map((party) => (
                  <option key={party.id} value={party.id}>{party.name} ({party.code})</option>
                ))}
              </select>
              <span className={`font-body text-[11px] font-normal ${flowType === "vmi" && !endCustomerPartyId ? "text-amber-700" : "text-slate-500"}`}>
                {flowType === "vmi" && !endCustomerPartyId
                  ? endCustomers.length === 0
                    ? "No active End Customer is available."
                    : "Required: select the downstream End Customer / Recipient to enable generation."
                  : "VMI releases require the downstream end customer who will receive the stock."}
              </span>
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

        </div>

        {!canEditLines && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-body text-sm text-slate-600">
            Complete the Organization, Inventory Model, and required recipient first. The first item row will unlock automatically; use <span className="font-semibold text-slate-800">Add item line</span> only when you need a second line.
          </div>
        )}

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
              {lineDetails.map(({ line, item, requestedUnits, requestedBoxes, fifoAllocations, allocatedBoxes, hasWholeCartonQuantity, totalAvailableBoxes, maxRequestBoxes, selectedSource, requiresOverride }) => (
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
                        onSelectItem={(itemId) => {
                          const selectedItem = catalog.find((candidate) => candidate.itemId === itemId);
                          updateLine(line.id, {
                            itemId,
                            boxes: "",
                            sourceBalanceId: "",
                            manualSplit: true,
                            manualAllocations: [],
                            customerItemCode: selectedItem?.customerItemCode ?? "",
                          });
                        }}
                        disabled={!canEditLines}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="grid min-w-0 gap-1 font-label text-xs font-bold text-slate-700">
                        Qty (Boxes)
                        <input value={line.boxes} onChange={(event) => handleBoxesChange(line.id, event.target.value)} type="number" min="1" max={maxRequestBoxes || undefined} disabled={!canEditLines || !item || maxRequestBoxes === 0} className="h-11 min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 text-right font-mono text-base text-slate-900 outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50" placeholder="0" />
                      </label>
                      <label className="grid min-w-0 gap-1 font-label text-xs font-bold text-slate-700">
                        Qty (Units)
                        <div className="flex h-11 items-center justify-end rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-base font-semibold text-slate-900">
                          {requestedUnits ?? "—"}
                        </div>
                      </label>
                    </div>
                    {item && <p className="font-body text-xs text-slate-500">Enter complete boxes. Units are calculated from SPQ {item.spq}.</p>}
                    <div className="grid min-w-0 gap-2 font-label text-xs font-bold text-slate-700">
                      <div className="flex items-center justify-between gap-2">
                        <span>Location allocation</span>
                        {item && (
                          <button
                            type="button"
                            onClick={() => handleManualSplitToggle(line.id)}
                            disabled={!canEditLines}
                            className="font-label text-[11px] font-bold text-brand-navy underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
                          >
                            {line.manualSplit ? "Use fixed location" : "Split quantities manually"}
                          </button>
                        )}
                      </div>
                      {!line.manualSplit ? (
                        <>
                          <select aria-label="Automatic source strategy" value={line.sourceBalanceId} onChange={(event) => handleSourceChange(line.id, event.target.value)} disabled={!canEditLines || !item} className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-3 font-body text-sm font-normal text-slate-900 outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50">
                            <option value="">Select a fixed location</option>
                            {item?.sources.map((source) => (
                              <option key={source.balanceId} value={source.balanceId}>
                                {source.locationLabel} · FIFO #{source.priority} · Lot {source.lotNumber} · {availableBoxesForSource(source)} boxes{source.priority === 1 ? " · Recommended" : " · Supervisor approval"}
                              </option>
                            ))}
                          </select>
                          <div className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 font-body text-base font-normal text-slate-900">
                            {fifoAllocations.length > 0 ? fifoAllocations.map(({ source, boxes }) => (
                              <div key={source.balanceId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                <span className="truncate">{source.locationLabel} <span className="text-sm text-slate-500">({source.lotNumber})</span></span>
                                <span className="font-mono text-sm font-semibold text-brand-navy">{boxes} boxes</span>
                              </div>
                            )) : <span className="text-slate-400">{!item ? "Select item code first" : !hasWholeCartonQuantity ? "Enter a whole number of boxes" : "No FIFO source can fulfill this quantity"}</span>}
                          </div>
                        </>
                      ) : (
                        <div className="grid gap-2 rounded-xl border border-brand-navy/15 bg-brand-navy/[0.03] p-3 font-normal">
                          <p className="text-[11px] font-semibold leading-4 text-slate-600">FIFO locations are preselected. Add another location below to split the quantity.</p>
                          {line.manualAllocations.map((allocation) => {
                            const source = item?.sources.find((candidate) => candidate.balanceId === allocation.balanceId);
                            if (!source) return null;
                            const otherAllocatedBoxes = line.manualAllocations
                              .filter((entry) => entry.balanceId !== source.balanceId)
                              .reduce((sum, entry) => sum + (Number.isInteger(Number(entry.boxes)) ? Number(entry.boxes) : 0), 0);
                            const maxBoxesForLine = Math.max(0, Math.min(availableBoxesForSource(source), (requestedBoxes ?? availableBoxesForSource(source)) - otherAllocatedBoxes));
                            return (
                              <div key={source.balanceId} className="grid grid-cols-[minmax(0,1fr)_5.5rem_auto] items-center gap-2 rounded-lg border border-brand-navy/30 bg-brand-navy/10 px-2.5 py-2 ring-1 ring-brand-navy/10">
                                <span className="min-w-0">
                                  <span className="block truncate font-semibold text-brand-navy">✓ {source.locationLabel} <span className="font-normal">· FIFO #{source.priority}</span></span>
                                  <span className="block truncate text-[10px] font-normal text-slate-600">Lot {source.lotNumber} · {availableBoxesForSource(source)} available</span>
                                </span>
                                <input
                                  aria-label={`Boxes from ${source.locationLabel}`}
                                  type="number"
                                  min="0"
                                  max={maxBoxesForLine}
                                  value={allocation.boxes}
                                  onChange={(event) => handleManualAllocationChange(line.id, source.balanceId, event.target.value)}
                                  disabled={!canEditLines}
                                  className="h-9 w-full rounded-lg border border-brand-navy/30 bg-white px-2 text-right font-mono text-sm font-semibold text-slate-900 outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
                                />
                                <button type="button" aria-label={`Remove location ${source.locationLabel}`} onClick={() => handleManualLocationToggle(line.id, source.balanceId)} disabled={!canEditLines} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-rose-600 disabled:opacity-40">×</button>
                              </div>
                            );
                          })}
                          <select
                            aria-label="Add location to split"
                            value=""
                            onChange={(event) => handleManualLocationToggle(line.id, event.target.value)}
                            disabled={!canEditLines || !item || line.manualAllocations.length === item?.sources.length}
                            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50"
                          >
                            <option value="">Add another location…</option>
                            {item?.sources.filter((source) => !line.manualAllocations.some((allocation) => allocation.balanceId === source.balanceId)).map((source) => (
                              <option key={source.balanceId} value={source.balanceId}>
                                {source.locationLabel} · FIFO #{source.priority} · {availableBoxesForSource(source)} boxes available
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-[11px]">
                            <span className="text-slate-500">Allocated</span>
                            <span className={allocatedBoxes === requestedBoxes && requestedBoxes !== null ? "font-mono font-bold text-emerald-700" : "font-mono font-bold text-amber-700"}>
                              {allocatedBoxes} / {requestedBoxes ?? "—"} boxes
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    <p className="font-body text-xs text-slate-500">Maximum for this line: {maxRequestBoxes} boxes on hand{selectedSource ? ` at ${selectedSource.locationLabel}` : " across available FIFO locations"}.</p>
                    <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 font-body text-sm">
                      <div><dt className="text-slate-500">SPQ</dt><dd className="mt-1 font-mono font-bold text-slate-900">{item?.spq ?? "—"}</dd></div>
                      <div><dt className="text-slate-500">Remaining</dt><dd className="mt-1 font-mono font-bold text-slate-900">{Math.max(0, totalAvailableBoxes - (requestedBoxes ?? 0))} boxes</dd></div>
                      <div><dt className="text-slate-500">Customer PN</dt><dd className="mt-1"><input value={line.customerItemCode} onChange={(event) => updateLine(line.id, { customerItemCode: event.target.value })} placeholder={item?.customerItemCode || "Enter customer PN"} className="h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 font-mono text-sm text-slate-900 outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10" /></dd></div>
                      <div><dt className="text-slate-500">Lot</dt><dd className="mt-1 break-words font-mono text-slate-900">{[...new Set(fifoAllocations.map(({ source }) => source.lotNumber))].join(", ") || "—"}</dd></div>
                      <div><dt className="text-slate-500">Mfg. Date</dt><dd className="mt-1 font-mono text-slate-900">{formatStockDate(fifoAllocations[0]?.source.manufactureDate) ?? <span className="text-slate-400">Not recorded</span>}</dd></div>
                    </dl>
                    {requiresOverride && <p className="text-sm font-medium text-amber-700">{selectedSource ? "This location is outside the recommended FIFO/FEFO source and needs supervisor approval." : "One or more selected locations are outside the recommended FIFO/FEFO source and need supervisor approval."}</p>}
                  </div>
                </MobileDataCard>
              ))}
            </MobileDataCardList>
          )}
        </div>

        {/* Pick List Table: desktop */}
        <div className="hidden min-w-0 max-w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
          <table aria-label="Pick list lines" className="w-full min-w-[1850px] table-fixed border-collapse text-left">
            <caption className="sr-only">Pick list lines and selected inventory sources</caption>
            <colgroup>
              <col className="w-[280px]" />
              <col className="w-[72px]" />
              <col className="w-[108px]" />
              <col className="w-[118px]" />
              <col className="w-[360px]" />
              <col className="w-[130px]" />
              <col className="w-[180px]" />
              <col className="w-[220px]" />
              <col className="w-[170px]" />
              <col className="w-[120px]" />
              <col className="w-[52px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                <th scope="col" className="h-14 px-4 text-left">Item Code</th>
                <th scope="col" className="h-14 px-2 text-right">SPQ</th>
                <th scope="col" className="h-14 px-3 text-right">Qty (Boxes)</th>
                <th scope="col" className="h-14 px-3 text-right">Qty (Units)</th>
                <th scope="col" className="h-14 px-4 text-left">Location</th>
                <th scope="col" className="h-14 px-3 text-left">Remaining</th>
                <th scope="col" className="h-14 px-4 text-left">Cust PN</th>
                <th scope="col" className="h-14 px-4 text-left">Item Description</th>
                <th scope="col" className="h-14 px-4 text-left">Lot Number</th>
                <th scope="col" className="h-14 px-4 text-left">Mfg Date</th>
                <th scope="col" className="h-14 px-3 text-center"><span className="sr-only">Actions</span></th>
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
                lineDetails.map(({ line, item, requestedUnits, requestedBoxes, fifoAllocations, allocatedBoxes, hasWholeCartonQuantity, totalAvailableBoxes, maxRequestBoxes, selectedSource, requiresOverride }) => (
                  <tr key={line.id} className="bg-white transition-colors hover:bg-[#F8FAFC]">
                    {/* ITEM CODE */}
                    <td className="px-4 py-4 align-top">
                      <PickListItemSearch
                        catalog={catalog}
                        flowType={flowType}
                        selectedItemId={line.itemId}
                        onSelectItem={(itemId) => {
                          const selectedItem = catalog.find((candidate) => candidate.itemId === itemId);
                          updateLine(line.id, {
                            itemId,
                            boxes: "",
                            sourceBalanceId: "",
                            manualSplit: true,
                            manualAllocations: [],
                            customerItemCode: selectedItem?.customerItemCode ?? "",
                          });
                        }}
                        disabled={!canEditLines}
                      />
                    </td>

                    {/* SPQ (inherited from item enrollment; never manually adjusted) */}
                    <td className="px-2 py-4 align-top">
                      <span className="block rounded-xl border border-slate-200 bg-slate-50 px-2 py-2.5 text-right font-mono text-xs font-semibold text-slate-900" title="Standard Packaging Quantity (SPQ)">
                        {item?.spq ?? "—"}
                      </span>
                    </td>

                    {/* Qty (Boxes input) */}
                    <td className="px-3 py-4 align-top">
                      <input
                        value={line.boxes}
                        onChange={(event) => handleBoxesChange(line.id, event.target.value)}
                        type="number"
                        min="1"
                        max={maxRequestBoxes || undefined}
                        disabled={!canEditLines || !item || maxRequestBoxes === 0}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-right font-mono text-sm font-semibold text-slate-900 shadow-2xs outline-none transition-colors focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50 disabled:text-slate-400"
                        placeholder="0"
                        title="Quantity in complete boxes"
                      />
                    </td>

                    {/* Qty (Units, derived from boxes × SPQ) */}
                    <td className="px-3 py-4 align-top">
                      <span className="block rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-right font-mono text-sm font-semibold text-slate-900">
                        {requestedUnits ?? "—"}
                      </span>
                    </td>

                    {/* LOCATION */}
                    <td className="px-4 py-4 align-top">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <p className="font-label text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                          Location allocation
                        </p>
                        {item && (
                          <button
                            type="button"
                            onClick={() => handleManualSplitToggle(line.id)}
                            disabled={!canEditLines}
                            className="font-label text-[10px] font-bold text-brand-navy underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-slate-400"
                          >
                            {line.manualSplit ? "Use fixed location" : "Split quantities manually"}
                          </button>
                        )}
                      </div>
                      {!line.manualSplit ? (
                        <>
                          <select aria-label="Automatic source strategy" value={line.sourceBalanceId} onChange={(event) => handleSourceChange(line.id, event.target.value)} disabled={!canEditLines || !item} className="mb-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 outline-none transition-colors focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50">
                            <option value="">Select a fixed location</option>
                            {item?.sources.map((source) => (
                              <option key={source.balanceId} value={source.balanceId}>
                                {source.locationLabel} · FIFO #{source.priority} · Lot {source.lotNumber} · {availableBoxesForSource(source)} boxes{source.priority === 1 ? " · Recommended" : " · Approval"}
                              </option>
                            ))}
                          </select>
                          <div className="min-h-10 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 font-body text-xs text-slate-900">
                            {fifoAllocations.length > 0 ? fifoAllocations.map(({ source, boxes }) => (
                              <div key={source.balanceId} className="flex items-center justify-between gap-3 leading-5">
                                <span className="truncate" title={`${source.locationLabel} · ${source.lotNumber}`}>{source.locationLabel}</span>
                                <span className="shrink-0 font-mono font-semibold text-brand-navy">{boxes} boxes</span>
                              </div>
                            )) : <span className="text-slate-400">{!item ? "Select item" : !hasWholeCartonQuantity ? `Qty ÷ SPQ must be whole (${item.spq})` : "No FIFO source"}</span>}
                          </div>
                        </>
                      ) : (
                        <div className="grid gap-2 rounded-xl border border-brand-navy/15 bg-brand-navy/[0.03] p-2.5">
                          <p className="font-body text-[11px] leading-4 text-slate-600">FIFO locations are preselected. Add another location below to split the quantity.</p>
                          {line.manualAllocations.map((allocation) => {
                            const source = item?.sources.find((candidate) => candidate.balanceId === allocation.balanceId);
                            if (!source) return null;
                            const otherAllocatedBoxes = line.manualAllocations
                              .filter((entry) => entry.balanceId !== source.balanceId)
                              .reduce((sum, entry) => sum + (Number.isInteger(Number(entry.boxes)) ? Number(entry.boxes) : 0), 0);
                            const maxBoxesForLine = Math.max(0, Math.min(availableBoxesForSource(source), (requestedBoxes ?? availableBoxesForSource(source)) - otherAllocatedBoxes));
                            return (
                              <div key={source.balanceId} className="grid grid-cols-[minmax(0,1fr)_4.5rem_auto] items-center gap-2 rounded-lg border border-brand-navy/30 bg-brand-navy/10 px-2 py-1.5 ring-1 ring-brand-navy/10">
                                <span className="min-w-0">
                                  <span className="block truncate font-body text-xs font-semibold text-brand-navy">✓ {source.locationLabel} <span className="font-normal">· FIFO #{source.priority}</span></span>
                                  <span className="block truncate font-body text-[10px] text-slate-600">Lot {source.lotNumber} · {availableBoxesForSource(source)} available</span>
                                </span>
                                <input
                                  aria-label={`Boxes from ${source.locationLabel}`}
                                  type="number"
                                  min="0"
                                  max={maxBoxesForLine}
                                  value={allocation.boxes}
                                  onChange={(event) => handleManualAllocationChange(line.id, source.balanceId, event.target.value)}
                                  disabled={!canEditLines}
                                  className="h-8 w-full rounded-lg border border-brand-navy/30 bg-white px-1.5 text-right font-mono text-xs font-semibold text-slate-900 outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
                                />
                                <button type="button" aria-label={`Remove location ${source.locationLabel}`} onClick={() => handleManualLocationToggle(line.id, source.balanceId)} disabled={!canEditLines} className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-rose-600 disabled:opacity-40">×</button>
                              </div>
                            );
                          })}
                          <select
                            aria-label="Add location to split"
                            value=""
                            onChange={(event) => handleManualLocationToggle(line.id, event.target.value)}
                            disabled={!canEditLines || !item || line.manualAllocations.length === item?.sources.length}
                            className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 font-body text-xs text-slate-900 outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50"
                          >
                            <option value="">Add another location…</option>
                            {item?.sources.filter((source) => !line.manualAllocations.some((allocation) => allocation.balanceId === source.balanceId)).map((source) => (
                              <option key={source.balanceId} value={source.balanceId}>
                                {source.locationLabel} · FIFO #{source.priority} · {availableBoxesForSource(source)} boxes available
                              </option>
                            ))}
                          </select>
                          <div className="flex items-center justify-between border-t border-slate-200 pt-1.5 font-body text-[11px]">
                            <span className="text-slate-500">Allocated</span>
                            <span className={allocatedBoxes === requestedBoxes && requestedBoxes !== null ? "font-mono font-bold text-emerald-700" : "font-mono font-bold text-amber-700"}>
                              {allocatedBoxes} / {requestedBoxes ?? "—"} boxes
                            </span>
                          </div>
                        </div>
                      )}
                      {!line.manualSplit && fifoAllocations.length > 0 && (
                        <span className="mt-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-label text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                          {selectedSource ? "Fixed location selected" : "FIFO allocation ready"}
                        </span>
                      )}
                      <p className="mt-2 font-body text-[11px] leading-4 text-slate-500">Max {maxRequestBoxes} boxes on hand{selectedSource ? ` at ${selectedSource.locationLabel}` : " across FIFO locations"}.</p>
                      {requiresOverride && <p className="mt-1 text-[11px] font-semibold leading-4 text-amber-700">{selectedSource ? "Supervisor approval required for this source." : "Supervisor approval required for one or more selected sources."}</p>}
                    </td>

                    {/* REMAINING (after this FIFO allocation) */}
                    <td className="px-3 py-4 align-top">
                      <div className="space-y-1 font-mono text-xs text-slate-700">
                        {fifoAllocations.length > 0 ? fifoAllocations.map(({ source, remainingBoxes }) => (
                          <div key={source.balanceId}>{remainingBoxes} boxes</div>
                        )) : <span className="text-slate-400">{item ? `${Math.max(0, totalAvailableBoxes - (requestedBoxes ?? 0))} boxes` : "—"}</span>}
                      </div>
                      {item && requestedBoxes !== null && requestedBoxes > maxRequestBoxes && <p className="mt-1 text-[10px] font-semibold text-amber-700">Maximum {maxRequestBoxes} boxes</p>}
                    </td>

                    {/* CUST PN */}
                    <td className="px-4 py-4 align-top">
                      <input value={line.customerItemCode} onChange={(event) => updateLine(line.id, { customerItemCode: event.target.value })} placeholder={item?.customerItemCode || "Enter customer PN"} title="Customer part number snapshot" className="h-10 w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 font-mono text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10" />
                    </td>

                    {/* ITEM DESCRIPTION */}
                    <td className="px-4 py-4 align-top">
                      <span className="block truncate pt-2.5 font-body text-sm text-slate-800" title={item?.itemName ?? undefined}>
                        {item?.itemName || <span className="text-slate-400">—</span>}
                      </span>
                    </td>

                    {/* LOT NUMBER */}
                    <td className="px-4 py-4 align-top">
                      <span className="block truncate pt-2.5 font-mono text-sm text-slate-700" title={fifoAllocations.map(({ source }) => source.lotNumber).join(", ") || undefined}>
                        {[...new Set(fifoAllocations.map(({ source }) => source.lotNumber))].join(", ") || <span className="text-slate-400">—</span>}
                      </span>
                    </td>

                    {/* MFG DATE */}
                    <td className="px-4 py-4 align-top">
                      <div className="pt-1.5">
                        <span className="block font-mono text-sm text-slate-600" title="Inherited from the selected inventory lot; correct this on the receiving record.">
                          {formatStockDate(fifoAllocations[0]?.source.manufactureDate) ?? <span className="text-slate-400">Not recorded</span>}
                        </span>
                        <span className="mt-1 block font-body text-[10px] leading-4 text-slate-400">Inherited from lot</span>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="px-3 py-4 align-top text-center">
                      <button
                        type="button"
                        onClick={() => removeLine(line.id)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
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
            disabled={!canEditLines}
            onClick={addLine}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-label text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white transition-colors"
          >
            <PackagePlus size={16} aria-hidden="true" />
            Add item line
          </button>
          {overrideDetails.length > 0 ? (
            <div className="flex flex-wrap items-end justify-end gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="min-w-[260px] max-w-md">
                <p className="font-label text-xs font-bold text-amber-900">
                  {overrideDetails.length > 1 ? "Select only one alternate location per approval request." : "FIFO/FEFO override required"}
                </p>
                {overrideDetails.length === 1 && (
                  <input
                    value={overrideReason}
                    onChange={(event) => setOverrideReason(event.target.value)}
                    placeholder="Optional reason for choosing this location"
                    className="mt-2 h-10 w-full rounded-lg border border-amber-300 bg-white px-3 font-body text-xs text-slate-900 outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10"
                  />
                )}
              </div>
              <form action={overrideAction}>
                <input type="hidden" name="request" value={overrideRequest} />
                <input type="hidden" name="reason" value={overrideReason} />
                <PendingActionButton
                  pendingLabel="Sending…"
                  disabled={!overrideRequest}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-amber-600 px-5 font-label text-xs font-bold text-white shadow-sm hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                >
                  Request Approval
                  <ChevronRight size={16} aria-hidden="true" />
                </PendingActionButton>
              </form>
            </div>
          ) : (
            <div className="flex flex-wrap items-end justify-end gap-3">
              {!request && generationBlocker && <p className="max-w-sm text-right font-body text-xs text-amber-700">{generationBlocker}</p>}
              <form action={createAction}>
              <input type="hidden" name="request" value={request} />
              <PendingActionButton
                pendingLabel="Creating…"
                disabled={!request}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-navy px-5 font-label text-xs font-bold text-white shadow-sm hover:bg-brand-navy/95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
              >
                Generate Pick List
                <ChevronRight size={16} aria-hidden="true" />
              </PendingActionButton>
              </form>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
