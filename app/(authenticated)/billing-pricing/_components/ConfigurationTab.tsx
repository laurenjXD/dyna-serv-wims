"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText, Truck } from "lucide-react";
import { LogisticsRateMatrixTable } from "./LogisticsRateMatrixTable";
import { ContractTableClient, type ContractItem } from "../contracts/_components/ContractTableClient";
import type { VmiContractTermsRow } from "@/lib/db/queries/vmi-contracts";
import type { TradingPolicyRow } from "@/lib/db/queries/trading-policies";

interface ConfigurationTabProps {
  contracts: ContractItem[];
  vmiContractRows?: VmiContractTermsRow[];
  parties?: { id: string; name: string; code: string }[];
  policyRows?: TradingPolicyRow[];
  items?: { id: string; name: string; code: string }[];
  initialSubTab?: "contracts" | "logistics";
}

export function ConfigurationTab({
  contracts,
  initialSubTab = "contracts",
}: ConfigurationTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const subTab = initialSubTab;

  function changeSubTab(nextTab: "contracts" | "logistics") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", "configuration");
    params.set("subtab", nextTab);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      {/* Configuration Sub-tabs */}
      <div className="border-b border-outline-variant/30 pb-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Configuration views">
          <button
            type="button"
            onClick={() => changeSubTab("contracts")}
            role="tab"
            aria-selected={subTab === "contracts"}
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
            onClick={() => changeSubTab("logistics")}
            role="tab"
            aria-selected={subTab === "logistics"}
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

