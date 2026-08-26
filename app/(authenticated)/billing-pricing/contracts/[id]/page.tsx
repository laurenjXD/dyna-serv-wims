// `/billing-pricing/contracts/[id]` — Contract Detail Screen (14 Tabs)
//
// Tabs per Spec Section 29:
//   General | Warehousing | Handling | Delivery | Documentation | LOA | Manpower |
//   VMI Policy | Trading | Other Charges | Billing Rules | Documents | Versions | Audit History

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { getContractDetail } from "@/lib/actions/contracts";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

const TABS = [
  { id: "general", label: "General" },
  { id: "warehousing", label: "Warehousing" },
  { id: "handling", label: "Handling" },
  { id: "delivery", label: "Delivery" },
  { id: "documentation", label: "Documentation" },
  { id: "loa", label: "LOA" },
  { id: "manpower", label: "Manpower" },
  { id: "vmi-policy", label: "VMI Policy" },
  { id: "trading", label: "Trading" },
  { id: "other-charges", label: "Other Charges" },
  { id: "billing-rules", label: "Billing Rules" },
  { id: "documents", label: "Documents" },
  { id: "versions", label: "Versions" },
  { id: "audit-history", label: "Audit History" },
];

export default async function ContractDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;

  const resolver = await createPageResolver();
  const permResult = await requirePermission(resolver, "reporting.financial_read");

  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-8 py-12 text-center">
        <FileText size={40} className="mx-auto mb-3 text-text-grey" />
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view contract details.
        </p>
      </div>
    );
  }

  const detail = await getContractDetail(resolver, id);
  if (!detail) {
    notFound();
  }

  const { contract, activeVersion, rules, vmiConfig } = detail;
  const activeTab = tabParam || "general";

  return (
    <div className="mx-auto max-w-container space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border-light pb-4">
        <div>
          <Link
            href="/billing-pricing/contracts"
            className="inline-flex items-center text-body-sm text-text-grey hover:text-brand-blue"
          >
            <ArrowLeft size={16} className="mr-1" /> Back to Contracts
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="font-heading text-heading-lg font-bold text-text-dark">
              {contract.contractNumber}
            </h1>
            <span className="rounded-full bg-brand-blue/10 px-3 py-1 font-mono text-mono-xs font-semibold text-brand-blue uppercase">
              {contract.contractType.replace("_", " + ")}
            </span>
            <span
              className={`rounded-full px-3 py-1 font-body text-body-xs font-semibold uppercase ${
                contract.status === "active"
                  ? "bg-green-100 text-green-800"
                  : "bg-yellow-100 text-yellow-800"
              }`}
            >
              {contract.status}
            </span>
          </div>
          <p className="font-body text-body-sm text-text-grey">
            Customer: <strong className="text-text-dark">{contract.partyName}</strong> &bull; Effective:{" "}
            <span className="font-mono">{contract.effectiveDate}</span> to{" "}
            <span className="font-mono">{contract.expirationDate ?? "Open-ended"}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/billing-pricing/contracts/${contract.id}/rules/new`}
            className="rounded-btn bg-surface-white border border-border-medium px-4 py-2 font-body text-body-sm font-semibold text-text-dark hover:bg-surface-background shadow-card transition-colors"
          >
            + Add Pricing Rule
          </Link>
        </div>
      </div>

      {/* 14 Tabs Navigation Bar */}
      <div className="overflow-x-auto border-b border-border-medium">
        <nav className="flex gap-2 min-w-max pb-px font-body text-body-sm font-medium">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={`/billing-pricing/contracts/${contract.id}?tab=${t.id}`}
              className={`whitespace-nowrap px-4 py-2.5 border-b-2 transition-colors ${
                activeTab === t.id
                  ? "border-brand-blue text-brand-blue font-semibold bg-brand-blue/5"
                  : "border-transparent text-text-grey hover:text-text-dark hover:border-border-medium"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Tab Content Display */}
      <div className="rounded-card bg-surface-white border border-border-light p-6 shadow-card space-y-6">
        {activeTab === "general" && (
          <div className="space-y-4">
            <h2 className="font-heading text-heading-md font-bold text-text-dark border-b pb-2">
              General Contract Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 font-body text-body-sm">
              <div>
                <span className="text-text-grey block">Contract Number:</span>
                <span className="font-mono font-semibold text-text-dark">{contract.contractNumber}</span>
              </div>
              <div>
                <span className="text-text-grey block">Customer / Principal:</span>
                <span className="font-semibold text-text-dark">{contract.partyName}</span>
              </div>
              <div>
                <span className="text-text-grey block">Contract Type:</span>
                <span className="uppercase font-semibold">{contract.contractType}</span>
              </div>
              <div>
                <span className="text-text-grey block">Billing Currency:</span>
                <span className="font-mono">{contract.currency}</span>
              </div>
              <div>
                <span className="text-text-grey block">Exchange Rate Policy:</span>
                <span>{contract.exchangeRatePolicy}</span>
              </div>
              <div>
                <span className="text-text-grey block">Payment Terms:</span>
                <span>{contract.paymentTerms}</span>
              </div>
              <div>
                <span className="text-text-grey block">Warehouses Covered:</span>
                <span>{contract.warehousesCovered}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === "warehousing" && (
          <div className="space-y-4">
            <h2 className="font-heading text-heading-md font-bold text-text-dark border-b pb-2">
              Warehousing & Storage Pricing Rules
            </h2>
            <p className="font-body text-body-sm text-text-grey">
              Defines CBM/Day storage pricing, daily volume unrolling, threshold allowances, and billing timing.
            </p>
            <table className="w-full text-left border-collapse text-body-sm font-body">
              <thead>
                <tr className="border-b border-border-light bg-surface-background text-text-grey text-body-xs uppercase">
                  <th className="py-2.5 px-3">Rule Name</th>
                  <th className="py-2.5 px-3">Basis</th>
                  <th className="py-2.5 px-3">Rate</th>
                  <th className="py-2.5 px-3">Min Charge</th>
                  <th className="py-2.5 px-3">Priority</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {rules.filter((r) => r.chargeCategory === "warehousing").length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-text-grey">
                      No Warehousing pricing rules configured for active version.
                    </td>
                  </tr>
                ) : (
                  rules
                    .filter((r) => r.chargeCategory === "warehousing")
                    .map((r) => (
                      <tr key={r.id}>
                        <td className="py-3 px-3 font-semibold">{r.chargeName}</td>
                        <td className="py-3 px-3 uppercase">{r.billingBasis}</td>
                        <td className="py-3 px-3 font-mono">${r.rate}</td>
                        <td className="py-3 px-3 font-mono">{r.minCharge ? `$${r.minCharge}` : "—"}</td>
                        <td className="py-3 px-3 font-mono">{r.priority}</td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "vmi-policy" && (
          <div className="space-y-4">
            <h2 className="font-heading text-heading-md font-bold text-text-dark border-b pb-2">
              VMI Policy Configuration
            </h2>
            {vmiConfig ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 font-body text-body-sm">
                <div>
                  <span className="text-text-grey block">Inventory Ownership:</span>
                  <span className="font-semibold uppercase">{vmiConfig.inventoryOwnership.replace("_", " ")}</span>
                </div>
                <div>
                  <span className="text-text-grey block">Billing Trigger:</span>
                  <span className="font-semibold uppercase">{vmiConfig.billingTrigger.replace("_", " ")}</span>
                </div>
                <div>
                  <span className="text-text-grey block">Lead Time:</span>
                  <span>{vmiConfig.leadTimeDays} Days</span>
                </div>
                <div>
                  <span className="text-text-grey block">Min Stock Threshold:</span>
                  <span className="font-mono">{vmiConfig.minStock ?? "N/A"}</span>
                </div>
                <div>
                  <span className="text-text-grey block">Max Stock Limit:</span>
                  <span className="font-mono">{vmiConfig.maxStock ?? "N/A"}</span>
                </div>
                <div>
                  <span className="text-text-grey block">Reorder Point:</span>
                  <span className="font-mono">{vmiConfig.reorderPoint ?? "N/A"}</span>
                </div>
              </div>
            ) : (
              <p className="font-body text-body-sm text-text-grey py-4">
                No specific VMI policy configured. Defaulting to Supplier-Owned upon consumption.
              </p>
            )}
          </div>
        )}

        {activeTab === "billing-rules" && (
          <div className="space-y-4">
            <h2 className="font-heading text-heading-md font-bold text-text-dark border-b pb-2">
              Complete Pricing Rule Engine Matrix
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-body-sm font-body">
                <thead>
                  <tr className="border-b border-border-light bg-surface-background text-text-grey text-body-xs uppercase">
                    <th className="py-2.5 px-3">Priority</th>
                    <th className="py-2.5 px-3">Charge Code</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3">Charge Name</th>
                    <th className="py-2.5 px-3">Basis</th>
                    <th className="py-2.5 px-3">Rate</th>
                    <th className="py-2.5 px-3">Conditions</th>
                    <th className="py-2.5 px-3">Taxable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-light">
                  {rules.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-text-grey">
                        No pricing rules defined for this contract. Click &quot;+ Add Pricing Rule&quot; to add one.
                      </td>
                    </tr>
                  ) : (
                    rules.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-background/50">
                        <td className="py-3 px-3 font-mono font-bold text-brand-blue">{r.priority}</td>
                        <td className="py-3 px-3 font-mono">{r.chargeCode}</td>
                        <td className="py-3 px-3 uppercase text-body-xs font-semibold">{r.chargeCategory}</td>
                        <td className="py-3 px-3 font-semibold">{r.chargeName}</td>
                        <td className="py-3 px-3 font-mono text-body-xs">{r.billingBasis}</td>
                        <td className="py-3 px-3 font-mono font-bold">${r.rate}</td>
                        <td className="py-3 px-3 font-mono text-mono-xs text-text-grey">
                          {r.conditionsJson ? r.conditionsJson : "Default"}
                        </td>
                        <td className="py-3 px-3">{r.isTaxable ? "Yes" : "No"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Fallback for remaining tabs */}
        {!["general", "warehousing", "vmi-policy", "billing-rules"].includes(activeTab) && (
          <div className="py-8 text-center space-y-2">
            <h3 className="font-heading text-heading-sm font-semibold capitalize text-text-dark">
              {activeTab.replace("-", " ")} Configuration
            </h3>
            <p className="font-body text-body-sm text-text-grey">
              Configurations for {activeTab.replace("-", " ")} are active for Version {activeVersion?.versionNumber ?? 1}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
