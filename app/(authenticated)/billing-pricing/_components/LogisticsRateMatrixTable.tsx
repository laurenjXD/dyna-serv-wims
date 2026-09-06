"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Truck,
  Edit3,
  Check,
  Plus,
  RefreshCw,
  DollarSign,
  Building2,
  ExternalLink,
  ShieldCheck,
  Info,
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

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [pageIndex, setPageIndex] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(10);

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
    } catch (e) {
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

  const filteredEntries = Object.values(matrixData).filter((entry) => {
    if (!searchQuery.trim()) return true;
    return entry.destination.toLowerCase().includes(searchQuery.toLowerCase().trim());
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
              Effective rates apply automatically across all Outgoing shipments based on vehicle type selected.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
            <Link
              href="/outgoing?tab=logistics"
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 font-label text-xs font-bold text-brand-navy hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <span>View Outgoing Logistics</span>
              <ExternalLink size={12} />
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs font-body">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/70 font-label text-[11px] font-bold uppercase tracking-wider text-text-grey">
                <th className="px-4 py-3">Destination / Plant</th>
                <th className="px-4 py-3">Default Vehicle</th>
                <th className="px-4 py-3 text-right">4-Wheeler (₱)</th>
                <th className="px-4 py-3 text-right">6-Wheeler (₱)</th>
                <th className="px-4 py-3 text-right">6-Wheeler Forward (₱)</th>
                <th className="px-4 py-3 text-right">10-Wheeler Forward (₱)</th>
                <th className="px-4 py-3 text-center">Pick-up</th>
                <th className="px-4 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-body">
              {pagedEntries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-text-grey">
                    No destinations match &quot;{searchQuery}&quot;.
                  </td>
                </tr>
              ) : (
                pagedEntries.map((entry) => {
                const isEditing = editingDest === entry.destination;

                if (isEditing) {
                  return (
                    <tr key={entry.destination} className="bg-blue-50/30">
                      <td className="px-4 py-2 font-bold text-brand-navy">{entry.destination}</td>
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
                  <tr key={entry.destination} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900 flex items-center gap-1.5">
                      <Building2 size={13} className="text-slate-400 shrink-0" />
                      <span>{entry.destination}</span>
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
                      <button
                        type="button"
                        onClick={() => startEdit(entry)}
                        className="inline-flex items-center gap-1 font-label text-xs font-bold text-brand-navy hover:underline"
                      >
                        <Edit3 size={12} /> Edit Rate
                      </button>
                    </td>
                  </tr>
                );
              }))}
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
    </div>
  );
}
