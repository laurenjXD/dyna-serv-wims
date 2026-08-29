"use client";

import type { TradingMarginRow } from "@/lib/billing/queries/trading-margin";

interface Props {
  rows: TradingMarginRow[];
  hasMarginView: boolean;
}

export function TradingMarginLedgerTable({ rows, hasMarginView }: Props) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-12 text-center shadow-elevation-1">
        <p className="font-body text-body-md text-text-grey">
          No Trading sales recorded for the selected period.
        </p>
        <p className="mt-1 font-body text-body-sm text-text-grey">
          Trading sales are frozen into the ledger automatically when pick lists are generated.
        </p>
      </div>
    );
  }

  const totalSalesAmount = rows.reduce(
    (sum, r) => sum + r.qty * r.sellPrice,
    0,
  );
  const totalCogsAmount = hasMarginView
    ? rows.reduce((sum, r) => sum + r.qty * (r.cogs ?? 0), 0)
    : 0;
  const totalMarginAmount = totalSalesAmount - totalCogsAmount;

  return (
    <div className="space-y-4">
      {/* Summary KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
          <p className="font-label text-label font-bold uppercase tracking-wider text-text-grey">
            Total Trading Revenue
          </p>
          <p className="mt-2 font-mono text-title-lg font-bold text-on-surface">
            ₱{totalSalesAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        {hasMarginView && (
          <>
            <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
              <p className="font-label text-label font-bold uppercase tracking-wider text-text-grey">
                Total COGS (Buy Cost)
              </p>
              <p className="mt-2 font-mono text-title-lg font-bold text-text-grey">
                ₱{totalCogsAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            <div className="rounded-xl border border-status-available/30 bg-status-available/10 p-4 shadow-elevation-1">
              <p className="font-label text-label font-bold uppercase tracking-wider text-status-available">
                Total Gross Margin
              </p>
              <p className="mt-2 font-mono text-title-lg font-bold text-status-available">
                ₱{totalMarginAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="ml-2 font-body text-body-sm">
                  ({totalSalesAmount > 0 ? ((totalMarginAmount / totalSalesAmount) * 100).toFixed(1) : 0}%)
                </span>
              </p>
            </div>
          </>
        )}
      </div>

      {/* Main Ledger Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                  Order / Ref #
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                  Customer
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                  Item Code
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                  Lot #
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                  Qty
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                  Sell Price
                </th>
                <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                  Total Revenue
                </th>

                {hasMarginView && (
                  <>
                    <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                      Buy Cost
                    </th>
                    <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                      Margin
                    </th>
                    <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                      Margin %
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {rows.map((row) => {
                const totalRev = row.qty * row.sellPrice;
                const buyCost = row.cogs ?? 0;
                const totalCost = row.qty * buyCost;
                const marginAmt = totalRev - totalCost;
                const marginPct = row.marginPct ?? 0;

                return (
                  <tr key={row.id} className="hover:bg-surface-light-grey/40">
                    <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface">
                      {row.orderNumber || "—"}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {row.party}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.item}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-text-grey">
                      {row.lot || "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface text-right font-bold">
                      {row.qty}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface text-right">
                      ₱{row.sellPrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface text-right">
                      ₱{totalRev.toFixed(2)}
                    </td>

                    {hasMarginView && (
                      <>
                        <td className="px-4 py-3 font-mono text-mono-md text-text-grey text-right">
                          ₱{buyCost.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 font-mono text-mono-md font-bold text-status-available text-right">
                          ₱{marginAmt.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 font-mono text-mono-md font-bold text-status-available text-right">
                          {marginPct.toFixed(1)}%
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-brand-navy bg-surface-light-grey/80 font-bold">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-right font-label uppercase text-on-surface">
                  Total Trading Sales:
                </td>
                <td className="px-4 py-3 text-right font-mono text-mono-md font-bold text-on-surface">
                  {rows.reduce((sum, r) => sum + r.qty, 0).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-label text-label-xs uppercase text-text-grey">
                  —
                </td>
                <td className="px-4 py-3 text-right font-mono text-mono-md font-bold text-brand-navy">
                  ₱{totalSalesAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                {hasMarginView && (
                  <>
                    <td className="px-4 py-3 text-right font-mono text-mono-md font-bold text-text-grey">
                      ₱{totalCogsAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-mono-md font-bold text-status-available">
                      ₱{totalMarginAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-mono-md font-bold text-status-available">
                      {totalSalesAmount > 0 ? ((totalMarginAmount / totalSalesAmount) * 100).toFixed(1) : 0}%
                    </td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
