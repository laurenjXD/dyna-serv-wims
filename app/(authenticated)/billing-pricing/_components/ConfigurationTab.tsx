"use client";

import React, { useState } from "react";
import { FileText, Truck, Tag } from "lucide-react";
import { VmiContractTermsTable } from "./VmiContractTermsTable";
import { LogisticsRateMatrixTable } from "./LogisticsRateMatrixTable";
import { TradingRateCardsTable } from "./TradingRateCardsTable";
import type { VmiContractTermsRow } from "@/lib/db/queries/vmi-contracts";
import type { TradingPolicyRow } from "@/lib/db/queries/trading-policies";

interface ConfigurationTabProps {
  contractRows: VmiContractTermsRow[];
  parties: { id: string; name: string; code: string }[];
  policyRows?: TradingPolicyRow[];
  items?: { id: string; name: string; code: string }[];
}

export function ConfigurationTab({
  contractRows,
  parties,
  policyRows = [],
  items = [],
}: ConfigurationTabProps) {
  const [subTab, setSubTab] = useState<"contracts" | "trading-rates" | "logistics">("contracts");

  return (
    <div className="space-y-6">
      {/* Configuration Sub-tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-outline-variant/30 pb-4">
        <div className="flex flex-wrap gap-2" role="tablist">
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
              <FileText size={16} /> Storage &amp; Handling Terms
            </span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab("trading-rates")}
            className={`rounded-lg px-4 py-2 font-label text-label font-bold transition-colors ${
              subTab === "trading-rates"
                ? "bg-brand-navy text-white shadow-sm"
                : "bg-surface-white text-text-grey hover:bg-surface-light-grey border border-outline-variant/30"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Tag size={16} /> Trading Rate Cards
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
              <Truck size={16} /> Logistics &amp; Delivery Matrix
            </span>
          </button>
        </div>
      </div>

      {/* Sub-tab content */}
      {subTab === "contracts" && (
        <VmiContractTermsTable rows={contractRows} parties={parties} />
      )}
      {subTab === "trading-rates" && (
        <TradingRateCardsTable rows={policyRows} parties={parties} items={items} />
      )}
      {subTab === "logistics" && (
        <LogisticsRateMatrixTable />
      )}
    </div>
  );
}


