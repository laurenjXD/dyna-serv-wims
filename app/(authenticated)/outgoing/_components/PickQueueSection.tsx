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
          <div className="rounded-lg border border-dashed border-outline-variant bg-surface-white px-6 py-9 text-center shadow-elevation-1">
            <Icon className="mx-auto text-status-neutral" size={30} aria-hidden="true" />
            <p className="mt-3 font-body text-body-md text-text-grey">{emptyMessage}</p>
          </div>
        ) : (
          rows.map((row) => (
            <article
              key={row.id}
              className={`rounded-lg border bg-surface-white p-4 shadow-elevation-2 transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 ${
                isDispatch ? "border-status-available/30" : "border-outline-variant"
              }`}
            >
              <div className="grid items-center gap-4 md:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-lg ${
                    isDispatch
                      ? "bg-status-available/15 text-status-available"
                      : "bg-[#E4ECFF] text-brand-navy"
                  }`}
                >
                  <Icon size={24} aria-hidden="true" />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-mono-md font-bold text-on-surface">
                      {row.pickListNumber}
                    </p>
                    <span
                      className={`inline-flex rounded-full px-2 py-1 font-label text-label font-bold uppercase ${
                        isDispatch
                          ? "bg-status-available/15 text-status-available"
                          : "bg-status-pending text-on-surface"
                      }`}
                    >
                      {isDispatch ? "PICKED" : "ALLOCATED"}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-body text-body-md font-bold text-on-surface">
                    {row.customerPartyName ?? row.customerPartyId}
                  </p>
                  <p className="mt-1 font-body text-body-sm text-text-grey">
                    {FLOW_LABELS[row.flowType] ?? row.flowType} · Created {row.createdAt.toLocaleString()}
                  </p>
                </div>

                <div className="md:text-right">
                  <p className="font-label text-label font-bold uppercase text-text-grey">Next step</p>
                  <p className="mt-1 font-body text-body-md font-bold text-on-surface">
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
                    className={`inline-flex h-12 items-center justify-center gap-2 rounded px-4 font-label text-body-md font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy ${
                      isDispatch
                        ? "bg-brand-navy text-surface-white"
                        : "border border-brand-navy bg-surface-white text-brand-navy"
                    }`}
                  >
                    {isDispatch ? "Dispatch" : "Start Pick"}
                    <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                ) : (
                  <span className="font-label text-label text-text-grey">View only</span>
                )}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
