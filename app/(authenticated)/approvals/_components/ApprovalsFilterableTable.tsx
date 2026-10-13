"use client";

import React, { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  XCircle,
  Archive,
  Plus,
  ArrowRight,
  ShieldAlert,
  Layers,
  Sparkles,
  Info,
  ChevronRight,
  Trash2,
} from "lucide-react";
import type { ApprovalRequestRow } from "@/lib/db/queries/approvals";
import type { StockViewRow } from "@/lib/db/queries/inventory";

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
  pending: "bg-status-pending/10 text-status-pending border-status-pending/30",
  approved: "bg-status-available/10 text-status-available border-status-available/30",
  rejected: "bg-status-held/10 text-status-held border-status-held/30",
  expired: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-status-held/10 text-status-held border-status-held/30",
  consumed: "bg-status-neutral/10 text-status-neutral border-status-neutral/30",
};

const REASON_CATEGORIES = [
  { value: "customer_preference", label: "Customer Preference" },
  { value: "lot_condition", label: "Lot Condition" },
  { value: "partial_lot", label: "Partial Lot" },
  { value: "other", label: "Other" },
] as const;

const REASON_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  REASON_CATEGORIES.map((c) => [c.value, c.label]),
);

interface SnapshotData {
  item_id?: string;
  item_code?: string;
  lot_id?: string;
  lot_number?: string;
  location_id?: string;
  location_code?: string;
  requested_qty?: string | number;
  available_qty_at_request?: string | number;
  flow_type?: string;
  actor_user_id?: string;
  reason?: string;
  reason_note?: string;
  allocation_version?: number;
  requested_at?: string;
}

function getSnapshotData(snapshot: unknown): SnapshotData {
  if (!snapshot || typeof snapshot !== "object") return {};
  return snapshot as SnapshotData;
}

function getSnapshotItemLotRef(snapshot: unknown): string {
  const s = getSnapshotData(snapshot);
  if (s.item_code && s.lot_number) return `${s.item_code} / ${s.lot_number}`;
  if (s.item_code) return s.item_code;
  if (s.lot_number) return s.lot_number;
  return "—";
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

function expiryCountdown(expiryAt: Date, now: Date = new Date()): { label: string; isExpired: boolean; isUrgent: boolean } {
  const diffMs = expiryAt.getTime() - now.getTime();
  if (diffMs <= 0) return { label: "Expired", isExpired: true, isUrgent: false };
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 60) return { label: `${diffMins}m left`, isExpired: false, isUrgent: true };
  const diffHours = Math.floor(diffMins / 60);
  return { label: `${diffHours}h left`, isExpired: false, isUrgent: diffHours <= 2 };
}

type SortField =
  | "requestNumber"
  | "approvalType"
  | "requesterUserId"
  | "reason"
  | "createdAt"
  | "expiryAt"
  | "status";
type SortDirection = "asc" | "desc";

interface ApprovalsFilterableTableProps {
  rows: ApprovalRequestRow[];
  showDeleted?: boolean;
  currentUserId: string;
  stockRows?: StockViewRow[];
  metrics: {
    pending: number;
    expired: number;
    archived: number;
    approved: number;
  };
  initialSearch?: string;
  archiveAction: (formData: FormData) => void | Promise<void>;
  archiveAllAction: () => void | Promise<void>;
  approveAction: (formData: FormData) => void | Promise<void>;
  rejectAction: (formData: FormData) => void | Promise<void>;
  createOverrideAction: (formData: FormData) => void | Promise<void>;
}

export function ApprovalsFilterableTable({
  rows,
  showDeleted = false,
  currentUserId,
  stockRows = [],
  metrics,
  initialSearch = "",
  archiveAction,
  archiveAllAction,
  approveAction,
  rejectAction,
  createOverrideAction,
}: ApprovalsFilterableTableProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearch);
  const [selectedReason, setSelectedReason] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [activeFilterTab, setActiveFilterTab] = useState<"all" | "pending" | "expired" | "self">("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  // Modal / Drawer states
  const [reviewModalRequest, setReviewModalRequest] = useState<ApprovalRequestRow | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isPendingTransition, startTransition] = useTransition();

  // Create Request form states
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [selectedLotId, setSelectedLotId] = useState<string>("");
  const [requestedQty, setRequestedQty] = useState<string>("1");
  const [reasonCategory, setReasonCategory] = useState<string>("customer_preference");
  const [reasonNote, setReasonNote] = useState<string>("");
  const [rejectCategory, setRejectCategory] = useState<string>("other");
  const [rejectNote, setRejectNote] = useState<string>("");
  const [approveNote, setApproveNote] = useState<string>("");

  const now = new Date();

  // Unique available items from stockRows for dropdown
  const uniqueItems = useMemo(() => {
    const map = new Map<string, { id: string; code: string; name: string }>();
    for (const r of stockRows) {
      if (!map.has(r.itemId)) {
        map.set(r.itemId, { id: r.itemId, code: r.itemCode, name: r.itemName });
      }
    }
    return Array.from(map.values());
  }, [stockRows]);

  // Available lots for chosen item
  const availableLotsForItem = useMemo(() => {
    if (!selectedItemId) return [];
    return stockRows.filter((r) => r.itemId === selectedItemId);
  }, [stockRows, selectedItemId]);

  const selectedLotRow = useMemo(() => {
    return availableLotsForItem.find((r) => r.lotId === selectedLotId);
  }, [availableLotsForItem, selectedLotId]);

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
        const isExp = req.expiryAt.getTime() <= Date.now();
        const effectiveStatus = req.status === "pending" && isExp ? "expired" : req.status;

        // Quick filter tabs
        if (activeFilterTab === "pending" && (effectiveStatus !== "pending" || isExp)) return false;
        if (activeFilterTab === "expired" && effectiveStatus !== "expired") return false;
        if (activeFilterTab === "self" && req.requesterUserId !== currentUserId) return false;

        // Dropdowns
        if (selectedStatus !== "all" && effectiveStatus !== selectedStatus) return false;
        if (selectedReason !== "all" && req.reason !== selectedReason) return false;

        // Search query
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase().trim();
        const itemLot = getSnapshotItemLotRef(req.targetSnapshot);
        const snapshot = getSnapshotData(req.targetSnapshot);
        const corpus = `${req.requestNumber} ${req.approvalType} ${req.requesterDisplayName ?? ""} ${req.requesterUserId} ${itemLot} ${snapshot.location_code ?? ""} ${req.reason ?? ""} ${effectiveStatus}`.toLowerCase();
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
  }, [rows, searchQuery, selectedReason, selectedStatus, activeFilterTab, sortField, sortDir, currentUserId]);

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown size={13} className="opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp size={13} className="text-brand-navy font-bold" />
    ) : (
      <ArrowDown size={13} className="text-brand-navy font-bold" />
    );
  };

  return (
    <div className="space-y-5">
      {/* ── Metric Summary Cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Pending Card */}
        <button
          type="button"
          onClick={() => {
            setActiveFilterTab("pending");
            setSelectedStatus("all");
          }}
          className={`flex flex-col text-left rounded-2xl border p-4 transition-all shadow-2xs hover:shadow-xs ${
            activeFilterTab === "pending"
              ? "border-amber-400 bg-amber-50/50 ring-2 ring-amber-400/30"
              : "border-border bg-surface hover:border-amber-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
              Pending Review
            </span>
            <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-title-xl font-black text-on-surface">
              {metrics.pending}
            </span>
            <span className="font-body text-xs text-amber-700 font-semibold">Active Queue</span>
          </div>
        </button>

        {/* Approved Card */}
        <div className="flex flex-col rounded-2xl border border-border bg-surface p-4 shadow-2xs">
          <span className="font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
            Approved
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-title-xl font-black text-emerald-700">
              {metrics.approved}
            </span>
            <span className="font-body text-xs text-emerald-600 font-semibold">Authorized</span>
          </div>
        </div>

        {/* Expired / Stale Card */}
        <button
          type="button"
          onClick={() => {
            setActiveFilterTab("expired");
            setSelectedStatus("all");
          }}
          className={`flex flex-col text-left rounded-2xl border p-4 transition-all shadow-2xs hover:shadow-xs ${
            activeFilterTab === "expired"
              ? "border-rose-400 bg-rose-50/50 ring-2 ring-rose-400/30"
              : "border-border bg-surface hover:border-rose-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
              Expired Requests
            </span>
            {metrics.expired > 0 && (
              <span className="flex h-2 w-2 rounded-full bg-rose-500" />
            )}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-title-xl font-black text-rose-700">
              {metrics.expired}
            </span>
            <span className="font-body text-xs text-rose-600 font-semibold">Needs Archive</span>
          </div>
        </button>

        {/* Archived Audit Card */}
        <Link
          href="/approvals?tab=deleted"
          className={`flex flex-col rounded-2xl border p-4 transition-all shadow-2xs hover:shadow-xs ${
            showDeleted
              ? "border-brand-navy bg-brand-navy/5 ring-2 ring-brand-navy/30"
              : "border-border bg-surface hover:border-brand-navy/40"
          }`}
        >
          <span className="font-label text-label-xs font-bold uppercase tracking-wider text-text-grey">
            Archived Logs
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-heading text-title-xl font-black text-on-surface">
              {metrics.archived}
            </span>
            <span className="font-body text-xs text-text-grey font-medium">Permanent Tier</span>
          </div>
        </Link>
      </div>

      {/* ── Toolbar & Actions Bar ──────────────────────────────────────── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-2xs lg:flex-row lg:items-center lg:justify-between">
        {/* Left: Omni Search */}
        <div className="relative flex-1 min-w-[260px]">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-grey"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Request #, Item, Lot, Requester, Reason…"
            className="h-10 w-full rounded-xl border border-border bg-surface-light-grey/40 pl-9 pr-9 font-body text-body-sm text-on-surface placeholder:text-text-grey focus:border-brand-navy focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-grey hover:text-on-surface"
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Center/Right: Dropdowns & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 shadow-2xs">
            <span className="font-label text-label-xs font-bold uppercase text-text-grey">Reason:</span>
            <select
              value={selectedReason}
              onChange={(e) => setSelectedReason(e.target.value)}
              className="bg-transparent font-body text-body-xs font-semibold text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All Reasons</option>
              <option value="customer_preference">Customer Preference</option>
              <option value="lot_condition">Lot Condition</option>
              <option value="partial_lot">Partial Lot</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 shadow-2xs">
            <span className="font-label text-label-xs font-bold uppercase text-text-grey">Status:</span>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-transparent font-body text-body-xs font-semibold text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
            </select>
          </div>

          {/* Bulk Archive Expired Button */}
          {!showDeleted && metrics.expired > 0 && (
            <form action={archiveAllAction}>
              <button
                type="submit"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 font-label text-label-xs font-bold text-rose-700 hover:bg-rose-100 active:scale-95 transition-all shadow-2xs"
                title="Move all expired requests to archived records"
              >
                <Archive size={14} />
                <span>Archive All Expired ({metrics.expired})</span>
              </button>
            </form>
          )}

          {/* + Request FIFO Override Modal Trigger */}
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-navy px-4 font-label text-label-xs font-bold text-surface-white hover:bg-brand-royal-blue active:scale-95 shadow-xs transition-all"
          >
            <Plus size={15} />
            <span>Request Override</span>
          </button>
        </div>
      </div>

      {/* ── Quick Filter Tabs Strip ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveFilterTab("all")}
            className={`rounded-lg px-3 py-1 font-label text-label-xs font-bold transition-colors ${
              activeFilterTab === "all"
                ? "bg-brand-navy text-white shadow-2xs"
                : "bg-surface text-text-grey hover:text-on-surface border border-border"
            }`}
          >
            All Requests ({rows.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveFilterTab("pending")}
            className={`rounded-lg px-3 py-1 font-label text-label-xs font-bold transition-colors ${
              activeFilterTab === "pending"
                ? "bg-amber-600 text-white shadow-2xs"
                : "bg-surface text-text-grey hover:text-on-surface border border-border"
            }`}
          >
            Pending Review
          </button>
          <button
            type="button"
            onClick={() => setActiveFilterTab("expired")}
            className={`rounded-lg px-3 py-1 font-label text-label-xs font-bold transition-colors ${
              activeFilterTab === "expired"
                ? "bg-rose-600 text-white shadow-2xs"
                : "bg-surface text-text-grey hover:text-on-surface border border-border"
            }`}
          >
            Expired / Stale
          </button>
          <button
            type="button"
            onClick={() => setActiveFilterTab("self")}
            className={`rounded-lg px-3 py-1 font-label text-label-xs font-bold transition-colors ${
              activeFilterTab === "self"
                ? "bg-brand-royal-blue text-white shadow-2xs"
                : "bg-surface text-text-grey hover:text-on-surface border border-border"
            }`}
          >
            Requested By Me
          </button>
        </div>

        <span className="font-body text-body-xs text-text-grey">
          Showing <strong className="text-on-surface">{filteredAndSorted.length}</strong> entries
        </span>
      </div>

      {/* ── Table Container ────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-2xs">
        {filteredAndSorted.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 size={28} />
            </div>
            <div>
              <h3 className="font-heading text-title-md font-bold text-on-surface">
                No Approval Requests Found
              </h3>
              <p className="mt-1 font-body text-body-xs text-text-grey max-w-sm mx-auto">
                There are no approval queue requests matching your current filter criteria.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setSelectedReason("all");
                setSelectedStatus("all");
                setActiveFilterTab("all");
              }}
              className="mt-2 inline-flex h-9 items-center rounded-lg border border-border bg-surface px-4 font-label text-label-xs font-bold text-on-surface hover:bg-surface-light-grey"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-border bg-surface-light-grey/60 text-[11px] font-label font-bold uppercase tracking-wider text-text-grey">
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort("requestNumber")}
                      className="flex items-center gap-1 hover:text-on-surface"
                    >
                      <span>Request ID</span>
                      {renderSortIcon("requestNumber")}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort("requesterUserId")}
                      className="flex items-center gap-1 hover:text-on-surface"
                    >
                      <span>Requester</span>
                      {renderSortIcon("requesterUserId")}
                    </button>
                  </th>
                  <th className="px-4 py-3">Item &amp; Target Lot</th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort("reason")}
                      className="flex items-center gap-1 hover:text-on-surface"
                    >
                      <span>Deviation Reason</span>
                      {renderSortIcon("reason")}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort("createdAt")}
                      className="flex items-center gap-1 hover:text-on-surface"
                    >
                      <span>Age</span>
                      {renderSortIcon("createdAt")}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort("expiryAt")}
                      className="flex items-center gap-1 hover:text-on-surface"
                    >
                      <span>Expiry Countdown</span>
                      {renderSortIcon("expiryAt")}
                    </button>
                  </th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleSort("status")}
                      className="flex items-center gap-1 hover:text-on-surface"
                    >
                      <span>Status</span>
                      {renderSortIcon("status")}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-body text-body-sm">
                {filteredAndSorted.map((req) => {
                  const nowTime = now.getTime();
                  const isExp = req.expiryAt.getTime() <= nowTime;
                  const effectiveStatus = (req.status === "pending" && isExp ? "expired" : req.status) as ApprovalStatus;
                  const itemLotRef = getSnapshotItemLotRef(req.targetSnapshot);
                  const snapshot = getSnapshotData(req.targetSnapshot);
                  const reasonLabel = REASON_CATEGORY_LABELS[req.reason] ?? req.reason;
                  const age = relativeTime(req.createdAt, now);
                  const expiryInfo = expiryCountdown(req.expiryAt, now);
                  const isSelf = req.requesterUserId === currentUserId;

                  return (
                    <tr
                      key={req.id}
                      className="group hover:bg-surface-light-grey/40 transition-colors"
                    >
                      {/* Request ID */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-bold text-brand-navy">
                            {req.requestNumber}
                          </span>
                          <span className="text-[11px] text-text-grey capitalize">
                            {req.approvalType.replace(/_/g, " ")}
                          </span>
                        </div>
                      </td>

                      {/* Requester */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-navy/10 text-brand-navy font-bold text-xs">
                            {(req.requesterDisplayName || req.requesterUserId).substring(0, 2).toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-on-surface text-xs" title={req.requesterUserId}>
                              {req.requesterDisplayName ?? "Operator"}
                            </span>
                            {isSelf && (
                              <span className="text-[10px] font-bold text-brand-royal-blue uppercase">
                                You
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Item & Target Lot */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs font-bold text-on-surface">
                            {itemLotRef}
                          </span>
                          {snapshot.location_code && (
                            <span className="text-[11px] text-text-grey">
                              Loc: <strong className="text-on-surface font-mono">{snapshot.location_code}</strong> (Qty: {snapshot.requested_qty ?? "—"})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Reason */}
                      <td className="px-4 py-3.5 max-w-[200px]">
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex w-fit items-center rounded-md bg-surface-light-grey px-2 py-0.5 font-label text-[10px] font-bold text-on-surface uppercase tracking-wider">
                            {reasonLabel}
                          </span>
                          {snapshot.reason_note && (
                            <span className="truncate text-xs text-text-grey" title={snapshot.reason_note}>
                              {snapshot.reason_note}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Age */}
                      <td className="px-4 py-3.5 text-text-grey text-xs">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={13} className="shrink-0" />
                          {age}
                        </span>
                      </td>

                      {/* Expiry Countdown */}
                      <td className="px-4 py-3.5 text-xs">
                        {expiryInfo.isExpired ? (
                          <span className="font-bold text-rose-600">Expired</span>
                        ) : expiryInfo.isUrgent ? (
                          <span className="font-bold text-amber-600 animate-pulse">
                            {expiryInfo.label}
                          </span>
                        ) : (
                          <span className="text-text-grey font-medium">{expiryInfo.label}</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-label font-bold uppercase tracking-wider ${
                            STATUS_CLASSES[effectiveStatus] ?? "bg-surface-light-grey text-text-grey"
                          }`}
                        >
                          {STATUS_LABELS[effectiveStatus] ?? effectiveStatus}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setReviewModalRequest(req)}
                            className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-navy px-3 font-label text-xs font-bold text-white hover:bg-brand-royal-blue active:scale-95 transition-all shadow-2xs"
                          >
                            <span>{showDeleted ? "View" : "Review"}</span>
                            <ChevronRight size={13} />
                          </button>

                          {!showDeleted && effectiveStatus === "expired" && (
                            <form action={archiveAction}>
                              <input type="hidden" name="requestId" value={req.id} />
                              <button
                                type="submit"
                                className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 font-label text-xs font-bold text-rose-700 hover:bg-rose-100 active:scale-95 transition-all"
                                title="Archive expired request"
                              >
                                <Archive size={13} />
                                <span>Archive</span>
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

      {/* ── Modal 1: Interactive Review & Decision Modal ───────────────── */}
      {reviewModalRequest && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setReviewModalRequest(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface shadow-elevation-3 overflow-hidden animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border bg-surface-light-grey/40 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy text-white shadow-xs">
                  <FileCheck size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-heading text-title-md font-bold text-on-surface">
                      {reviewModalRequest.requestNumber}
                    </h2>
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-label font-bold uppercase ${
                        STATUS_CLASSES[
                          reviewModalRequest.status === "pending" && reviewModalRequest.expiryAt.getTime() <= now.getTime()
                            ? "expired"
                            : (reviewModalRequest.status as ApprovalStatus)
                        ]
                      }`}
                    >
                      {reviewModalRequest.status === "pending" && reviewModalRequest.expiryAt.getTime() <= now.getTime()
                        ? "EXPIRED"
                        : reviewModalRequest.status.toUpperCase()}
                    </span>
                  </div>
                  <p className="font-body text-body-xs text-text-grey">
                    FIFO Allocation Override Evaluation
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setReviewModalRequest(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-grey hover:bg-surface-light-grey hover:text-on-surface"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Requester & Timing Bar */}
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-surface-light-grey/40 p-3.5 text-xs">
                <div>
                  <span className="text-text-grey block font-label uppercase font-bold text-[10px]">
                    Submitted By:
                  </span>
                  <span className="font-medium text-on-surface font-heading">
                    {reviewModalRequest.requesterDisplayName ?? reviewModalRequest.requesterUserId}
                  </span>
                  <span className="text-text-grey block text-[11px]">
                    {reviewModalRequest.createdAt.toLocaleString()} ({relativeTime(reviewModalRequest.createdAt, now)})
                  </span>
                </div>
                <div>
                  <span className="text-text-grey block font-label uppercase font-bold text-[10px]">
                    Expiry Window:
                  </span>
                  <span className="font-medium text-on-surface font-heading">
                    {reviewModalRequest.expiryAt.toLocaleString()}
                  </span>
                  <span
                    className={`block text-[11px] font-bold ${
                      reviewModalRequest.expiryAt.getTime() <= now.getTime()
                        ? "text-rose-600"
                        : "text-amber-600"
                    }`}
                  >
                    {expiryCountdown(reviewModalRequest.expiryAt, now).label}
                  </span>
                </div>
              </div>

              {/* Side-by-side FIFO comparison */}
              <div className="space-y-2">
                <h3 className="font-heading text-body-md font-bold text-on-surface flex items-center gap-1.5">
                  <Layers size={16} className="text-brand-navy" />
                  <span>Target Override Details</span>
                </h3>

                {(() => {
                  const s = getSnapshotData(reviewModalRequest.targetSnapshot);
                  return (
                    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-text-grey block text-[10px] uppercase font-bold">Item Code</span>
                          <span className="font-mono font-bold text-on-surface">{s.item_code ?? "—"}</span>
                        </div>
                        <div>
                          <span className="text-text-grey block text-[10px] uppercase font-bold">Requested Lot</span>
                          <span className="font-mono font-bold text-brand-navy">{s.lot_number ?? "—"}</span>
                        </div>
                        <div>
                          <span className="text-text-grey block text-[10px] uppercase font-bold">Location</span>
                          <span className="font-mono font-bold text-on-surface">{s.location_code ?? "—"}</span>
                        </div>
                        <div>
                          <span className="text-text-grey block text-[10px] uppercase font-bold">Requested Qty</span>
                          <span className="font-mono font-bold text-on-surface">{s.requested_qty ?? "—"}</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border">
                        <span className="text-text-grey block text-[10px] uppercase font-bold mb-1">Business Justification</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-brand-navy/10 px-2 py-0.5 text-xs font-bold text-brand-navy">
                            {REASON_CATEGORY_LABELS[reviewModalRequest.reason] ?? reviewModalRequest.reason}
                          </span>
                          {s.reason_note && (
                            <span className="text-xs text-on-surface">{s.reason_note}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Self-approval note if applicable */}
              {reviewModalRequest.requesterUserId === currentUserId && reviewModalRequest.status === "pending" && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
                  <ShieldAlert size={16} className="text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Compliance Rule Active</strong>
                    <span>
                      You submitted this request. To prevent conflict of interest, another supervisor must record the approval decision.
                    </span>
                  </div>
                </div>
              )}

              {/* Decision Section (if pending and not expired) */}
              {reviewModalRequest.status === "pending" && reviewModalRequest.expiryAt.getTime() > now.getTime() && (
                <div className="space-y-4 pt-2 border-t border-border">
                  <h3 className="font-heading text-body-md font-bold text-on-surface">
                    Record Supervisor Decision
                  </h3>

                  {/* Approve Form */}
                  <form action={approveAction} className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                    <input type="hidden" name="requestId" value={reviewModalRequest.id} />
                    <div className="flex items-center justify-between">
                      <span className="font-label text-xs font-bold text-emerald-900 uppercase">
                        Authorize One-Time FIFO Override
                      </span>
                      <span className="text-[11px] text-emerald-700">Authoritative commitment authorization</span>
                    </div>
                    <input
                      type="text"
                      name="reason"
                      value={approveNote}
                      onChange={(e) => setApproveNote(e.target.value)}
                      placeholder="Optional approval note or condition (e.g. Approved per QA inspection)..."
                      className="h-9 w-full rounded-lg border border-emerald-200 bg-white px-3 font-body text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="submit"
                      disabled={reviewModalRequest.requesterUserId === currentUserId}
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 font-label text-xs font-bold text-white hover:bg-emerald-800 active:scale-95 transition-all disabled:opacity-40"
                    >
                      <CheckCircle2 size={16} />
                      <span>Authorize &amp; Approve Override</span>
                    </button>
                  </form>

                  {/* Reject Form */}
                  <form action={rejectAction} className="rounded-xl border border-rose-200 bg-rose-50/40 p-4 space-y-3">
                    <input type="hidden" name="requestId" value={reviewModalRequest.id} />
                    <span className="font-label text-xs font-bold text-rose-900 uppercase block">
                      Disallow &amp; Reject Request
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        name="reason_category"
                        value={rejectCategory}
                        onChange={(e) => setRejectCategory(e.target.value)}
                        className="h-9 rounded-lg border border-rose-200 bg-white px-2.5 font-body text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-rose-500"
                      >
                        {REASON_CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        name="reason_note"
                        value={rejectNote}
                        onChange={(e) => setRejectNote(e.target.value)}
                        placeholder="Rejection explanation..."
                        className="h-9 rounded-lg border border-rose-200 bg-white px-3 font-body text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                    <button
                      type="submit"
                      className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-5 font-label text-xs font-bold text-rose-700 hover:bg-rose-100 active:scale-95 transition-all"
                    >
                      <XCircle size={16} />
                      <span>Reject Request</span>
                    </button>
                  </form>
                </div>
              )}

              {/* Expired Archive option */}
              {reviewModalRequest.expiryAt.getTime() <= now.getTime() && !showDeleted && (
                <form action={archiveAction} className="rounded-xl border border-border bg-surface-light-grey/60 p-4 space-y-3">
                  <input type="hidden" name="requestId" value={reviewModalRequest.id} />
                  <span className="font-label text-xs font-bold text-on-surface block uppercase">
                    Expired Request Maintenance
                  </span>
                  <p className="text-xs text-text-grey">
                    This request has passed its 30-minute validity window and can be moved to the permanent archive queue.
                  </p>
                  <button
                    type="submit"
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-status-held px-5 font-label text-xs font-bold text-white hover:opacity-90 active:scale-95 transition-all"
                  >
                    <Archive size={15} />
                    <span>Archive Expired Request</span>
                  </button>
                </form>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-border bg-surface-light-grey/40 px-6 py-3.5">
              <Link
                href={`/approvals/${reviewModalRequest.id}`}
                className="inline-flex items-center gap-1 text-xs font-label font-bold text-brand-navy hover:underline"
              >
                <span>Open Full Page View</span>
                <ArrowRight size={13} />
              </Link>
              <button
                type="button"
                onClick={() => setReviewModalRequest(null)}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-border bg-surface px-4 font-label text-xs font-bold text-on-surface hover:bg-surface-light-grey"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 2: Submit New FIFO Override Request ───────────────────── */}
      {isCreateModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl border border-border bg-surface shadow-elevation-3 overflow-hidden animate-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border bg-surface-light-grey/40 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy text-white shadow-xs">
                  <Plus size={20} />
                </div>
                <div>
                  <h2 className="font-heading text-title-md font-bold text-on-surface">
                    Request FIFO Allocation Override
                  </h2>
                  <p className="font-body text-body-xs text-text-grey">
                    Submit inventory deviation for supervisor approval
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-grey hover:bg-surface-light-grey hover:text-on-surface"
              >
                <X size={18} />
              </button>
            </div>

            <form
              action={(formData) => {
                const selectedItem = uniqueItems.find((i) => i.id === selectedItemId);
                formData.set("itemId", selectedItemId);
                formData.set("itemCode", selectedItem?.code || "");
                formData.set("lotId", selectedLotRow?.lotId || "");
                formData.set("lotNumber", selectedLotRow?.lotNumber || "");
                formData.set("locationId", selectedLotRow?.locationId || "");
                formData.set("locationCode", selectedLotRow?.locationLabel || "");
                formData.set("requestedQty", requestedQty);
                formData.set("reasonCategory", reasonCategory);
                formData.set("reasonNote", reasonNote);

                createOverrideAction(formData);
                setIsCreateModalOpen(false);
              }}
              className="flex-1 overflow-y-auto p-6 space-y-4"
            >
              {/* Select Item */}
              <div>
                <label className="block font-label text-xs font-bold uppercase tracking-wider text-text-grey mb-1">
                  Target Stock Item <span className="text-brand-red">*</span>
                </label>
                <select
                  required
                  value={selectedItemId}
                  onChange={(e) => {
                    setSelectedItemId(e.target.value);
                    setSelectedLotId("");
                  }}
                  className="h-10 w-full rounded-xl border border-border bg-surface px-3 font-body text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  <option value="">Select an active item in inventory…</option>
                  {uniqueItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} — {item.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Select Specific Lot / Location */}
              {selectedItemId && (
                <div>
                  <label className="block font-label text-xs font-bold uppercase tracking-wider text-text-grey mb-1">
                    Specific Target Lot &amp; Location <span className="text-brand-red">*</span>
                  </label>
                  <select
                    required
                    value={selectedLotId}
                    onChange={(e) => setSelectedLotId(e.target.value)}
                    className="h-10 w-full rounded-xl border border-border bg-surface px-3 font-body text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
                  >
                    <option value="">Choose lot number &amp; location…</option>
                    {availableLotsForItem.map((lot) => (
                      <option key={lot.lotId} value={lot.lotId}>
                        Lot: {lot.lotNumber} @ {lot.locationLabel} (Avail: {lot.qtyRemaining - lot.qtyCommitted} {lot.uom})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Requested Quantity */}
              {selectedLotRow && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-label text-xs font-bold uppercase tracking-wider text-text-grey mb-1">
                      Requested Qty ({selectedLotRow.uom}) <span className="text-brand-red">*</span>
                    </label>
                    <input
                      type="number"
                      required
                      min={1}
                      max={selectedLotRow.qtyRemaining - selectedLotRow.qtyCommitted}
                      value={requestedQty}
                      onChange={(e) => setRequestedQty(e.target.value)}
                      className="h-10 w-full rounded-xl border border-border bg-surface px-3 font-body text-xs font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    />
                  </div>
                  <div>
                    <label className="block font-label text-xs font-bold uppercase tracking-wider text-text-grey mb-1">
                      Available Stock
                    </label>
                    <div className="flex h-10 items-center rounded-xl bg-surface-light-grey px-3 font-mono text-xs font-bold text-on-surface">
                      {selectedLotRow.qtyRemaining - selectedLotRow.qtyCommitted} {selectedLotRow.uom}
                    </div>
                  </div>
                </div>
              )}

              {/* Deviation Reason */}
              <div>
                <label className="block font-label text-xs font-bold uppercase tracking-wider text-text-grey mb-1">
                  Deviation Category <span className="text-brand-red">*</span>
                </label>
                <select
                  required
                  value={reasonCategory}
                  onChange={(e) => setReasonCategory(e.target.value)}
                  className="h-10 w-full rounded-xl border border-border bg-surface px-3 font-body text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  {REASON_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Justification Note */}
              <div>
                <label className="block font-label text-xs font-bold uppercase tracking-wider text-text-grey mb-1">
                  Justification Note <span className="text-brand-red">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  minLength={5}
                  value={reasonNote}
                  onChange={(e) => setReasonNote(e.target.value)}
                  placeholder="Explain why this lot is being picked instead of standard FIFO order…"
                  className="w-full rounded-xl border border-border bg-surface p-3 font-body text-xs text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-surface px-4 font-label text-xs font-bold text-on-surface hover:bg-surface-light-grey"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedItemId || !selectedLotId || !requestedQty || !reasonNote}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-brand-navy px-5 font-label text-xs font-bold text-white hover:bg-brand-royal-blue active:scale-95 transition-all shadow-xs disabled:opacity-50"
                >
                  <span>Submit Override Request</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
