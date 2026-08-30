"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Clock,
  CheckCircle2,
} from "lucide-react";
import type { ApprovalRequestRow } from "@/lib/db/queries/approvals";

type ApprovalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled"
  | "consumed";

const STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
  expired: "EXPIRED",
  cancelled: "CANCELLED",
  consumed: "CONSUMED",
};

const STATUS_CLASSES: Record<ApprovalStatus, string> = {
  pending: "bg-status-pending/10 text-status-pending",
  approved: "bg-status-available/10 text-status-available",
  rejected: "bg-status-held/10 text-status-held",
  expired: "bg-status-held/10 text-status-held",
  cancelled: "bg-status-held/10 text-status-held",
  consumed: "bg-status-neutral/10 text-status-neutral",
};

const REASON_CATEGORY_LABELS: Record<string, string> = {
  customer_preference: "Customer Preference",
  lot_condition: "Lot Condition",
  partial_lot: "Partial Lot",
  other: "Other",
};

function getSnapshotItemLotRef(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== "object") return "—";
  const s = snapshot as Record<string, unknown>;
  const itemCode = typeof s.item_code === "string" ? s.item_code : null;
  const lotNumber = typeof s.lot_number === "string" ? s.lot_number : null;
  if (itemCode && lotNumber) return `${itemCode} / ${lotNumber}`;
  if (itemCode) return itemCode;
  if (lotNumber) return lotNumber;
  return "—";
}

function getReasonCategoryLabel(reason: string | undefined | null): string {
  if (!reason) return "—";
  return REASON_CATEGORY_LABELS[reason] ?? reason;
}

function relativeTime(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function expiryCountdown(expiryAt: Date, now: Date = new Date()): string {
  const diffMs = expiryAt.getTime() - now.getTime();
  if (diffMs <= 0) return "expired";
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return `expires in ${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  return `expires in ${diffHours}h`;
}

type SortField = "approvalType" | "requesterUserId" | "reason" | "createdAt" | "expiryAt" | "status";
type SortDirection = "asc" | "desc";

interface ApprovalsFilterableTableProps {
  rows: ApprovalRequestRow[];
  showDeleted?: boolean;
  archiveAction?: (formData: FormData) => void | Promise<void>;
}

export function ApprovalsFilterableTable({ rows, showDeleted = false, archiveAction }: ApprovalsFilterableTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReason, setSelectedReason] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  const now = new Date();

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const filteredAndSorted = useMemo(() => {
    return rows
      .filter((req) => {
        const effectiveStatus = req.status === "pending" && req.expiryAt.getTime() <= Date.now() ? "expired" : req.status;
        if (selectedStatus !== "all" && effectiveStatus !== selectedStatus) return false;
        if (selectedReason !== "all" && req.reason !== selectedReason) return false;
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const itemLot = getSnapshotItemLotRef(req.targetSnapshot);
        const corpus = `${req.approvalType} ${req.requesterUserId} ${itemLot} ${req.reason ?? ""} ${effectiveStatus}`.toLowerCase();
        return corpus.includes(q);
      })
      .sort((a, b) => {
        if (sortField === "createdAt") {
          return sortDir === "asc"
            ? a.createdAt.getTime() - b.createdAt.getTime()
            : b.createdAt.getTime() - a.createdAt.getTime();
        }
        if (sortField === "expiryAt") {
          return sortDir === "asc"
            ? a.expiryAt.getTime() - b.expiryAt.getTime()
            : b.expiryAt.getTime() - a.expiryAt.getTime();
        }
        const valA = ((a[sortField] as string) || "").toLowerCase();
        const valB = ((b[sortField] as string) || "").toLowerCase();
        return sortDir === "asc" ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
  }, [rows, searchQuery, selectedReason, selectedStatus, sortField, sortDir]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={14} className="opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp size={14} className="text-brand-navy font-bold" />
    ) : (
      <ArrowDown size={14} className="text-brand-navy font-bold" />
    );
  };

  return (
    <div className="space-y-4">
      {/* ── Search & Filter Toolbar ────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/40 bg-surface-white p-4 shadow-elevation-1 lg:flex-row lg:items-center lg:justify-between">
        {/* Omni Search */}
        <div className="relative flex-1 min-w-[280px]">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-grey"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by requester, item/lot, reason, status…"
            className="h-11 w-full rounded-xl border border-outline-variant/40 bg-surface-light-grey/40 pl-10 pr-10 font-body text-body-sm text-on-surface placeholder:text-text-grey focus:border-brand-navy focus:bg-surface-white focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-grey hover:text-on-surface"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3 py-1.5">
            <span className="font-label text-label-xs uppercase text-text-grey">Reason:</span>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              className="bg-transparent font-body text-body-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All Reasons</option>
              <option value="customer_preference">Customer Preference</option>
              <option value="lot_condition">Lot Condition</option>
              <option value="partial_lot">Partial Lot</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3 py-1.5">
            <span className="font-label text-label-xs uppercase text-text-grey">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent font-body text-body-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          {(searchQuery || selectedReason !== "all" || selectedStatus !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedReason("all");
                setSelectedStatus("all");
              }}
              className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 font-label text-label-xs font-bold text-status-held hover:bg-status-held/10"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Summary Count Strip ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-body-sm text-text-grey px-1">
        <span>Showing <strong className="text-on-surface">{filteredAndSorted.length}</strong> approval requests</span>
      </div>

      {/* ── Table Container ────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        {filteredAndSorted.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <CheckCircle2 size={40} className="text-status-available" aria-hidden="true" />
            <p className="font-body text-body-md text-text-grey">
              No approval requests match your search or filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("approvalType")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Type</span>
                      {renderSortIcon("approvalType")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("requesterUserId")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Requested By</span>
                      {renderSortIcon("requesterUserId")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Item / Lot
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("reason")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Reason</span>
                      {renderSortIcon("reason")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("createdAt")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Age</span>
                      {renderSortIcon("createdAt")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("expiryAt")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Expiry</span>
                      {renderSortIcon("expiryAt")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    <button
                      type="button"
                      onClick={() => handleSort("status")}
                      className="flex items-center gap-1 font-bold uppercase hover:text-brand-navy"
                    >
                      <span>Status</span>
                      {renderSortIcon("status")}
                    </button>
                  </th>
                  <th className="sr-only px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {filteredAndSorted.map((req) => {
                  const status = (req.status === "pending" && req.expiryAt.getTime() <= now.getTime() ? "expired" : req.status) as ApprovalStatus;
                  const itemLotRef = getSnapshotItemLotRef(req.targetSnapshot);
                  const reasonLabel = getReasonCategoryLabel(req.reason);
                  const age = relativeTime(req.createdAt, now);
                  const expiry = expiryCountdown(req.expiryAt, now);
                  const isExpired = req.expiryAt.getTime() <= now.getTime();

                  return (
                    <tr key={req.id} className="hover:bg-surface-light-grey/50">
                      <td className="px-4 py-3 font-body text-body-md text-on-surface font-semibold capitalize">
                        {req.approvalType.replace(/_/g, " ")}
                      </td>
                      <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                        {req.requesterUserId}
                      </td>
                      <td className="px-4 py-3 font-mono text-mono-md text-on-surface font-bold">
                        {itemLotRef}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full bg-status-neutral/10 px-2 py-0.5 font-label text-label text-status-neutral uppercase tracking-[0.05em]">
                          {reasonLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 font-body text-body-md text-text-grey">
                          <Clock size={16} className="shrink-0" aria-hidden="true" />
                          {age}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-body text-body-md">
                        <span className={isExpired ? "text-status-held font-bold" : "text-text-grey"}>
                          {expiry}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${
                            STATUS_CLASSES[status] ?? "bg-status-neutral/10 text-status-neutral"
                          }`}
                        >
                          {STATUS_LABELS[status] ?? req.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <Link href={`/approvals/${req.id}`} className="inline-flex h-11 items-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90">
                            {showDeleted ? "View" : "Review"}
                          </Link>
                          {!showDeleted && status === "expired" && archiveAction && (
                            <form action={archiveAction}>
                              <input type="hidden" name="requestId" value={req.id} />
                              <button type="submit" className="inline-flex h-11 items-center rounded border border-status-held/40 px-4 font-label text-label font-bold text-status-held hover:bg-status-held/10">
                                Delete
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
