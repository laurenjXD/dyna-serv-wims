"use client";

import { useState } from "react";
import { Edit3, Check, DollarSign, Truck, FileText, RefreshCw, Zap } from "lucide-react";
import { syncLiveBspRateAction } from "@/lib/actions/forex";
import {
  VEHICLE_TYPES,
  type VehicleType,
  lookupEffectiveLogisticsRate,
} from "@/lib/logistics/rate-matrix";

export type LogisticsDrRow = {
  id: string;
  date: string;
  drReference: string;
  consignee: string;
  vehicleType: VehicleType;
  deliveryChargePhp: number;
  documentationChargeUsd: number;
  remarks: string;
  status: "pending" | "recorded" | "billed";
};

// June 2026 Canonical Billing Schedule DR Rows matching PDF Sample
const INITIAL_DR_ROWS: LogisticsDrRow[] = [
  { id: "dr-1", date: "2026-06-02", drReference: "WR-UPI-260546", consignee: "AMERTRON", vehicleType: "Customer Pick-up (Self-service)", deliveryChargePhp: 0.0, documentationChargeUsd: 10.0, remarks: "", status: "recorded" },
  { id: "dr-2", date: "2026-06-02", drReference: "WR-UBOT-260549", consignee: "ADGT", vehicleType: "Customer Pick-up (Self-service)", deliveryChargePhp: 0.0, documentationChargeUsd: 0.0, remarks: "Plastic Reel", status: "recorded" },
  { id: "dr-3", date: "2026-06-02", drReference: "WR-UPI-260551", consignee: "AMPLEON", vehicleType: "Customer Pick-up (Self-service)", deliveryChargePhp: 0.0, documentationChargeUsd: 10.0, remarks: "co-load", status: "recorded" },
  { id: "dr-4", date: "2026-06-02", drReference: "UPI00233 & 00234", consignee: "UPI — Cavite Assembly Plant A", vehicleType: "4-Wheeler", deliveryChargePhp: 600.0, documentationChargeUsd: 0.0, remarks: "co-load (pick up: UPI)", status: "recorded" },
  { id: "dr-5", date: "2026-06-02", drReference: "UPI00230 - 232", consignee: "DSGC", vehicleType: "6-Wheeler Forward", deliveryChargePhp: 2000.0, documentationChargeUsd: 10.0, remarks: "FG", status: "recorded" },
  { id: "dr-6", date: "2026-06-02", drReference: "UPI00229", consignee: "DSGC", vehicleType: "Customer Pick-up (Self-service)", deliveryChargePhp: 0.0, documentationChargeUsd: 10.0, remarks: "FG Reels", status: "recorded" },
  { id: "dr-7", date: "2026-06-03", drReference: "UPI00235", consignee: "DSGC", vehicleType: "Customer Pick-up (Self-service)", deliveryChargePhp: 0.0, documentationChargeUsd: 10.0, remarks: "FG Reels", status: "recorded" },
  { id: "dr-8", date: "2026-06-04", drReference: "WR-UBOT-260557", consignee: "ST", vehicleType: "Customer Pick-up (Self-service)", deliveryChargePhp: 0.0, documentationChargeUsd: 0.0, remarks: "Plastic Reel", status: "recorded" },
  { id: "dr-9", date: "2026-06-04", drReference: "WR-UBOT-260562", consignee: "ATP", vehicleType: "Customer Pick-up (Self-service)", deliveryChargePhp: 0.0, documentationChargeUsd: 10.0, remarks: "co-load trays", status: "recorded" },
  { id: "dr-10", date: "2026-06-05", drReference: "WR-UPI-260569", consignee: "AMPLEON", vehicleType: "6-Wheeler", deliveryChargePhp: 1500.0, documentationChargeUsd: 10.0, remarks: "", status: "recorded" },
  { id: "dr-11", date: "2026-06-05", drReference: "UPI00244", consignee: "UPI — Calamba Storage Hub", vehicleType: "4-Wheeler", deliveryChargePhp: 600.0, documentationChargeUsd: 0.0, remarks: "co-load (pick up: UPI)", status: "recorded" },
  { id: "dr-12", date: "2026-06-05", drReference: "UPI00239 - 00243", consignee: "DSGC", vehicleType: "6-Wheeler", deliveryChargePhp: 1000.0, documentationChargeUsd: 10.0, remarks: "FG", status: "recorded" },
  { id: "dr-13", date: "2026-06-09", drReference: "WR-UBOT-260581", consignee: "UPI — Cavite Assembly Plant A", vehicleType: "6-Wheeler Forward", deliveryChargePhp: 3000.0, documentationChargeUsd: 10.0, remarks: "Scrap (Reject)", status: "recorded" },
  { id: "dr-14", date: "2026-06-15", drReference: "WR-UBOT-260598", consignee: "UPI — Clark Facility", vehicleType: "10-Wheeler Forward", deliveryChargePhp: 7230.0, documentationChargeUsd: 10.0, remarks: "Scrap (Reject)", status: "recorded" },
  { id: "dr-15", date: "2026-06-16", drReference: "WR-UPI260600", consignee: "AMPLEON", vehicleType: "6-Wheeler Forward", deliveryChargePhp: 3470.0, documentationChargeUsd: 10.0, remarks: "", status: "recorded" },
];

export const STANDARD_CONSIGNEES = [
  "UPI — Cavite Assembly Plant A",
  "UPI — Calamba Storage Hub",
  "UPI — Clark Facility",
  "AMERTRON (Cavite)",
  "AMPLEON (Laguna)",
  "ADGT (Gateway Business Park)",
  "ATP (LISP II)",
  "ST (Calamba)",
  "DSGC (Main Warehouse)",
];

export function LogisticsLedgerClientTable() {
  const [rows, setRows] = useState<LogisticsDrRow[]>(INITIAL_DR_ROWS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<LogisticsDrRow>>({});
  const [fxRate, setFxRate] = useState<number>(61.71); // Daily Forex Rate (USD -> PHP)
  const [isSyncingFx, setIsSyncingFx] = useState<boolean>(false);
  const [fxSourceLabel, setFxSourceLabel] = useState<string>("June Baseline Contract Rate");

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

  const handleConsigneeChange = (val: string) => {
    const currentVehicle = (editForm.vehicleType as VehicleType) ?? "6-Wheeler Forward";
    const autoRate = lookupEffectiveLogisticsRate(val, currentVehicle);
    setEditForm((prev) => ({
      ...prev,
      consignee: val,
      deliveryChargePhp: autoRate,
    }));
  };

  const handleVehicleChange = (newVehicle: VehicleType) => {
    const dest = editForm.consignee ?? "";
    const autoRate = lookupEffectiveLogisticsRate(dest, newVehicle);
    setEditForm((prev) => ({
      ...prev,
      vehicleType: newVehicle,
      deliveryChargePhp: autoRate,
    }));
  };

  const startEdit = (row: LogisticsDrRow) => {
    setEditingId(row.id);
    setEditForm({ ...row });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = (id: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              consignee: editForm.consignee ?? r.consignee,
              vehicleType: (editForm.vehicleType as VehicleType) ?? r.vehicleType ?? "6-Wheeler Forward",
              deliveryChargePhp: Number(editForm.deliveryChargePhp ?? r.deliveryChargePhp),
              documentationChargeUsd: Number(editForm.documentationChargeUsd ?? r.documentationChargeUsd),
              remarks: editForm.remarks ?? r.remarks,
              status: "recorded",
            }
          : r,
      ),
    );
    setEditingId(null);
    setEditForm({});
  };

  const totalDeliveryPhp = rows.reduce((sum, r) => sum + r.deliveryChargePhp, 0);
  const totalDocUsd = rows.reduce((sum, r) => sum + r.documentationChargeUsd, 0);
  const deliveryUsd = fxRate > 0 ? totalDeliveryPhp / fxRate : 0;

  return (
    <div className="space-y-6">
      {/* Daily Forex Rate Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-xl border border-brand-navy/30 bg-[#F0F4FF] p-4 shadow-sm">
        <div>
          <h4 className="font-heading text-body-md font-bold text-brand-navy flex items-center gap-2">
            Bangko Sentral ng Pilipinas (BSP) Live Forex Integration
          </h4>
          <p className="font-body text-body-xs text-text-grey">
            Source: <strong className="text-brand-navy">{fxSourceLabel}</strong> &bull; Converts daily peso delivery charges into USD for SOA invoicing.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="font-label text-label-xs font-bold text-brand-navy">
              1 USD =
            </label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-mono-sm text-text-grey">₱</span>
              <input
                type="number"
                step="0.0001"
                value={fxRate}
                onChange={(e) => setFxRate(parseFloat(e.target.value) || 0)}
                className="w-28 rounded border border-brand-navy bg-surface-white pl-6 pr-2 py-1 font-mono text-mono-sm font-bold text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/30"
              />
            </div>
          </div>
          <button
            type="button"
            disabled={isSyncingFx}
            onClick={handleSyncLiveBspRate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-navy px-3 py-1.5 font-label text-label-xs font-bold text-white shadow-sm hover:bg-brand-navy/90 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={isSyncingFx ? "animate-spin" : ""} />
            {isSyncingFx ? "Syncing..." : "Sync Live BSP Rate"}
          </button>
        </div>
      </div>

      {/* Summary Widget */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
          <div className="flex items-center gap-3 text-brand-navy">
            <Truck size={24} />
            <span className="font-label text-label uppercase tracking-wider text-text-grey">Total Delivery Charges</span>
          </div>
          <p className="mt-2 font-heading font-extrabold text-headline-md text-on-surface">
            ₱{totalDeliveryPhp.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
          <p className="mt-1 font-body text-body-xs text-text-grey">
            ~ ${deliveryUsd.toFixed(2)} USD (Daily FX: ₱{fxRate.toFixed(2)})
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
          <div className="flex items-center gap-3 text-brand-navy">
            <FileText size={24} />
            <span className="font-label text-label uppercase tracking-wider text-text-grey">Total Documentation Fees</span>
          </div>
          <p className="mt-2 font-heading font-extrabold text-headline-md text-on-surface">
            ${totalDocUsd.toFixed(2)} USD
          </p>
          <p className="mt-1 font-body text-body-xs text-text-grey">
            {rows.length} Delivery Receipts logged
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
          <div className="flex items-center gap-3 text-brand-navy">
            <DollarSign size={24} />
            <span className="font-label text-label uppercase tracking-wider text-text-grey">Combined Logistics Fees</span>
          </div>
          <p className="mt-2 font-heading font-extrabold text-headline-md text-on-surface">
            ${(deliveryUsd + totalDocUsd).toFixed(2)} USD
          </p>
          <p className="mt-1 font-body text-body-xs text-text-grey">
            Basis for Monthly Statement of Account (SOA)
          </p>
        </div>
      </div>

      {/* Logistics DR Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        <div className="border-b border-outline-variant/30 bg-surface-light-grey p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-2">
          <div>
            <h3 className="font-heading font-bold text-headline-sm text-on-surface">
              Delivery Receipt (DR) Logistics &amp; Freight Ledger
            </h3>
            <p className="font-body text-body-sm text-text-grey">
              Effective contract rates automatically computed by <strong>Vehicle Type</strong> (4W, 6W, 6W Forward, 10W Forward) and <strong>Destination</strong>. Batched multi-DR runs share one vehicle trip charge.
            </p>
          </div>
          <span className="inline-flex items-center shrink-0 rounded-full bg-brand-navy/10 px-3 py-1 font-mono text-mono-xs font-bold text-brand-navy">
            Vehicle Rate Matrix Active
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-light-grey font-label text-label uppercase tracking-[0.05em] text-text-grey">
                <th className="px-3.5 py-3">Date</th>
                <th className="px-3.5 py-3">DR Reference #</th>
                <th className="px-3.5 py-3">Consignee / Destination</th>
                <th className="px-3.5 py-3">Vehicle Type</th>
                <th className="px-3.5 py-3 text-right">Delivery Charge (PHP)</th>
                <th className="px-3.5 py-3 text-right">Doc Charge (USD)</th>
                <th className="px-3.5 py-3">Remarks</th>
                <th className="px-3.5 py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30 font-body text-body-md text-on-surface">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-surface-light-grey/40 transition-colors text-xs">
                  <td className="px-3.5 py-3 font-mono font-semibold whitespace-nowrap">{row.date}</td>
                  <td className="px-3.5 py-3 font-mono font-bold text-brand-navy">{row.drReference}</td>
                  
                  {editingId === row.id ? (
                    <>
                      {/* Destination / Consignee Input */}
                      <td className="px-3 py-2">
                        <input
                          list="consignee-options"
                          type="text"
                          value={editForm.consignee ?? ""}
                          onChange={(e) => handleConsigneeChange(e.target.value)}
                          placeholder="Select or enter plant/customer..."
                          className="w-full rounded border border-brand-navy px-2 py-1 font-body text-xs bg-surface-white"
                        />
                        <datalist id="consignee-options">
                          {STANDARD_CONSIGNEES.map((c) => (
                            <option key={c} value={c} />
                          ))}
                        </datalist>
                      </td>

                      {/* Vehicle Type Dropdown with Auto-Rate */}
                      <td className="px-3 py-2">
                        <select
                          value={editForm.vehicleType ?? "6-Wheeler Forward"}
                          onChange={(e) => handleVehicleChange(e.target.value as VehicleType)}
                          className="w-full rounded border border-brand-navy px-2 py-1 font-label text-xs font-bold text-brand-navy bg-surface-white"
                        >
                          {VEHICLE_TYPES.map((vt) => (
                            <option key={vt} value={vt}>
                              {vt}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Delivery Charge (PHP) */}
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <input
                            type="number"
                            step="0.01"
                            value={editForm.deliveryChargePhp ?? 0}
                            onChange={(e) => setEditForm({ ...editForm, deliveryChargePhp: parseFloat(e.target.value) || 0 })}
                            className="w-24 text-right rounded border border-brand-navy px-2 py-1 font-mono text-xs font-bold"
                          />
                        </div>
                      </td>

                      {/* Doc Charge (USD) */}
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={editForm.documentationChargeUsd ?? 0}
                          onChange={(e) => setEditForm({ ...editForm, documentationChargeUsd: parseFloat(e.target.value) || 0 })}
                          className="w-20 text-right rounded border border-brand-navy px-2 py-1 font-mono text-xs"
                        />
                      </td>

                      {/* Remarks */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={editForm.remarks ?? ""}
                          onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                          className="w-full rounded border border-brand-navy px-2 py-1 font-body text-xs"
                          placeholder="Trip remarks / co-load..."
                        />
                      </td>

                      {/* Save / Cancel */}
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => saveEdit(row.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-brand-navy px-2.5 py-1 font-label text-xs font-bold text-white hover:bg-brand-navy/90"
                        >
                          <Check size={13} /> Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="ml-2 font-label text-xs text-text-grey hover:underline"
                        >
                          Cancel
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3.5 py-3 font-semibold text-slate-800">{row.consignee}</td>
                      
                      {/* Vehicle Type Badge */}
                      <td className="px-3.5 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-label text-[11px] font-bold ${
                            row.vehicleType === "10-Wheeler Forward"
                              ? "bg-purple-50 text-purple-800 border border-purple-200"
                              : row.vehicleType === "6-Wheeler Forward"
                              ? "bg-blue-50 text-brand-navy border border-blue-200"
                              : row.vehicleType === "6-Wheeler"
                              ? "bg-sky-50 text-sky-800 border border-sky-200"
                              : row.vehicleType === "4-Wheeler"
                              ? "bg-slate-100 text-slate-800 border border-slate-200"
                              : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          }`}
                        >
                          <Truck size={11} />
                          {row.vehicleType}
                        </span>
                      </td>

                      <td className="px-3.5 py-3 text-right font-mono text-xs font-bold text-slate-900">
                        {row.deliveryChargePhp > 0 ? `₱${row.deliveryChargePhp.toLocaleString("en-US", { minimumFractionDigits: 2 })}` : "₱0.00"}
                      </td>
                      <td className="px-3.5 py-3 text-right font-mono text-xs text-slate-700">
                        {row.documentationChargeUsd > 0 ? `$${row.documentationChargeUsd.toFixed(2)}` : "$0.00"}
                      </td>
                      <td className="px-3.5 py-3 font-body text-xs text-text-grey">{row.remarks || "—"}</td>
                      <td className="px-3.5 py-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => startEdit(row)}
                          className="inline-flex items-center gap-1 font-label text-xs font-bold text-brand-navy hover:underline"
                        >
                          <Edit3 size={13} /> Edit Fees
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
