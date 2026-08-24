"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, PackagePlus, ShieldCheck, Trash2 } from "lucide-react";

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
  balanceId: string;
  lotId: string;
  lotNumber: string;
  locationId: string;
  locationLabel: string;
  availableQty: number;
  priority: number;
};

type DraftLine = { id: string; itemId: string; balanceId: string; qty: string };

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
      sources: sources
        .sort((a, b) => a.priority - b.priority)
        .map((source, index) => ({ ...source, priority: index + 1 })),
    }));
  }, [flowType, organizationId, stock]);

  const lineDetails = lines.map((line) => {
    const item = catalog.find((candidate) => candidate.itemId === line.itemId);
    const source = item?.sources.find((candidate) => candidate.balanceId === line.balanceId);
    return { line, item, source };
  });
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
  const handleOrganization = (value: string) => { setOrganizationId(value); setFlowType(""); resetDraft(); };
  const handleFlow = (value: "" | "vmi" | "trading" | "supplies") => { setFlowType(value); resetDraft(); };

  return (
    <section className="rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-title-lg font-bold text-on-surface">Create Pick List</h2>
          <p className="mt-1 font-body text-body-sm text-text-grey">Choose one organization, then add all item codes and box sources to one pick list.</p>
        </div>
        <span className="rounded-full bg-accent-indigo-50 px-3 py-1 font-label text-label font-bold text-brand-navy">{lines.length} line{lines.length === 1 ? "" : "s"}</span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 font-label text-label font-bold text-on-surface">Organization
          <select value={organizationId} onChange={(event) => handleOrganization(event.target.value)} className="h-12 rounded border border-outline-variant bg-surface-white px-3 font-body text-body-md font-normal text-on-surface outline-none focus:ring-2 focus:ring-primary">
            <option value="">Select organization…</option>
            {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
          </select>
        </label>
        <label className="grid gap-2 font-label text-label font-bold text-on-surface">Inventory Model
          <select value={flowType} onChange={(event) => handleFlow(event.target.value as typeof flowType)} disabled={!organizationId} className="h-12 rounded border border-outline-variant bg-surface-white px-3 font-body text-body-md font-normal text-on-surface outline-none focus:ring-2 focus:ring-primary disabled:bg-surface-light-grey disabled:text-text-grey">
            <option value="">Select inventory model…</option>
            {(["vmi", "trading", "supplies"] as const).filter((flow) => stock.some((row) => row.organizationId === organizationId && row.flowType === flow)).map((flow) => <option key={flow} value={flow}>{flow.toUpperCase()}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-outline-variant/30">
        <div className="min-w-[1020px]">
          <div className="grid grid-cols-[minmax(230px,1.4fr)_minmax(210px,1.1fr)_160px_120px_120px_48px] gap-3 bg-surface-light-grey px-4 py-3 font-label text-label font-bold uppercase tracking-[0.04em] text-text-grey">
            <span>Item Code</span><span>Source Location</span><span>Lot Number</span><span className="text-right">Boxes</span><span>UOM / SPQ</span><span className="sr-only">Remove</span>
          </div>
          {lines.length === 0 ? <div className="px-4 py-8 text-center font-body text-body-md text-text-grey">Add an item code to start this pick list.</div> : lineDetails.map(({ line, item, source }) => (
            <div key={line.id} className="grid grid-cols-[minmax(230px,1.4fr)_minmax(210px,1.1fr)_160px_120px_120px_48px] items-center gap-3 border-t border-outline-variant/30 px-4 py-3">
              <select value={line.itemId} onChange={(event) => updateLine(line.id, { itemId: event.target.value, balanceId: "", qty: "" })} className="h-11 rounded border border-outline-variant bg-surface-white px-3 font-body text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary">
                <option value="">Select item code…</option>
                {catalog.map((candidate) => <option key={candidate.itemId} value={candidate.itemId}>{candidate.itemCode} — {candidate.itemName}</option>)}
              </select>
              <select value={line.balanceId} disabled={!item} onChange={(event) => updateLine(line.id, { balanceId: event.target.value, qty: "" })} className="h-11 rounded border border-outline-variant bg-surface-white px-3 font-body text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary disabled:bg-surface-light-grey">
                <option value="">Select location…</option>
                {item?.sources.map((candidate) => <option key={candidate.balanceId} value={candidate.balanceId}>{candidate.locationLabel} · {candidate.availableQty} boxes{candidate.priority === 1 ? " · FIFO/FEFO" : " · approval may be required"}</option>)}
              </select>
              <p className="font-mono text-mono-md text-on-surface">{source?.lotNumber ?? "—"}</p>
              <label className="flex h-11 items-center rounded border border-outline-variant bg-surface-white px-3 focus-within:ring-2 focus-within:ring-primary"><input value={line.qty} onChange={(event) => updateLine(line.id, { qty: event.target.value })} type="number" min="1" max={source?.availableQty} disabled={!source} className="min-w-0 flex-1 bg-transparent text-right font-mono text-mono-md text-on-surface outline-none disabled:text-text-grey" placeholder="0" /><span className="ml-1 font-body text-body-sm text-text-grey">box</span></label>
              <p className="font-body text-body-sm text-text-grey">{item ? `${item.uom} / ${item.spq}` : "—"}</p>
              <button type="button" onClick={() => removeLine(line.id)} className="flex h-11 w-11 items-center justify-center rounded text-status-held hover:bg-status-held/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Remove line"><Trash2 size={18} aria-hidden="true" /></button>
              {item && <p className="col-span-5 -mt-1 font-body text-body-sm text-text-grey">{item.customerItemCode ? `Customer item code: ${item.customerItemCode}` : "No customer item code"}{source?.priority && source.priority > 1 ? " · This source may need FIFO/FEFO override approval." : ""}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" disabled={!organizationId || !flowType} onClick={addLine} className="inline-flex h-11 items-center gap-2 rounded border border-brand-navy px-4 font-label text-label font-bold text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:border-outline-variant disabled:text-text-grey"><PackagePlus size={18} aria-hidden="true" />Add item line</button>
        <form action={requiresOverride ? overrideAction : createAction}>
          <input type="hidden" name="request" value={requiresOverride ? overrideRequest : request} />
          {requiresOverride && <input type="hidden" name="reason" value={overrideReason} />}
          <button type="submit" disabled={requiresOverride ? !canRequestOverride || !overrideRequest || overrideReason.trim().length < 10 : !request} className="inline-flex h-12 items-center gap-2 rounded bg-primary px-5 font-label text-body-md font-bold text-surface-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy disabled:cursor-not-allowed disabled:opacity-45">{requiresOverride ? "Request Approval" : "Generate Pick List"}{requiresOverride ? <ShieldCheck size={18} aria-hidden="true" /> : <ChevronRight size={18} aria-hidden="true" />}</button>
        </form>
      </div>
      {requiresOverride && <div className="mt-4 rounded-lg border border-status-pending/40 bg-status-pending/5 p-4"><div className="flex items-start gap-3"><AlertTriangle size={21} className="mt-0.5 shrink-0 text-status-pending" aria-hidden="true" /><div className="min-w-0"><p className="font-heading text-body-md font-bold text-on-surface">FIFO/FEFO override approval required</p><p className="mt-1 font-body text-body-sm text-text-grey">This source is not the recommended location. An approved request is locked to the selected item, lot, location, and box quantity.</p></div></div>{canRequestOverride ? <label className="mt-4 grid gap-2 font-label text-label font-bold text-on-surface">Reason for choosing this location<textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} minLength={10} rows={3} placeholder="Explain why the recommended source cannot be used." className="rounded border border-outline-variant bg-surface-white px-3 py-2 font-body text-body-md font-normal text-on-surface outline-none focus:ring-2 focus:ring-primary" /><span className="font-body text-body-sm font-normal text-text-grey">At least 10 characters are required.</span></label> : <p className="mt-4 font-body text-body-sm text-status-held">Request an approval for one alternate source at a time before adding other draft lines.</p>}</div>}
    </section>
  );
}
