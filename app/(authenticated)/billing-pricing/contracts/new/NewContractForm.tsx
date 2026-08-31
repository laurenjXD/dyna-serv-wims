"use client";

import { useState } from "react";
import Link from "next/link";
import { Save } from "lucide-react";

interface Organization {
  id: string;
  name: string;
  code: string;
}

interface NewContractFormProps {
  partiesList: Organization[];
  onSubmitAction: (formData: FormData) => Promise<void>;
}

export function NewContractForm({ partiesList, onSubmitAction }: NewContractFormProps) {
  const [contractType, setContractType] = useState<"vmi_trading" | "vmi" | "trading">("vmi_trading");

  const showVmi = contractType === "vmi" || contractType === "vmi_trading";
  const showTrading = contractType === "trading" || contractType === "vmi_trading";

  return (
    <form action={onSubmitAction} className="space-y-6 rounded-card bg-surface-white border border-border-light p-6 shadow-card">
      {/* Basic Contract Header */}
      <div className="space-y-4">
        <h2 className="font-heading text-heading-sm font-bold text-text-dark border-b border-border-light pb-2">
          1. General Contract Header
        </h2>

        <div>
          <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
            Organization (Customer / Principal)
          </label>
          <select
            name="partyId"
            required
            onChange={(e) => {
              const selectedId = e.target.value;
              if (selectedId) {
                const party = partiesList.find((p) => p.id === selectedId);
                if (party?.code.includes("UPI") || party?.name.toLowerCase().includes("vmi")) {
                  setContractType("vmi");
                } else if (party?.name.toLowerCase().includes("trading")) {
                  setContractType("trading");
                } else {
                  setContractType("vmi_trading");
                }
              }
            }}
            className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm"
          >
            <option value="">Select an Organization...</option>
            {partiesList.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
          <p className="mt-1 font-body text-body-xs text-brand-navy">
            Selecting an organization inherits their business roles and default inventory model (VMI / Trading / Supplies).
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
              Contract Number
            </label>
            <input
              type="text"
              name="contractNumber"
              required
              placeholder="e.g. DSGC-VMI-2026-001"
              className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
            />
          </div>

          <div>
            <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
              Contract Type
            </label>
            <select
              name="contractType"
              value={contractType}
              onChange={(e) => setContractType(e.target.value as "vmi_trading" | "vmi" | "trading")}
              className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-semibold text-brand-blue"
            >
              <option value="vmi_trading">VMI + Trading (Combined)</option>
              <option value="vmi">VMI Only</option>
              <option value="trading">Trading Only</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
              Effective Date
            </label>
            <input
              type="date"
              name="effectiveDate"
              required
              defaultValue={new Date().toISOString().split("T")[0]}
              className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
            />
          </div>

          <div>
            <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
              Expiration Date (Optional)
            </label>
            <input
              type="date"
              name="expirationDate"
              className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
              Currency
            </label>
            <select
              name="currency"
              className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
            >
              <option value="USD">USD ($)</option>
              <option value="PHP">PHP (₱)</option>
            </select>
          </div>

          <div>
            <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
              Exchange Rate Policy
            </label>
            <select
              name="exchangeRatePolicy"
              className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm"
            >
              <option value="monthly_rate">Monthly Locked Rate</option>
              <option value="fixed_contract_rate">Fixed Contract Rate</option>
              <option value="daily_rate">Daily Forex Rate</option>
              <option value="manual_approved_rate">Manual Approved Rate</option>
            </select>
          </div>

          <div>
            <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
              Payment Terms
            </label>
            <input
              type="text"
              name="paymentTerms"
              defaultValue="Net 30"
              className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm"
            />
          </div>
        </div>

        <div>
          <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
            Warehouses Covered
          </label>
          <input
            type="text"
            name="warehousesCovered"
            defaultValue="Main Warehouse"
            className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm"
          />
        </div>
      </div>

      {/* Conditional Section A: VMI Terms & Policy Configuration */}
      {showVmi && (
        <div className="space-y-4 pt-4 border-t border-border-light bg-surface-background/30 p-4 rounded-card">
          <div className="flex items-center justify-between border-b border-border-light pb-2">
            <h2 className="font-heading text-heading-sm font-bold text-brand-blue flex items-center">
              2. VMI Storage Policy &amp; Rate Terms Configuration
            </h2>
            <span className="text-body-xs font-mono font-semibold px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded">
              VMI Policy Active
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Inventory Ownership
              </label>
              <select
                name="vmiOwnership"
                defaultValue="supplier_owned"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm"
              >
                <option value="supplier_owned">Supplier Owned (VMI Standard)</option>
                <option value="customer_owned">Customer Owned</option>
                <option value="warehouse_owned">Warehouse Owned</option>
              </select>
            </div>

            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Billing Trigger Event
              </label>
              <select
                name="vmiBillingTrigger"
                defaultValue="upon_consumption"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm"
              >
                <option value="upon_consumption">Upon Consumption / Release</option>
                <option value="upon_receipt">Upon Receipt (WRR)</option>
                <option value="upon_dispatch">Upon Dispatch</option>
                <option value="upon_customer_confirmation">Upon Customer Confirmation</option>
                <option value="monthly_settlement">Monthly Settlement</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Storage Rate ($ / CBM / Day)
              </label>
              <input
                type="number"
                step="0.0001"
                name="storageRatePerCbmDay"
                defaultValue="0.0500"
                placeholder="0.05"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
              />
            </div>

            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Handling IN Rate ($ / CBM)
              </label>
              <input
                type="number"
                step="0.0001"
                name="handlingInRatePerCbm"
                defaultValue="2.0000"
                placeholder="2.00"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
              />
            </div>

            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Handling OUT Rate ($ / CBM)
              </label>
              <input
                type="number"
                step="0.0001"
                name="handlingOutRatePerCbm"
                defaultValue="2.0000"
                placeholder="2.00"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                LOA Permit Number (Optional)
              </label>
              <input
                type="text"
                name="loaPermitNumber"
                placeholder="e.g. LOA-2026-889"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
              />
            </div>

            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                LOA Monthly Rate ($ / Month)
              </label>
              <input
                type="number"
                step="0.01"
                name="loaMonthlyRate"
                defaultValue="150.00"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Min Stock Level
              </label>
              <input
                type="number"
                step="1"
                name="minStock"
                placeholder="100"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
              />
            </div>

            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Max Stock Level
              </label>
              <input
                type="number"
                step="1"
                name="maxStock"
                placeholder="1000"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
              />
            </div>

            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Reorder Point
              </label>
              <input
                type="number"
                step="1"
                name="reorderPoint"
                placeholder="250"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
              />
            </div>
          </div>
        </div>
      )}

      {/* Conditional Section B: Trading Pricing & Policy Configuration */}
      {showTrading && (
        <div className="space-y-4 pt-4 border-t border-border-light bg-surface-background/30 p-4 rounded-card">
          <div className="flex items-center justify-between border-b border-border-light pb-2">
            <h2 className="font-heading text-heading-sm font-bold text-brand-blue flex items-center">
              3. Trading Pricing &amp; Margin Policy Configuration
            </h2>
            <span className="text-body-xs font-mono font-semibold px-2 py-0.5 bg-brand-blue/10 text-brand-blue rounded">
              Trading Policy Active
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Default Supplier Cost ($)
              </label>
              <input
                type="number"
                step="0.01"
                name="supplierCost"
                placeholder="10.00"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
              />
            </div>

            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Default Selling Price ($)
              </label>
              <input
                type="number"
                step="0.01"
                name="sellingPrice"
                placeholder="14.00"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Markup Type
              </label>
              <select
                name="markupType"
                defaultValue="percentage"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm"
              >
                <option value="percentage">Percentage Markup (%)</option>
                <option value="fixed_amount">Fixed Amount per Unit ($)</option>
                <option value="fixed_selling_price">Fixed Selling Price ($)</option>
              </select>
            </div>

            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Markup Value
              </label>
              <input
                type="number"
                step="0.01"
                name="markupValue"
                placeholder="15.00"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
              />
            </div>

            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Min Order Quantity (MOQ)
              </label>
              <input
                type="number"
                step="1"
                name="minOrderQuantity"
                placeholder="50"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
              />
            </div>
          </div>
        </div>
      )}

      {/* Notes & Actions */}
      <div>
        <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
          Notes / Commercial Terms
        </label>
        <textarea
          name="notes"
          rows={3}
          placeholder="Additional commercial contract notes..."
          className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm"
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Link
          href="/billing-pricing/contracts"
          className="rounded-btn border border-border-medium px-4 py-2 font-body text-body-sm font-semibold text-text-grey hover:bg-surface-background"
        >
          Cancel
        </Link>
        <button
          type="submit"
          className="inline-flex items-center rounded-btn bg-brand-blue px-6 py-2 font-body text-body-sm font-semibold text-white shadow-card hover:bg-brand-blue-dark transition-colors"
        >
          <Save size={16} className="mr-2" /> Save &amp; Configure Rate Cards
        </button>
      </div>
    </form>
  );
}
