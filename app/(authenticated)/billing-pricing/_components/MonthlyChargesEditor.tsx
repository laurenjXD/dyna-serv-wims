"use client";

import React, { useState, useTransition } from "react";
import { Truck, FileText, Users, Plus, Save, Clock } from "lucide-react";
import { logManpowerHoursAction } from "@/lib/actions/vmi-manpower";
import type { VmiChargeLineRow, VmiManpowerSummary } from "@/lib/billing/queries/vmi-ledger";

interface MonthlyChargesEditorProps {
  partyId: string;
  partyName: string;
  periodStartDate: string;
  periodEndDate: string;
  chargeLines: VmiChargeLineRow[];
  manpowerSummary: VmiManpowerSummary;
  lockedFxRate?: number;
}

export function MonthlyChargesEditor({
  partyId,
  partyName,
  periodStartDate,
  periodEndDate,
  chargeLines,
  manpowerSummary,
  lockedFxRate = 60.0,
}: MonthlyChargesEditorProps) {
  const [isPending, startTransition] = useTransition();
  const [manpowerHours, setManpowerHours] = useState(manpowerSummary.hours.toString());
  const [manpowerNotes, setManpowerNotes] = useState(manpowerSummary.notes ?? "");
  const [feedback, setFeedback] = useState<{ ok?: boolean; error?: string } | null>(null);

  const deliveryLines = chargeLines.filter((c) => c.chargeType === "delivery");
  const docLines = chargeLines.filter((c) => c.chargeType === "documentation");
  const adhocLines = chargeLines.filter((c) => c.chargeType === "ad_hoc" || c.chargeType === "other");

  const totalDeliveryPhp = deliveryLines.reduce((sum, l) => sum + (l.currency === "PHP" ? l.amount : l.amount * lockedFxRate), 0);
  const totalDeliveryUsd = lockedFxRate > 0 ? totalDeliveryPhp / lockedFxRate : 0;
  const totalDocUsd = docLines.reduce((sum, l) => sum + (l.currency === "USD" ? l.amount : l.amount / lockedFxRate), 0);
  const manpowerTotalUsd = parseFloat(manpowerHours || "0") * manpowerSummary.ratePerHour;

  function handleSaveManpower(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    const formData = new FormData();
    formData.append("partyId", partyId);
    formData.append("periodStartDate", periodStartDate);
    formData.append("periodEndDate", periodEndDate);
    formData.append("hours", manpowerHours);
    formData.append("notes", manpowerNotes);

    startTransition(async () => {
      const res = await logManpowerHoursAction({}, formData);
      setFeedback(res);
    });
  }

  return (
    <div className="space-y-6">
      {/* Top summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center gap-2 text-brand-navy">
            <Truck size={18} />
            <span className="font-label text-label font-bold uppercase">Delivery Charges</span>
          </div>
          <div className="mt-2 font-mono text-mono-lg font-bold text-on-surface">
            ₱{totalDeliveryPhp.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="mt-1 font-mono text-mono-sm text-text-grey">
            ≈ ${totalDeliveryUsd.toFixed(2)} USD (FX: ₱{lockedFxRate.toFixed(2)})
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center gap-2 text-brand-blue">
            <FileText size={18} />
            <span className="font-label text-label font-bold uppercase">Documentation Fees</span>
          </div>
          <div className="mt-2 font-mono text-mono-lg font-bold text-on-surface">
            ${totalDocUsd.toFixed(2)} USD
          </div>
          <div className="mt-1 font-body text-body-sm text-text-grey">
            {docLines.length} recorded documentation entries
          </div>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <div className="flex items-center gap-2 text-status-available">
            <Users size={18} />
            <span className="font-label text-label font-bold uppercase">Logged Manpower</span>
          </div>
          <div className="mt-2 font-mono text-mono-lg font-bold text-on-surface">
            ${manpowerTotalUsd.toFixed(2)} USD
          </div>
          <div className="mt-1 font-mono text-mono-sm text-text-grey">
            {manpowerHours || "0"} hrs @ ${manpowerSummary.ratePerHour.toFixed(2)}/hr
          </div>
        </div>
      </div>

      {/* Manpower Logging Form */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1">
        <div className="flex items-center gap-2 pb-3 border-b border-outline-variant/30">
          <Clock size={20} className="text-brand-navy" />
          <h3 className="font-heading text-heading-sm font-bold text-on-surface">
            Warehouse Manpower &amp; Overtime Log
          </h3>
        </div>

        <form onSubmit={handleSaveManpower} className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block font-label text-label font-bold text-text-grey mb-1">
                Manpower Hours for Period ({periodStartDate} to {periodEndDate})
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={manpowerHours}
                onChange={(e) => setManpowerHours(e.target.value)}
                placeholder="e.g. 12.5"
                className="h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-mono text-mono-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
                required
              />
              <span className="mt-1 block font-body text-body-xs text-text-grey">
                Standing contract rate: ${manpowerSummary.ratePerHour.toFixed(2)} / hour
              </span>
            </div>

            <div>
              <label className="block font-label text-label font-bold text-text-grey mb-1">
                Log Remarks / Work Notes
              </label>
              <input
                type="text"
                value={manpowerNotes}
                onChange={(e) => setManpowerNotes(e.target.value)}
                placeholder="e.g. Weekend destuffing overtime, sorting lot #..."
                className="h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
              />
            </div>
          </div>

          {feedback && (
            <div className={`p-3 rounded-lg text-body-sm font-body ${feedback.ok ? "bg-status-available/10 text-status-available" : "bg-status-held/10 text-status-held"}`}>
              {feedback.ok ? "Manpower hours saved successfully." : feedback.error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-label text-label font-bold text-white shadow hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              <Save size={16} />
              {isPending ? "Saving..." : "Save Manpower Log"}
            </button>
          </div>
        </form>
      </div>

      {/* Charge Lines Breakdown Table */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1">
        <h3 className="font-heading text-heading-sm font-bold text-on-surface mb-3">
          Itemized Monthly Service Charges ({partyName})
        </h3>

        {chargeLines.length === 0 ? (
          <p className="py-6 text-center font-body text-body-md text-text-grey">
            No delivery or ad-hoc service charges recorded for this period yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  <th className="px-4 py-2.5 text-left font-label text-label font-bold uppercase text-text-grey">
                    Date
                  </th>
                  <th className="px-4 py-2.5 text-left font-label text-label font-bold uppercase text-text-grey">
                    Type
                  </th>
                  <th className="px-4 py-2.5 text-left font-label text-label font-bold uppercase text-text-grey">
                    Description
                  </th>
                  <th className="px-4 py-2.5 text-right font-label text-label font-bold uppercase text-text-grey">
                    PHP Amount
                  </th>
                  <th className="px-4 py-2.5 text-right font-label text-label font-bold uppercase text-text-grey">
                    USD Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30 font-body text-body-md text-on-surface">
                {chargeLines.map((line) => (
                  <tr key={line.id} className="hover:bg-surface-light-grey/40">
                    <td className="px-4 py-2.5 font-mono text-mono-sm text-text-grey">
                      {line.createdAt.slice(0, 10)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex rounded bg-brand-navy/10 px-2 py-0.5 font-label text-label uppercase text-brand-navy">
                        {line.chargeType}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-body">
                      {line.notes || `${line.chargeType} fee`}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-mono-md">
                      {line.currency === "PHP" ? `₱${line.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-mono-md font-bold">
                      {line.currency === "USD" ? `$${line.amount.toFixed(2)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
