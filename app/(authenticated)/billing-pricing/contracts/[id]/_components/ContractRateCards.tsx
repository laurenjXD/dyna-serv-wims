"use client";

import { Box, Truck, ShieldCheck, ShoppingCart, Calculator, ArrowRight, Layers, FileCheck } from "lucide-react";
import type { PricingRuleRow } from "./ContractPricingRulesTable";

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
}

export function ContractRateCards({ contract, rules, vmiConfig }: ContractRateCardsProps) {
  // Extract specific category rules
  const allRules = rules || [];
  const warehousingRules = allRules.filter((r: PricingRuleRow) => r.chargeCategory === "warehousing");
  const handlingInRules = allRules.filter((r: PricingRuleRow) => r.chargeCategory === "handling_in");
  const handlingOutRules = allRules.filter((r: PricingRuleRow) => r.chargeCategory === "handling_out");
  const docRules = allRules.filter((r: PricingRuleRow) => r.chargeCategory === "documentation");
  const loaRules = allRules.filter((r: PricingRuleRow) => r.chargeCategory === "loa");
  const manpowerRules = allRules.filter((r: PricingRuleRow) => r.chargeCategory === "manpower");
  const deliveryRules = allRules.filter((r: PricingRuleRow) => r.chargeCategory === "delivery");
  const tradingRules = allRules.filter((r: PricingRuleRow) => r.chargeCategory === "trading");

  const isTrading = contract.contractType === "trading" || contract.contractType === "vmi_trading";
  const primaryStorageRule = warehousingRules[0];
  const storageRate = primaryStorageRule ? Number(primaryStorageRule.rate) : 0.85;

  return (
    <div className="space-y-6">
      {/* ── Section Title ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-title-md font-bold text-on-surface flex items-center gap-2">
            <Layers size={20} className="text-brand-navy" />
            Master Commercial Rate Sheet
          </h2>
          <p className="font-body text-body-sm text-text-grey">
            Active contracted rates and operational charge formulas governed by Version 1.
          </p>
        </div>
      </div>

      {/* ── 4-Card Master Grid ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* ── CARD 1: Storage & Warehousing ──────────────────────────── */}
        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 transition-all hover:shadow-elevation-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy/10 text-brand-navy">
                  <Box size={20} />
                </div>
                <div>
                  <h3 className="font-heading text-title-sm font-bold text-on-surface">Storage &amp; Warehousing</h3>
                  <p className="font-body text-body-xs text-text-grey">Daily CBM inventory holding rates</p>
                </div>
              </div>
              <span className="rounded-lg bg-brand-navy/10 px-2 py-0.5 font-mono text-mono-xs font-bold text-brand-navy">
                {contract.currency}
              </span>
            </div>

            {/* Key Value Pairs */}
            <div className="grid grid-cols-2 gap-3 font-body text-body-sm">
              <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                <span className="text-body-xs text-text-grey block">Daily Storage Rate:</span>
                <span className="font-mono text-title-sm font-bold text-brand-navy">
                  ${storageRate.toFixed(4)} <span className="text-body-xs font-normal text-text-grey">/ CBM / day</span>
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
                  {vmiConfig?.billingTrigger?.replace("_", " ") ?? "Monthly Settlement"}
                </span>
              </div>
              <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                <span className="text-body-xs text-text-grey block">Inventory Ownership:</span>
                <span className="font-body font-semibold text-on-surface uppercase text-body-xs">
                  {vmiConfig?.inventoryOwnership?.replace("_", " ") ?? "Supplier Owned"}
                </span>
              </div>
            </div>
          </div>

          {/* Live Formula Preview Badge */}
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-brand-navy/20 bg-brand-navy/5 p-3 font-body text-body-xs text-brand-navy">
            <Calculator size={16} className="shrink-0 text-brand-navy" />
            <span>
              <strong>Formula Preview:</strong> 100 CBM &times; 30 days &times; ${storageRate.toFixed(4)} ={" "}
              <strong>${(100 * 30 * storageRate).toLocaleString("en-US", { minimumFractionDigits: 2 })} / month</strong>
            </span>
          </div>
        </div>

        {/* ── CARD 2: Handling & Service Operations ───────────────────── */}
        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 transition-all hover:shadow-elevation-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy/10 text-brand-navy">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="font-heading text-title-sm font-bold text-on-surface">Handling &amp; Activity Fees</h3>
                  <p className="font-body text-body-xs text-text-grey">Per-movement and administrative charges</p>
                </div>
              </div>
              <span className="rounded-lg bg-brand-navy/10 px-2 py-0.5 font-mono text-mono-xs font-bold text-brand-navy">
                {contract.currency}
              </span>
            </div>

            {/* Key Value Pairs */}
            <div className="grid grid-cols-2 gap-3 font-body text-body-sm">
              <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                <span className="text-body-xs text-text-grey block">Handling IN (Receiving):</span>
                <span className="font-mono text-mono-md font-bold text-on-surface">
                  ${handlingInRules[0] ? Number(handlingInRules[0].rate).toFixed(4) : "0.0500"}{" "}
                  <span className="text-body-xs font-normal text-text-grey">/ box</span>
                </span>
              </div>
              <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                <span className="text-body-xs text-text-grey block">Handling OUT (Dispatch):</span>
                <span className="font-mono text-mono-md font-bold text-on-surface">
                  ${handlingOutRules[0] ? Number(handlingOutRules[0].rate).toFixed(4) : "0.0500"}{" "}
                  <span className="text-body-xs font-normal text-text-grey">/ box</span>
                </span>
              </div>
              <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                <span className="text-body-xs text-text-grey block">Documentation Fee:</span>
                <span className="font-mono text-mono-md font-bold text-on-surface">
                  ${docRules[0] ? Number(docRules[0].rate).toFixed(2) : "15.00"}{" "}
                  <span className="text-body-xs font-normal text-text-grey">/ shipment</span>
                </span>
              </div>
              <div className="rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-3">
                <span className="text-body-xs text-text-grey block">LOA Monthly Permit:</span>
                <span className="font-mono text-mono-md font-bold text-on-surface">
                  ${loaRules[0] ? Number(loaRules[0].rate).toFixed(2) : "50.00"}{" "}
                  <span className="text-body-xs font-normal text-text-grey">/ mo</span>
                </span>
              </div>
            </div>
          </div>

          {/* Manpower Rate Footer Note */}
          <div className="mt-4 flex items-center justify-between rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 px-3.5 py-2.5 font-body text-body-xs">
            <span className="text-text-grey">Overtime / Ad-hoc Manpower:</span>
            <span className="font-mono font-bold text-brand-navy">
              ${manpowerRules[0] ? Number(manpowerRules[0].rate).toFixed(2) : "12.50"} / man-hour
            </span>
          </div>
        </div>

        {/* ── CARD 3: Logistics & Freight Matrix ──────────────────────── */}
        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 transition-all hover:shadow-elevation-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy/10 text-brand-navy">
                  <Truck size={20} />
                </div>
                <div>
                  <h3 className="font-heading text-title-sm font-bold text-on-surface">Freight &amp; Delivery Matrix</h3>
                  <p className="font-body text-body-xs text-text-grey">Standard vehicle run rates by destination</p>
                </div>
              </div>
              <span className="rounded-lg bg-brand-navy/10 px-2 py-0.5 font-mono text-mono-xs font-bold text-brand-navy">
                PHP (₱)
              </span>
            </div>

            {/* Delivery Routes Summary */}
            <div className="space-y-2 font-body text-body-sm">
              <div className="flex items-center justify-between rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-2.5">
                <div>
                  <span className="font-semibold text-on-surface">Plant 1 (Laguna Technopark)</span>
                  <p className="text-body-xs text-text-grey">Standard 4-Wheeler Route</p>
                </div>
                <span className="font-mono font-bold text-brand-navy">₱2,800.00</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-2.5">
                <div>
                  <span className="font-semibold text-on-surface">Plant 2 (FPIP Sto. Tomas)</span>
                  <p className="text-body-xs text-text-grey">Forward 6-Wheeler Route</p>
                </div>
                <span className="font-mono font-bold text-brand-navy">₱4,500.00</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-body-xs text-text-grey">
            <span>Customer Pick-up: <strong className="text-emerald-700">₱0.00 (Free)</strong></span>
            <span>{deliveryRules.length} custom matrix overrides</span>
          </div>
        </div>

        {/* ── CARD 4: Trading Pricing Catalog ─────────────────────────── */}
        <div className="flex flex-col justify-between rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 transition-all hover:shadow-elevation-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-outline-variant/20 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy/10 text-brand-navy">
                  <ShoppingCart size={20} />
                </div>
                <div>
                  <h3 className="font-heading text-title-sm font-bold text-on-surface">Trading Pricing Catalog</h3>
                  <p className="font-body text-body-xs text-text-grey">
                    {isTrading ? "Contracted SKU selling prices & margins" : "Not applicable for pure VMI contracts"}
                  </p>
                </div>
              </div>
              {isTrading && (
                <span className="rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-0.5 font-label text-label-xs font-bold text-emerald-700 uppercase">
                  Active
                </span>
              )}
            </div>

            {isTrading ? (
              <div className="space-y-2.5 font-body text-body-sm">
                <div className="flex items-center justify-between rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-2.5">
                  <div>
                    <span className="font-mono font-bold text-on-surface">SAMPLE-ITEM-001</span>
                    <p className="text-body-xs text-text-grey">Landed Buy Cost: $1.2000 (15% Margin)</p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-brand-navy">₱82.50</span>
                    <p className="text-body-xs text-text-grey">MOQ: 500 pcs</p>
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-xl border border-outline-variant/20 bg-surface-light-grey/40 p-2.5">
                  <div>
                    <span className="font-mono font-bold text-on-surface">SAMPLE-ITEM-002</span>
                    <p className="text-body-xs text-text-grey">Landed Buy Cost: $3.5000 (18% Margin)</p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-brand-navy">₱245.00</span>
                    <p className="text-body-xs text-text-grey">MOQ: 250 pcs</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-6 text-center text-text-grey">
                <FileCheck size={32} className="text-text-grey/60 mb-2" />
                <p className="font-body text-body-sm">
                  This contract is pure VMI. Trading SKU pricing policies do not apply.
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between text-body-xs text-text-grey">
            <span>Foreign Exchange: <strong className="text-on-surface">BSP Live Daily Rate</strong></span>
            <span>{tradingRules.length} SKUs configured</span>
          </div>
        </div>
      </div>
    </div>
  );
}
