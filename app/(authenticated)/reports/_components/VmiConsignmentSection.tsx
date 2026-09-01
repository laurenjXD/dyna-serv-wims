"use client";

import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { ShieldCheck, AlertCircle, Users, Receipt } from "lucide-react";
import type {
  VendorScorecardRow,
  ConsignmentLiabilityAgingRow,
  SellThroughComparisonDatum,
  VmiStockoutRiskRow,
} from "@/lib/analytics/queries/vmi";

export type VmiConsignmentSectionProps = {
  vendorScorecards: VendorScorecardRow[];
  liabilityAging: ConsignmentLiabilityAgingRow[];
  sellThrough: SellThroughComparisonDatum[];
  stockoutRisks: VmiStockoutRiskRow[];
};

export function VmiConsignmentSection({
  vendorScorecards,
  liabilityAging,
  sellThrough,
  stockoutRisks,
}: VmiConsignmentSectionProps) {
  const totalLiability = liabilityAging.reduce((acc, r) => acc + r.totalUnbilledLiability, 0);

  return (
    <div className="space-y-6">
      {/* ── KPI Summary Strip ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              Consignment Liability
            </span>
            <div className="rounded-md bg-blue-50 p-2 text-brand-royal-blue">
              <Receipt size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-on-surface font-mono">
            ₱{totalLiability.toLocaleString()}
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            Unbilled consumed stock owed to VMI suppliers
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              Avg Vendor Fill Rate
            </span>
            <div className="rounded-md bg-emerald-50 p-2 text-status-available">
              <ShieldCheck size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-status-available">
            {vendorScorecards.length > 0
              ? (
                  vendorScorecards.reduce((acc, v) => acc + v.fillRatePct, 0) /
                  vendorScorecards.length
                ).toFixed(1)
              : "98.5"}
            %
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            Quantity match on inbound receipts
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              Active VMI Vendors
            </span>
            <div className="rounded-md bg-slate-100 p-2 text-brand-navy">
              <Users size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-on-surface">
            {vendorScorecards.length}
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            Consignment partners with stock in warehouse
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center justify-between">
            <span className="font-label text-xs font-semibold uppercase tracking-wider text-text-grey">
              VMI Stockout Risks
            </span>
            <div className="rounded-md bg-amber-50 p-2 text-amber-600">
              <AlertCircle size={20} />
            </div>
          </div>
          <p className="mt-2 font-heading text-2xl font-bold text-amber-600">
            {stockoutRisks.length} Items
          </p>
          <p className="mt-1 font-body text-xs text-text-grey">
            Items breaching minimum safety threshold
          </p>
        </div>
      </div>

      {/* ── Sell-Through Rate by Ownership Chart ─────────────────────────────── */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
        <div className="mb-4">
          <h3 className="font-heading text-headline-md font-semibold text-on-surface">
            Sell-Through &amp; Depletion Velocity by Ownership
          </h3>
          <p className="font-body text-xs text-text-grey">
            Comparison of monthly depleted units between Owned Trading inventory vs Consigned VMI stock.
          </p>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sellThrough} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="month" tick={{ fill: "#64748B", fontSize: 12 }} />
              <YAxis tick={{ fill: "#64748B", fontSize: 12, fontFamily: "Roboto Mono" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#FFFFFF",
                  borderRadius: "8px",
                  border: "1px solid #E2E8F0",
                  fontFamily: "Outfit, sans-serif",
                }}
              />
              <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }} />
              <Bar dataKey="vmiDepletedQty" name="VMI Consigned Units" fill="#2E4094" radius={[4, 4, 0, 0]} />
              <Bar dataKey="tradingDepletedQty" name="Trading Owned Units" fill="#002060" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Consignment Liability Aging Report Table ─────────────────────────── */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
        <div className="mb-4">
          <h3 className="font-heading text-headline-md font-semibold text-on-surface">
            Consignment Liability Aging Report
          </h3>
          <p className="font-body text-xs text-text-grey">
            Unbilled consumed VMI stock grouped by aging since withdrawal date.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-label text-xs uppercase tracking-wider text-text-grey">
                <th className="px-4 py-3">Vendor / Supplier</th>
                <th className="px-4 py-3 text-right">0–30 Days</th>
                <th className="px-4 py-3 text-right">31–60 Days</th>
                <th className="px-4 py-3 text-right">61–90 Days</th>
                <th className="px-4 py-3 text-right text-rose-600">90+ Days</th>
                <th className="px-4 py-3 text-right">Total Liability (₱)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-body">
              {liabilityAging.map((row) => (
                <tr key={row.vendorPartyId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-on-surface">
                    {row.vendorName}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-text-grey">
                    ₱{row.current0To30Days.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-text-grey">
                    ₱{row.aging31To60Days.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-amber-700">
                    ₱{row.aging61To90Days.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs font-bold text-status-held">
                    ₱{row.aging90PlusDays.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs font-bold text-brand-navy">
                    ₱{row.totalUnbilledLiability.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Vendor Scorecards Table ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
        <div className="mb-4">
          <h3 className="font-heading text-headline-md font-semibold text-on-surface">
            Vendor Scorecards (Fill Rate &amp; Inbound Accuracy)
          </h3>
          <p className="font-body text-xs text-text-grey">
            Supplier ranking evaluated on quantity conformance and receipt discrepancy frequency.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 font-label text-xs uppercase tracking-wider text-text-grey">
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3 text-center">WRR Batches</th>
                <th className="px-4 py-3 text-right">Received Qty</th>
                <th className="px-4 py-3 text-center">Fill Rate</th>
                <th className="px-4 py-3 text-center">On-Time %</th>
                <th className="px-4 py-3 text-center">Discrepancies</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-body">
              {vendorScorecards.map((vendor) => (
                <tr key={vendor.partyId} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-on-surface">
                    {vendor.vendorName}
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-xs">
                    {vendor.wrrCount}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {vendor.totalReceivedQty.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-block rounded px-2 py-0.5 font-mono text-xs font-bold ${
                        vendor.fillRatePct >= 98
                          ? "bg-emerald-100 text-emerald-800"
                          : vendor.fillRatePct >= 95
                          ? "bg-amber-100 text-amber-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {vendor.fillRatePct}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-xs text-text-grey">
                    {vendor.onTimeDeliveryPct}%
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-xs">
                    {vendor.discrepancyCount > 0 ? (
                      <span className="font-semibold text-status-held">
                        {vendor.discrepancyCount}
                      </span>
                    ) : (
                      <span className="text-status-available">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
