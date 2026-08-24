"use client";

import { useState } from "react";
import { Plus, FileText } from "lucide-react";
import type { VmiContractTermsRow } from "@/lib/db/queries/vmi-contracts";
import { VmiContractTermsModal } from "../vmi/contracts/_components/VmiContractTermsModal";

type Option = { id: string; name: string; code: string };

interface Props {
  rows: VmiContractTermsRow[];
  parties: Option[];
}

export function VmiContractTermsTable({ rows, parties }: Props) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Header action bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
        <div>
          <h2 className="font-heading text-title-md font-bold text-on-surface flex items-center gap-2">
            <FileText size={20} className="text-brand-navy" />
            VMI Contract Terms (vmi_contract_terms)
          </h2>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            Configured storage rates ($/CBM/day), handling IN/OUT rates, doc fees, and billing currency per VMI Organization.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex h-11 items-center gap-2 rounded bg-primary px-4 font-label text-label font-bold text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          <Plus size={18} />
          Configure VMI Contract
        </button>
      </div>

      {/* Main Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        {rows.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-body text-body-md text-text-grey">
              No active VMI Contract Terms configured.
            </p>
            <p className="mt-1 font-body text-body-sm text-text-grey">
              Click <strong>&quot;Configure VMI Contract&quot;</strong> above to define storage and handling rates for a VMI Organization.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                    Organization
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    Storage Rate ($/m³/day)
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    Handling IN ($/m³)
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    Handling OUT ($/m³)
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey text-right">
                    Doc Fee ($/AR)
                  </th>
                  <th className="px-4 py-3 font-label text-label uppercase tracking-wider text-text-grey">
                    Timing
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
                    <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface text-right">
                      ${parseFloat(row.storageRatePerCbmDay).toFixed(4)}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface text-right">
                      ${parseFloat(row.handlingInRatePerCbm).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface text-right">
                      ${parseFloat(row.handlingOutRatePerCbm).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface text-right">
                      ${parseFloat(row.documentationDefaultRateUsd).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-text-grey capitalize">
                      {row.billingTiming.replace(/_/g, " ")}
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

      <VmiContractTermsModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        parties={parties}
      />
    </div>
  );
}
