"use client";

import React, { useState } from "react";
import { FileText, Truck } from "lucide-react";
import { LogisticsRateMatrixTable } from "./LogisticsRateMatrixTable";
import { ContractTableClient, type ContractItem } from "../contracts/_components/ContractTableClient";

interface ConfigurationTabProps {
  contracts: ContractItem[];
}

export function ConfigurationTab({
  contracts,
}: ConfigurationTabProps) {
  const [subTab, setSubTab] = useState<"contracts" | "logistics">("contracts");

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
      {subTab === "logistics" && (
        <LogisticsRateMatrixTable />
      )}
    </div>
  );
}
