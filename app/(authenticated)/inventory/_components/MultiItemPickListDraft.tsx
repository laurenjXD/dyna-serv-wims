"use client";
import { evaluateExpiry, type ExpiryPolicy, type ExpiryReviewLine } from "@/lib/inventory/expiry-policy";
import { ExpiryAcknowledgementFields } from "@/components/inventory/ExpiryAcknowledgementFields";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { createPortal } from "react-dom";
import { AlertCircle, AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, FileSpreadsheet, PackagePlus, Search, Trash2, Upload } from "@/components/ui/icons";
import { DraImportReview, type ReviewedDraImport } from "./DraImportReview";
import { boxesToPieces, piecesToBoxes } from "@/lib/inventory/quantities";
import { buildAllocationPlan, orderLotLocationRows, type AllocationPlan } from "@/lib/withdrawal/allocation";
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
  receivedAt?: Date;
  expiryDate?: string | null;
  expiryPolicy?: ExpiryPolicy;
  expiryPolicyVersion?: number;
  isPerishable?: boolean;
  priority?: number;
  locationPickSequence?: number | null;
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
  isPerishable: boolean;
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

function optionalCustomerItemCode(lineValue: string | null | undefined, sourceValue: string | null | undefined): string | undefined {
  const value = lineValue?.trim() || sourceValue?.trim() || "";
  return value.length > 0 && value.length <= 100 ? value : undefined;
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

function AllocationRankPlan({ plan, sources, allocations, requestedBoxes, disabled, onToggle, onChange }: {
  plan: AllocationPlan | null;
  sources: StockSource[];
  allocations: DraftLine["manualAllocations"];
  requestedBoxes: number | null;
  disabled: boolean;
  onToggle: (balanceId: string) => void;
  onChange: (balanceId: string, value: string) => void;
}) {
  if (!plan || plan.lots.length === 0) return null;
  const selected = new Map(allocations.map((entry) => [entry.balanceId, entry.boxes]));
  const allocated = allocations.reduce((sum, entry) => sum + (Number(entry.boxes) || 0), 0);
  const sourceByKey = new Map(sources.map((source) => [`${source.lotId}:${source.locationId}`, source]));
  const rankGroups = [...new Set(plan.lots.map((lot) => lot.rank))].map((rank) => {
    const lots = plan.lots.filter((lot) => lot.rank === rank);
    // Opening-balance imports can retain separate lot IDs for split locations
    // of one business lot number. Group only the presentation; each control
    // still targets its exact balance/lot/location IDs for server validation.
    const byNumber = new Map<string, { lotNumber: string; sources: StockSource[] }>();
    for (const lot of lots) {
      const key = lot.lotNumber.trim() || lot.lotId;
      const group = byNumber.get(key) ?? { lotNumber: lot.lotNumber, sources: [] };
      for (const location of lot.locations) {
        const source = sourceByKey.get(`${lot.lotId}:${location.locationId}`);
        if (source) group.sources.push(source);
      }
      byNumber.set(key, group);
    }
    return { rank, firstLot: lots[0], lots: [...byNumber.values()] };
  });

  return (
    <div aria-label={`${plan.strategy} lot and location plan`} className="max-h-96 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
      <p className="mb-2 font-body text-xs text-slate-600">Select locations and enter boxes below. {requestedBoxes !== null && allocated >= requestedBoxes ? "To move boxes, reduce an existing allocation first." : `${Math.max(0, (requestedBoxes ?? 0) - allocated)} boxes still need a location.`}</p>
      <div className="grid gap-2">
        {rankGroups.map(({ rank, firstLot, lots }) => (
          <section key={rank} aria-label={`${plan.strategy} rank ${rank}`} className="rounded-lg bg-slate-50 p-2">
            <h4 className="font-label text-xs font-bold text-brand-navy">
              {plan.strategy} #{rank}
              {plan.strategy === "FIFO"
                ? ` · Received ${formatStockDate(firstLot.receivedAt.toISOString()) ?? "date not recorded"}`
                : ` · Expires ${formatStockDate(firstLot.expiryDate?.toISOString() ?? null) ?? "date not recorded"}`}
            </h4>
            <div className="mt-2 grid gap-2">
              {lots.map((lot) => {
                const available = lot.sources.reduce((sum, source) => sum + availableBoxesForSource(source), 0);
                const lotAllocated = lot.sources.reduce((sum, source) => sum + (Number(selected.get(source.balanceId)) || 0), 0);
                return (
                  <div key={lot.lotNumber} role="group" aria-label={`Lot ${lot.lotNumber}`} className="rounded-lg border border-slate-200 bg-white p-2">
                    <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                      <span className="break-all font-semibold text-slate-800">Lot {lot.lotNumber}</span>
                      <span className="text-slate-600">{lotAllocated} allocated · {available} available</span>
                    </div>
                    <div className="mt-1 divide-y divide-slate-100">
                      {lot.sources.map((source) => {
                        const isSelected = selected.has(source.balanceId);
                        const boxes = selected.get(source.balanceId) ?? "";
                        const availableBoxes = availableBoxesForSource(source);
                        const maximum = Math.min(availableBoxes, Math.max(0, (requestedBoxes ?? 0) - allocated + (Number(boxes) || 0)));
                        return (
                          <div key={source.balanceId} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-1">
                            <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-2 text-xs text-slate-700">
                              <input type="checkbox" aria-label={`Select location ${source.locationLabel} from lot ${source.lotNumber}`} checked={isSelected} onChange={() => onToggle(source.balanceId)} disabled={disabled || requestedBoxes === null} className="h-4 w-4 accent-brand-navy" />
                              <span><span className="block font-semibold">{source.locationLabel}</span><span className="text-slate-500">{availableBoxes} boxes available</span></span>
                            </label>
                            {isSelected && <label className="flex items-center gap-1 text-xs text-slate-500">
                              <input aria-label={`Boxes from ${source.locationLabel}`} type="number" min="0" max={maximum} step="1" value={boxes} onChange={(event) => onChange(source.balanceId, event.target.value)} disabled={disabled} className="h-11 w-20 rounded-lg border border-brand-navy/30 bg-white px-2 text-right font-mono text-sm font-semibold text-slate-900 outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10" />
                              boxes
                            </label>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
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

function sourceAsBoxPlanRow(source: StockSource) {
  return {
    lotId: source.lotId,
    locationId: source.locationId,
    lotStatus: "available",
    qtyRemaining: availableBoxesForSource(source),
    qtyCommitted: 0,
    receivedAt: source.receivedAt ?? new Date(0),
    expiryDate: source.expiryDate ? new Date(`${source.expiryDate}T00:00:00.000Z`) : null,
    expiryPolicy: source.expiryPolicy,
    lotNumber: source.lotNumber,
    locationLabel: source.locationLabel,
    locationPickSequence: source.locationPickSequence,
  };
}

function orderedSourcesForItem(sources: StockSource[], isPerishable: boolean): StockSource[] {
  const byKey = new Map(sources.map((source) => [`${source.lotId}:${source.locationId}`, source]));
  return orderLotLocationRows(sources.map(sourceAsBoxPlanRow), isPerishable)
    .map((row) => byKey.get(`${row.lotId}:${row.locationId}`))
    .filter((source): source is StockSource => Boolean(source));
}

function buildBoxAllocationPlan(
  sources: StockSource[],
  requestedBoxes: number,
  isPerishable: boolean,
): { plan: AllocationPlan; allocations: FifoBoxAllocation[] } {
  const plan = buildAllocationPlan(
    sources.map(sourceAsBoxPlanRow),
    requestedBoxes,
    isPerishable,
  );
  const byKey = new Map(sources.map((source) => [`${source.lotId}:${source.locationId}`, source]));
  const allocations = plan.lines.flatMap((line) => {
    const source = byKey.get(`${line.lotId}:${line.locationId}`);
    if (!source || line.qtyAllocated <= 0) return [];
    const availableBoxes = availableBoxesForSource(source);
    return [{ source, boxes: line.qtyAllocated, availableBoxes }];
  });
  return { plan, allocations };
}

function allocateDefaultFifoLocation(
  sources: StockSource[],
  requestedBoxes: number,
  isPerishable: boolean,
): DraftLine["manualAllocations"] {
  const { allocations } = buildBoxAllocationPlan(sources, requestedBoxes, isPerishable);
  return allocations.map(({ source, boxes }) => ({ balanceId: source.balanceId, boxes: String(boxes) }));
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
  isPerishable: boolean,
): DraftLine["manualAllocations"] {
  if (existing.length === 0) return allocateDefaultFifoLocation(sources, requestedBoxes, isPerishable);

  let remaining = requestedBoxes;
  const existingByBalanceId = new Map(existing.map((allocation) => [allocation.balanceId, allocation]));
  const sortedSources = orderedSourcesForItem(sources, isPerishable);
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

  // If demand grew, first use spare capacity in already-selected locations,
  // then add further locations, all in authoritative FIFO/FEFO order.
  for (const source of sortedSources) {
    if (remaining <= 0) break;
    const existingIndex = allocations.findIndex((allocation) => allocation.balanceId === source.balanceId);
    const currentBoxes = existingIndex >= 0 ? Number(allocations[existingIndex].boxes) : 0;
    const current = Number.isInteger(currentBoxes) ? currentBoxes : 0;
    const boxes = Math.min(Math.max(0, availableBoxesForSource(source) - current), remaining);
    if (boxes <= 0) continue;
    if (existingIndex >= 0) {
      allocations[existingIndex] = { balanceId: source.balanceId, boxes: String(current + boxes) };
    } else {
      allocations.push({ balanceId: source.balanceId, boxes: String(boxes) });
    }
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
  const [openAllocationLineIds, setOpenAllocationLineIds] = useState<Set<string>>(() => new Set());
  const [draFile, setDraFile] = useState<File | null>(null);
  const [importSummary, setImportSummary] = useState<{ type: "success" | "warning" | "error"; message: string; details?: string[] } | null>(null);
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
      isPerishable: sources[0].isPerishable ?? false,
      sources: orderedSourcesForItem(sources, sources[0].isPerishable ?? false),
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
    const selectedAvailableBoxes = selectedSource && !line.manualSplit ? availableBoxesForSource(selectedSource) : totalAvailableBoxes;
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
          }];
        })
      : null;
    const standardPlanResult = item
      ? buildBoxAllocationPlan(item.sources, requestedBoxes ?? 0, item.isPerishable)
      : null;
    const fifoPlan = standardPlanResult?.allocations ?? [];
    const selectedPlanResult = item && selectedSource && requestedBoxes
      ? buildBoxAllocationPlan([selectedSource], requestedBoxes, item.isPerishable)
      : null;
    const fifoAllocations = manualAllocations
      ?? selectedPlanResult?.allocations
      ?? (requestedBoxes !== null ? fifoPlan : []);
    const allocatedBoxes = fifoAllocations.reduce((sum, allocation) => sum + allocation.boxes, 0);
    const stockShortageBoxes = requestedBoxes === null ? 0 : Math.max(0, requestedBoxes - totalAvailableBoxes);
    const allocationShortageBoxes = requestedBoxes === null ? 0 : Math.max(0, requestedBoxes - allocatedBoxes);
    const hasWholeCartonQuantity = requestedBoxes !== null;
    const hasEnoughStock = requestedBoxes !== null && allocatedBoxes === requestedBoxes;
    const requiresOverride = hasEnoughStock && (line.manualSplit
      ? !allocationsMatchFifoPlan(fifoAllocations, fifoPlan)
      : Boolean(selectedSource && !allocationsMatchFifoPlan(fifoAllocations, fifoPlan)));
    return {
      line,
      item,
      effectiveSpq,
      requestedUnits,
      requestedBoxes,
      fifoAllocations,
      allocationPlan: standardPlanResult?.plan ?? null,
      allocatedBoxes,
      stockShortageBoxes,
      allocationShortageBoxes,
      totalAvailableBoxes,
      selectedAvailableBoxes,
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
    const nextValue = val;
    const nextRequestedBoxes = parsed;
    let manualAllocationsPatch: DraftLine["manualAllocations"] | undefined;
    if (detail?.line.manualSplit && detail.item && Number.isInteger(nextRequestedBoxes) && nextRequestedBoxes > 0) {
      const previousRequestedBoxes = Number(detail.line.boxes);
      const previousPlan = Number.isInteger(previousRequestedBoxes) && previousRequestedBoxes > 0
        ? buildBoxAllocationPlan(detail.item.sources, previousRequestedBoxes, detail.item.isPerishable).allocations
        : [];
      const isStillFollowingDefaultPlan = detail.line.manualAllocations.length === 0
        || allocationsMatchFifoPlan(detail.fifoAllocations, previousPlan);
      manualAllocationsPatch = isStillFollowingDefaultPlan
        ? allocateDefaultFifoLocation(detail.item.sources, nextRequestedBoxes, detail.item.isPerishable)
        : rebalanceManualAllocations(detail.item.sources, detail.line.manualAllocations, nextRequestedBoxes, detail.item.isPerishable);
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
    updateLine(lineId, {
      sourceBalanceId,
      manualSplit: false,
      manualAllocations: [],
    });
  };

  const handleManualSplitToggle = (lineId: string) => {
    const detail = lineDetails.find(({ line }) => line.id === lineId);
    if (!detail) return;

    setOpenAllocationLineIds((current) => new Set(current).add(lineId));

    if (detail.line.manualSplit) {
      const fixedSource = detail.item?.sources[0] ?? null;
      updateLine(lineId, {
        manualSplit: false,
        manualAllocations: [],
        sourceBalanceId: fixedSource?.balanceId ?? "",
      });
      return;
    }

    updateLine(lineId, {
      manualSplit: true,
      sourceBalanceId: "",
      manualAllocations: detail.item
        ? allocateDefaultFifoLocation(detail.item.sources, detail.requestedBoxes ?? 0, detail.item.isPerishable)
        : [],
    });
  };

  const handleManualLocationToggle = (lineId: string, balanceId: string) => {
    const detail = lineDetails.find(({ line }) => line.id === lineId);
    const currentAllocations = detail?.line.manualAllocations ?? [];
    const isSelected = currentAllocations.some((allocation) => allocation.balanceId === balanceId);
    updateLine(lineId, {
      manualAllocations: isSelected
        ? currentAllocations.filter((allocation) => allocation.balanceId !== balanceId)
        : [...currentAllocations, {
          balanceId,
          boxes: String(Math.min(
            availableBoxesForSource(detail?.item?.sources.find((source) => source.balanceId === balanceId) ?? { availableQty: 0, spq: 1 }),
            Math.max(0, (detail?.requestedBoxes ?? 0) - currentAllocations.reduce((sum, entry) => sum + (Number(entry.boxes) || 0), 0)),
          )),
        }],
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
      fifoAllocations.map(({ source, boxes }) => {
        const customerItemCode = optionalCustomerItemCode(line.customerItemCode, source.customerItemCode);
        return {
          itemId: line.itemId,
          lotId: source.lotId,
          locationId: source.locationId,
          qty: boxesToPieces(boxes, item?.spq ?? 1),
          ...(customerItemCode ? { customerItemCode } : {}),
          itemCodeIsProvisional: false,
          valid: Boolean(item && itemHasRequiredCode && requestedBoxes !== null && hasWholeCartonQuantity && hasEnoughStock),
        };
      }),
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
  const expiryBySource = new Map<string, ExpiryReviewLine>();
  for (const detail of lineDetails) {
    for (const { source, boxes } of detail.fifoAllocations) {
      if (boxes <= 0 || !evaluateExpiry({ expiryDate: source.expiryDate ?? null, expiryPolicy: source.expiryPolicy ?? "block_release" }).requiresAcknowledgement) continue;
      const key = `${source.itemId}:${source.lotId}:${source.locationId}`;
      const previous = expiryBySource.get(key);
      expiryBySource.set(key, { itemId: source.itemId, lotId: source.lotId, lotNumber: source.lotNumber, locationId: source.locationId,
        qty: (previous?.qty ?? 0) + boxesToPieces(boxes, source.spq), expiryDate: source.expiryDate ?? null,
        expiryPolicy: source.expiryPolicy!, expiryPolicyVersion: source.expiryPolicyVersion ?? 1 });
    }
  }
  const expiryReviewLines = [...expiryBySource.values()];
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
              : lineDetails.some(({ stockShortageBoxes }) => stockShortageBoxes > 0)
                ? "One or more lines exceed available stock. Add/receive stock or intentionally adjust the requested quantity; generation stays blocked while any shortage remains."
              : lineDetails.some(({ line, allocationShortageBoxes }) => line.manualSplit && allocationShortageBoxes > 0)
                ? "Some requested boxes still need a location. Add a FIFO/FEFO location or complete the split allocation."
              : lineDetails.some(({ allocationShortageBoxes }) => allocationShortageBoxes > 0)
                ? "The selected location cannot cover the request. Switch to multi-location allocation or choose a location with enough boxes."
                : null;

  const addLine = () => setLines((current) => [...current, blankDraftLine(crypto.randomUUID())]);
  const updateLine = (id: string, patch: Partial<DraftLine>) => setLines((current) => current.map((line) => line.id === id ? { ...line, ...patch } : line));
  const removeLine = (id: string) => {
    setLines((current) => current.filter((line) => line.id !== id));
    setOpenAllocationLineIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  };
  const resetDraft = () => {
    setLines([blankDraftLine(crypto.randomUUID())]);
    setOpenAllocationLineIds(new Set());
  };
  const toggleAllocationDetails = (lineId: string) => {
    const isOpen = openAllocationLineIds.has(lineId);
    if (!isOpen) {
      const detail = lineDetails.find(({ line }) => line.id === lineId);
      // Opening the allocation editor is an explicit request to edit the
      // server-previewed FIFO/FEFO split. Seed the editable controls with the
      // current preview so the operator can adjust it without first toggling
      // a second "manual split" control.
      if (detail?.item && !detail.line.manualSplit) {
        updateLine(lineId, {
          manualSplit: true,
          sourceBalanceId: "",
          manualAllocations: detail.fifoAllocations.map(({ source, boxes }) => ({
            balanceId: source.balanceId,
            boxes: String(boxes),
          })),
        });
      }
    }
    setOpenAllocationLineIds((current) => {
      const next = new Set(current);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };
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
  function handleDraImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Permit the same file to be selected after cancelling or correcting it.
    event.target.value = "";
    if (file) setDraFile(file);
  }

  function applyDraImport(review: ReviewedDraImport) {
    const hasDraft = lines.some((line) => line.itemId || line.boxes || line.customerItemCode || line.manualAllocations.length > 0);
    if (hasDraft && !window.confirm("Replace the current draft with the reviewed DRA lines? Your current draft entries will be discarded.")) return;
    const availableStock = stock.filter((source) => source.organizationId === review.organizationId && source.flowType === review.flowType);
    const requests = new Map<string, { itemId: string; boxes: number; customerItemCode: string }>();
    for (const row of review.rows) {
      const key = JSON.stringify([row.itemId, row.customerItemCode]);
      const existing = requests.get(key);
      if (existing) existing.boxes += row.boxes;
      else requests.set(key, { ...row });
    }
    const remainingByBalance = new Map(availableStock.map((source) => [source.balanceId, source.availableQty]));
    const nextLines: DraftLine[] = [];
    const warnings: string[] = [];
    let requested = 0;
    let allocated = 0;
    for (const request of requests.values()) {
      const sources = availableStock.filter((source) => source.itemId === request.itemId)
        .map((source) => ({ ...source, availableQty: remainingByBalance.get(source.balanceId) ?? 0 }));
      const allocations = allocateDefaultFifoLocation(orderedSourcesForItem(sources, sources[0]?.isPerishable ?? false), request.boxes, sources[0]?.isPerishable ?? false);
      const allocatedBoxes = allocations.reduce((sum, allocation) => sum + Number(allocation.boxes), 0);
      for (const allocation of allocations) {
        const source = sources.find((candidate) => candidate.balanceId === allocation.balanceId);
        if (source) remainingByBalance.set(source.balanceId, Math.max(0, source.availableQty - Number(allocation.boxes) * source.spq));
      }
      if (allocatedBoxes < request.boxes) warnings.push(`${sources[0]?.itemCode ?? request.itemId}: requested ${request.boxes}, allocated ${allocatedBoxes}, short ${request.boxes - allocatedBoxes} boxes. Receive or locate stock, or intentionally reduce demand before generating the pick list.`);
      nextLines.push({ id: crypto.randomUUID(), itemId: request.itemId, boxes: String(request.boxes), sourceBalanceId: "", manualSplit: true, manualAllocations: allocations, customerItemCode: request.customerItemCode });
      requested += request.boxes;
      allocated += allocatedBoxes;
    }
    setOrganizationId(review.organizationId);
    setFlowType(review.flowType);
    setCustomerPartyId(review.customerPartyId);
    setEndCustomerPartyId(review.endCustomerPartyId);
    setLines(nextLines);
    setOpenAllocationLineIds(new Set());
    setDraFile(null);
    setImportSummary({ type: warnings.length || review.excludedCount ? "warning" : "success",
      message: `Imported ${nextLines.length} line(s) from ${review.fileName} into the draft: ${requested} boxes requested, ${allocated} allocated in preview. ${review.excludedCount} source row(s) explicitly excluded. Review the lot and location allocations before generating the pick list.`, details: warnings });
  }

  return (
    <div className="space-y-4">
      {draFile && <DraImportReview file={draFile} stock={stock} customers={customers} endCustomers={endCustomers}
        initialOrganizationId={organizationId} initialFlowType={flowType} initialCustomerPartyId={customerPartyId} initialEndCustomerPartyId={endCustomerPartyId}
        onApply={applyDraImport} onCancel={() => setDraFile(null)} />}
      {/* Pick List Draft Builder Section */}
      <section className="min-w-0 max-w-full overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-xs space-y-4 sm:p-5">
        {/* Header with Integrated Compact DRA Import */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex min-w-0 items-start gap-2">
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
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-label text-sm font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand-navy transition-colors">
              <Upload className="h-3.5 w-3.5 text-slate-500" />
              Import DRA (Excel/PDF)
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,application/pdf,text/csv"
                className="sr-only"
                onChange={handleDraImport}
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
              <div className="min-w-0">
                <p>{importSummary.message}</p>
                {importSummary.details && importSummary.details.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5" aria-label="DRA rows to review">
                    {importSummary.details.map((detail, index) => <li key={`${index}-${detail}`}>{detail}</li>)}
                  </ul>
                )}
              </div>
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
              {lineDetails.map(({ line, item, requestedUnits, requestedBoxes, fifoAllocations, allocationPlan, allocatedBoxes, stockShortageBoxes, allocationShortageBoxes, hasWholeCartonQuantity, totalAvailableBoxes, selectedAvailableBoxes, selectedSource, requiresOverride }) => (
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
                        <input value={line.boxes} onChange={(event) => handleBoxesChange(line.id, event.target.value)} type="number" min="1" step="1" disabled={!canEditLines || !item} className="h-11 min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 text-right font-mono text-base text-slate-900 outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50" placeholder="0" />
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
                            className="inline-flex min-h-11 items-center rounded-lg px-2 font-label text-[11px] font-bold text-brand-navy underline-offset-2 hover:bg-white hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy disabled:cursor-not-allowed disabled:text-slate-400"
                          >
                            {line.manualSplit ? "Use fixed location" : "Split quantities manually"}
                          </button>
                        )}
                      </div>
                      {requestedBoxes !== null && item && (
                        <div aria-label="Allocation summary" className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-body text-[11px] leading-4 text-slate-600">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-label text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Current allocation</p>
                              <p className="mt-1 truncate text-sm font-semibold text-slate-800" title={fifoAllocations.map(({ source }) => source.locationLabel).join(", ") || undefined}>
                                {fifoAllocations.length > 0
                                  ? fifoAllocations.map(({ source, boxes }) => `${boxes} box${boxes === 1 ? "" : "es"} · ${source.locationLabel}`).join(", ")
                                  : "No location allocated yet"}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleAllocationDetails(line.id)}
                              aria-expanded={openAllocationLineIds.has(line.id)}
                              aria-controls={`allocation-editor-mobile-${line.id}`}
                              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 font-label text-[11px] font-bold text-brand-navy hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy disabled:cursor-not-allowed disabled:text-slate-400"
                            >
                              {openAllocationLineIds.has(line.id) ? "Hide details" : "Edit allocation"}
                              <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${openAllocationLineIds.has(line.id) ? "rotate-180" : ""}`} />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            <span><strong className="text-slate-800">Requested:</strong> {requestedBoxes}</span>
                            <span><strong className="text-slate-800">Available:</strong> {totalAvailableBoxes}</span>
                            <span><strong className="text-slate-800">Allocated:</strong> {allocatedBoxes}</span>
                            <span><strong className="text-slate-800">Remaining:</strong> {Math.max(0, totalAvailableBoxes - allocatedBoxes)}</span>
                            {allocationShortageBoxes > 0 && <span className="font-semibold text-amber-700"><strong>Unallocated:</strong> {allocationShortageBoxes}</span>}
                            {stockShortageBoxes > 0 && <span className="font-semibold text-amber-700"><strong>Stock short:</strong> {stockShortageBoxes}</span>}
                          </div>
                        </div>
                      )}
                      {openAllocationLineIds.has(line.id) && (
                        <div id={`allocation-editor-mobile-${line.id}`} className="grid gap-2 rounded-xl border border-brand-navy/15 bg-brand-navy/[0.03] p-3 font-normal">
                          {!line.manualSplit ? (
                            <>
                              <select aria-label="Automatic source strategy" value={line.sourceBalanceId} onChange={(event) => handleSourceChange(line.id, event.target.value)} disabled={!canEditLines || !item} className="h-11 min-w-0 rounded-xl border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50">
                                <option value="">Select a fixed location</option>
                                {item?.sources.map((source) => {
                                  const lotRank = allocationPlan?.lots.find((lot) => lot.lotId === source.lotId)?.rank;
                                  return (
                                  <option key={source.balanceId} value={source.balanceId}>
                                    {source.locationLabel} · Lot #{lotRank ?? "—"} {source.lotNumber} · {availableBoxesForSource(source)} boxes{lotRank === 1 ? " · Recommended" : " · Supervisor approval"}
                                  </option>
                                  );
                                })}
                              </select>
                              <div className="min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 font-body text-sm text-slate-700">
                                {fifoAllocations.length > 0 ? fifoAllocations.map(({ source, boxes }) => (
                                  <div key={source.balanceId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                    <span className="truncate">{boxes} boxes from {source.locationLabel} <span className="text-slate-500">· Lot {source.lotNumber}</span></span>
                                  </div>
                                )) : <span className="text-slate-400">{!item ? "Select item code first" : !hasWholeCartonQuantity ? "Enter a whole number of boxes" : "No FIFO source can fulfill this quantity"}</span>}
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="text-[11px] font-semibold leading-4 text-slate-600">{allocationPlan?.strategy ?? "FIFO"} is applied automatically across lots. Adjust the locations below if needed.</p>
                              <AllocationRankPlan
                                plan={allocationPlan}
                                sources={item?.sources ?? []}
                                allocations={line.manualAllocations}
                                requestedBoxes={requestedBoxes}
                                disabled={!canEditLines}
                                onToggle={(balanceId) => handleManualLocationToggle(line.id, balanceId)}
                                onChange={(balanceId, value) => handleManualAllocationChange(line.id, balanceId, value)}
                              />
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {requestedBoxes !== null && allocatedBoxes < requestedBoxes && (
                      <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 font-body text-xs leading-5 text-amber-900">
                        {!line.manualSplit && selectedSource && requestedBoxes > selectedAvailableBoxes
                          ? `This location has ${selectedAvailableBoxes} boxes; ${totalAvailableBoxes} are available across FIFO/FEFO locations${requestedBoxes > totalAvailableBoxes ? `, leaving ${stockShortageBoxes} boxes short` : ""}. Keep the ${requestedBoxes}-box request and split across locations${stockShortageBoxes > 0 ? " or receive/locate more stock" : ""}.`
                          : requestedBoxes > totalAvailableBoxes
                            ? `Short ${requestedBoxes - allocatedBoxes} boxes: ${requestedBoxes} requested, ${totalAvailableBoxes} available. Add/receive stock or intentionally adjust the request.`
                            : `${requestedBoxes - allocatedBoxes} requested boxes still need a location. Add a location or complete the split.`}
                      </p>
                    )}
                    <dl className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 font-body text-sm">
                      <div><dt className="text-slate-500">SPQ</dt><dd className="mt-1 font-mono font-bold text-slate-900">{item?.spq ?? "—"}</dd></div>
                      <div><dt className="text-slate-500">Remaining after allocation</dt><dd className="mt-1 font-mono font-bold text-slate-900">{Math.max(0, totalAvailableBoxes - allocatedBoxes)} boxes</dd></div>
                      <div><dt className="text-slate-500">Customer PN</dt><dd className="mt-1"><input value={line.customerItemCode} onChange={(event) => updateLine(line.id, { customerItemCode: event.target.value })} placeholder={item?.customerItemCode || "Enter customer PN"} className="h-9 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 font-mono text-sm text-slate-900 outline-none focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10" /></dd></div>
                      <div><dt className="text-slate-500">Lot</dt><dd className="mt-1 break-words font-mono text-slate-900">{[...new Set(fifoAllocations.map(({ source }) => source.lotNumber))].join(", ") || "—"}</dd></div>
                      <div><dt className="text-slate-500">Mfg. Date</dt><dd className="mt-1 font-mono text-slate-900">{formatStockDate(fifoAllocations[0]?.source.manufactureDate) ?? <span className="text-slate-400">Not recorded</span>}</dd></div>
                      <div><dt className="text-slate-500">Expiry Date</dt><dd className="mt-1 font-mono text-slate-900">{formatStockDate(fifoAllocations[0]?.source.expiryDate) ?? <span className="text-slate-400">Not recorded</span>}</dd></div>
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
          <table aria-label="Pick list lines" className="w-full min-w-[1860px] table-fixed border-collapse text-left">
            <caption className="sr-only">Pick list lines and selected inventory sources</caption>
            <colgroup>
              <col className="w-[280px]" />
              <col className="w-[72px]" />
              <col className="w-[108px]" />
              <col className="w-[118px]" />
              <col className="w-[360px]" />
              <col className="w-[180px]" />
              <col className="w-[220px]" />
              <col className="w-[170px]" />
              <col className="w-[130px]" />
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
                <th scope="col" className="h-14 px-4 text-left">Cust PN</th>
                <th scope="col" className="h-14 px-4 text-left">Item Description</th>
                <th scope="col" className="h-14 px-4 text-left">Lot Number</th>
                <th scope="col" className="h-14 px-4 text-left">Mfg Date</th>
                <th scope="col" className="h-14 px-4 text-left">Expiry Date</th>
                <th scope="col" className="h-14 px-3 text-center"><span className="sr-only">Actions</span></th>
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
                lineDetails.map(({ line, item, requestedUnits, requestedBoxes, fifoAllocations, allocationPlan, allocatedBoxes, stockShortageBoxes, allocationShortageBoxes, hasWholeCartonQuantity, totalAvailableBoxes, selectedAvailableBoxes, selectedSource, requiresOverride }) => (
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
                        step="1"
                        disabled={!canEditLines || !item}
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
                            className="inline-flex min-h-11 items-center rounded-lg px-2 font-label text-[10px] font-bold text-brand-navy underline-offset-2 hover:bg-slate-50 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy disabled:cursor-not-allowed disabled:text-slate-400"
                          >
                            {line.manualSplit ? "Use fixed location" : "Split quantities manually"}
                          </button>
                        )}
                      </div>
                      {requestedBoxes !== null && item && (
                        <div aria-label="Allocation summary" className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-body text-[11px] leading-4 text-slate-600">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-label text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Current allocation</p>
                              <p className="mt-1 truncate text-sm font-semibold text-slate-800" title={fifoAllocations.map(({ source }) => source.locationLabel).join(", ") || undefined}>
                                {fifoAllocations.length > 0
                                  ? fifoAllocations.map(({ source, boxes }) => `${boxes} box${boxes === 1 ? "" : "es"} · ${source.locationLabel}`).join(", ")
                                  : "No location allocated yet"}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleAllocationDetails(line.id)}
                              aria-expanded={openAllocationLineIds.has(line.id)}
                              aria-controls={`allocation-editor-desktop-${line.id}`}
                              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 font-label text-[11px] font-bold text-brand-navy hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy disabled:cursor-not-allowed disabled:text-slate-400"
                            >
                              {openAllocationLineIds.has(line.id) ? "Hide details" : "Edit allocation"}
                              <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${openAllocationLineIds.has(line.id) ? "rotate-180" : ""}`} />
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-1">
                            <span><strong className="text-slate-800">Requested:</strong> {requestedBoxes}</span>
                            <span><strong className="text-slate-800">Available:</strong> {totalAvailableBoxes}</span>
                            <span><strong className="text-slate-800">Allocated:</strong> {allocatedBoxes}</span>
                            <span><strong className="text-slate-800">Remaining:</strong> {Math.max(0, totalAvailableBoxes - allocatedBoxes)}</span>
                            {allocationShortageBoxes > 0 && <span className="font-semibold text-amber-700"><strong>Unallocated:</strong> {allocationShortageBoxes}</span>}
                            {stockShortageBoxes > 0 && <span className="font-semibold text-amber-700"><strong>Stock short:</strong> {stockShortageBoxes}</span>}
                          </div>
                        </div>
                      )}
                      {openAllocationLineIds.has(line.id) && (
                        <div id={`allocation-editor-desktop-${line.id}`} className="grid gap-2 rounded-xl border border-brand-navy/15 bg-brand-navy/[0.03] p-2.5">
                          {!line.manualSplit ? (
                            <>
                              <select aria-label="Automatic source strategy" value={line.sourceBalanceId} onChange={(event) => handleSourceChange(line.id, event.target.value)} disabled={!canEditLines || !item} className="mb-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 font-body text-sm text-slate-900 outline-none transition-colors focus:border-brand-navy focus:ring-2 focus:ring-brand-navy/10 disabled:bg-slate-50">
                                <option value="">Select a fixed location</option>
                                {item?.sources.map((source) => {
                                  const lotRank = allocationPlan?.lots.find((lot) => lot.lotId === source.lotId)?.rank;
                                  return (
                                  <option key={source.balanceId} value={source.balanceId}>
                                    {source.locationLabel} · Lot #{lotRank ?? "—"} {source.lotNumber} · {availableBoxesForSource(source)} boxes{lotRank === 1 ? " · Recommended" : " · Approval"}
                                  </option>
                                  );
                                })}
                              </select>
                              <div className="min-h-10 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 font-body text-xs text-slate-700">
                                {fifoAllocations.length > 0 ? fifoAllocations.map(({ source, boxes }) => (
                                  <div key={source.balanceId} className="flex items-center justify-between gap-3 leading-5">
                                    <span className="truncate" title={`${source.locationLabel} · ${source.lotNumber}`}>{boxes} boxes from {source.locationLabel} · Lot {source.lotNumber}</span>
                                  </div>
                                )) : <span className="text-slate-400">{!item ? "Select item" : !hasWholeCartonQuantity ? `Qty ÷ SPQ must be whole (${item.spq})` : "No FIFO source"}</span>}
                              </div>
                            </>
                          ) : (
                            <>
                              <p className="font-body text-[11px] leading-4 text-slate-600">{allocationPlan?.strategy ?? "FIFO"} is applied automatically across lots. Adjust the locations below if needed.</p>
                              <AllocationRankPlan
                                plan={allocationPlan}
                                sources={item?.sources ?? []}
                                allocations={line.manualAllocations}
                                requestedBoxes={requestedBoxes}
                                disabled={!canEditLines}
                                onToggle={(balanceId) => handleManualLocationToggle(line.id, balanceId)}
                                onChange={(balanceId, value) => handleManualAllocationChange(line.id, balanceId, value)}
                              />
                            </>
                          )}
                        </div>
                      )}
                      {!line.manualSplit && fifoAllocations.length > 0 && (
                        <span className="mt-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-label text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                          {selectedSource ? "Fixed location selected" : "FIFO allocation ready"}
                        </span>
                      )}
                      {requestedBoxes !== null && allocatedBoxes < requestedBoxes && (
                        <p role="alert" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 font-body text-[11px] leading-4 text-amber-900">
                          {!line.manualSplit && selectedSource && requestedBoxes > selectedAvailableBoxes
                            ? `This location has ${selectedAvailableBoxes} boxes; ${totalAvailableBoxes} are available across FIFO/FEFO locations${requestedBoxes > totalAvailableBoxes ? `, leaving ${stockShortageBoxes} boxes short` : ""}. Keep the ${requestedBoxes}-box request and split across locations${stockShortageBoxes > 0 ? " or receive/locate more stock" : ""}.`
                            : requestedBoxes > totalAvailableBoxes
                              ? `Short ${requestedBoxes - allocatedBoxes} boxes: ${requestedBoxes} requested, ${totalAvailableBoxes} available. Add/receive stock or intentionally adjust the request.`
                              : `${requestedBoxes - allocatedBoxes} requested boxes still need a location. Add a location or complete the split.`}
                        </p>
                      )}
                      {requiresOverride && <p className="mt-1 text-[11px] font-semibold leading-4 text-amber-700">{selectedSource ? "Supervisor approval required for this source." : "Supervisor approval required for one or more selected sources."}</p>}
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

                    {/* EXPIRY DATE */}
                    <td className="px-4 py-4 align-top">
                      <div className="pt-1.5">
                        <span className="block font-mono text-sm text-slate-600" title="Inherited from the selected inventory lot; correct this on the receiving record.">
                          {formatStockDate(fifoAllocations[0]?.source.expiryDate) ?? <span className="text-slate-400">Not recorded</span>}
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
              <ExpiryAcknowledgementFields lines={expiryReviewLines} />
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
