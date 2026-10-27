import Link from "next/link";
import type { CycleCountLineRow, CycleCountSessionRow } from "@/lib/db/queries/cycle-count";

type FormAction = (formData: FormData) => Promise<void>;
type ActiveCount = {
  session: {
    id: string;
    countNumber: string;
    locationId: string;
    locationLabel: string | null;
    status: string;
    snapshotAt: Date;
  };
  lines: CycleCountLineRow[];
};

const STATUS_LABELS: Record<string, string> = {
  counting: "COUNTING",
  submitted: "AWAITING REVIEW",
  approved: "APPROVED",
  rejected: "RECOUNT REQUIRED",
  posted: "POSTED",
  cancelled: "CANCELLED",
};

export function StockCountTab({
  locations,
  sessions,
  active,
  createAction,
  recordAction,
  submitAction,
  approveAction,
  rejectAction,
  postAction,
}: {
  locations: Array<{ id: string; label: string | null; zone: string }>;
  sessions: CycleCountSessionRow[];
  active: ActiveCount | null;
  createAction: FormAction;
  recordAction: FormAction;
  submitAction: FormAction;
  approveAction: FormAction;
  rejectAction: FormAction;
  postAction: FormAction;
}) {
  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-2xl border border-outline-variant/40 bg-surface-white p-5 shadow-elevation-1 sm:p-6">
        <p className="font-label text-label font-semibold uppercase tracking-[0.08em] text-brand-navy">Physical inventory control</p>
        <h2 className="mt-2 font-heading text-title-md font-bold text-on-surface">Stock Count &amp; Reconciliation</h2>
        <p className="mt-2 max-w-3xl font-body text-body-sm text-text-grey">
          Compare the system snapshot with the physical warehouse count. Variances require review and are posted as audited reconciliation transactions; the system quantity is never edited directly.
        </p>

        <form action={createAction} className="mt-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label htmlFor="cycle-count-location" className="font-label text-label font-semibold text-text-grey">Location to count</label>
            <select id="cycle-count-location" name="locationId" required className="mt-2 h-12 w-full rounded-xl border border-outline-variant bg-surface-white px-3 font-body text-body-md text-on-surface">
              <option value="">Select an active location…</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.label ?? location.id} · Zone {location.zone}</option>)}
            </select>
          </div>
          <button type="submit" className="inline-flex min-h-12 items-center justify-center rounded-xl bg-brand-navy px-5 font-label text-label font-semibold text-surface-white">Start Count</button>
        </form>
      </section>

      {active && (
        <section className="rounded-2xl border border-brand-navy/20 bg-surface-white p-5 shadow-elevation-1 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-mono text-body-md font-bold text-brand-navy">{active.session.countNumber}</p>
              <p className="mt-1 font-body text-body-sm text-text-grey">{active.session.locationLabel ?? active.session.locationId} · Snapshot {new Date(active.session.snapshotAt).toLocaleString()}</p>
            </div>
            <span className="inline-flex w-fit rounded-full bg-status-pending/10 px-3 py-1 font-label text-label font-semibold text-status-pending">{STATUS_LABELS[active.session.status] ?? active.session.status}</span>
          </div>

          <div className="mt-5 overflow-x-auto rounded-xl border border-outline-variant/40">
            <table className="w-full min-w-[820px] text-left">
              <thead className="bg-surface-low font-label text-label font-semibold text-text-grey"><tr><th className="px-3 py-3">Item</th><th className="px-3 py-3">Lot</th><th className="px-3 py-3">System</th><th className="px-3 py-3">Physical count</th><th className="px-3 py-3">Variance</th><th className="px-3 py-3">Action</th></tr></thead>
              <tbody>
                {active.lines.map((line) => (
                  <tr key={line.id} className="border-t border-outline-variant/30 align-top">
                    <td className="px-3 py-3"><p className="font-mono text-body-sm font-semibold text-on-surface">{line.itemCode}</p><p className="mt-1 font-body text-xs text-text-grey">{line.itemName}</p></td>
                    <td className="px-3 py-3 font-mono text-body-sm text-on-surface">{line.lotNumber}</td>
                    <td className="px-3 py-3 font-mono text-body-sm font-semibold text-on-surface">{line.systemQty}</td>
                    <td className="px-3 py-3 font-mono text-body-sm text-on-surface">{line.countedQty ?? "—"}</td>
                    <td className={`px-3 py-3 font-mono text-body-sm font-semibold ${line.variance === null ? "text-text-grey" : line.variance === 0 ? "text-status-available" : "text-status-pending"}`}>{line.variance === null ? "—" : line.variance > 0 ? `+${line.variance}` : line.variance}</td>
                    <td className="px-3 py-3">
                      {active.session.status === "counting" || active.session.status === "rejected" ? (
                        <form action={recordAction} className="flex min-w-[240px] gap-2">
                          <input type="hidden" name="sessionId" value={active.session.id} /><input type="hidden" name="lineId" value={line.id} />
                          <input name="countedQty" type="number" min="0" required defaultValue={line.countedQty ?? ""} aria-label={`Physical count for ${line.itemCode}`} className="h-10 w-24 rounded-lg border border-outline-variant px-2 font-mono text-body-sm" />
                          <button type="submit" className="h-10 rounded-lg border border-brand-navy px-3 font-label text-xs font-semibold text-brand-navy">Save</button>
                        </form>
                      ) : <span className="font-label text-xs text-text-grey">Locked for review</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-3">
            {active.session.status === "counting" || active.session.status === "rejected" ? <form action={submitAction}><input type="hidden" name="sessionId" value={active.session.id} /><button type="submit" className="min-h-11 rounded-xl bg-brand-navy px-4 font-label text-label font-semibold text-surface-white">Submit for Review</button></form> : null}
            {active.session.status === "submitted" ? <><form action={rejectAction} className="flex gap-2"><input type="hidden" name="sessionId" value={active.session.id} /><input name="reason" required placeholder="Reason for recount" className="h-11 rounded-xl border border-outline-variant px-3 font-body text-sm" /><button type="submit" className="min-h-11 rounded-xl border border-status-held px-4 font-label text-label font-semibold text-status-held">Request Recount</button></form><form action={approveAction}><input type="hidden" name="sessionId" value={active.session.id} /><button type="submit" className="min-h-11 rounded-xl bg-brand-navy px-4 font-label text-label font-semibold text-surface-white">Approve Count</button></form></> : null}
            {active.session.status === "approved" ? <form action={postAction}><input type="hidden" name="sessionId" value={active.session.id} /><button type="submit" className="min-h-11 rounded-xl bg-status-available px-4 font-label text-label font-semibold text-surface-white">Post Reconciliation</button></form> : null}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex items-end justify-between"><div><h2 className="font-heading text-title-md font-bold text-on-surface">Count sessions</h2><p className="mt-1 font-body text-body-sm text-text-grey">Historical counts and variance totals.</p></div></div>
        <div className="space-y-3">
          {sessions.length === 0 ? <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-white px-6 py-10 text-center font-body text-body-sm text-text-grey">No count sessions yet.</div> : sessions.map((session) => <div key={session.id} className="flex flex-col gap-3 rounded-2xl border border-outline-variant/40 bg-surface-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-mono text-body-sm font-bold text-brand-navy">{session.countNumber}</p><p className="mt-1 font-body text-body-sm text-text-grey">{session.locationLabel ?? session.locationId} · {session.countedLineCount}/{session.lineCount} lines counted</p></div><div className="flex items-center gap-3"><span className="font-mono text-body-sm font-semibold text-on-surface">Variance {session.totalVariance > 0 ? `+${session.totalVariance}` : session.totalVariance}</span><Link href={`/inventory?tab=stock-count&count=${session.id}`} className="font-label text-label font-semibold text-brand-navy">Open</Link></div></div>)}
        </div>
      </section>
    </div>
  );
}
