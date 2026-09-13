"use client";

import React, { useState } from "react";
import { FileText, Truck } from "lucide-react";
import { LogisticsRateMatrixTable } from "./LogisticsRateMatrixTable";
import { ContractTableClient, type ContractItem } from "../contracts/_components/ContractTableClient";
import type { VmiContractTermsRow } from "@/lib/db/queries/vmi-contracts";
import type { TradingPolicyRow } from "@/lib/db/queries/trading-policies";

interface ConfigurationTabProps {
  contracts?: ContractItem[];
  contractRows?: VmiContractTermsRow[];
  parties?: { id: string; name: string; code: string }[];
  policyRows?: TradingPolicyRow[];
  items?: { id: string; name: string; code: string }[];
}

export function ConfigurationTab({
  contracts = [],
}: ConfigurationTabProps) {
  const [subTab, setSubTab] = useState<"contracts" | "logistics">("contracts");

  return (
    <div className="space-y-6">
      {/* 2 Core Configuration Sub-tabs: Commercial Contracts & Logistics */}
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
              <FileText size={16} /> Commercial Contracts (VMI &amp; Trading)
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

      {/* Sub-tab 1: Commercial Contracts (Single unified configuration for both VMI & Trading) */}
      {subTab === "contracts" && (
        <ContractTableClient initialContracts={contracts} />
      )}

      {/* Sub-tab 2: Logistics & Delivery Matrix (kept 100% intact) */}
      {subTab === "logistics" && (
        <LogisticsRateMatrixTable />
      )}
    </div>
  );
}
