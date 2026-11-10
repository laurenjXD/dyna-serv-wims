"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, ExternalLink, Search, ShieldCheck } from "@/components/ui/icons";
import type { RequesterFifoOverrideRow } from "@/lib/db/queries/approvals";

type SnapshotData = {
  item_code?: string;
  lot_number?: string;
  location_code?: string;
  requested_qty?: string | number;
  flow_type?: string;
};

function getSnapshotData(snapshot: unknown): SnapshotData {
  if (!snapshot || typeof snapshot !== "object") return {};
  return snapshot as SnapshotData;
}

function statusCopy(status: string) {
  return status === "approved"
    ? {
        label: "Approved",
        badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
        dot: "bg-emerald-500",
      }
    : {
        label: "Pending Approval",
        badge: "border-amber-200 bg-amber-50 text-amber-900",
        dot: "bg-amber-500",
      };
}

export function ApprovalPickQueue({ rows }: { rows: RequesterFifoOverrideRow[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (!rows.some((row) => row.status === "pending" && row.consumedAt === null)) return;

    const refreshTimer = window.setInterval(() => {
      router.refresh();
    }, 10_000);

    return () => window.clearInterval(refreshTimer);
  }, [router, rows]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => {
      const snapshot = getSnapshotData(row.targetSnapshot);
      return `${row.requestNumber} ${row.status} ${snapshot.item_code ?? ""} ${snapshot.lot_number ?? ""} ${snapshot.location_code ?? ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [rows, searchQuery]);

  if (rows.length === 0) return null;

  return (
    <section
      aria-labelledby="pick-list-approval-queue-heading"
      className="overflow-hidden rounded-2xl border border-outline-variant/40 bg-surface-white shadow-elevation-2"
    >
      <div className="border-b border-outline-variant/30 bg-gradient-to-r from-surface-white via-surface-white to-[#FFF9ED] px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
              <ShieldCheck size={22} className="stroke-[2.2]" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 id="pick-list-approval-queue-heading" className="font-heading text-headline-sm font-bold text-on-surface">
                  Pick List Approval Queue
                </h2>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-50 px-3 py-0.5 font-label text-label-xs font-bold uppercase tracking-wider text-amber-900">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  {rows.length} {rows.length === 1 ? "Request" : "Requests"}
                </span>
              </div>
              <p className="mt-0.5 font-body text-body-sm text-text-grey">
                Override requests stay here while a supervisor reviews them. The status updates when the decision is recorded.
              </p>
            </div>
          </div>

          {rows.length > 1 && (
            <div className="relative w-full sm:w-auto sm:min-w-[220px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-grey/60" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Filter approval requests..."
                aria-label="Filter pick list approval requests"
                className="h-10 w-full rounded-xl border border-outline-variant/60 bg-surface-white pl-9 pr-3 font-body text-body-sm text-on-surface placeholder:text-text-grey/60 focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
              />
            </div>
          )}
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <div className="px-6 py-8 text-center font-body text-body-sm text-text-grey">
          No approval requests match “{searchQuery}”.
        </div>
      ) : (
        <div className="divide-y divide-outline-variant/20">
          {filteredRows.map((row) => {
            const snapshot = getSnapshotData(row.targetSnapshot);
            const copy = statusCopy(row.status);
            const isApproved = row.status === "approved";

            return (
              <div key={row.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-mono-md font-bold text-brand-navy">{row.requestNumber}</span>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-label text-label-xs font-bold uppercase tracking-wider ${copy.badge}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${copy.dot}`} />
                      {copy.label}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-body text-body-sm font-semibold text-on-surface">
                    {snapshot.item_code ?? "Item not recorded"} · Lot {snapshot.lot_number ?? "—"}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-body-xs text-text-grey">
                    <span>Location: {snapshot.location_code ?? "—"}</span>
                    <span>Quantity: {snapshot.requested_qty ?? "—"}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(row.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 font-body text-body-xs text-text-grey">
                    {isApproved
                      ? "Approval recorded. This request remains visible until it is used to create the locked pick list."
                      : "Waiting for a supervisor decision. No stock has been reserved yet."}
                  </p>
                </div>

                <Link
                  href={`/approvals/${row.id}`}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-outline-variant/60 bg-surface-white px-4 font-label text-label-sm font-bold text-on-surface hover:bg-surface-light-grey focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
                >
                  {isApproved ? <CheckCircle2 size={15} className="text-emerald-600" /> : <ExternalLink size={15} />}
                  <span>View Approval</span>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
