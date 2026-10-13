// `/billing-pricing/contracts/new` — Create New Commercial Contract Page

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { createContract } from "@/lib/actions/contracts";
import { listParties } from "@/lib/db/queries/parties";
import { db } from "@/lib/db/client";
import { partyRoles } from "@/lib/db/schema/parties";
import { NewContractForm } from "./NewContractForm";

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
  const allPartyRoles = await db
    .select({ partyId: partyRoles.partyId, role: partyRoles.role })
    .from(partyRoles);

  const rolesByParty = new Map<string, string[]>();
  for (const r of allPartyRoles) {
    const list = rolesByParty.get(r.partyId) ?? [];
    list.push(r.role);
    rolesByParty.set(r.partyId, list);
  }

  // End-customers do not receive billings (no billing applies to them)
  const partiesList = partiesResult.rows.filter((p) => {
    const r = rolesByParty.get(p.id) ?? [];
    return !(r.length > 0 && r.every((role) => role === "end_customer"));
  });

  async function handleCreateContract(formData: FormData): Promise<{ ok: boolean; error?: string }> {
    "use server";
    const pageResolver = await createPageResolver();
    const contractNumber = String(formData.get("contractNumber") ?? "").trim();
    const partyId = String(formData.get("partyId") ?? "").trim();
    const contractType = String(formData.get("contractType") ?? "vmi_trading") as "vmi" | "trading" | "vmi_trading";
    let effectiveDate = String(formData.get("effectiveDate") ?? "").trim();
    const expirationDate = String(formData.get("expirationDate") ?? "").trim() || undefined;
    const currency = String(formData.get("currency") ?? "USD");
    const exchangeRatePolicy = String(formData.get("exchangeRatePolicy") ?? "monthly_rate");
    const paymentTerms = String(formData.get("paymentTerms") ?? "Net 30");
    const warehousesCovered = String(formData.get("warehousesCovered") ?? "Main Warehouse");
    const billingCycle = String(formData.get("billingCycle") ?? "weekly_sun_sat");
    const notes = String(formData.get("notes") ?? "");

    if (!partyId) {
      return { ok: false, error: "Please select an Organization." };
    }
    if (!contractNumber) {
      return { ok: false, error: "Contract Number is required." };
    }
    if (!effectiveDate) {
      effectiveDate = new Date().toISOString().split("T")[0];
    }

    // Helper to parse non-empty numbers
    const numOrUndef = (key: string) => {
      const val = formData.get(key);
      if (val === null || val === undefined || String(val).trim() === "") return undefined;
      const num = Number(val);
      return isNaN(num) ? undefined : num;
    };

    // VMI Fields
    const vmiOwnership = formData.get("vmiOwnership") ? String(formData.get("vmiOwnership")) as "supplier_owned" | "customer_owned" | "warehouse_owned" : undefined;
    const vmiBillingTrigger = formData.get("vmiBillingTrigger") ? String(formData.get("vmiBillingTrigger")) as "upon_receipt" | "upon_consumption" | "upon_dispatch" | "upon_customer_confirmation" | "monthly_settlement" : undefined;
    const storageRatePerCbmDay = numOrUndef("storageRatePerCbmDay");
    const handlingInRatePerCbm = numOrUndef("handlingInRatePerCbm");
    const handlingOutRatePerCbm = numOrUndef("handlingOutRatePerCbm");
    const loaPermitNumber = formData.get("loaPermitNumber") ? String(formData.get("loaPermitNumber")).trim() : undefined;
    const loaMonthlyRate = numOrUndef("loaMonthlyRate");
    const loaStartDate = formData.get("loaStartDate") ? String(formData.get("loaStartDate")).trim() : undefined;
    const loaExpirationDate = formData.get("loaExpirationDate") ? String(formData.get("loaExpirationDate")).trim() : undefined;
    const suretyBondMonthlyFee = numOrUndef("suretyBondMonthlyFee");
    const otherComplianceFee = numOrUndef("otherComplianceFee");
    const otherComplianceLabel = formData.get("otherComplianceLabel") ? String(formData.get("otherComplianceLabel")).trim() : undefined;
    const truckingAdminFee = numOrUndef("truckingAdminFee");
    const manpowerRatePerHour = numOrUndef("manpowerRatePerHour");
    const minStock = numOrUndef("minStock");
    const maxStock = numOrUndef("maxStock");
    const reorderPoint = numOrUndef("reorderPoint");

    // Trading Fields
    const supplierCost = numOrUndef("supplierCost");
    const sellingPrice = numOrUndef("sellingPrice");
    const markupType = formData.get("markupType") ? String(formData.get("markupType")) as "percentage" | "fixed_amount" | "fixed_selling_price" : undefined;
    const markupValue = numOrUndef("markupValue");
    const minOrderQuantity = numOrUndef("minOrderQuantity");

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
      billingCycle,
      notes,
      vmiOwnership,
      vmiBillingTrigger,
      storageRatePerCbmDay,
      handlingInRatePerCbm,
      handlingOutRatePerCbm,
      loaPermitNumber,
      loaMonthlyRate,
      loaStartDate,
      loaExpirationDate,
      suretyBondMonthlyFee,
      otherComplianceFee,
      otherComplianceLabel,
      truckingAdminFee,
      manpowerRatePerHour,
      minStock,
      maxStock,
      reorderPoint,
      supplierCost,
      sellingPrice,
      markupType,
      markupValue,
      minOrderQuantity,
    });

    if (result.ok && result.contract) {
      redirect(`/billing-pricing/contracts/${result.contract.id}`);
    }

    return { ok: false, error: result.error || "Failed to create contract." };
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <Link
          href="/billing-pricing?tab=configuration"
          className="inline-flex items-center text-body-sm text-text-grey hover:text-brand-blue"
        >
          <ArrowLeft size={16} className="mr-1" /> Back to Commercial Contracts
        </Link>
        <h1 className="mt-2 font-heading text-heading-lg font-bold text-text-dark">
          New Commercial Contract
        </h1>
        <p className="font-body text-body-sm text-text-grey">
          Create a VMI or Trading commercial contract with versioned rate cards.
        </p>
      </div>

      <NewContractForm
        partiesList={partiesList}
        onSubmitAction={handleCreateContract}
      />
    </div>
  );
}

