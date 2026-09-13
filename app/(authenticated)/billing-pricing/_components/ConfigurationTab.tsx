"use client";

import React, { useState } from "react";
import Link from "next/link";
import { FileText, Truck, Tag, Plus } from "lucide-react";
import { VmiContractTermsTable } from "./VmiContractTermsTable";
import { LogisticsRateMatrixTable } from "./LogisticsRateMatrixTable";
import { TradingRateCardsTable } from "./TradingRateCardsTable";
import { ContractTableClient, type ContractItem } from "../contracts/_components/ContractTableClient";
import type { VmiContractTermsRow } from "@/lib/db/queries/vmi-contracts";
import type { TradingPolicyRow } from "@/lib/db/queries/trading-policies";

interface ConfigurationTabProps {
  contracts?: ContractItem[];
  contractRows: VmiContractTermsRow[];
  parties: { id: string; name: string; code: string }[];
  policyRows?: TradingPolicyRow[];
  items?: { id: string; name: string; code: string }[];
}

export function ConfigurationTab({
  contracts = [],
  contractRows,
  parties,
  policyRows = [],
  items = [],
}: ConfigurationTabProps) {
  const [subTab, setSubTab] = useState<"contracts" | "trading-rates" | "logistics">("contracts");
  const [contractViewMode, setContractViewMode] = useState<"master" | "matrix">("master");

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
              <FileText size={16} /> Commercial Contracts &amp; Terms
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

      {/* Sub-tab 1: Commercial Contracts */}
      {subTab === "contracts" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
            <div>
              <h2 className="font-heading text-title-md font-bold text-on-surface flex items-center gap-2">
                <FileText size={20} className="text-brand-navy" />
                Commercial Contracts &amp; Master Rate Cards
              </h2>
              <p className="mt-1 font-body text-body-sm text-text-grey">
                Customer rate agreements, dynamic pricing policies, VMI storage terms, and LOA regulatory permits.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-lg border border-outline-variant/30 p-0.5 bg-surface-light-grey/60">
                <button
                  type="button"
                  onClick={() => setContractViewMode("master")}
                  className={`px-3 py-1.5 font-label text-label-xs font-bold rounded-md transition-colors ${
                    contractViewMode === "master"
                      ? "bg-surface-white text-brand-navy shadow-2xs"
                      : "text-text-grey hover:text-on-surface"
                  }`}
                >
                  Contracts Master
                </button>
                <button
                  type="button"
                  onClick={() => setContractViewMode("matrix")}
                  className={`px-3 py-1.5 font-label text-label-xs font-bold rounded-md transition-colors ${
                    contractViewMode === "matrix"
                      ? "bg-surface-white text-brand-navy shadow-2xs"
                      : "text-text-grey hover:text-on-surface"
                  }`}
                >
                  Storage &amp; Handling Matrix
                </button>
              </div>

              <Link
                href="/billing-pricing/contracts/new"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-navy px-4 font-label text-label font-bold text-white shadow-2xs hover:bg-brand-navy/90 transition-colors"
              >
                <Plus size={16} />
                <span>New Contract</span>
              </Link>
            </div>
          </div>

          {contractViewMode === "master" ? (
            <ContractTableClient initialContracts={contracts} />
          ) : (
            <VmiContractTermsTable rows={contractRows} parties={parties} />
          )}
        </div>
      )}

      {/* Sub-tab 2: Trading Rate Cards */}
      {subTab === "trading-rates" && (
        <TradingRateCardsTable rows={policyRows} parties={parties} items={items} />
      )}

      {/* Sub-tab 3: Logistics & Delivery Matrix (kept 100% intact) */}
      {subTab === "logistics" && (
        <LogisticsRateMatrixTable />
      )}
    </div>
  );
}
