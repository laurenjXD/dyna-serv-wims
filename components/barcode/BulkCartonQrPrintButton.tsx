"use client";

import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { Printer, X } from "@/components/ui/icons";
import type { MigrationCartonQrLabel } from "@/lib/actions/data-migration";
import { scheduleThermalPrint } from "@/lib/barcode/thermal-print";

export function BulkCartonQrPrintButton({ labels }: { labels: MigrationCartonQrLabel[] }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    document.body.dataset.bulkCartonQrPrintMode = "true";
    return () => { delete document.body.dataset.bulkCartonQrPrintMode; };
  }, [open]);
  if (labels.length === 0) return null;
  const print = scheduleThermalPrint;
  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-brand-blue px-6 font-label text-label font-bold text-brand-blue hover:bg-brand-blue/10"><Printer size={18} /> Print carton QRs ({labels.length})</button>
    {open && <div role="dialog" aria-modal="true" aria-labelledby="migration-carton-qr-title" data-bulk-carton-qr-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/60 p-4 print:static print:block print:bg-white print:p-0">
      <style>{`@page{size:50mm 50mm;margin:0}@media print{html,body{width:50mm!important;min-width:50mm!important;margin:0!important;padding:0!important;background:#fff!important}body[data-bulk-carton-qr-print-mode] *{visibility:hidden!important}body[data-bulk-carton-qr-print-mode] [data-bulk-carton-qr-modal],body[data-bulk-carton-qr-print-mode] [data-bulk-carton-qr-modal] #migration-carton-qr-sheet,body[data-bulk-carton-qr-print-mode] [data-bulk-carton-qr-modal] #migration-carton-qr-sheet *{visibility:visible!important}body[data-bulk-carton-qr-print-mode] [data-bulk-carton-qr-modal]{display:block!important;position:absolute!important;left:50%!important;top:0!important;transform:translateX(-50%)!important;width:50mm!important;min-width:50mm!important;background:#fff!important}.migration-carton-qr-card{display:flex!important;width:50mm!important;height:50mm!important;box-sizing:border-box!important;margin:0!important;padding:2mm!important;border:0!important;border-radius:0!important;background:#fff!important;page-break-after:always!important;break-after:page!important;overflow:hidden!important;justify-content:center!important;gap:1mm!important}.migration-carton-qr-card:last-child{page-break-after:avoid!important;break-after:avoid!important}.migration-carton-qr-card svg{display:block!important;width:40mm!important;height:40mm!important;max-width:40mm!important;max-height:40mm!important;visibility:visible!important}}`}</style>
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl bg-surface-white p-6 shadow-elevation-2 print:block print:max-h-none print:w-[50mm] print:p-0 print:shadow-none">
        <div className="flex items-center justify-between border-b border-outline-variant pb-4 print:hidden"><div><h2 id="migration-carton-qr-title" className="font-heading text-title-lg font-bold text-on-surface">Migration Carton QR Labels</h2><p className="mt-1 font-body text-body-sm text-text-grey">{labels.length} unique carton labels linked to migrated inventory.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Close" className="grid size-11 place-items-center rounded border border-outline-variant"><X size={18} /></button></div>
        <div id="migration-carton-qr-sheet" className="grid grid-cols-2 gap-4 overflow-y-auto py-4 print:block print:overflow-visible print:py-0">{labels.map((label) => <div key={label.unitId} className="migration-carton-qr-card flex min-h-[210px] flex-col items-center justify-between rounded-xl border border-outline-variant/60 bg-surface-white p-3 text-center shadow-xs print:min-h-0"><div className="w-full border-b border-black pb-0.5 text-left font-mono text-[8px] font-black uppercase text-black"><div className="flex justify-between"><span>DYNA-SERV</span><span>CARTON</span></div><div className="truncate text-[9.5px]">{label.itemCode}</div></div><div className="bg-white p-1"><QRCode value={JSON.stringify({ type: "inventory_unit", unit_id: label.unitId, carton_id: label.cartonId })} size={115} level="M" fgColor="#000" bgColor="#fff" shapeRendering="crispEdges" style={{ height: "auto", maxWidth: "40mm", width: "100%" }} viewBox="0 0 256 256" /></div><div className="w-full border-t border-black pt-0.5 font-mono leading-tight text-black"><div className="truncate text-[10px] font-black">{label.cartonId}</div><div className="truncate text-[9px] font-bold">Lot: {label.lotNumber}</div></div></div>)}</div>
        <div className="flex gap-2 border-t border-outline-variant pt-4 print:hidden"><button type="button" onClick={print} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded bg-primary font-label text-label font-bold text-white"><Printer size={18} /> Print carton labels</button><button type="button" onClick={() => setOpen(false)} className="min-h-12 rounded border border-outline-variant px-5 font-label text-label font-bold text-on-surface">Close</button></div>
      </div>
    </div>}
  </>;
}
