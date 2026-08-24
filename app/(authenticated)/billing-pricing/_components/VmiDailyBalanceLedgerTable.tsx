"use client";

import type { VmiDailyBalanceRow, VmiCbmLedgerRow } from "@/lib/billing/queries/vmi-ledger";

interface Props {
  summary: VmiCbmLedgerRow | null;
  dailyRows: VmiDailyBalanceRow[];
}

export function VmiDailyBalanceLedgerTable({ summary, dailyRows }: Props) {
  if (!summary && dailyRows.length === 0) {
    return (
      <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-12 text-center shadow-elevation-1">
        <p className="font-body text-body-md text-text-grey">
          No VMI daily balance ledger records found for the selected Organization and month.
        </p>
        <p className="mt-1 font-body text-body-sm text-text-grey">
          The nightly balance replay engine calculates daily balances automatically at 23:59 Asia/Manila.
        </p>
      </div>
    );
  }

  const totalStorageAmount = dailyRows.reduce((sum, r) => sum + r.storageAmountUsd, 0);

  return (
    <div className="space-y-4">
      {/* Summary KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <p className="font-label text-label font-bold uppercase tracking-wider text-text-grey">
            Lots in Storage
          </p>
          <p className="mt-2 font-mono text-title-lg font-bold text-on-surface">
            {summary?.lotsInStorage ?? 0}
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <p className="font-label text-label font-bold uppercase tracking-wider text-text-grey">
            Avg Daily CBM
          </p>
          <p className="mt-2 font-mono text-title-lg font-bold text-on-surface">
            {(summary?.avgDailyCbm ?? 0).toFixed(2)} m³
          </p>
        </div>

        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <p className="font-label text-label font-bold uppercase tracking-wider text-text-grey">
            Contract Rate
          </p>
          <p className="mt-2 font-mono text-title-lg font-bold text-on-surface">
            ${(summary?.ratePerCbm ?? 0).toFixed(4)} <span className="font-body text-body-sm text-text-grey">/m³/day</span>
          </p>
        </div>

        <div className="rounded-xl border border-brand-navy/30 bg-brand-navy/5 p-4 shadow-elevation-1">
          <p className="font-label text-label font-bold uppercase tracking-wider text-brand-navy">
            Period Storage Subtotal
          </p>
          <p className="mt-2 font-mono text-title-lg font-bold text-brand-navy">
            ${totalStorageAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
          </p>
        </div>
      </div>

      {/* Daily Balance Ledger Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                  Date
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                  Beginning CBM
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                  IN (FG)
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                  IN (Raw Mtl)
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                  OUT (FG)
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                  OUT (Raw Mtl)
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                  Ending CBM
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                  Rate ($/m³)
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                  Amount ($)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {dailyRows.map((row) => (
                <tr key={row.id} className="hover:bg-surface-light-grey/40">
                  <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface">
                    {row.ledgerDate}
                  </td>
                  <td className="px-4 py-3 font-mono text-mono-md text-on-surface text-right">
                    {row.beginningCbm.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 font-mono text-mono-md text-status-available text-right font-medium">
                    {row.inFgCbm > 0 ? `+${row.inFgCbm.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-mono-md text-status-available text-right font-medium">
                    {row.inRawCbm > 0 ? `+${row.inRawCbm.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-mono-md text-status-held text-right font-medium">
                    {row.outFgCbm > 0 ? `-${row.outFgCbm.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-mono-md text-status-held text-right font-medium">
                    {row.outRawCbm > 0 ? `-${row.outRawCbm.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface text-right">
                    {row.endingCbm.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 font-mono text-mono-md text-text-grey text-right">
                    ${row.appliedStorageRateUsd.toFixed(4)}
                  </td>
                  <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface text-right">
                    ${row.storageAmountUsd.toFixed(2)}
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
