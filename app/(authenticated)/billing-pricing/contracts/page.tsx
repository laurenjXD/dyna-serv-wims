import Link from "next/link";
import { Plus, FileText, ArrowLeft } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { listContracts } from "@/lib/actions/contracts";
import { ContractTableClient } from "./_components/ContractTableClient";

export default async function ContractListPage() {
  const resolver = await createPageResolver();
  const permResult = await requirePermission(resolver, "reporting.financial_read");

  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-8 py-12 text-center">
        <FileText size={40} className="mx-auto mb-3 text-text-grey" aria-hidden="true" />
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view commercial contracts.
        </p>
      </div>
    );
  }

  const contractsList = await listContracts(resolver);

  return (
    <div className="mx-auto max-w-container space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/billing-pricing"
              className="inline-flex items-center text-body-sm text-text-grey hover:text-brand-blue"
            >
              <ArrowLeft size={16} className="mr-1" /> Back to Billing & Pricing
            </Link>
          </div>
          <h1 className="mt-1 font-heading text-heading-lg text-text-dark">
            Commercial Contracts (VMI & Trading)
          </h1>
          <p className="font-body text-body-sm text-text-grey">
            Configure customer rate cards, versioned pricing policies, VMI triggers, and contract terms.
          </p>
        </div>

        <Link
          href="/billing-pricing/contracts/new"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 font-body text-body-sm font-bold text-white shadow-md hover:bg-primary-hover transition-colors"
        >
          <Plus size={16} className="mr-2" /> + New Contract
        </Link>
      </div>

      {/* Contract List Table with Live Search & Filtering */}
      <ContractTableClient initialContracts={contractsList} />
    </div>
  );
}
