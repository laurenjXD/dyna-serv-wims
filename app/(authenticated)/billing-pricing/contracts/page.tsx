// `/billing-pricing/contracts` — Contract List Screen
//
// Features: Search, Filter by Status, Filter by Customer, Filter by Contract Type, Sort by Effective Date

import Link from "next/link";
import { Plus, Search, Filter, FileText, ArrowLeft } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { listContracts } from "@/lib/actions/contracts";

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


      {/* Contract List Table */}
      <div className="overflow-hidden rounded-card bg-surface-white border border-border-light shadow-card">
        <div className="border-b border-border-light bg-surface-background p-4 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-grey" />
            <input
              type="text"
              placeholder="Search contract # or customer..."
              className="w-full rounded-btn border border-border-medium bg-surface-white pl-9 pr-3 py-1.5 font-body text-body-sm focus:border-brand-blue focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Filter size={16} className="text-text-grey" />
            <span className="font-body text-body-sm text-text-grey">Filter:</span>
            <select className="rounded-btn border border-border-medium bg-surface-white px-3 py-1.5 font-body text-body-sm">
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-light bg-surface-background text-text-grey font-body text-body-xs uppercase tracking-wider">
                <th className="py-3 px-4">Contract #</th>
                <th className="py-3 px-4">Organization (Customer)</th>
                <th className="py-3 px-4">Contract Type</th>
                <th className="py-3 px-4">Effective Date</th>
                <th className="py-3 px-4">Expiration Date</th>
                <th className="py-3 px-4">Currency</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-light font-body text-body-sm text-text-dark">
              {contractsList.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-text-grey">
                    No commercial contracts configured yet. Click &quot;New Contract&quot; to define your first rate-card contract.
                  </td>
                </tr>
              ) : (
                contractsList.map((contract) => (
                  <tr key={contract.id} className="hover:bg-surface-background/50 transition-colors">
                    <td className="py-3.5 px-4 font-mono text-mono-md font-semibold text-brand-blue">
                      <Link href={`/billing-pricing/contracts/${contract.id}`}>
                        {contract.contractNumber}
                      </Link>
                    </td>
                    <td className="py-3.5 px-4 font-medium">{contract.partyName}</td>
                    <td className="py-3.5 px-4 uppercase text-body-xs font-semibold text-text-grey">
                      {contract.contractType.replace("_", " + ")}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-mono-sm">{contract.effectiveDate}</td>
                    <td className="py-3.5 px-4 font-mono text-mono-sm">
                      {contract.expirationDate ?? "Open-ended"}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-mono-sm">{contract.currency}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-body-xs font-semibold ${
                          contract.status === "active"
                            ? "bg-green-100 text-green-800"
                            : contract.status === "draft"
                            ? "bg-yellow-100 text-yellow-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {contract.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        href={`/billing-pricing/contracts/${contract.id}`}
                        className="inline-flex items-center font-body text-body-xs font-semibold text-brand-blue hover:underline"
                      >
                        View & Edit
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
