"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveMigrationCartons, type MigrationPendingCartonLot } from "@/lib/actions/data-migration";

export function MigrationCartonResolutionPanel({ batchId, lots }: { batchId: string; lots: MigrationPendingCartonLot[] }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  if (lots.length === 0) return null;
  const submit = () => startTransition(async () => {
    const resolutions = lots.map((lot) => ({ lotId: lot.lotId, cartonCount: Number(values[lot.lotId]) })).filter((row) => Number.isInteger(row.cartonCount) && row.cartonCount > 0);
    const result = await resolveMigrationCartons(batchId, resolutions);
    if (result.ok) {
      setMessage(`${result.created} migration carton identities created.`);
      router.refresh();
    } else setMessage(result.error);
  });
  return <section className="mt-8 rounded-2xl border border-warning/30 bg-warning/5 p-6 text-left" aria-labelledby="pending-carton-title"><h2 id="pending-carton-title" className="font-heading text-title-md font-bold text-on-surface">Resolve migrated carton counts</h2><p className="mt-1 font-body text-body-sm text-text-grey">These lots have a lot QR, but no confirmed physical carton count yet.</p><div className="mt-4 space-y-3">{lots.map((lot) => <label key={lot.lotId} className="grid gap-2 rounded-xl border border-outline-variant/40 bg-surface-white p-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center"><span><span className="block font-label text-label font-bold text-on-surface">{lot.lotNumber} · {lot.itemCode}</span><span className="font-body text-body-xs text-text-grey">Aggregate quantity: {lot.quantity.toLocaleString()}</span></span><input type="number" min="1" step="1" value={values[lot.lotId] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [lot.lotId]: event.target.value }))} placeholder="Cartons" className="min-h-11 rounded-lg border border-outline-variant px-3 font-mono text-body-sm" /></label>)}</div><div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={submit} disabled={isPending} className="min-h-11 rounded-full bg-brand-blue px-5 font-label text-label font-bold text-white disabled:opacity-50">{isPending ? "Creating cartons…" : "Create carton identities"}</button>{message && <p role="status" className="font-body text-body-sm text-text-grey">{message}</p>}</div></section>;
}
