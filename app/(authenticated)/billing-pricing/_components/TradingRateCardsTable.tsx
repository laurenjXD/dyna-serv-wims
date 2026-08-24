"use client";

import { useState } from "react";
import { Plus, Tag } from "lucide-react";
import type { TradingPolicyRow } from "@/lib/db/queries/trading-policies";
import { PolicyFormModal } from "../trading/policies/_components/PolicyFormModal";

type Option = { id: string; name: string; code: string };

interface Props {
  rows: TradingPolicyRow[];
  parties: Option[];
  items: Option[];
}

export function TradingRateCardsTable({ rows, parties, items }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header action bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
        <div>
          <h2 className="font-heading text-title-md font-bold text-on-surface flex items-center gap-2">
            <Tag size={20} className="text-brand-navy" />
            Trading Rate Cards (trading_policies)
          </h2>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            Configured default buy cost, margin formula, and sell price per Customer &amp; Item.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex h-11 items-center gap-2 rounded bg-primary px-4 font-label text-label font-bold text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          <Plus size={18} />
          Configure Rate Card
        </button>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        {rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-body text-body-md text-text-grey">
              No active Trading rate cards configured.
            </p>
            <p className="mt-1 font-body text-body-sm text-text-grey">
              Click <strong>&quot;Configure Rate Card&quot;</strong> above to define buy cost and sell price for a Customer and Item pair.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                    Customer Organization
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                    Item Code &amp; Name
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    Buy Cost
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                    Margin Formula
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    Sell Price
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                    Status
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                    Effective Range
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-light-grey/40">
                    <td className="px-4 py-3 font-body text-body-md text-on-surface font-semibold">
                      {row.partyCode} — {row.partyName}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      <span className="font-mono text-mono-md font-bold">{row.itemCode}</span>
                      <br />
                      <span className="text-body-sm text-text-grey">{row.itemName}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface text-right font-medium">
                      {row.buyCurrency} ${parseFloat(row.buyCost).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {row.marginType === "percentage" ? (
                        <span className="inline-flex items-center rounded-full bg-brand-navy/10 px-2 py-0.5 font-mono text-mono-md font-bold text-brand-navy">
                          +{parseFloat(row.marginValue).toFixed(1)}%
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-brand-navy/10 px-2 py-0.5 font-mono text-mono-md font-bold text-brand-navy">
                          +${parseFloat(row.marginValue).toFixed(2)} / unit
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md font-bold text-status-available text-right">
                      {row.sellCurrency} ₱{parseFloat(row.sellPrice).toFixed(2)}
                      {row.sellPriceIsOverride && (
                        <span className="ml-1 rounded bg-status-pending/20 px-1 py-0.5 text-[10px] text-status-pending uppercase font-bold">
                          Override
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md">
                      {row.isActive ? (
                        <span className="inline-flex items-center rounded-full bg-status-available/10 px-2 py-0.5 font-label text-label font-bold text-status-available">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-status-neutral/10 px-2 py-0.5 font-label text-label font-bold text-text-grey">
                          Superseded
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-text-grey">
                      {new Date(row.effectiveFrom).toLocaleDateString()}
                      {row.effectiveTo ? ` — ${new Date(row.effectiveTo).toLocaleDateString()}` : " — Present"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PolicyFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        parties={parties}
        items={items}
      />
    </div>
  );
}
