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
  DollarSign,
  TrendingUp,
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
    paymentTerms?: string;
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
  tradingPolicies?: {
    id: string;
    itemCode: string;
    itemName: string;
    buyCost: string;
    buyCurrency: string;
    marginType: string;
    marginValue: string;
    sellPrice: string;
    sellCurrency: string;
  }[];
  recurringFeeLines?: {
    id: string;
    feeType: string;
    label: string;
    flatAmountUsd: string | null;
    manpowerRatePerHour: string | null;
    manpowerCurrency: string | null;
    isActive: boolean;
  }[];
}

export function ContractRateCards({
  contract,
  rules,
  vmiConfig,
  permit,
  tradingPolicies = [],
  recurringFeeLines = [],
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

  // Strict conditional flags based on contract type
  const isVmi = contract.contractType === "vmi" || contract.contractType === "vmi_trading";
  const isTrading = contract.contractType === "trading" || contract.contractType === "vmi_trading";

  const primaryStorageRule = warehousingRules[0];
  const storageRate = primaryStorageRule ? Number(primaryStorageRule.rate) : 0.05;

  const handlingInRate = handlingInRules[0] ? Number(handlingInRules[0].rate) : 2.0;
  const handlingOutRate = handlingOutRules[0] ? Number(handlingOutRules[0].rate) : 2.0;

  // Existing recurring misc fees from vmi_recurring_fee_lines and pricing_rules
  const suretyBondLine = recurringFeeLines.find((r) => r.feeType === "surety_bond");
  const suretyBondRule = allRules.find((r) => r.chargeCode === "MSC-SURETY-BOND" || r.chargeName.toLowerCase().includes("surety"));
  const suretyBondRate = suretyBondLine?.flatAmountUsd ? Number(suretyBondLine.flatAmountUsd) : suretyBondRule ? Number(suretyBondRule.rate) : 100.0;

  const truckingAdminLine = recurringFeeLines.find((r) => r.feeType === "trucking_admin_fee");
  const truckingAdminRule = allRules.find((r) => r.chargeCode === "MSC-TRK-ADMIN" || r.chargeName.toLowerCase().includes("trucking admin"));
  const truckingAdminRate = truckingAdminLine?.flatAmountUsd ? Number(truckingAdminLine.flatAmountUsd) : truckingAdminRule ? Number(truckingAdminRule.rate) : 50.0;

  const manpowerLine = recurringFeeLines.find((r) => r.feeType === "manpower");
  const manpowerRule = manpowerRules[0];
  const manpowerRate = manpowerLine?.manpowerRatePerHour ? Number(manpowerLine.manpowerRatePerHour) : manpowerRule ? Number(manpowerRule.rate) : 120.0;
  const manpowerCurrency = manpowerLine?.manpowerCurrency || "PHP";

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
            {isVmi && isTrading
              ? `Active VMI storage holding terms and Trading SKU pricing for ${contract.partyName}.`
              : isTrading
              ? `Active Trading SKU sales pricing catalog and commercial margins for ${contract.partyName}.`
              : `Active VMI inventory holding rates, handling fees, and PEZA compliance for ${contract.partyName}.`}
          </p>
        </div>
      </div>

      {/* Conditionally Rendered Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* ─── VMI: Storage & Warehousing (Conditional) ─── */}
        {isVmi && (
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
        )}

        {/* ─── VMI: Handling & Activity Fees (Conditional) ─── */}
        {isVmi && (
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
                      : "$50.00"}{" "}
                    <span className="text-body-xs font-normal text-text-grey">/ mo</span>
                  </span>
                </div>
                <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                  <span className="text-body-xs text-text-grey block">Customs Surety Bond:</span>
                  <span className="font-mono text-mono-md font-bold text-on-surface">
                    ${suretyBondRate.toFixed(2)}{" "}
                    <span className="text-body-xs font-normal text-text-grey">/ mo</span>
                  </span>
                </div>
                <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                  <span className="text-body-xs text-text-grey block">Trucking Admin Fee:</span>
                  <span className="font-mono text-mono-md font-bold text-on-surface">
                    ${truckingAdminRate.toFixed(2)}{" "}
                    <span className="text-body-xs font-normal text-text-grey">/ mo</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 px-3.5 py-2.5 font-body text-body-xs">
              <span className="text-text-grey">Dedicated Warehouse Manpower:</span>
              <span className="font-mono font-bold text-brand-navy">
                {manpowerCurrency === "PHP" ? "₱" : "$"}{manpowerRate.toFixed(2)} / hour{" "}
                <span className="font-normal text-text-grey text-body-xs">(billed per actual log)</span>
              </span>
            </div>
          </div>
        )}

        {/* ─── TRADING: Commercial Terms (Conditional for Trading) ─── */}
        {isTrading && (
          <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 transition-all hover:shadow-elevation-2">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy/10 text-brand-navy">
                    <TrendingUp size={20} />
                  </div>
                  <div>
                    <h3 className="font-heading text-title-sm font-bold text-on-surface">Trading Commercial Terms</h3>
                    <p className="font-body text-body-xs text-text-grey">Landed buy pricing policy and margins</p>
                  </div>
                </div>
                <span className="rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-0.5 font-label text-label-xs font-bold text-emerald-700 uppercase">
                  Active
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 font-body text-body-sm">
                <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                  <span className="text-body-xs text-text-grey block">Payment Terms:</span>
                  <span className="font-body font-bold text-on-surface">{contract.paymentTerms || "Net 30"}</span>
                </div>
                <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                  <span className="text-body-xs text-text-grey block">Trading Currency:</span>
                  <span className="font-mono font-bold text-brand-navy">{contract.currency}</span>
                </div>
                <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                  <span className="text-body-xs text-text-grey block">Price Validity:</span>
                  <span className="font-body font-bold text-on-surface text-body-xs">Fixed per Release (PO)</span>
                </div>
                <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                  <span className="text-body-xs text-text-grey block">Foreign Exchange:</span>
                  <span className="font-body font-bold text-on-surface text-body-xs">BSP Live Daily Rate</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 px-3.5 py-2.5 font-body text-body-xs">
              <span className="text-text-grey">Active Catalog SKUs:</span>
              <span className="font-mono font-bold text-brand-navy">
                {tradingPolicies.length || tradingRules.length} items configured
              </span>
            </div>
          </div>
        )}

        {/* ─── TRADING: Contracted SKU Pricing Catalog (Conditional for Trading) ─── */}
        {isTrading && (
          <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 transition-all hover:shadow-elevation-2">
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy/10 text-brand-navy">
                    <ShoppingCart size={20} />
                  </div>
                  <div>
                    <h3 className="font-heading text-title-sm font-bold text-on-surface">Contracted SKU Catalog</h3>
                    <p className="font-body text-body-xs text-text-grey">Individual item buy costs and selling prices</p>
                  </div>
                </div>
                <span className="font-mono text-mono-xs font-bold text-brand-navy">
                  {tradingPolicies.length} SKUs
                </span>
              </div>

              <div className="space-y-2 font-body text-body-sm">
                {tradingPolicies && tradingPolicies.length > 0 ? (
                  tradingPolicies.slice(0, 3).map((tp) => (
                    <div
                      key={tp.id}
                      className="flex items-center justify-between rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-2.5"
                    >
                      <div>
                        <span className="font-mono font-bold text-on-surface">{tp.itemCode}</span>
                        <p className="text-body-xs text-text-grey truncate max-w-[180px]">{tp.itemName}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-brand-navy">
                          {tp.sellCurrency} {Number(tp.sellPrice).toFixed(2)}
                        </span>
                        <p className="text-body-xs text-text-grey">
                          Cost: ${Number(tp.buyCost).toFixed(2)} ({tp.marginValue}% margin)
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-6 text-center text-text-grey">
                    <FileCheck size={28} className="mx-auto mb-2 opacity-50" />
                    <p className="font-body text-body-sm">No trading SKUs configured yet.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between text-body-xs text-text-grey border-t border-outline-variant/20 pt-3">
              <span>Pricing model: <strong className="text-on-surface">Cost-plus margin</strong></span>
              <span className="font-mono font-bold text-brand-navy">Firm Fixed</span>
            </div>
          </div>
        )}

        {/* ─── VMI: PEZA Compliance & LOA (Conditional for pure VMI) ─── */}
        {isVmi && !isTrading && (
          <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 transition-all hover:shadow-elevation-2">
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
            </div>

            <div className="mt-4 flex items-center justify-between text-body-xs text-text-grey border-t border-outline-variant/20 pt-3">
              <span>Valid: <strong className="text-on-surface">{permit ? `${permit.validFrom} → ${permit.validTo}` : "Current Term"}</strong></span>
              <span className="font-mono text-mono-xs text-text-grey font-semibold">PEZA Bonded Facility</span>
            </div>
          </div>
        )}

        {/* ─── LOGISTICS: Freight & Delivery Matrix (Always present) ─── */}
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
      </div>
    </div>
  );
}
