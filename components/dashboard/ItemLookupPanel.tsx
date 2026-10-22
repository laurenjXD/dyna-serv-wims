"use client";

import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarDays, MapPin, Package, X } from "lucide-react";
import { getItemAuditDetailAction } from "@/app/(authenticated)/inventory/_actions";
import type { ItemDetail } from "@/lib/db/queries/items";
import type { ItemMovementRow, StockViewRow } from "@/lib/db/queries/inventory";

type LookupDetail = { ok: true; item: ItemDetail; movements: ItemMovementRow[]; stockRows: StockViewRow[] };

export function ItemLookupPanel({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<LookupDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setDetail(null);
    setError(null);
    getItemAuditDetailAction(itemId)
      .then((result) => {
        if (!active) return;
        if (result.ok) setDetail(result);
        else setError(result.error);
      })
      .catch(() => active && setError("The item details could not be loaded. Try scanning again."));
    return () => { active = false; };
  }, [itemId]);

  const item = detail?.item;
  const stockRows = detail?.stockRows ?? [];
  const totalAvailable = stockRows.reduce((sum, row) => sum + Math.max(0, row.qtyRemaining - row.qtyCommitted), 0);
  const totalAvailableBoxes = item ? totalAvailable / Math.max(1, Number(item.spq) || 1) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-brand-navy/35" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-lookup-title"
        className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col overflow-hidden bg-surface-white shadow-2xl sm:w-[min(92vw,34rem)]"
      >
        <header className="flex items-start justify-between border-b border-outline-variant/30 bg-surface-light-grey px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-surface-white"><Package size={21} aria-hidden="true" /></span>
            <div className="min-w-0">
              <p className="font-label text-label-xs font-bold uppercase tracking-wide text-text-grey">Item lookup</p>
              <h2 id="item-lookup-title" className="truncate font-heading text-headline-md font-semibold text-brand-navy">
                {item?.code ?? "Loading item…"}
              </h2>
              {item && <p className="truncate font-body text-body-sm text-on-surface">{item.name}</p>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close item details" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-text-grey hover:bg-surface-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-navy"><X size={21} aria-hidden="true" /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {error ? (
            <div role="alert" className="rounded-xl border border-status-held/30 bg-status-held/5 p-4 font-body text-body-md text-on-surface">
              <p className="font-heading font-semibold text-status-held">Item details unavailable</p>
              <p className="mt-1">{error}</p>
              <button type="button" onClick={onClose} className="mt-4 h-11 rounded-xl bg-brand-navy px-4 font-label text-label font-bold text-surface-white">Scan another item</button>
            </div>
          ) : !detail ? (
            <div className="flex min-h-40 items-center justify-center font-body text-body-md text-text-grey" role="status">Loading item details…</div>
          ) : (
            <div className="space-y-4">
              <section className="grid grid-cols-2 gap-3" aria-label="Item stock summary">
                <div className="rounded-xl border border-outline-variant/30 bg-surface-light-grey p-4"><p className="font-label text-label-xs font-bold uppercase text-text-grey">Available</p><p className="mt-1 font-heading text-headline-md font-semibold text-on-surface">{totalAvailable.toLocaleString()} <span className="font-body text-body-sm font-normal">{detail.item.uom}</span></p><p className="mt-1 font-body text-body-xs text-text-grey">{totalAvailableBoxes.toLocaleString()} boxes</p></div>
                <div className="rounded-xl border border-outline-variant/30 bg-surface-light-grey p-4"><p className="font-label text-label-xs font-bold uppercase text-text-grey">Locations</p><p className="mt-1 font-heading text-headline-md font-semibold text-on-surface">{new Set(stockRows.map((row) => row.locationId)).size}</p></div>
              </section>

              <section className="rounded-xl border border-outline-variant/30 bg-surface-white p-4" aria-labelledby="item-profile-heading">
                <h3 id="item-profile-heading" className="font-heading text-body-md font-semibold text-brand-navy">Item profile</h3>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 font-body text-body-sm">
                  <div><dt className="text-text-grey">Barcode</dt><dd className="mt-0.5 break-all font-mono text-on-surface">{detail.item.barcode}</dd></div>
                  <div><dt className="text-text-grey">UOM</dt><dd className="mt-0.5 text-on-surface">{detail.item.uom}</dd></div>
                  <div><dt className="text-text-grey">Inventory model</dt><dd className="mt-0.5 capitalize text-on-surface">{stockRows[0]?.flowType ?? "—"}</dd></div>
                  <div><dt className="text-text-grey">Status</dt><dd className="mt-0.5 text-on-surface">{detail.item.isActive ? "Active" : "Inactive"}</dd></div>
                </dl>
              </section>

              <section className="space-y-2" aria-labelledby="stock-by-location-heading">
                <h3 id="stock-by-location-heading" className="font-heading text-body-md font-semibold text-brand-navy">Stock by lot and location</h3>
                {stockRows.length === 0 ? <p className="rounded-xl border border-outline-variant/30 p-4 font-body text-body-sm text-text-grey">No available stock is currently recorded for this item.</p> : stockRows.map((row) => {
                  const available = Math.max(0, row.qtyRemaining - row.qtyCommitted);
                  return <div key={row.balanceId ?? `${row.lotId}-${row.locationId}`} className="rounded-xl border border-outline-variant/30 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-label text-label font-bold text-on-surface">Lot {row.lotNumber}</p><p className="mt-1 flex items-center gap-1 font-body text-body-sm text-text-grey"><MapPin size={14} aria-hidden="true" />{row.locationLabel}</p></div><div className="text-right"><p className="font-heading text-body-md font-semibold text-brand-navy">{available.toLocaleString()} {row.uom}</p><p className="font-body text-body-xs text-text-grey">{(available / Math.max(1, Number(row.spq) || 1)).toLocaleString()} boxes</p></div></div><div className="mt-3 flex flex-wrap gap-3 font-body text-body-xs text-text-grey">{row.expiryDate && <span className="inline-flex items-center gap-1"><CalendarDays size={13} aria-hidden="true" />Expires {row.expiryDate}</span>}<span>{row.lotStatus}</span></div></div>;
                })}
              </section>

              <section className="rounded-xl border border-outline-variant/30 bg-surface-light-grey p-4" aria-labelledby="movement-heading">
                <h3 id="movement-heading" className="font-heading text-body-md font-semibold text-brand-navy">Recent movement</h3>
                <div className="mt-3 space-y-2">{(detail.movements ?? []).slice(0, 5).map((movement) => <div key={movement.id} className="flex items-center justify-between gap-3 font-body text-body-sm"><span className="flex min-w-0 items-center gap-2 truncate text-on-surface">{movement.movementType === "receive" || movement.movementType === "putaway" ? <ArrowDownRight size={15} className="shrink-0 text-status-available" aria-hidden="true" /> : <ArrowUpRight size={15} className="shrink-0 text-status-held" aria-hidden="true" />}{movement.movementType}</span><span className="shrink-0 font-mono text-text-grey">{movement.qty}</span></div>)}{detail.movements?.length === 0 && <p className="font-body text-body-sm text-text-grey">No movement history available.</p>}</div>
              </section>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
