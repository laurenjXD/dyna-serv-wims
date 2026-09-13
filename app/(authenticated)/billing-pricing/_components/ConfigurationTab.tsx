"use client";

import React, { useState } from "react";
import { FileText, Layers, Tag, Truck } from "lucide-react";
import { LogisticsRateMatrixTable } from "./LogisticsRateMatrixTable";
import { ContractTableClient, type ContractItem } from "../contracts/_components/ContractTableClient";
import { TradingRateCardsTable } from "./TradingRateCardsTable";
import { VmiContractTermsTable } from "./VmiContractTermsTable";
import type { VmiContractTermsRow } from "@/lib/db/queries/vmi-contracts";
import type { TradingPolicyRow } from "@/lib/db/queries/trading-policies";

interface ConfigurationTabProps {
  contracts: ContractItem[];
  vmiContractRows: VmiContractTermsRow[];
  parties: { id: string; name: string; code: string }[];
  policyRows: TradingPolicyRow[];
  items: { id: string; name: string; code: string }[];
}

export function ConfigurationTab({
  contracts,
  vmiContractRows,
  parties,
  policyRows,
  items,
}: ConfigurationTabProps) {
  const [subTab, setSubTab] = useState<"contracts" | "vmi" | "trading" | "logistics">("contracts");

  return (
    <div className="space-y-6">
      {/* Configuration Sub-tabs */}
      <div className="border-b border-outline-variant/30 pb-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Configuration views">
          <button
            type="button"
            onClick={() => setSubTab("contracts")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-label text-label font-bold transition-colors ${
              subTab === "contracts"
                ? "bg-brand-navy text-white shadow-sm"
                : "border border-outline-variant/30 bg-surface-white text-text-grey hover:bg-surface-light-grey"
            }`}
          >
            <FileText size={16} /> Commercial Contracts (VMI &amp; Trading)
          </button>
          <button
            type="button"
            onClick={() => setSubTab("vmi")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-label text-label font-bold transition-colors ${
              subTab === "vmi"
                ? "bg-brand-navy text-white shadow-sm"
                : "border border-outline-variant/30 bg-surface-white text-text-grey hover:bg-surface-light-grey"
            }`}
          >
            <Layers size={16} /> VMI Storage &amp; Handling
          </button>
          <button
            type="button"
            onClick={() => setSubTab("trading")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-label text-label font-bold transition-colors ${
              subTab === "trading"
                ? "bg-brand-navy text-white shadow-sm"
                : "border border-outline-variant/30 bg-surface-white text-text-grey hover:bg-surface-light-grey"
            }`}
          >
            <Tag size={16} /> Trading Rate Cards
          </button>
          <button
            type="button"
            onClick={() => setSubTab("logistics")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-label text-label font-bold transition-colors ${
              subTab === "logistics"
                ? "bg-brand-navy text-white shadow-sm"
                : "border border-outline-variant/30 bg-surface-white text-text-grey hover:bg-surface-light-grey"
            }`}
          >
            <Truck size={16} /> Logistics &amp; Delivery Matrix
          </button>
        </div>
      </div>

      {/* Sub-tab content */}
      {subTab === "contracts" && (
        <ContractTableClient initialContracts={contracts} />
      )}
      {subTab === "vmi" && (
        <VmiContractTermsTable rows={vmiContractRows} parties={parties} />
      )}
      {subTab === "trading" && (
        <TradingRateCardsTable rows={policyRows} parties={parties} items={items} />
      )}
      {subTab === "logistics" && (
        <LogisticsRateMatrixTable />
      )}
    </div>
  );
}
