"use client";

import { useMemo, useState } from "react";
import { ChevronRight, PackageCheck, Trash2, Building2, Layers } from "lucide-react";

export type CustomerOption = {
  id: string;
  code: string;
  name: string;
};

export type PickListDraftLine = {
  balanceId: string;
  itemId: string;
  itemCode: string;
  customerItemCode?: string | null;
  itemDescription: string;
  lotId: string;
  lotNumber: string;
  locationId: string;
  locationLabel: string;
  qty: number;
  spq: number;
  spqMeter?: string | number | null;
  manufactureDate?: string | null;
  uom: string;
  flowType: "vmi" | "trading" | "supplies";
  availableQty: number;
};

interface Props {
  customers: CustomerOption[];
  createAction: (formData: FormData) => void;
  draftLines: PickListDraftLine[];
  onRemoveLine: (balanceId: string) => void;
  onUpdateQty: (balanceId: string, qty: number) => void;
  onClearDraft: () => void;
}

export function MultiPickListBuilder({
  customers,
  createAction,
  draftLines,
  onRemoveLine,
  onUpdateQty,
  onClearDraft,
}: Props) {
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [isExpanded, setIsExpanded] = useState(true);

  // Default flowType based on the first draft line if present, else fallback to trading
  const flowType = draftLines[0]?.flowType ?? "trading";

  const payloadJson = useMemo(() => {
    if (!selectedCustomerId || draftLines.length === 0) return "";
    const lines = draftLines.map((line) => ({
      itemId: line.itemId,
      lotId: line.lotId,
      locationId: line.locationId,
      qty: line.qty,
    }));
    return JSON.stringify({
      partyId: selectedCustomerId,
      flowType,
      lines,
      idempotencyKey: crypto.randomUUID(),
    });
  }, [selectedCustomerId, flowType, draftLines]);

  if (draftLines.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-outline-variant bg-surface-white/60 p-4 text-center">
        <p className="font-heading text-body-md font-semibold text-on-surface">
          Multi-Item Pick List Builder
        </p>
        <p className="mt-1 font-body text-body-sm text-text-grey">
          Select a customer party below and click <strong>&quot;+ Add to Pick List&quot;</strong> on any lot row in the table to queue multiple item codes.
        </p>
      </div>
    );
  }

  const totalBoxes = draftLines.reduce((sum, l) => sum + Math.ceil(l.qty / (l.spq || 1)), 0);
  const totalUnits = draftLines.reduce((sum, l) => sum + l.qty, 0);

  return (
    <section className="rounded-xl border border-brand-navy/30 bg-surface-white shadow-elevation-2 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-navy/5 px-5 py-3 border-b border-outline-variant/30">
        <div className="flex items-center gap-2">
          <Layers className="text-brand-navy" size={20} />
          <h3 className="font-heading text-title-md font-bold text-on-surface">
            Multi-Item Pick List Draft ({draftLines.length} {draftLines.length === 1 ? "Item Code" : "Item Codes"})
          </h3>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClearDraft}
            className="text-body-sm font-label font-bold text-status-held hover:underline"
          >
            Clear Draft
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 rounded border border-outline-variant px-3 font-label text-label font-bold text-on-surface"
          >
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-5 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="target-customer" className="block font-label text-label font-bold text-on-surface">
                Target Customer Organization <span className="text-brand-red">*</span>
              </label>
              <div className="mt-1.5 flex items-center gap-2 rounded border border-outline-variant bg-surface-white px-3 focus-within:ring-2 focus-within:ring-brand-navy">
                <Building2 size={18} className="text-text-grey" />
                <select
                  id="target-customer"
                  required
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="h-11 w-full bg-transparent font-body text-body-md text-on-surface outline-none"
                >
                  <option value="">Select target customer organization…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-6 rounded bg-surface-light-grey/45 px-4 py-2">
              <div>
                <span className="block font-label text-label uppercase text-text-grey">Total Packages</span>
                <span className="font-mono text-mono-lg font-bold text-brand-navy">{totalBoxes} Boxes</span>
              </div>
              <div className="h-8 w-px bg-outline-variant/40" />
              <div>
                <span className="block font-label text-label uppercase text-text-grey">Total Qty</span>
                <span className="font-mono text-mono-lg font-bold text-on-surface">{totalUnits.toLocaleString()} Units</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded border border-outline-variant/40">
            <table className="w-full min-w-[1000px] border-collapse text-left font-body text-body-md">
              <thead>
                <tr className="border-b border-outline-variant bg-accent-indigo-50/70 font-label text-label font-bold text-text-grey uppercase">
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5 text-right">SPQ</th>
                  <th className="px-3 py-2.5 text-right">No. of Pckgs</th>
                  <th className="px-3 py-2.5 font-mono">ITEM CODE</th>
                  <th className="px-3 py-2.5 font-mono">CUST PN</th>
                  <th className="px-3 py-2.5">ITEM DESCRIPTION</th>
                  <th className="px-3 py-2.5 text-right">METERAGE</th>
                  <th className="px-3 py-2.5 font-mono">LOT NUMBER</th>
                  <th className="px-3 py-2.5 font-mono">MFG DATE</th>
                  <th className="px-3 py-2.5">LOCATION</th>
                  <th className="px-3 py-2.5 text-center">REMOVE</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 font-body text-body-sm">
                {draftLines.map((line) => {
                  const spq = line.spq || 1;
                  const numPckgs = Math.ceil(line.qty / spq);
                  return (
                    <tr key={line.balanceId} className="hover:bg-surface-light-grey/20">
                      <td className="px-3 py-2.5 text-right">
                        <input
                          type="number"
                          min={1}
                          max={line.availableQty}
                          value={line.qty}
                          onChange={(e) => onUpdateQty(line.balanceId, Math.max(1, Math.min(line.availableQty, Number(e.target.value) || 1)))}
                          className="w-24 rounded border border-outline-variant px-2 py-1 text-right font-mono text-mono-md font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-on-surface">{spq}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-bold text-brand-navy">
                        <div className="inline-flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min={1}
                            max={Math.ceil(line.availableQty / spq)}
                            value={numPckgs}
                            onChange={(e) => {
                              const boxes = Math.max(1, Number(e.target.value) || 1);
                              const computedQty = Math.min(line.availableQty, boxes * spq);
                              onUpdateQty(line.balanceId, computedQty);
                            }}
                            className="w-20 rounded border border-outline-variant px-2 py-1 text-right font-mono text-mono-md font-bold text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold text-on-surface">{line.itemCode}</td>
                      <td className="px-3 py-2.5 font-mono text-text-grey">{line.customerItemCode ?? "—"}</td>
                      <td className="px-3 py-2.5 text-on-surface">{line.itemDescription}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-text-grey">
                        {line.spqMeter ? `${line.spqMeter}m` : "—"}
                      </td>
                      <td className="px-3 py-2.5 font-mono font-bold text-on-surface">{line.lotNumber}</td>
                      <td className="px-3 py-2.5 font-mono text-text-grey">
                        {line.manufactureDate ? new Date(line.manufactureDate).toLocaleDateString() : "—"}
                      </td>
                      <td className="px-3 py-2.5 font-body text-on-surface">{line.locationLabel}</td>
                      <td className="px-3 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => onRemoveLine(line.balanceId)}
                          className="inline-flex items-center justify-center p-1.5 rounded text-status-held hover:bg-status-held/10"
                          title="Remove line"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <form action={createAction} className="flex justify-end">
            <input type="hidden" name="request" value={payloadJson} />
            <button
              type="submit"
              disabled={!payloadJson}
              className="inline-flex h-12 items-center gap-2 rounded bg-brand-navy px-6 font-label text-body-md font-bold text-surface-white shadow-elevation-1 disabled:cursor-not-allowed disabled:opacity-45 hover:bg-brand-navy/90"
            >
              <PackageCheck size={20} />
              Generate Multi-Item Pick List ({draftLines.length} Lines)
              <ChevronRight size={18} />
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
