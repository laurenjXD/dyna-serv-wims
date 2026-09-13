"use client";

import React, { useState } from "react";
import Link from "next/link";
import { FileText, Plus, Tag, Truck } from "lucide-react";
import { VmiContractTermsTable } from "./VmiContractTermsTable";
import { LogisticsRateMatrixTable } from "./LogisticsRateMatrixTable";
import { TradingRateCardsTable } from "./TradingRateCardsTable";
import { ContractTableClient, type ContractItem } from "../contracts/_components/ContractTableClient";
import type { VmiContractTermsRow } from "@/lib/db/queries/vmi-contracts";
import type { TradingPolicyRow } from "@/lib/db/queries/trading-policies";

interface ConfigurationTabProps {
  contractRows: VmiContractTermsRow[];
  parties: { id: string; name: string; code: string }[];
  contracts: ContractItem[];
  policyRows: TradingPolicyRow[];
  items: { id: string; name: string; code: string }[];
}

export function ConfigurationTab({
  contractRows,
  parties,
  contracts,
  policyRows,
  items,
}: ConfigurationTabProps) {
  const [subTab, setSubTab] = useState<"contracts" | "trading-rates" | "logistics">("contracts");
  const [contractView, setContractView] = useState<"master" | "storage">("master");

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
            <FileText size={16} /> Commercial Contracts &amp; Terms
          </button>
          <button
            type="button"
            onClick={() => setSubTab("trading-rates")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 font-label text-label font-bold transition-colors ${
              subTab === "trading-rates"
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
        <div className="space-y-5">
          <div className="flex flex-col gap-4 rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-heading text-title-lg font-bold text-on-surface">
                Commercial Contracts &amp; Master Rate Cards
              </h2>
              <p className="mt-1 font-body text-body-sm text-text-grey">
                Manage customer agreements, dynamic pricing policies, VMI storage terms, and LOA regulatory permits.
              </p>
            </div>
            <Link
              href="/billing-pricing/contracts/new"
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-brand-navy px-4 font-label text-label font-bold text-white transition-colors hover:bg-brand-navy/90"
            >
              <Plus size={16} /> New Contract
            </Link>
          </div>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Commercial contract views">
            <button
              type="button"
              onClick={() => setContractView("master")}
              className={`rounded-full px-4 py-2 font-label text-body-sm font-semibold transition-colors ${
                contractView === "master"
                  ? "bg-brand-navy text-white"
                  : "border border-outline-variant/30 bg-surface-white text-text-grey hover:bg-surface-light-grey"
              }`}
            >
              Contracts Master
            </button>
            <button
              type="button"
              onClick={() => setContractView("storage")}
              className={`rounded-full px-4 py-2 font-label text-body-sm font-semibold transition-colors ${
                contractView === "storage"
                  ? "bg-brand-navy text-white"
                  : "border border-outline-variant/30 bg-surface-white text-text-grey hover:bg-surface-light-grey"
              }`}
            >
              Storage &amp; Handling Matrix
            </button>
          </div>

          {contractView === "master" ? (
            <ContractTableClient initialContracts={contracts} />
          ) : (
            <VmiContractTermsTable rows={contractRows} parties={parties} />
          )}
        </div>
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
