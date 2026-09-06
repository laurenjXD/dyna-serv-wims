import Link from "next/link";
import { ArrowRight, CheckCircle2, PackageCheck } from "lucide-react";
import type { PickListRow } from "@/lib/db/queries/withdrawals";

type QueueMode = "pick" | "dispatch";

const FLOW_LABELS: Record<string, string> = {
  vmi: "VMI",
  trading: "Trading",
  supplies: "Supplies",
};

export function PickQueueSection({
  mode,
  rows,
  canExecute,
}: {
  mode: QueueMode;
  rows: PickListRow[];
  canExecute: boolean;
}) {
  const isDispatch = mode === "dispatch";
  const title = isDispatch ? "To Dispatch" : "To Pick";
  const description = isDispatch
    ? "Picking is complete. Confirm the vehicle details and release these orders."
    : "Allocated orders waiting for pallet verification and physical picking.";
  const emptyMessage = isDispatch
    ? "Completed picks will appear here when they are ready for dispatch."
    : "Newly allocated pick lists will appear here.";
  const sectionId = `queue-${mode}-title`;
  const Icon = isDispatch ? CheckCircle2 : PackageCheck;

  return (
    <section aria-labelledby={sectionId}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
              isDispatch
                ? "bg-status-available/15 text-status-available"
                : "bg-[#E4ECFF] text-brand-navy"
            }`}
          >
            <Icon size={22} aria-hidden="true" />
          </span>
          <div>
            <h2 id={sectionId} className="font-heading text-headline-md font-bold text-on-surface">
              {title}
            </h2>
            <p className="mt-1 max-w-2xl font-body text-body-sm text-text-grey">{description}</p>
          </div>
        </div>
        <span
          className={`rounded-full px-3 py-1 font-label text-label font-bold ${
            isDispatch
              ? "bg-status-available/15 text-status-available"
              : "bg-[#DCE6FF] text-brand-navy"
          }`}
        >
          {rows.length} {isDispatch ? "ready" : "waiting"}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-surface-white px-6 py-12 text-center shadow-xs">
            <Icon className="mx-auto text-slate-400" size={32} aria-hidden="true" />
            <p className="mt-3 font-heading text-sm font-bold text-text-primary">{emptyMessage}</p>
          </div>
        ) : (
          rows.map((row) => (
            <article
              key={row.id}
              className="rounded-2xl border border-slate-200/80 bg-surface-white p-4 shadow-xs transition-all duration-150 hover:border-slate-300 hover:shadow-sm"
            >
              <div className="grid items-center gap-4 md:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                    isDispatch
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                      : "bg-blue-50 text-brand-navy border-blue-200/60"
                  }`}
                >
                  <Icon size={20} aria-hidden="true" />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-bold text-brand-navy">
                      {row.pickListNumber}
                    </p>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase ${
                        isDispatch
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {isDispatch ? "PICKED" : "ALLOCATED"}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-body text-xs font-semibold text-text-primary">
                    {row.customerPartyName ?? row.customerPartyId}
                  </p>
                  <p className="mt-0.5 font-body text-xs text-text-grey">
                    <span className="font-mono">{FLOW_LABELS[row.flowType] ?? row.flowType}</span> · Created {row.createdAt.toLocaleString()}
                  </p>
                </div>

                <div className="md:text-right">
                  <p className="font-label text-[10px] font-bold uppercase tracking-wider text-text-grey">Next step</p>
                  <p className="mt-0.5 font-body text-xs font-semibold text-text-primary">
                    {isDispatch ? "Confirm dispatch" : "Pick & verify"}
                  </p>
                </div>

                {canExecute ? (
                  <Link
                    href={
                      isDispatch
                        ? `/pick-lists/${row.id}/dispatch`
                        : `/pick-lists/${row.id}/pick`
                    }
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-navy px-4 font-label text-xs font-bold text-white shadow-2xs hover:bg-brand-navy/90 active:scale-98 transition-all"
                  >
                    <span>{isDispatch ? "Dispatch" : "Start Pick"}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                ) : (
                  <span className="font-label text-xs text-text-grey">View only</span>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
