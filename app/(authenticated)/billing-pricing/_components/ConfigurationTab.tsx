"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Settings, FileText, Truck, Plus, ArrowRight } from "lucide-react";
import { VmiContractTermsTable } from "./VmiContractTermsTable";
import { LogisticsRateMatrixTable } from "./LogisticsRateMatrixTable";
import type { VmiContractTermsRow } from "@/lib/db/queries/vmi-contracts";

interface ConfigurationTabProps {
  contractRows: VmiContractTermsRow[];
  parties: { id: string; name: string; code: string }[];
}

export function ConfigurationTab({ contractRows, parties }: ConfigurationTabProps) {
  const [subTab, setSubTab] = useState<"contracts" | "logistics">("contracts");

  return (
    <div className="space-y-6">
      {/* Configuration Sub-tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-outline-variant/30 pb-4">
        <div className="flex gap-2" role="tablist">
          <button
            type="button"
            onClick={() => setSubTab("contracts")}
            className={`rounded-lg px-4 py-2 font-label text-label font-bold transition-colors ${
              subTab === "contracts"
                ? "bg-brand-navy text-white shadow-sm"
                : "bg-surface-white text-text-grey hover:bg-surface-light-grey border border-outline-variant/30"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <FileText size={16} /> Commercial Storage &amp; Handling Contracts
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab("logistics")}
            className={`rounded-lg px-4 py-2 font-label text-label font-bold transition-colors ${
              subTab === "logistics"
                ? "bg-brand-navy text-white shadow-sm"
                : "bg-surface-white text-text-grey hover:bg-surface-light-grey border border-outline-variant/30"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Truck size={16} /> Logistics &amp; Delivery Rate Matrix
            </span>
          </button>
        </div>

        {subTab === "contracts" && (
          <Link
            href="/billing-pricing/contracts"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 font-label text-label font-bold text-white shadow hover:bg-primary-hover transition-colors text-sm"
          >
            Full Contract Directory <ArrowRight size={14} />
          </Link>
        )}
      </div>

      {/* Sub-tab content */}
      {subTab === "contracts" ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1">
            <h3 className="font-heading text-heading-sm font-bold text-on-surface">
              Active Storage &amp; Handling Contract Terms
            </h3>
            <p className="mt-1 font-body text-body-sm text-text-grey">
              Effective-dated rates governing daily CBM storage occupancy and handling volume fees.
            </p>
          </div>
          <VmiContractTermsTable rows={contractRows} parties={parties} />
        </div>
      ) : (
        <div className="space-y-4">
          <LogisticsRateMatrixTable />
        </div>
      )}
    </div>
  );
}
