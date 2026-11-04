"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "@/components/ui/icons";
import { matchItemAgainstCatalog } from "@/lib/parsers/item-matcher";
import type { DraParseOptions, DraParseResult, ParsedDraRow } from "@/lib/parsers/dra-parser";
import { parseDraDocumentAction } from "../_actions";

type Model = "vmi" | "trading" | "supplies";
type Source = {
  itemId: string; itemCode: string; itemName: string;
  supplierItemCode?: string | null; dsgcItemNumber?: string | null; customerItemCode: string | null;
  organizationId: string | null; organizationName: string | null;
  flowType: Model; spq: number; availableQty: number; uom: string;
};
export type ReviewedDraImport = {
  organizationId: string; flowType: Model; customerPartyId: string; endCustomerPartyId: string;
  rows: Array<{ itemId: string; boxes: number; customerItemCode: string }>;
  fileName: string; excludedCount: number;
};
type Props = {
  file: File; stock: Source[];
  customers: Array<{ id: string; code: string; name: string; relationship: string }>;
  endCustomers: Array<{ id: string; code: string; name: string }>;
  initialOrganizationId: string; initialFlowType: "" | Model;
  initialCustomerPartyId: string; initialEndCustomerPartyId: string;
  onApply: (review: ReviewedDraImport) => void; onCancel: () => void;
};
type ReviewRow = { itemId: string; customerItemCode: string; quantity: string; unit: "boxes" | "units"; excluded: boolean; corrected: boolean };
const columnLabels = {
  itemCode: "Item code", customerItemCode: "Customer item code", itemDescription: "Description",
  requestedQty: "Requested quantity", packageCount: "Boxes / cartons", spq: "SPQ", uom: "UOM", remarks: "Remarks",
} as const;
const inputClass = "h-11 w-full min-w-0 rounded-lg border border-outline-variant bg-surface-white px-3 font-body text-base text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy";
const buttonClass = "min-h-11 rounded-lg border border-outline-variant px-4 font-label text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:cursor-not-allowed disabled:opacity-50";
const boxUom = (value?: string) => /^(box(?:es)?|ctns?|cartons?|pkg|pkgs|packages?)$/i.test(value?.trim() ?? "");
const positiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0;

function initialRow(row: ParsedDraRow, catalog: Source[]): ReviewRow {
  const match = matchItemAgainstCatalog({ itemCode: row.itemCode, customerItemCode: row.customerItemCode, description: row.itemDescription },
    catalog.map((item) => ({ ...item, id: item.itemId, code: item.itemCode, name: item.itemName })));
  const best = match.bestMatch;
  // A fuzzy or description match is a suggestion, never an automatic identity.
  const unique = best && best.score >= 95 && best.matchedField !== "name"
    && match.candidates.filter((candidate) => candidate.score === best.score).length === 1;
  return {
    itemId: unique ? best.item.id : "",
    customerItemCode: row.customerItemCode?.trim() ?? "",
    quantity: String(row.packageCount ?? row.requestedQty ?? ""),
    unit: row.packageCount !== undefined || boxUom(row.uom) ? "boxes" : "units",
    excluded: false, corrected: false,
  };
}

/** Review changes only a browser-local draft. The normal commit command owns reservation and scope checks. */
export function DraImportReview(props: Props) {
  const { file, stock, customers, endCustomers, onApply, onCancel } = props;
  const [result, setResult] = useState<DraParseResult | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState(props.initialOrganizationId);
  const [flowType, setFlowType] = useState<"" | Model>(props.initialFlowType);
  const [customerPartyId, setCustomerPartyId] = useState(props.initialCustomerPartyId);
  const [endCustomerPartyId, setEndCustomerPartyId] = useState(props.initialEndCustomerPartyId);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [options, setOptions] = useState<DraParseOptions>({});
  const [mappingDirty, setMappingDirty] = useState(false);
  const [headerConfirmed, setHeaderConfirmed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  const organizations = useMemo(() => [...new Map(stock.filter((s) => s.organizationId).map((s) => [s.organizationId!, {
    id: s.organizationId!, name: s.organizationName ?? s.organizationId!,
    code: customers.find((c) => c.id === s.organizationId)?.code,
  }])).values()], [stock, customers]);
  const models = useMemo(() => [...new Set(stock.filter((s) => s.organizationId === organizationId).map((s) => s.flowType))], [stock, organizationId]);
  const catalog = useMemo(() => [...new Map(stock.filter((s) => s.organizationId === organizationId && s.flowType === flowType)
    .map((s) => [s.itemId, s])).values()], [stock, organizationId, flowType]);
  const recipients = flowType === "trading" ? customers.filter((c) => c.relationship === "trading_customer") : endCustomers;
  const requester = result?.header.requestingOrganization?.trim().toLowerCase();
  const selectedOrganization = organizations.find((o) => o.id === organizationId);
  const headerConflict = Boolean(requester && selectedOrganization && ![selectedOrganization.name, selectedOrganization.code]
    .some((value) => value?.trim().toLowerCase() === requester));

  useEffect(() => {
    alive.current = true;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => { alive.current = false; document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);

  async function readDocument(nextOptions: DraParseOptions, initial = false) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("options", JSON.stringify(nextOptions));
      const response = await parseDraDocumentAction(form);
      if (!alive.current) return;
      if (response.parseResult) {
        const parsed = response.parseResult;
        setResult(parsed);
        setHeaderConfirmed(false);
        setMappingDirty(false);
        if (parsed.spreadsheet) setOptions({ sheetName: parsed.spreadsheet.sheetName,
          headerRowIndex: parsed.spreadsheet.headerRowIndex, columnMap: parsed.spreadsheet.columnMap });
        if (initial) {
          const requested = parsed.header.requestingOrganization?.trim().toLowerCase();
          const matches = requested ? organizations.filter((o) => [o.name, o.code].some((v) => v?.trim().toLowerCase() === requested)) : [];
          const orgId = matches.length === 1 ? matches[0].id : props.initialOrganizationId;
          const availableModels = [...new Set(stock.filter((s) => s.organizationId === orgId).map((s) => s.flowType))];
          const model = availableModels.length === 1 ? availableModels[0]
            : orgId === props.initialOrganizationId && availableModels.includes(props.initialFlowType as Model) ? props.initialFlowType : "";
          setOrganizationId(orgId);
          setFlowType(model);
          const recipientText = parsed.header.recipientOrganization?.trim().toLowerCase();
          const choices = model === "trading" ? customers.filter((c) => c.relationship === "trading_customer") : endCustomers;
          const recipientMatches = choices.filter((c) => [c.name, c.code].some((v) => v.trim().toLowerCase() === recipientText));
          const recipientId = recipientMatches.length === 1 ? recipientMatches[0].id : "";
          setCustomerPartyId(model === "vmi" || model === "supplies" ? orgId : recipientText ? recipientId : model === props.initialFlowType ? props.initialCustomerPartyId : "");
          setEndCustomerPartyId(model === "vmi" ? recipientText ? recipientId : orgId === props.initialOrganizationId ? props.initialEndCustomerPartyId : "" : "");
        } else if (parsed.header.recipientOrganization !== result?.header.recipientOrganization) {
          // A different worksheet is a different request. Its recipient cannot
          // inherit a previously confirmed destination from another sheet.
          const recipientText = parsed.header.recipientOrganization?.trim().toLowerCase();
          const choices = flowType === "trading" ? customers.filter((c) => c.relationship === "trading_customer") : endCustomers;
          const matches = recipientText ? choices.filter((c) => [c.name, c.code].some((value) => value.trim().toLowerCase() === recipientText)) : [];
          const recipientId = matches.length === 1 ? matches[0].id : "";
          if (flowType === "vmi") setEndCustomerPartyId(recipientId);
          else if (flowType === "trading") setCustomerPartyId(recipientId);
        }
      }
      if (!response.ok) setError(response.error ?? "The DRA could not be read. Check the file or review its column mapping.");
    } catch {
      if (alive.current) setError("The DRA could not be read. Check your connection, then retry this file.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  useEffect(() => {
    void readDocument({}, true);
    // One file per mounted review; header changes must not upload it again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);
  useEffect(() => { setRows((result?.rows ?? []).map((row) => initialRow(row, catalog))); }, [result, catalog]);

  const details = rows.map((row, index) => {
    const original = result?.rows[index];
    const item = catalog.find((i) => i.itemId === row.itemId);
    const quantity = Number(row.quantity);
    const boxes = row.unit === "boxes" ? quantity : item && item.spq > 0 ? quantity / item.spq : 0;
    const originalMismatch = Boolean(item && original && (
      (original.spq !== undefined && original.spq !== item.spq)
      || (original.packageCount !== undefined && original.requestedQty !== undefined
        && original.requestedQty !== original.packageCount * (boxUom(original.uom) ? 1 : item.spq))
    ));
    const issue = !item ? "Select an enrolled item for this row."
      : row.customerItemCode.trim().length > 100 ? "Customer item code exceeds 100 characters. Correct the reference before using this row."
      : !positiveInteger(quantity) || !positiveInteger(boxes) || !positiveInteger(item.spq)
        ? `Enter a positive whole-box quantity or units divisible by enrolled SPQ ${item.spq}.`
        : originalMismatch && !row.corrected ? "Document quantities or SPQ disagree with enrollment. Check the quantity and confirm the correction below." : null;
    return { row, original, item, boxes, issue, originalMismatch };
  });
  const requestedByItem = new Map<string, number>();
  details.filter((d) => !d.row.excluded && !d.issue).forEach((d) => requestedByItem.set(d.row.itemId, (requestedByItem.get(d.row.itemId) ?? 0) + d.boxes));
  const shortageItems = [...requestedByItem].flatMap(([itemId, requested]) => {
    const sources = stock.filter((s) => s.itemId === itemId && s.organizationId === organizationId && s.flowType === flowType);
    const available = sources.reduce((sum, s) => sum + Math.max(0, Math.floor(s.availableQty / s.spq)), 0);
    return requested > available ? [`${sources[0]?.itemCode}: ${requested} boxes requested, ${available} available, short ${requested - available}. The full demand will stay in the draft.`] : [];
  });
  const included = details.filter((d) => !d.row.excluded);
  const referencesByItem = new Map<string, Set<string>>();
  for (const detail of included) {
    if (!detail.row.itemId) continue;
    const references = referencesByItem.get(detail.row.itemId) ?? new Set<string>();
    references.add(detail.row.customerItemCode.trim());
    referencesByItem.set(detail.row.itemId, references);
  }
  // The committed snapshot has one customer reference per item/source.
  // Reconcile aliases here instead of allowing a later aggregate to discard one.
  const conflictingReferences = [...referencesByItem.values()].some((references) => references.size > 1);
  const recipientValid = flowType === "vmi" ? endCustomers.some((c) => c.id === endCustomerPartyId)
    : flowType === "trading" ? recipients.some((c) => c.id === customerPartyId) : flowType === "supplies";
  const canApply = !busy && !error && !mappingDirty && Boolean(organizationId && flowType && models.includes(flowType))
    && recipientValid && (!headerConflict || headerConfirmed) && !conflictingReferences && included.length > 0 && included.every((d) => !d.issue);
  const patchRow = (index: number, patch: Partial<ReviewRow>) => setRows((current) => current.map((row, i) => i === index ? { ...row, ...patch } : row));

  function changeOrganization(value: string) {
    setOrganizationId(value); setHeaderConfirmed(false);
    const validModels = [...new Set(stock.filter((s) => s.organizationId === value).map((s) => s.flowType))];
    const model = validModels.length === 1 ? validModels[0] : "";
    setFlowType(model); setCustomerPartyId(model === "vmi" || model === "supplies" ? value : ""); setEndCustomerPartyId("");
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-2 sm:p-6">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dra-review-title" aria-describedby="dra-review-description" tabIndex={-1}
        className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-surface-white text-on-surface shadow-elevation-2"
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); onCancel(); }
          if (event.key === "Tab") {
            const elements = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]');
            if (!elements?.length) return;
            const first = elements[0], last = elements[elements.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus(); }
          }
        }}>
        <div className="flex items-start justify-between gap-3 border-b border-outline-variant/30 p-4">
          <div className="min-w-0"><h2 id="dra-review-title" className="font-heading text-lg font-bold">Review DRA import</h2>
            <p id="dra-review-description" className="mt-1 break-words font-body text-sm">{file.name} — review columns, Organization, items, and quantities before adding lines to the draft.</p></div>
          <button type="button" onClick={onCancel} aria-label="Close DRA review" className={`${buttonClass} shrink-0 px-3`}><X size={20} /></button>
        </div>
        <div className="space-y-5 overflow-y-auto p-4 font-body text-sm" aria-busy={busy}>
          {busy && <p role="status">Reading DRA document…</p>}
          {error && <div role="alert" className="rounded-lg border border-error/30 p-3"><p>{error}</p><button className={`${buttonClass} mt-2`} type="button" disabled={busy} onClick={() => void readDocument(options)}>Retry file</button></div>}
          {result?.spreadsheet && <details open={result.rows.length === 0 || undefined} className="rounded-lg border border-outline-variant/40 p-3">
            <summary className="min-h-11 cursor-pointer py-2 font-semibold">Review spreadsheet columns</summary>
            <p className="mb-3">Map the columns present in your file. A location column is not required. Re-reading columns resets row corrections.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label>Worksheet<select className={inputClass} value={options.sheetName ?? ""} disabled={busy} onChange={(e) => { setMappingDirty(true); void readDocument({ sheetName: e.target.value }); }}>
                {result.spreadsheet.sheetNames.map((name) => <option key={name}>{name}</option>)}</select></label>
              <label>Header row<input type="number" min="1" max="10000" className={inputClass} value={(options.headerRowIndex ?? 0) + 1} disabled={busy}
                onChange={(e) => { setOptions((current) => ({ ...current, headerRowIndex: Number(e.target.value) - 1 })); setMappingDirty(true); }} /></label>
              {(Object.keys(columnLabels) as Array<keyof typeof columnLabels>).map((key) => <label key={key}>{columnLabels[key]} column
                <select className={inputClass} aria-label={`${columnLabels[key]} column`} value={options.columnMap?.[key] ?? ""} disabled={busy}
                  onChange={(e) => { const index = e.target.value; setOptions((current) => ({ ...current, columnMap: { ...current.columnMap, [key]: index === "" ? undefined : Number(index) } })); setMappingDirty(true); }}>
                  <option value="">Not in file</option>{result.spreadsheet!.columns.map((column) => <option key={column.index} value={column.index}>{column.index + 1}: {column.label || "Unnamed column"}</option>)}
                </select></label>)}
            </div>
            <button type="button" className={`${buttonClass} mt-3`} disabled={busy} onClick={() => void readDocument(options)}>Re-read columns</button>
            {mappingDirty && <p role="status" className="mt-2">Column mapping changed. Re-read columns before using these rows.</p>}
          </details>}
          {result && <>
            {(result.header.draReference || result.header.releaseDate) && <p>Reference: {result.header.draReference || "Not provided"} · Release date: {result.header.releaseDate || "Not provided"}</p>}
            {result.header.requestingOrganization && <p>Requesting Organization in document: <strong>{result.header.requestingOrganization}</strong></p>}
            {result.header.recipientOrganization && <p>Delivery to in document: <strong>{result.header.recipientOrganization}</strong></p>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label>Organization<select className={inputClass} value={organizationId} disabled={busy} onChange={(e) => changeOrganization(e.target.value)}>
                <option value="">Select Organization</option>{organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
              <label>Inventory Model<select className={inputClass} value={flowType} disabled={busy || !organizationId} onChange={(e) => { const model = e.target.value as Model; setFlowType(model); setCustomerPartyId(model === "vmi" || model === "supplies" ? organizationId : ""); setEndCustomerPartyId(""); }}>
                <option value="">Select Inventory Model</option>{models.map((model) => <option key={model} value={model}>{model === "vmi" ? "VMI" : model === "trading" ? "Trading" : "Supplies"}</option>)}</select></label>
              {(flowType === "vmi" || flowType === "trading") && <label>{flowType === "vmi" ? "End Customer" : "Trading Customer"}<select className={inputClass} value={flowType === "vmi" ? endCustomerPartyId : customerPartyId} disabled={busy}
                onChange={(e) => flowType === "vmi" ? setEndCustomerPartyId(e.target.value) : setCustomerPartyId(e.target.value)}>
                <option value="">Select recipient</option>{recipients.map((recipient) => <option key={recipient.id} value={recipient.id}>{recipient.code} · {recipient.name}</option>)}</select></label>}
            </div>
            {headerConflict && <label className="flex min-h-11 items-center gap-3 rounded-lg border border-status-held/30 p-3"><input type="checkbox" checked={headerConfirmed} onChange={(e) => setHeaderConfirmed(e.target.checked)} />I reviewed the document requester and confirm the selected Organization owns this stock.</label>}
            {result.warnings.length > 0 && <div role="status" className="rounded-lg border border-status-held/30 p-3"><p className="font-semibold">Document needs review</p><ul className="mt-1 list-disc pl-5">{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
            {result.rows.length === 0 && <p role="status">No release rows were extracted. Review spreadsheet columns, or upload a searchable PDF, Excel, or CSV file with item codes and quantities.</p>}
            <div className="space-y-3">{details.map(({ row, original, item, boxes, issue, originalMismatch }, index) => {
              const rowNumber = original?.sourceRow ?? index + 1;
              return <section key={index} aria-label={`DRA row ${rowNumber}`} className="rounded-lg border border-outline-variant/50 p-3">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="font-semibold">Row {rowNumber}</h3><p className="break-all">{original?.customerItemCode || original?.itemCode || "No item code"}</p>{original?.itemDescription && <p className="break-words">{original.itemDescription}</p>}</div>
                  <label className="flex min-h-11 items-center gap-2"><input type="checkbox" aria-label={`Exclude row ${rowNumber}`} checked={row.excluded} onChange={(e) => patchRow(index, { excluded: e.target.checked })} />Exclude this row</label></div>
                {!row.excluded && <>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="sm:col-span-2 lg:col-span-1">Enrolled item<select className={inputClass} aria-label={`Enrolled item for row ${rowNumber}`} value={row.itemId} onChange={(e) => patchRow(index, { itemId: e.target.value, corrected: false })}>
                      <option value="">Select an enrolled item</option>{catalog.map((candidate) => <option key={candidate.itemId} value={candidate.itemId}>{(flowType === "vmi" ? candidate.supplierItemCode : candidate.dsgcItemNumber) || candidate.itemCode} · {candidate.itemName}</option>)}</select></label>
                    <label>Requested quantity<input className={inputClass} aria-label={`Requested quantity for row ${rowNumber}`} type="number" min="1" step="1" value={row.quantity} onChange={(e) => patchRow(index, { quantity: e.target.value, corrected: false })} /></label>
                    <label>Quantity unit<select className={inputClass} aria-label={`Quantity unit for row ${rowNumber}`} value={row.unit} onChange={(e) => patchRow(index, { unit: e.target.value as ReviewRow["unit"], corrected: false })}><option value="boxes">Boxes</option><option value="units">Base units</option></select></label>
                    <label>Customer item code (optional)<input className={inputClass} aria-label={`Customer item code for row ${rowNumber}`} maxLength={100} value={row.customerItemCode} onChange={(e) => patchRow(index, { customerItemCode: e.target.value })} /></label>
                  </div>
                  {item && <p className="mt-2">Enrolled SPQ: {item.spq} {item.uom} per box{positiveInteger(boxes) ? ` · Requested: ${boxes} boxes (${boxes * item.spq} ${item.uom})` : ""}</p>}
                  {item && flowType !== "vmi" && !item.dsgcItemNumber?.trim() && <p role="status" className="mt-2 text-status-held">This item needs its enrolled DSGC item code before pick-list generation. Correct Item Enrollment, then refresh stock before generating.</p>}
                  {issue && <p role="status" className="mt-2 text-error">{issue}</p>}
                  {originalMismatch && <label className="mt-2 flex min-h-11 items-center gap-2"><input type="checkbox" checked={row.corrected} aria-label={`Use corrected quantity for row ${rowNumber}`} onChange={(e) => patchRow(index, { corrected: e.target.checked })} />I checked this quantity against the DRA and will use the corrected quantity with enrolled SPQ.</label>}
                </>}
              </section>;
            })}</div>
            {conflictingReferences && <p role="alert" className="rounded-lg border border-error/30 p-3 text-error">Repeated rows for the same item have conflicting Customer item codes. Correct them to one release reference, explicitly exclude the affected row, or prepare separate pick lists for different references.</p>}
            {shortageItems.length > 0 && <div role="status" className="rounded-lg border border-status-held/40 p-3"><p className="font-semibold">Stock shortages</p><ul className="list-disc pl-5">{shortageItems.map((message) => <li key={message}>{message}</li>)}</ul><p className="mt-2">Receive or locate stock, or intentionally reduce demand in the draft before generating the pick list.</p></div>}
          </>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/30 bg-surface-white p-4">
          <p className="font-body text-sm">{included.length} included · {rows.length - included.length} excluded. Review lot and location allocations in the next step.</p>
          <div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} onClick={onCancel}>Cancel</button>
            <button type="button" disabled={!canApply} className={`${buttonClass} bg-brand-navy text-white`} onClick={() => {
              if (!canApply || !flowType) return;
              onApply({ organizationId, flowType, customerPartyId: flowType === "vmi" || flowType === "supplies" ? organizationId : customerPartyId,
                endCustomerPartyId: flowType === "vmi" ? endCustomerPartyId : flowType === "supplies" ? organizationId : customerPartyId,
                fileName: file.name, excludedCount: rows.length - included.length,
                rows: included.map((detail) => ({ itemId: detail.row.itemId, boxes: detail.boxes, customerItemCode: detail.row.customerItemCode.trim() })) });
            }}>Use reviewed lines</button></div>
        </div>
      </div>
    </div>, document.body,
  );
}
