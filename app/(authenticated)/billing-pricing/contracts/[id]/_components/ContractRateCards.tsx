"use client";

import Link from "next/link";
import {
  Box,
  Truck,
  ShieldCheck,
  ShoppingCart,
  Calculator,
  Layers,
  FileCheck,
  ExternalLink,
  FileText,
} from "lucide-react";
import type { PricingRuleRow } from "./ContractPricingRulesTable";
import { LOGISTICS_RATE_MATRIX } from "@/lib/logistics/rate-matrix";

interface ContractRateCardsProps {
  contract: {
    id: string;
    contractNumber: string;
    partyId: string;
    partyName: string;
    contractType: string;
    status: string;
    currency: string;
    effectiveDate: string;
    expirationDate?: string | null;
  };
  activeVersion?: {
    id?: string;
    versionNumber?: number;
    isActive?: boolean;
  } | null;
  rules: PricingRuleRow[];
  vmiConfig?: {
    minStock?: string | null;
    maxStock?: string | null;
    billingTrigger?: string | null;
    inventoryOwnership?: string | null;
  } | null;
  permit?: {
    id: string;
    permitNumber: string;
    itemScope: string;
    validFrom: string;
    validTo: string;
    monthlyFeeUsd: string;
    isActive: boolean;
  } | null;
}

export function ContractRateCards({
  contract,
  rules,
  vmiConfig,
  permit,
}: ContractRateCardsProps) {
  const allRules = rules || [];
  const warehousingRules = allRules.filter((r) => r.chargeCategory === "warehousing");
  const handlingInRules = allRules.filter((r) => r.chargeCategory === "handling_in");
  const handlingOutRules = allRules.filter((r) => r.chargeCategory === "handling_out");
  const docRules = allRules.filter((r) => r.chargeCategory === "documentation");
  const loaRules = allRules.filter((r) => r.chargeCategory === "loa");
  const manpowerRules = allRules.filter((r) => r.chargeCategory === "manpower");
  const deliveryRules = allRules.filter((r) => r.chargeCategory === "delivery");
  const tradingRules = allRules.filter((r) => r.chargeCategory === "trading");

  const isTrading = contract.contractType === "trading" || contract.contractType === "vmi_trading";
  const primaryStorageRule = warehousingRules[0];
  const storageRate = primaryStorageRule ? Number(primaryStorageRule.rate) : 0.05;

  const handlingInRate = handlingInRules[0] ? Number(handlingInRules[0].rate) : 2.0;
  const handlingOutRate = handlingOutRules[0] ? Number(handlingOutRules[0].rate) : 2.0;

  // Key real destinations from canonical system logistics matrix
  const matrixEntries = Object.values(LOGISTICS_RATE_MATRIX).slice(0, 2);

  return (
    <div className="space-y-6">
      {/* Section Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-title-md font-bold text-on-surface flex items-center gap-2">
            <Layers size={20} className="text-brand-navy" />
            Master Commercial Rate Sheet
          </h2>
          <p className="font-body text-body-sm text-text-grey">
            Active contracted rates and operational charge formulas for {contract.partyName}.
          </p>
        </div>
      </div>

      {/* 4-Card Master Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* CARD 1: Storage & Warehousing */}
        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 transition-all hover:shadow-elevation-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy/10 text-brand-navy">
                  <Box size={20} />
                </div>
                <div>
                  <h3 className="font-heading text-title-sm font-bold text-on-surface">Storage &amp; Warehousing</h3>
                  <p className="font-body text-body-xs text-text-grey">Daily inventory holding rates</p>
                </div>
              </div>
              <span className="rounded-lg bg-brand-navy/10 px-2 py-0.5 font-mono text-mono-xs font-bold text-brand-navy">
                {contract.currency}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 font-body text-body-sm">
              <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                <span className="text-body-xs text-text-grey block">Daily Storage Rate:</span>
                <span className="font-mono text-title-sm font-bold text-brand-navy">
                  ${storageRate.toFixed(4)}{" "}
                  <span className="text-body-xs font-normal text-text-grey">/ CBM / day</span>
                </span>
              </div>
              <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                <span className="text-body-xs text-text-grey block">Min Monthly Commitment:</span>
                <span className="font-mono text-title-sm font-bold text-on-surface">
                  {vmiConfig?.minStock ? `${Number(vmiConfig.minStock).toLocaleString()} CBM` : "None"}
                </span>
              </div>
              <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                <span className="text-body-xs text-text-grey block">Billing Trigger:</span>
                <span className="font-body font-semibold text-on-surface uppercase text-body-xs">
                  {vmiConfig?.billingTrigger === "beginning_of_day"
                    ? "Beginning of Day"
                    : vmiConfig?.billingTrigger?.replace(/_/g, " ") ?? "Monthly Settlement"}
                </span>
              </div>
              <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                <span className="text-body-xs text-text-grey block">Inventory Ownership:</span>
                <span className="font-body font-semibold text-on-surface uppercase text-body-xs">
                  {vmiConfig?.inventoryOwnership?.replace(/_/g, " ") ?? "Supplier Owned"}
                </span>
              </div>
            </div>
          </div>

          {/* Dynamic Formula Preview Badge */}
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-brand-navy/20 bg-brand-navy/5 p-3 font-body text-body-xs text-brand-navy">
            <Calculator size={16} className="shrink-0 text-brand-navy" />
            <span>
              <strong>Formula Preview:</strong> 100 CBM &times; 30 days &times; ${storageRate.toFixed(4)} ={" "}
              <strong>${(100 * 30 * storageRate).toLocaleString("en-US", { minimumFractionDigits: 2 })} / month</strong>
            </span>
          </div>
        </div>

        {/* CARD 2: Handling & Activity Fees */}
        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 transition-all hover:shadow-elevation-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy/10 text-brand-navy">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="font-heading text-title-sm font-bold text-on-surface">Handling &amp; Activity Fees</h3>
                  <p className="font-body text-body-xs text-text-grey">Movement, documentation, and compliance charges</p>
                </div>
              </div>
              <span className="rounded-lg bg-brand-navy/10 px-2 py-0.5 font-mono text-mono-xs font-bold text-brand-navy">
                {contract.currency}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 font-body text-body-sm">
              <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                <span className="text-body-xs text-text-grey block">Handling IN (Receiving):</span>
                <span className="font-mono text-mono-md font-bold text-on-surface">
                  ${handlingInRate.toFixed(2)}{" "}
                  <span className="text-body-xs font-normal text-text-grey">
                    / {handlingInRules[0]?.billingBasis?.replace(/_/g, " ") || "m³"}
                  </span>
                </span>
              </div>
              <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                <span className="text-body-xs text-text-grey block">Handling OUT (Picking):</span>
                <span className="font-mono text-mono-md font-bold text-on-surface">
                  ${handlingOutRate.toFixed(2)}{" "}
                  <span className="text-body-xs font-normal text-text-grey">
                    / {handlingOutRules[0]?.billingBasis?.replace(/_/g, " ") || "m³"}
                  </span>
                </span>
              </div>
              <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                <span className="text-body-xs text-text-grey block">Documentation Fee:</span>
                <span className="font-mono text-mono-md font-bold text-on-surface">
                  ${docRules[0] ? Number(docRules[0].rate).toFixed(2) : "15.00"}{" "}
                  <span className="text-body-xs font-normal text-text-grey">/ AR</span>
                </span>
              </div>
              <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                <span className="text-body-xs text-text-grey block">LOA Monthly Permit:</span>
                <span className="font-mono text-mono-md font-bold text-on-surface">
                  {permit
                    ? `$${Number(permit.monthlyFeeUsd).toFixed(2)}`
                    : loaRules[0]
                    ? `$${Number(loaRules[0].rate).toFixed(2)}`
                    : "None"}{" "}
                  <span className="text-body-xs font-normal text-text-grey">
                    {permit || loaRules[0] ? "/ mo" : ""}
                  </span>
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 px-3.5 py-2.5 font-body text-body-xs">
            <span className="text-text-grey">Overtime / Ad-hoc Manpower:</span>
            <span className="font-mono font-bold text-brand-navy">
              {manpowerRules[0] ? `$${Number(manpowerRules[0].rate).toFixed(2)} / man-hour` : "Per approved rate"}
            </span>
          </div>
        </div>

        {/* CARD 3: Logistics & Delivery Matrix */}
        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 transition-all hover:shadow-elevation-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy/10 text-brand-navy">
                  <Truck size={20} />
                </div>
                <div>
                  <h3 className="font-heading text-title-sm font-bold text-on-surface">Freight &amp; Delivery Matrix</h3>
                  <p className="font-body text-body-xs text-text-grey">Fleet transport and delivery dispatch rates</p>
                </div>
              </div>
              <span className="rounded-lg bg-brand-navy/10 px-2 py-0.5 font-mono text-mono-xs font-bold text-brand-navy">
                PHP (₱)
              </span>
            </div>

            {/* Standard destination routes from matrix */}
            <div className="space-y-2 font-body text-body-sm">
              {matrixEntries.map((m) => {
                const defaultVehicle = m.defaultVehicle;
                const defaultRate = m.rates[defaultVehicle] ?? 0;
                return (
                  <div
                    key={m.destination}
                    className="flex items-center justify-between rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-2.5"
                  >
                    <div>
                      <span className="font-semibold text-on-surface">{m.destination}</span>
                      <p className="text-body-xs text-text-grey">Standard {defaultVehicle} Route</p>
                    </div>
                    <span className="font-mono font-bold text-brand-navy">
                      ₱{defaultRate.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-body-xs text-text-grey border-t border-outline-variant/20 pt-3">
            <span>Customer Pick-up: <strong className="text-emerald-700">₱0.00 (Free)</strong></span>
            <Link
              href="/billing-pricing?tab=configuration&subtab=logistics"
              className="inline-flex items-center gap-1 font-label text-label-xs font-bold text-brand-navy hover:underline"
            >
              <span>View Master Logistics Matrix</span>
              <ExternalLink size={12} />
            </Link>
          </div>
        </div>

        {/* CARD 4: Trading Catalog OR PEZA Compliance & Permits */}
        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 transition-all hover:shadow-elevation-2">
          {isTrading ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy/10 text-brand-navy">
                    <ShoppingCart size={20} />
                  </div>
                  <div>
                    <h3 className="font-heading text-title-sm font-bold text-on-surface">Trading Pricing Catalog</h3>
                    <p className="font-body text-body-xs text-text-grey">Contracted SKU selling prices &amp; margins</p>
                  </div>
                </div>
                <span className="rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-0.5 font-label text-label-xs font-bold text-emerald-700 uppercase">
                  Active
                </span>
              </div>

              <div className="space-y-2.5 font-body text-body-sm">
                <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-on-surface">Contracted Trading SKUs</span>
                      <p className="text-body-xs text-text-grey">Configured selling prices and landed margin rates</p>
                    </div>
                    <span className="font-mono font-bold text-brand-navy">
                      {tradingRules.length} SKUs configured
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-body-xs text-text-grey border-t border-outline-variant/20 pt-3">
                <span>Foreign Exchange: <strong className="text-on-surface">BSP Live Daily Rate</strong></span>
                <Link
                  href="/billing-pricing?tab=configuration&subtab=trading-rates"
                  className="inline-flex items-center gap-1 font-label text-label-xs font-bold text-brand-navy hover:underline"
                >
                  <span>Manage Trading Cards</span>
                  <ExternalLink size={12} />
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy/10 text-brand-navy">
                    <FileText size={20} />
                  </div>
                  <div>
                    <h3 className="font-heading text-title-sm font-bold text-on-surface">PEZA Compliance &amp; LOA</h3>
                    <p className="font-body text-body-xs text-text-grey">Bonded warehouse regulatory permits and scope</p>
                  </div>
                </div>
                <span
                  className={`rounded-lg border px-2 py-0.5 font-label text-label-xs font-bold uppercase ${
                    permit
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-surface-light-grey border-outline-variant/30 text-text-grey"
                  }`}
                >
                  {permit ? "Permit Active" : "PEZA Standard"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 font-body text-body-sm">
                <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3 col-span-2">
                  <span className="text-body-xs text-text-grey block">Permit / Authorization Number:</span>
                  <span className="font-mono text-mono-md font-bold text-on-surface">
                    {permit?.permitNumber ?? "ELSE-PEZA-STANDARD-BOND"}
                  </span>
                </div>
                <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                  <span className="text-body-xs text-text-grey block">Bonded Goods Scope:</span>
                  <span className="font-body font-semibold text-on-surface text-body-xs truncate block">
                    {permit?.itemScope ?? "Bonded VMI Inventory"}
                  </span>
                </div>
                <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                  <span className="text-body-xs text-text-grey block">Monthly LOA Fee:</span>
                  <span className="font-mono text-mono-md font-bold text-brand-navy">
                    {permit ? `$${Number(permit.monthlyFeeUsd).toFixed(2)}` : "$50.00"}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-body-xs text-text-grey border-t border-outline-variant/20 pt-3">
                <span>Valid: <strong className="text-on-surface">{permit ? `${permit.validFrom} → ${permit.validTo}` : "Current Term"}</strong></span>
                <Link
                  href={`/billing-pricing/vmi/permits/${contract.partyId}`}
                  className="inline-flex items-center gap-1 font-label text-label-xs font-bold text-brand-navy hover:underline"
                >
                  <span>Manage LOA &amp; Permits</span>
                  <ExternalLink size={12} />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
