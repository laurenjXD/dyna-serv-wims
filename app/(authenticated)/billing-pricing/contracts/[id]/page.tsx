// `/billing-pricing/contracts/[id]` — Commercial Contract & Rate Card Master Screen
// Unified 4-Card Master Rate Card Architecture with Dynamic Rules and Version History

import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { getContractDetail } from "@/lib/actions/contracts";
import { ContractHeader } from "./_components/ContractHeader";
import { ContractRateCards } from "./_components/ContractRateCards";
import { ContractPricingRulesTable } from "./_components/ContractPricingRulesTable";
import { ContractVersionHistory } from "./_components/ContractVersionHistory";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function ContractDetailPage({ params }: PageProps) {
  const { id } = await params;

  const resolver = await createPageResolver();
  const permResult = await requirePermission(resolver, "reporting.financial_read");

  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-8 py-12 text-center">
        <FileText size={40} className="mx-auto mb-3 text-text-grey" />
        <h3 className="font-heading text-title-md font-bold text-on-surface">Financial Access Required</h3>
        <p className="mt-1 font-body text-body-md text-text-grey">
          You do not have permission to view commercial contract details.
        </p>
      </div>
    );
  }

  const detail = await getContractDetail(resolver, id);
  if (!detail) {
    notFound();
  }

  const { contract, activeVersion, rules, vmiConfig } = detail;

  return (
    <div className="mx-auto max-w-container space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* 1. Master Contract Header & Status */}
      <ContractHeader contract={contract} />

      {/* 2. Unified 4-Card Rate Card Sheet */}
      <ContractRateCards
        contract={contract}
        activeVersion={activeVersion}
        rules={rules}
        vmiConfig={vmiConfig}
      />

      {/* 3. Dynamic Pricing Rules Engine */}
      <ContractPricingRulesTable
        contractId={contract.id}
        rules={rules}
        currency={contract.currency}
      />

      {/* 4. Contract Version & Revision Timeline */}
      <ContractVersionHistory activeVersion={activeVersion} />
    </div>
  );
}
