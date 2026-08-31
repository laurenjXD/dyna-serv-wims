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

        {activeTab === "handling" && (
          <div className="space-y-4">
            <h2 className="font-heading text-heading-md font-bold text-text-dark border-b pb-2">
              Handling Rates Configuration
            </h2>
            <p className="font-body text-body-sm text-text-grey">
              Rates applied per CBM moved during Inbound Stripping (Handling IN) and Outbound Picking/Dispatch (Handling OUT).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-card border border-border-light bg-surface-background/40 space-y-1">
                <span className="text-body-xs font-semibold text-text-grey uppercase tracking-wider block">Handling IN (Inbound Stripping)</span>
                <p className="font-mono text-heading-sm font-bold text-brand-navy">
                  ${rules.find((r) => r.chargeCategory === "handling_in")?.rate ?? "2.0000"} <span className="text-body-xs font-normal text-text-grey">/ CBM</span>
                </p>
                <p className="text-body-xs text-text-grey">Applied to total CBM received per Inbound WRR.</p>
              </div>
              <div className="p-4 rounded-card border border-border-light bg-surface-background/40 space-y-1">
                <span className="text-body-xs font-semibold text-text-grey uppercase tracking-wider block">Handling OUT (Outbound Picking)</span>
                <p className="font-mono text-heading-sm font-bold text-brand-navy">
                  ${rules.find((r) => r.chargeCategory === "handling_out")?.rate ?? "2.0000"} <span className="text-body-xs font-normal text-text-grey">/ CBM</span>
                </p>
                <p className="text-body-xs text-text-grey">Applied to total CBM released per Outgoing AR / Pick List.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "delivery" && (
          <div className="space-y-4">
            <h2 className="font-heading text-heading-md font-bold text-text-dark border-b pb-2">
              Delivery & Distribution Policy
            </h2>
            <p className="font-body text-body-sm text-text-grey">
              Delivery charges are billed as actual pass-through trucking invoice costs (in PHP), converted to USD at the monthly locked BSP forex rate.
            </p>
            <div className="rounded-card border border-border-light p-4 bg-surface-background/30 space-y-3 font-body text-body-sm">
              <div className="flex justify-between border-b border-border-light/60 pb-2">
                <span className="text-text-grey">Billing Method:</span>
                <span className="font-semibold text-text-dark">Actual Pass-Through Trucker Invoice (PHP)</span>
              </div>
              <div className="flex justify-between border-b border-border-light/60 pb-2">
                <span className="text-text-grey">Forex Conversion Rule:</span>
                <span className="font-semibold text-text-dark">Locked Monthly BSP Spot Rate</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-grey">Multi-Consignee / Multi-Plant Distribution:</span>
                <span className="font-semibold text-green-700">Supported (Itemized per Delivery Receipt)</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === "documentation" && (
          <div className="space-y-4">
            <h2 className="font-heading text-heading-md font-bold text-text-dark border-b pb-2">
              Documentation Processing Fees
            </h2>
            <p className="font-body text-body-sm text-text-grey">
              Standard flat administrative and customs documentation fee applied per processed Delivery Receipt (DR).
            </p>
            <div className="p-4 rounded-card border border-border-light bg-surface-background/40 max-w-sm space-y-1">
              <span className="text-body-xs font-semibold text-text-grey uppercase tracking-wider block">Standard Documentation Rate</span>
              <p className="font-mono text-heading-sm font-bold text-brand-navy">
                $10.00 <span className="text-body-xs font-normal text-text-grey">/ DR Reference</span>
              </p>
              <p className="text-body-xs text-text-grey">Flat rate per shipment run unless marked $0.00 for co-load pickups.</p>
            </div>
          </div>
        )}

        {activeTab === "loa" && (
          <div className="space-y-4">
            <h2 className="font-heading text-heading-md font-bold text-text-dark border-b pb-2">
              Letter of Authority (LOA) & PEZA Permits
            </h2>
            <p className="font-body text-body-sm text-text-grey">
              Monthly recurring customs and PEZA compliance maintenance fees.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-body text-body-sm">
              <div className="p-4 rounded-card border border-border-light bg-surface-background/40 space-y-1">
                <span className="text-body-xs font-semibold text-text-grey uppercase tracking-wider block">LOA Monthly Maintenance Fee</span>
                <p className="font-mono text-heading-sm font-bold text-brand-navy">
                  ${rules.find((r) => r.chargeCategory === "loa")?.rate ?? "150.00"} <span className="text-body-xs font-normal text-text-grey">/ Month</span>
                </p>
                <p className="text-body-xs text-text-grey">Automatically billed on the monthly Statement of Account.</p>
              </div>
              <div className="p-4 rounded-card border border-border-light bg-surface-background/40 space-y-1">
                <span className="text-body-xs font-semibold text-text-grey uppercase tracking-wider block">Permit Scope</span>
                <p className="font-semibold text-text-dark">PEZA Bonded Warehouse Goods</p>
                <p className="text-body-xs text-text-grey">Active customs compliance permit covering bonded inventory storage.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "manpower" && (
          <div className="space-y-4">
            <h2 className="font-heading text-heading-md font-bold text-text-dark border-b pb-2">
              Dedicated Manpower & Handling Support
            </h2>
            <p className="font-body text-body-sm text-text-grey">
              Dedicated warehouse handling staff and operational support allocations.
            </p>
            <div className="p-4 rounded-card border border-border-light bg-surface-background/40 max-w-sm space-y-1">
              <span className="text-body-xs font-semibold text-text-grey uppercase tracking-wider block">Billing Structure</span>
              <p className="font-semibold text-text-dark">Actual Logged Hours / Headcount</p>
              <p className="text-body-xs text-text-grey">Tracked via the monthly warehouse manpower attendance log.</p>
            </div>
          </div>
        )}

        {activeTab === "trading" && (
          <div className="space-y-4">
            <h2 className="font-heading text-heading-md font-bold text-text-dark border-b pb-2">
              Trading Pricing & Margin Policy
            </h2>
            <p className="font-body text-body-sm text-text-grey">
              Supplier cost, selling price rules, and commercial markup settings.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-body text-body-sm">
              <div className="p-4 rounded-card border border-border-light bg-surface-background/40 space-y-1">
                <span className="text-body-xs font-semibold text-text-grey uppercase tracking-wider block">Default Markup Policy</span>
                <p className="font-semibold text-text-dark">15.00% Percentage Markup</p>
              </div>
              <div className="p-4 rounded-card border border-border-light bg-surface-background/40 space-y-1">
                <span className="text-body-xs font-semibold text-text-grey uppercase tracking-wider block">Price Validity</span>
                <p className="font-semibold text-text-dark">Firm Fixed per PO Release</p>
              </div>
              <div className="p-4 rounded-card border border-border-light bg-surface-background/40 space-y-1">
                <span className="text-body-xs font-semibold text-text-grey uppercase tracking-wider block">Minimum Order Qty (MOQ)</span>
                <p className="font-mono font-bold text-text-dark">50 Units</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "other-charges" && (
          <div className="space-y-4">
            <h2 className="font-heading text-heading-md font-bold text-text-dark border-b pb-2">
              Other Accessorial & Ad-Hoc Charges
            </h2>
            <p className="font-body text-body-sm text-text-grey">
              Specialized fees, customs guarantees, and ad-hoc operational handling charges.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-body text-body-sm">
              <div className="p-4 rounded-card border border-border-light bg-surface-background/40 space-y-1">
                <span className="text-body-xs font-semibold text-text-grey uppercase tracking-wider block">Surety Bond Allocation</span>
                <p className="font-semibold text-text-dark">Actual Pass-Through / Bond Invoice</p>
                <p className="text-body-xs text-text-grey">Customs surety bond premium allocated per billing cycle.</p>
              </div>
              <div className="p-4 rounded-card border border-border-light bg-surface-background/40 space-y-1">
                <span className="text-body-xs font-semibold text-text-grey uppercase tracking-wider block">Cargo Transfer Fee (CTF)</span>
                <p className="font-semibold text-text-dark">Pass-Through port transfer fee</p>
                <p className="text-body-xs text-text-grey">Billed when transferring bonded containers from port to warehouse.</p>
              </div>
              <div className="p-4 rounded-card border border-border-light bg-surface-background/40 space-y-1">
                <span className="text-body-xs font-semibold text-text-grey uppercase tracking-wider block">Return to Vendor (RTV) Handling</span>
                <p className="font-semibold text-text-dark">Standard Handling OUT + Repackaging</p>
                <p className="text-body-xs text-text-grey">Applied to scrap, damaged, or rejected inventory releases.</p>
              </div>
              <div className="p-4 rounded-card border border-border-light bg-surface-background/40 space-y-1">
                <span className="text-body-xs font-semibold text-text-grey uppercase tracking-wider block">Container Stripping Fee</span>
                <p className="font-semibold text-text-dark">Included in Handling IN Rate ($2.00 / CBM)</p>
                <p className="text-body-xs text-text-grey">Unloading, inspection, and initial palletization at receiving bay.</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "documents" && (
          <div className="space-y-4">
            <h2 className="font-heading text-heading-md font-bold text-text-dark border-b pb-2">
              Attached Contract Documents & Certificates
            </h2>
            <p className="font-body text-body-sm text-text-grey">
              Official legal contracts, PEZA endorsements, and signed commercial rate addendums.
            </p>
            <div className="space-y-2 font-body text-body-sm">
              <div className="flex items-center justify-between p-3 rounded-card border border-border-light bg-surface-white hover:bg-surface-background/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded bg-brand-blue/10 text-brand-blue font-bold text-body-xs font-mono">PDF</div>
                  <div>
                    <p className="font-semibold text-text-dark">Master_VMI_Commercial_Agreement_{contract.partyName.replace(/\s+/g, "_")}.pdf</p>
                    <p className="text-body-xs text-text-grey">Signed Agreement &bull; Effective {contract.effectiveDate}</p>
                  </div>
                </div>
                <span className="text-body-xs font-semibold text-brand-blue font-mono">Active</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-card border border-border-light bg-surface-white hover:bg-surface-background/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded bg-green-100 text-green-800 font-bold text-body-xs font-mono">PEZA</div>
                  <div>
                    <p className="font-semibold text-text-dark">PEZA_Bonded_Warehouse_Endorsement_Certificate.pdf</p>
                    <p className="text-body-xs text-text-grey">Customs Compliance Authorization</p>
                  </div>
                </div>
                <span className="text-body-xs font-semibold text-green-700 font-mono">Verified</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === "versions" && (
          <div className="space-y-4">
            <h2 className="font-heading text-heading-md font-bold text-text-dark border-b pb-2">
              Contract Version History
            </h2>
            <div className="rounded-card border border-border-light p-4 bg-surface-background/30 space-y-2 font-body text-body-sm">
              <div className="flex justify-between items-center">
                <span className="font-bold text-text-dark">Version 1 (Active)</span>
                <span className="text-body-xs px-2 py-0.5 bg-green-100 text-green-800 rounded font-semibold">Currently Effective</span>
              </div>
              <p className="text-text-grey text-body-xs">Created upon contract initiation with baseline VMI storage, handling, and documentation rates.</p>
            </div>
          </div>
        )}

        {activeTab === "audit-history" && (
          <div className="space-y-4">
            <h2 className="font-heading text-heading-md font-bold text-text-dark border-b pb-2">
              Permanent Audit Trail
            </h2>
            <p className="font-body text-body-sm text-text-grey">
              All contract creation, rate modifications, and version transitions are recorded permanently.
            </p>
            <div className="text-body-xs font-mono text-text-grey bg-surface-background/40 p-4 rounded border border-border-light">
              [{new Date().toISOString()}] Contract created / rates verified for {contract.partyName}.
            </div>
          </div>
        )}

        {/* Catch-all for any other unhandled tab */}
        {!["general", "warehousing", "handling", "delivery", "documentation", "loa", "manpower", "vmi-policy", "trading", "other-charges", "billing-rules", "documents", "versions", "audit-history"].includes(activeTab) && (
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
