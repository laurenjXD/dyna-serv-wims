"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Sliders, Plus, Search, Filter } from "lucide-react";
import type { ContractDetailResult } from "@/lib/actions/contracts";

export interface PricingRuleRow {
  id: string;
  chargeName: string;
  chargeCode: string;
  chargeCategory: string;
  billingBasis: string;
  rate: string;
  minCharge?: string | null;
  maxCharge?: string | null;
  priority?: number | null;
}

interface ContractPricingRulesTableProps {
  contractId: string;
  rules: PricingRuleRow[];
  currency: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  warehousing: "bg-blue-50 text-blue-700 border-blue-200",
  handling_in: "bg-emerald-50 text-emerald-700 border-emerald-200",
  handling_out: "bg-teal-50 text-teal-700 border-teal-200",
  delivery: "bg-indigo-50 text-indigo-700 border-indigo-200",
  documentation: "bg-purple-50 text-purple-700 border-purple-200",
  loa: "bg-amber-50 text-amber-700 border-amber-200",
  manpower: "bg-rose-50 text-rose-700 border-rose-200",
  trading: "bg-orange-50 text-orange-700 border-orange-200",
  other: "bg-slate-50 text-slate-700 border-slate-200",
};

export function ContractPricingRulesTable({ contractId, rules, currency }: ContractPricingRulesTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const filteredRules = useMemo(() => {
    return (rules || []).filter((r: PricingRuleRow) => {
      const matchesSearch =
        searchQuery === "" ||
        r.chargeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.chargeCode.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCat = selectedCategory === "all" || r.chargeCategory === selectedCategory;

      return matchesSearch && matchesCat;
    });
  }, [rules, searchQuery, selectedCategory]);

  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-1 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant/20 pb-4">
        <div>
          <h3 className="font-heading text-title-md font-bold text-on-surface flex items-center gap-2">
            <Sliders size={20} className="text-brand-navy" />
            Configured Dynamic Pricing Rules
          </h3>
          <p className="font-body text-body-sm text-text-grey">
            Detailed rate card line items, priority order, and calculation overrides.
          </p>
        </div>

        <Link
          href={`/billing-pricing/contracts/${contractId}/rules/new`}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-brand-navy/20 bg-brand-navy/5 px-3.5 font-label text-label font-bold text-brand-navy hover:bg-brand-navy/10 transition-colors"
        >
          <Plus size={14} /> Add Rule
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-grey" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter rule name or code…"
            className="h-10 w-full rounded-xl border border-outline-variant/40 bg-surface-light-grey/40 pl-10 pr-4 font-body text-body-sm focus:border-brand-navy focus:bg-surface-white focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={15} className="text-text-grey" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="h-10 rounded-xl border border-outline-variant/40 bg-surface-white px-3 font-label text-label font-bold text-on-surface focus:border-brand-navy focus:outline-none"
          >
            <option value="all">All Categories</option>
            <option value="warehousing">Warehousing</option>
            <option value="handling_in">Handling IN</option>
            <option value="handling_out">Handling OUT</option>
            <option value="delivery">Delivery</option>
            <option value="documentation">Documentation</option>
            <option value="loa">LOA Permit</option>
            <option value="manpower">Manpower</option>
            <option value="trading">Trading</option>
          </select>
        </div>
      </div>

      {/* Rules Table */}
      <div className="overflow-hidden rounded-xl border border-outline-variant/30">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left font-body text-body-sm">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-light-grey text-text-grey font-label text-label-xs uppercase tracking-wider">
                <th className="px-4 py-3">Rule &amp; Code</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Basis</th>
                <th className="px-4 py-3 text-right">Rate</th>
                <th className="px-4 py-3 text-right">Min Charge</th>
                <th className="px-4 py-3 text-center">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              {filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-text-grey font-body text-body-sm">
                    No pricing rules match your search or filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRules.map((r: PricingRuleRow) => {
                  const catClass = CATEGORY_COLORS[r.chargeCategory] ?? "bg-slate-50 text-slate-700 border-slate-200";

                  return (
                    <tr key={r.id} className="hover:bg-surface-light-grey/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-on-surface">{r.chargeName}</div>
                        <div className="font-mono text-mono-xs text-text-grey">{r.chargeCode}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-lg border px-2.5 py-0.5 font-label text-label-xs font-bold uppercase ${catClass}`}>
                          {r.chargeCategory.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-label text-label-xs uppercase font-medium text-text-grey">
                        {r.billingBasis.replace("_", " ")}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-brand-navy">
                        {currency} {Number(r.rate).toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-text-grey">
                        {r.minCharge ? `${currency} ${Number(r.minCharge).toFixed(2)}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-mono-xs font-bold text-on-surface">
                        {r.priority ?? 10}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
