"use client";

import React, { useState } from "react";
import {
  Truck,
  Edit3,
  Check,
  Plus,
  RefreshCw,
  Building2,
  ShieldCheck,
  Trash2,
  Power,
  X,
  AlertTriangle,
} from "lucide-react";
import { syncLiveBspRateAction } from "@/lib/actions/forex";
import {
  VEHICLE_TYPES,
  type VehicleType,
  LOGISTICS_RATE_MATRIX,
  type LogisticsRateEntry,
} from "@/lib/logistics/rate-matrix";
import { TablePagination } from "@/components/ui/TablePagination";

export function LogisticsRateMatrixTable() {
  const [matrixData, setMatrixData] = useState<Record<string, LogisticsRateEntry>>(LOGISTICS_RATE_MATRIX);
  const [editingDest, setEditingDest] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<LogisticsRateEntry>>({});
  const [fxRate, setFxRate] = useState<number>(61.71);
  const [isSyncingFx, setIsSyncingFx] = useState<boolean>(false);
  const [fxSourceLabel, setFxSourceLabel] = useState<string>("June Baseline Contract Rate");

  // Filter & Pagination state
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [pageIndex, setPageIndex] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(10);

  // Add Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [newPlantName, setNewPlantName] = useState<string>("");
  const [newDefaultVehicle, setNewDefaultVehicle] = useState<VehicleType>("6-Wheeler Forward");
  const [newRates, setNewRates] = useState<Record<string, number>>({
    "4-Wheeler": 600,
    "6-Wheeler": 1500,
    "6-Wheeler Forward": 2500,
    "10-Wheeler Forward": 4500,
  });
  const [addError, setAddError] = useState<string | null>(null);

  // Delete Confirmation State
  const [deletingDest, setDeletingDest] = useState<string | null>(null);

  const handleSyncLiveBspRate = async () => {
    setIsSyncingFx(true);
    try {
      const res = await syncLiveBspRateAction();
      if (res.ok && res.rate) {
        setFxRate(res.rate);
        setFxSourceLabel(`BSP Live Market API (${res.date})`);
      } else {
        alert(`Failed to fetch live BSP rate: ${res.error}`);
      }
    } catch {
      alert("Error contacting live BSP Forex server.");
    } finally {
      setIsSyncingFx(false);
    }
  };

  const startEdit = (entry: LogisticsRateEntry) => {
    setEditingDest(entry.destination);
    setEditForm({
      ...entry,
      rates: { ...entry.rates },
    });
  };

  const cancelEdit = () => {
    setEditingDest(null);
    setEditForm({});
  };

  const saveEdit = (dest: string) => {
    setMatrixData((prev) => ({
      ...prev,
      [dest]: {
        ...prev[dest],
        destination: editForm.destination ?? dest,
        defaultVehicle: editForm.defaultVehicle ?? prev[dest]?.defaultVehicle ?? "6-Wheeler Forward",
        rates: {
          ...prev[dest]?.rates,
          ...editForm.rates,
        },
      },
    }));
    setEditingDest(null);
    setEditForm({});
  };

  const toggleActiveStatus = (dest: string) => {
    setMatrixData((prev) => {
      const current = prev[dest];
      if (!current) return prev;
      const isCurrentlyActive = current.isActive !== false;
      return {
        ...prev,
        [dest]: {
          ...current,
          isActive: !isCurrentlyActive,
        },
      };
    });
  };

  const handleAddDestination = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPlantName.trim();
    if (!trimmed) {
      setAddError("Destination / Plant name is required.");
      return;
    }
    if (matrixData[trimmed]) {
      setAddError("A destination with this name already exists in the matrix.");
      return;
    }

    const newEntry: LogisticsRateEntry = {
      destination: trimmed,
      defaultVehicle: newDefaultVehicle,
      isActive: true,
      isCustom: true,
      rates: {
        "4-Wheeler": Number(newRates["4-Wheeler"]) || 0,
        "6-Wheeler": Number(newRates["6-Wheeler"]) || 0,
        "6-Wheeler Forward": Number(newRates["6-Wheeler Forward"]) || 0,
        "10-Wheeler Forward": Number(newRates["10-Wheeler Forward"]) || 0,
        "Customer Pick-up (Self-service)": 0.0,
      },
    };

    setMatrixData((prev) => ({
      [trimmed]: newEntry,
      ...prev,
    }));

    // Reset & close
    setNewPlantName("");
    setNewDefaultVehicle("6-Wheeler Forward");
    setNewRates({
      "4-Wheeler": 600,
      "6-Wheeler": 1500,
      "6-Wheeler Forward": 2500,
      "10-Wheeler Forward": 4500,
    });
    setAddError(null);
    setIsAddModalOpen(false);
  };

  const handleDeleteDestination = (dest: string) => {
    setMatrixData((prev) => {
      const next = { ...prev };
      delete next[dest];
      return next;
    });
    setDeletingDest(null);
  };

  // Filter entries
  const filteredEntries = Object.values(matrixData).filter((entry) => {
    const matchesSearch = !searchQuery.trim() || entry.destination.toLowerCase().includes(searchQuery.toLowerCase().trim());
    const isActive = entry.isActive !== false;
    const matchesStatus =
      statusFilter === "ALL" ||
      (statusFilter === "ACTIVE" && isActive) ||
      (statusFilter === "INACTIVE" && !isActive);
    return matchesSearch && matchesStatus;
  });

  const totalCount = filteredEntries.length;
  const pageCount = Math.ceil(totalCount / pageSize) || 1;
  const pagedEntries = filteredEntries.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);

  return (
    <div className="space-y-6">
      {/* ── Forex Integration Header ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-brand-navy/20 bg-gradient-to-r from-[#F0F4FF] via-white to-white p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-heading text-title-md font-bold text-brand-navy flex items-center gap-2">
              <Truck size={20} className="text-brand-navy" />
              Master Logistics &amp; Vehicle Rate Cards
            </h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700 border border-emerald-200">
              <ShieldCheck size={11} />
              EFFECTIVE CONTRACT RATES
            </span>
          </div>
          <p className="mt-1 font-body text-xs text-text-grey">
            Pre-defined trucking delivery charges (PHP) by vehicle class and delivery drop-off zone. Used for auto-pricing dispatches in Outgoing and SOA billing.
          </p>
        </div>

        {/* Live BSP Exchange Rate Controller */}
        <div className="flex flex-wrap items-center gap-3 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2">
            <span className="font-label text-xs font-bold text-brand-navy">1 USD =</span>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-slate-400">₱</span>
              <input
                type="number"
                step="0.0001"
                value={fxRate}
                onChange={(e) => setFxRate(parseFloat(e.target.value) || 0)}
                className="w-24 rounded-lg border border-slate-200 bg-slate-50 pl-6 pr-2 py-1 font-mono text-xs font-bold text-brand-navy focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
                aria-label="USD to PHP exchange rate"
              />
            </div>
          </div>
          <button
            type="button"
            disabled={isSyncingFx}
            onClick={handleSyncLiveBspRate}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-navy px-3 font-label text-xs font-bold text-white shadow-2xs hover:bg-brand-navy/90 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={13} className={isSyncingFx ? "animate-spin" : ""} />
            <span>{isSyncingFx ? "Syncing..." : "Sync BSP Live"}</span>
          </button>
        </div>
      </div>

      {/* ── Rate Card Table ──────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-surface-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/70 p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <h4 className="font-heading font-bold text-sm text-brand-navy">
              Standard Freight Rate Matrix (PHP / Run)
            </h4>
            <p className="font-body text-xs text-text-grey">
              Effective rates apply automatically across Outgoing shipments based on vehicle type and destination.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as "ALL" | "ACTIVE" | "INACTIVE");
                setPageIndex(0);
              }}
              className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 font-body text-xs text-slate-800 focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>

            {/* Search Input */}
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPageIndex(0);
              }}
              placeholder="Filter destination…"
              className="h-8 w-44 rounded-lg border border-slate-200 bg-white px-2.5 font-body text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
            />

            {/* Add Destination Button */}
            <button
              type="button"
              onClick={() => {
                setAddError(null);
                setIsAddModalOpen(true);
              }}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-navy px-3 font-label text-xs font-bold text-white shadow-2xs hover:bg-brand-navy/90 transition-colors"
            >
              <Plus size={13} />
              <span>Add Destination / Plant</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs font-body">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/70 font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
                <th className="px-4 py-3">Destination / Plant</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Default Vehicle</th>
                <th className="px-4 py-3 text-right">4-Wheeler (₱)</th>
                <th className="px-4 py-3 text-right">6-Wheeler (₱)</th>
                <th className="px-4 py-3 text-right">6-Wheeler Forward (₱)</th>
                <th className="px-4 py-3 text-right">10-Wheeler Forward (₱)</th>
                <th className="px-4 py-3 text-center">Pick-up</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-body">
              {pagedEntries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-text-grey">
                    No destinations match the selected filters.
                  </td>
                </tr>
              ) : (
                pagedEntries.map((entry) => {
                  const isEditing = editingDest === entry.destination;
                  const isActive = entry.isActive !== false;

                  if (isEditing) {
                    return (
                      <tr key={entry.destination} className="bg-blue-50/30">
                        <td className="px-4 py-2 font-bold text-brand-navy">{entry.destination}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-[10px] font-bold ${
                              isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={editForm.defaultVehicle ?? entry.defaultVehicle}
                            onChange={(e) => setEditForm({ ...editForm, defaultVehicle: e.target.value as VehicleType })}
                            className="rounded border border-brand-navy bg-white px-2 py-1 font-label text-xs font-bold"
                          >
                            {VEHICLE_TYPES.map((vt) => (
                              <option key={vt} value={vt}>
                                {vt}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number"
                            step="50"
                            value={editForm.rates?.["4-Wheeler"] ?? entry.rates["4-Wheeler"] ?? 0}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                rates: { ...editForm.rates, "4-Wheeler": parseFloat(e.target.value) || 0 },
                              })
                            }
                            className="w-20 text-right rounded border border-brand-navy px-1.5 py-1 font-mono text-xs font-bold"
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number"
                            step="50"
                            value={editForm.rates?.["6-Wheeler"] ?? entry.rates["6-Wheeler"] ?? 0}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                rates: { ...editForm.rates, "6-Wheeler": parseFloat(e.target.value) || 0 },
                              })
                            }
                            className="w-20 text-right rounded border border-brand-navy px-1.5 py-1 font-mono text-xs font-bold"
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number"
                            step="50"
                            value={editForm.rates?.["6-Wheeler Forward"] ?? entry.rates["6-Wheeler Forward"] ?? 0}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                rates: { ...editForm.rates, "6-Wheeler Forward": parseFloat(e.target.value) || 0 },
                              })
                            }
                            className="w-24 text-right rounded border border-brand-navy px-1.5 py-1 font-mono text-xs font-bold"
                          />
                        </td>
                        <td className="px-4 py-2 text-right">
                          <input
                            type="number"
                            step="50"
                            value={editForm.rates?.["10-Wheeler Forward"] ?? entry.rates["10-Wheeler Forward"] ?? 0}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                rates: { ...editForm.rates, "10-Wheeler Forward": parseFloat(e.target.value) || 0 },
                              })
                            }
                            className="w-24 text-right rounded border border-brand-navy px-1.5 py-1 font-mono text-xs font-bold"
                          />
                        </td>
                        <td className="px-4 py-2 text-center font-mono text-xs text-slate-500">₱0.00</td>
                        <td className="px-4 py-2 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => saveEdit(entry.destination)}
                            className="inline-flex items-center gap-1 rounded-lg bg-brand-navy px-2.5 py-1 font-label text-xs font-bold text-white hover:bg-brand-navy/90 shadow-2xs"
                          >
                            <Check size={12} /> Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="ml-2 font-label text-xs text-text-grey hover:underline"
                          >
                            Cancel
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr
                      key={entry.destination}
                      className={`hover:bg-slate-50/80 transition-colors ${!isActive ? "opacity-60 bg-slate-50/40" : ""}`}
                    >
                      <td className="px-4 py-3 font-semibold text-slate-900 flex items-center gap-1.5">
                        <Building2 size={13} className="text-slate-400 shrink-0" />
                        <span>{entry.destination}</span>
                        {entry.isCustom && (
                          <span className="rounded bg-blue-100 px-1.5 py-0.2 font-mono text-[9px] font-bold text-brand-navy">
                            NEW
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-[10px] font-bold ${
                            isActive
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-500 border border-slate-200"
                          }`}
                        >
                          {isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 font-label text-[11px] font-bold text-slate-800">
                          {entry.defaultVehicle}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">
                        ₱{(entry.rates["4-Wheeler"] ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-slate-700">
                        ₱{(entry.rates["6-Wheeler"] ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-brand-navy">
                        ₱{(entry.rates["6-Wheeler Forward"] ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-purple-900">
                        ₱{(entry.rates["10-Wheeler Forward"] ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-emerald-700 font-bold">
                        ₱0.00
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(entry)}
                            className="inline-flex items-center gap-1 font-label text-xs font-bold text-brand-navy hover:underline"
                          >
                            <Edit3 size={12} /> Edit Rate
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleActiveStatus(entry.destination)}
                            title={isActive ? "Deactivate (soft-delete)" : "Reactivate destination"}
                            className={`inline-flex items-center gap-1 font-label text-xs font-medium hover:underline ${
                              isActive ? "text-slate-500 hover:text-amber-700" : "text-emerald-700 font-bold"
                            }`}
                          >
                            <Power size={11} /> {isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingDest(entry.destination)}
                            title="Delete destination from rate matrix"
                            className="inline-flex items-center gap-1 font-label text-xs text-rose-500 hover:text-rose-700 hover:underline"
                          >
                            <Trash2 size={11} /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <TablePagination
          pageIndex={pageIndex}
          pageSize={pageSize}
          totalCount={totalCount}
          pageCount={pageCount}
          canPreviousPage={pageIndex > 0}
          canNextPage={pageIndex < pageCount - 1}
          onPageChange={(newPageIndex) => setPageIndex(newPageIndex)}
          onPageSizeChange={(newPageSize) => {
            setPageSize(newPageSize);
            setPageIndex(0);
          }}
          pageSizeOptions={[5, 10, 20, 50]}
        />
      </div>

      {/* ── Operational Specification Card ──────────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-surface-white p-4 shadow-2xs">
          <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">4-Wheeler Van / L300</p>
          <p className="mt-1 font-mono text-sm font-bold text-slate-900">1.5 – 2.0 Metric Tons</p>
          <p className="mt-0.5 text-[11px] font-body text-text-grey">Urgent single-box / small pallet drops</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-surface-white p-4 shadow-2xs">
          <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">6-Wheeler Medium Truck</p>
          <p className="mt-1 font-mono text-sm font-bold text-slate-900">4.0 – 5.0 Metric Tons</p>
          <p className="mt-0.5 text-[11px] font-body text-text-grey">Standard medium-volume delivery runs</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-surface-white p-4 shadow-2xs">
          <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">6-Wheeler Forward</p>
          <p className="mt-1 font-mono text-sm font-bold text-slate-900">7.0 – 8.0 Metric Tons</p>
          <p className="mt-0.5 text-[11px] font-body text-text-grey">Extended wheelbase / heavy FG pallets</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-surface-white p-4 shadow-2xs">
          <p className="font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">10-Wheeler Forward</p>
          <p className="mt-1 font-mono text-sm font-bold text-slate-900">12.0 – 15.0 Metric Tons</p>
          <p className="mt-0.5 text-[11px] font-body text-text-grey">Bulky scrap, reject reels &amp; Clark long-haul</p>
        </div>
      </div>

      {/* ── Add Destination / Plant Modal ────────────────────────────────── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Building2 size={20} className="text-brand-navy" />
                <h3 className="font-heading text-lg font-bold text-brand-navy">
                  Add Destination / Plant
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddDestination} className="mt-4 space-y-4">
              {addError && (
                <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-700">
                  {addError}
                </div>
              )}

              <div>
                <label className="block font-label text-xs font-bold text-slate-700 mb-1">
                  Destination / Plant Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. UPI — Subic Assembly Branch"
                  value={newPlantName}
                  onChange={(e) => setNewPlantName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-body text-slate-900 focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
                />
              </div>

              <div>
                <label className="block font-label text-xs font-bold text-slate-700 mb-1">
                  Default Vehicle Class
                </label>
                <select
                  value={newDefaultVehicle}
                  onChange={(e) => setNewDefaultVehicle(e.target.value as VehicleType)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-body text-slate-900 focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
                >
                  {VEHICLE_TYPES.map((vt) => (
                    <option key={vt} value={vt}>
                      {vt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200/80 space-y-3">
                <p className="font-label text-xs font-bold text-brand-navy uppercase tracking-wider">
                  Standard Truck Run Rates (PHP)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-label text-[11px] font-semibold text-slate-600 mb-1">
                      4-Wheeler Rate (₱)
                    </label>
                    <input
                      type="number"
                      step="50"
                      min="0"
                      value={newRates["4-Wheeler"]}
                      onChange={(e) => setNewRates({ ...newRates, "4-Wheeler": parseFloat(e.target.value) || 0 })}
                      className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-800 focus:border-brand-navy focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-label text-[11px] font-semibold text-slate-600 mb-1">
                      6-Wheeler Rate (₱)
                    </label>
                    <input
                      type="number"
                      step="50"
                      min="0"
                      value={newRates["6-Wheeler"]}
                      onChange={(e) => setNewRates({ ...newRates, "6-Wheeler": parseFloat(e.target.value) || 0 })}
                      className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-800 focus:border-brand-navy focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-label text-[11px] font-semibold text-slate-600 mb-1">
                      6-Wheeler Forward Rate (₱)
                    </label>
                    <input
                      type="number"
                      step="50"
                      min="0"
                      value={newRates["6-Wheeler Forward"]}
                      onChange={(e) => setNewRates({ ...newRates, "6-Wheeler Forward": parseFloat(e.target.value) || 0 })}
                      className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-800 focus:border-brand-navy focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-label text-[11px] font-semibold text-slate-600 mb-1">
                      10-Wheeler Forward Rate (₱)
                    </label>
                    <input
                      type="number"
                      step="50"
                      min="0"
                      value={newRates["10-Wheeler Forward"]}
                      onChange={(e) => setNewRates({ ...newRates, "10-Wheeler Forward": parseFloat(e.target.value) || 0 })}
                      className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-slate-800 focus:border-brand-navy focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-lg px-4 py-2 font-label text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-brand-navy px-4 py-2 font-label text-xs font-bold text-white shadow-2xs hover:bg-brand-navy/90 transition-colors"
                >
                  Save Destination
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Dialog ───────────────────────────────────── */}
      {deletingDest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <AlertTriangle size={24} />
              <h3 className="font-heading text-lg font-bold text-slate-900">
                Delete Rate Matrix Entry?
              </h3>
            </div>
            <p className="font-body text-xs text-text-grey leading-relaxed">
              Are you sure you want to delete <strong className="text-slate-900">&quot;{deletingDest}&quot;</strong> from the logistics rate matrix?
            </p>
            <p className="mt-2 font-body text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
              <strong>Tip:</strong> If this plant has historical dispatches, consider using <strong>&quot;Deactivate&quot;</strong> instead so historical SOAs and audit reports remain accessible.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingDest(null)}
                className="rounded-lg px-4 py-2 font-label text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteDestination(deletingDest)}
                className="rounded-lg bg-rose-600 px-4 py-2 font-label text-xs font-bold text-white shadow-2xs hover:bg-rose-700 transition-colors"
              >
                Delete Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
