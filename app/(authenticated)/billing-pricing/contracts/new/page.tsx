// `/billing-pricing/contracts/new` — Create New Commercial Contract Page

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { createContract } from "@/lib/actions/contracts";
import { listParties } from "@/lib/db/queries/parties";
import { db } from "@/lib/db/client";

export default async function NewContractPage() {
  const resolver = await createPageResolver();
  const permResult = await requirePermission(resolver, "reporting.financial_read");

  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-8 py-12 text-center">
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to create contracts.
        </p>
      </div>
    );
  }

  const partiesResult = await listParties(db, { limit: 100 });
  const partiesList = partiesResult.rows;

  async function handleCreateContract(formData: FormData) {
    "use server";
    const pageResolver = await createPageResolver();
    const contractNumber = String(formData.get("contractNumber") ?? "");
    const partyId = String(formData.get("partyId") ?? "");
    const contractType = String(formData.get("contractType") ?? "vmi_trading") as "vmi" | "trading" | "vmi_trading";
    const effectiveDate = String(formData.get("effectiveDate") ?? new Date().toISOString().split("T")[0]);
    const expirationDate = String(formData.get("expirationDate") ?? "") || undefined;
    const currency = String(formData.get("currency") ?? "USD");
    const exchangeRatePolicy = String(formData.get("exchangeRatePolicy") ?? "monthly_rate");
    const paymentTerms = String(formData.get("paymentTerms") ?? "Net 30");
    const warehousesCovered = String(formData.get("warehousesCovered") ?? "Main Warehouse");
    const notes = String(formData.get("notes") ?? "");

    const result = await createContract(pageResolver, {
      contractNumber,
      partyId,
      contractType,
      effectiveDate,
      expirationDate,
      currency,
      exchangeRatePolicy,
      paymentTerms,
      warehousesCovered,
      notes,
    });

    if (result.ok && result.contract) {
      redirect(`/billing-pricing/contracts/${result.contract.id}`);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/billing-pricing/contracts"
          className="inline-flex items-center text-body-sm text-text-grey hover:text-brand-blue"
        >
          <ArrowLeft size={16} className="mr-1" /> Back to Contracts
        </Link>
        <h1 className="mt-2 font-heading text-heading-lg font-bold text-text-dark">
          New Commercial Contract
        </h1>
        <p className="font-body text-body-sm text-text-grey">
          Create a VMI or Trading commercial contract with versioned rate cards.
        </p>
      </div>

      <form action={handleCreateContract} className="space-y-6 rounded-card bg-surface-white border border-border-light p-6 shadow-card">
        <div className="space-y-4">
          <div>
            <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
              Organization (Customer / Principal)
            </label>
            <select
              name="partyId"
              required
              className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm"
            >
              <option value="">Select an Organization...</option>
              {partiesList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.code})
                </option>
              ))}
            </select>
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
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm"
              >
                <option value="vmi_trading">VMI + Trading</option>
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

          <div>
            <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
              Notes / Commercial Terms
            </label>
            <textarea
              name="notes"
              rows={3}
              placeholder="Additional commercial notes..."
              className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm"
            />
          </div>
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
            <Save size={16} className="mr-2" /> Save & Configure Rates
          </button>
        </div>
      </form>
    </div>
  );
}
