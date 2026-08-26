// `/billing-pricing/contracts/new` — Create New Commercial Contract Page

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { createContract } from "@/lib/actions/contracts";
import { listParties } from "@/lib/db/queries/parties";
import { db } from "@/lib/db/client";
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

    // VMI Fields
    const vmiOwnership = formData.get("vmiOwnership") ? String(formData.get("vmiOwnership")) as "supplier_owned" | "customer_owned" | "warehouse_owned" : undefined;
    const vmiBillingTrigger = formData.get("vmiBillingTrigger") ? String(formData.get("vmiBillingTrigger")) as "upon_receipt" | "upon_consumption" | "upon_dispatch" | "upon_customer_confirmation" | "monthly_settlement" : undefined;
    const storageRatePerCbmDay = formData.get("storageRatePerCbmDay") ? Number(formData.get("storageRatePerCbmDay")) : undefined;
    const handlingInRatePerCbm = formData.get("handlingInRatePerCbm") ? Number(formData.get("handlingInRatePerCbm")) : undefined;
    const handlingOutRatePerCbm = formData.get("handlingOutRatePerCbm") ? Number(formData.get("handlingOutRatePerCbm")) : undefined;
    const loaPermitNumber = formData.get("loaPermitNumber") ? String(formData.get("loaPermitNumber")) : undefined;
    const loaMonthlyRate = formData.get("loaMonthlyRate") ? Number(formData.get("loaMonthlyRate")) : undefined;
    const minStock = formData.get("minStock") ? Number(formData.get("minStock")) : undefined;
    const maxStock = formData.get("maxStock") ? Number(formData.get("maxStock")) : undefined;
    const reorderPoint = formData.get("reorderPoint") ? Number(formData.get("reorderPoint")) : undefined;

    // Trading Fields
    const supplierCost = formData.get("supplierCost") ? Number(formData.get("supplierCost")) : undefined;
    const sellingPrice = formData.get("sellingPrice") ? Number(formData.get("sellingPrice")) : undefined;
    const markupType = formData.get("markupType") ? String(formData.get("markupType")) as "percentage" | "fixed_amount" | "fixed_selling_price" : undefined;
    const markupValue = formData.get("markupValue") ? Number(formData.get("markupValue")) : undefined;
    const minOrderQuantity = formData.get("minOrderQuantity") ? Number(formData.get("minOrderQuantity")) : undefined;


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
      vmiOwnership,
      vmiBillingTrigger,
      storageRatePerCbmDay,
      handlingInRatePerCbm,
      handlingOutRatePerCbm,
      loaPermitNumber,
      loaMonthlyRate,
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
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
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

      <NewContractForm
        partiesList={partiesList}
        onSubmitAction={handleCreateContract}
      />
    </div>
  );
}

