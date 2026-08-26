// `/billing-pricing/contracts/[id]/rules/new` — Visual Pricing Rule Builder
//
// Allows administrators to build rules with WHEN [condition] THEN CHARGE [type] BASED ON [basis] AT [rate]

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Save, Sparkles } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { getContractDetail, createPricingRule } from "@/lib/actions/contracts";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PricingRuleBuilderPage({ params }: PageProps) {
  const { id } = await params;

  const resolver = await createPageResolver();
  const permResult = await requirePermission(resolver, "reporting.financial_read");

  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-8 py-12 text-center">
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to configure pricing rules.
        </p>
      </div>
    );
  }

  const detail = await getContractDetail(resolver, id);
  if (!detail || !detail.activeVersion) {
    notFound();
  }

  async function handleCreateRule(formData: FormData) {
    "use server";
    const pageResolver = await createPageResolver();
    const chargeName = String(formData.get("chargeName") ?? "");
    const chargeCode = String(formData.get("chargeCode") ?? "");
    const chargeCategory = String(formData.get("chargeCategory") ?? "delivery") as any;
    const billingBasis = String(formData.get("billingBasis") ?? "flat") as any;
    const rate = Number(formData.get("rate") ?? "0");
    const currency = String(formData.get("currency") ?? "USD");
    const priority = Number(formData.get("priority") ?? "0");
    const minCharge = formData.get("minCharge") ? Number(formData.get("minCharge")) : undefined;

    const deliveryType = String(formData.get("conditionDeliveryType") ?? "");
    const deliveryZone = String(formData.get("conditionDeliveryZone") ?? "");

    const conditionsObj: Record<string, string> = {};
    if (deliveryType) conditionsObj.deliveryType = deliveryType;
    if (deliveryZone) conditionsObj.deliveryZone = deliveryZone;

    const contractVersionId = String(formData.get("contractVersionId") ?? "");
    if (!contractVersionId) return;

    const conditionsJson = Object.keys(conditionsObj).length > 0 ? JSON.stringify(conditionsObj) : undefined;

    await createPricingRule(pageResolver, {
      contractVersionId,
      chargeName,
      chargeCode,
      chargeCategory,
      billingBasis,
      rate,
      currency,
      priority,
      minCharge,
      conditionsJson,
    });

    redirect(`/billing-pricing/contracts/${id}?tab=billing-rules`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href={`/billing-pricing/contracts/${id}?tab=billing-rules`}
          className="inline-flex items-center text-body-sm text-text-grey hover:text-brand-blue"
        >
          <ArrowLeft size={16} className="mr-1" /> Back to Contract Rules
        </Link>
        <h1 className="mt-2 font-heading text-heading-lg font-bold text-text-dark">
          Pricing Rule Builder
        </h1>
        <p className="font-body text-body-sm text-text-grey">
          Define condition-based pricing logic for Contract #{detail.contract.contractNumber}.
        </p>
      </div>

      {/* Visual Rule Builder Form */}
      <form action={handleCreateRule} className="space-y-6 rounded-card bg-surface-white border border-border-light p-6 shadow-card">
        <input type="hidden" name="contractVersionId" value={detail.activeVersion.id} />
        {/* WHEN Section */}
        <div className="rounded-card bg-surface-background p-4 border border-border-medium space-y-3">
          <div className="flex items-center gap-2 font-heading text-heading-sm font-bold text-brand-blue uppercase tracking-wider">
            <Sparkles size={18} /> WHEN [Condition]
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Delivery Type Condition
              </label>
              <select
                name="conditionDeliveryType"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm"
              >
                <option value="">Any Delivery Type</option>
                <option value="NORMAL">Normal Delivery</option>
                <option value="CO_LOAD">Co-load</option>
                <option value="CUSTOMER_PICKUP">Customer Pickup</option>
                <option value="WAREHOUSE_PICKUP">Warehouse Pickup</option>
              </select>
            </div>

            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Delivery Zone / Location
              </label>
              <input
                type="text"
                name="conditionDeliveryZone"
                placeholder="e.g. Cavite, Laguna"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm"
              />
            </div>
          </div>
        </div>

        {/* THEN CHARGE Section */}
        <div className="rounded-card bg-surface-background p-4 border border-border-medium space-y-4">
          <div className="font-heading text-heading-sm font-bold text-brand-blue uppercase tracking-wider">
            THEN CHARGE
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Charge Name
              </label>
              <input
                type="text"
                name="chargeName"
                required
                placeholder="e.g. Co-load Cavite Rate"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm"
              />
            </div>

            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Charge Code
              </label>
              <input
                type="text"
                name="chargeCode"
                required
                placeholder="e.g. DEL-CO-CAV"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
              />
            </div>

            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Charge Category
              </label>
              <select
                name="chargeCategory"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm"
              >
                <option value="delivery">Delivery</option>
                <option value="warehousing">Warehousing</option>
                <option value="handling_in">Handling IN</option>
                <option value="handling_out">Handling OUT</option>
                <option value="documentation">Documentation</option>
                <option value="loa">LOA</option>
                <option value="manpower">Manpower</option>
                <option value="other">Other Charges</option>
                <option value="trading">Trading</option>
              </select>
            </div>

            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Priority / Precedence
              </label>
              <input
                type="number"
                name="priority"
                defaultValue={10}
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
              />
              <span className="text-body-xs text-text-grey">Higher priority overrides general rules.</span>
            </div>
          </div>
        </div>

        {/* BASED ON & AT Section */}
        <div className="rounded-card bg-surface-background p-4 border border-border-medium space-y-4">
          <div className="font-heading text-heading-sm font-bold text-brand-blue uppercase tracking-wider">
            BASED ON & AT
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Billing Basis
              </label>
              <select
                name="billingBasis"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm"
              >
                <option value="flat">Flat Rate</option>
                <option value="cbm_day">CBM / Day</option>
                <option value="trip">Per Trip</option>
                <option value="pallet">Per Pallet</option>
                <option value="carton">Per Carton</option>
                <option value="unit">Per Unit</option>
                <option value="transaction">Per Transaction</option>
                <option value="hour">Per Hour</option>
                <option value="percentage">Percentage (%)</option>
              </select>
            </div>

            <div>
              <label className="block font-body text-body-xs font-semibold text-text-grey mb-1">
                Rate Amount
              </label>
              <input
                type="number"
                step="0.0001"
                name="rate"
                required
                placeholder="150.00"
                className="w-full rounded-btn border border-border-medium bg-surface-white px-3 py-2 font-body text-body-sm font-mono"
              />
            </div>

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
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link
            href={`/billing-pricing/contracts/${id}?tab=billing-rules`}
            className="rounded-btn border border-border-medium px-4 py-2 font-body text-body-sm font-semibold text-text-grey hover:bg-surface-background"
          >
            Cancel
          </Link>
          <button
            type="submit"
            className="inline-flex items-center rounded-btn bg-brand-blue px-6 py-2 font-body text-body-sm font-semibold text-white shadow-card hover:bg-brand-blue-dark transition-colors"
          >
            <Save size={16} className="mr-2" /> Save Pricing Rule
          </button>
        </div>
      </form>
    </div>
  );
}
