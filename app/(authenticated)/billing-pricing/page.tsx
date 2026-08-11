import Link from "next/link";
import { Receipt } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";

export default async function BillingPricingPage(props: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await props.searchParams;
  const resolver = await createPageResolver();
  const permResult = await requirePermission(resolver, "reporting.financial_read");

  if (permResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-8 py-12 text-center">
        <Receipt
          size={40}
          className="mx-auto mb-3 text-on-surface-variant"
          aria-hidden="true"
        />
        <p className="font-body text-body-md text-on-surface-variant">
          You do not have permission to view billing and pricing.
        </p>
        <p className="mt-2 font-body text-body-sm text-on-surface-variant">
          This page requires the{" "}
          <span className="font-mono text-mono-md">reporting.financial_read</span>{" "}
          capability.
        </p>
      </div>
    );
  }

  const activeTab = tabParam === "trading" ? "trading" : "vmi";

  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div>
        <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
          Billing &amp; Pricing
        </h1>
        <p className="mt-1 font-body text-body-md text-on-surface-variant">
          Enrollment forms for VMI contract terms and Trading margin policies.
        </p>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1 border-b border-outline-variant/30">
        <Link
          href="/billing-pricing?tab=vmi"
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary ${
            activeTab === "vmi"
              ? "border-b-2 border-primary text-primary"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
          aria-current={activeTab === "vmi" ? "page" : undefined}
        >
          VMI Contracts
        </Link>
        <Link
          href="/billing-pricing?tab=trading"
          className={`flex h-11 items-center px-4 font-label text-label transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-primary ${
            activeTab === "trading"
              ? "border-b-2 border-primary text-primary"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
          aria-current={activeTab === "trading" ? "page" : undefined}
        >
          Trading Margin Policies
        </Link>
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === "vmi" ? <VmiContractForm /> : <TradingMarginForm />}
      </div>
    </div>
  );
}

// ─── Mock VMI Contract Form ──────────────────────────────────────────────────

function VmiContractForm() {
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-white shadow-elevation-1">
      <div className="border-b border-outline-variant/30 px-6 py-4">
        <h2 className="font-heading font-semibold text-headline-md text-on-surface">
          VMI Contract Terms
        </h2>
        <p className="mt-1 font-body text-body-sm text-on-surface-variant">
          Placeholder form for VMI billing inputs (Spec 16).
        </p>
      </div>
      <form className="p-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Party Selection */}
          <div className="flex flex-col gap-2 md:col-span-2">
            <label className="font-label text-label text-on-surface-variant">
              Party
            </label>
            <select className="h-11 rounded border border-outline-variant/30 bg-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">Select a party...</option>
              <option value="party-1">Acme Logistics Co.</option>
              <option value="party-2">Global Parts Inc.</option>
              <option value="party-3">Pacific Supply Group</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-label text-label text-on-surface-variant">
              CBM-day Storage Rate
            </label>
            <input
              type="number"
              step="0.01"
              defaultValue="4.50"
              className="h-11 rounded border border-outline-variant/30 px-3 font-mono text-mono-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="font-label text-label text-on-surface-variant">
              Billing Currency
            </label>
            <select className="h-11 rounded border border-outline-variant/30 bg-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="USD">USD</option>
              <option value="PHP">PHP</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-label text-label text-on-surface-variant">
              Inbound Handling Fee
            </label>
            <input
              type="number"
              step="0.01"
              defaultValue="15.00"
              className="h-11 rounded border border-outline-variant/30 px-3 font-mono text-mono-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-label text-label text-on-surface-variant">
              Outbound Handling Fee
            </label>
            <input
              type="number"
              step="0.01"
              defaultValue="10.00"
              className="h-11 rounded border border-outline-variant/30 px-3 font-mono text-mono-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-label text-label text-on-surface-variant">
              Contracted CBM Threshold (Before Surcharge)
            </label>
            <input
              type="number"
              step="1"
              defaultValue="50"
              className="h-11 rounded border border-outline-variant/30 px-3 font-mono text-mono-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            className="flex h-11 items-center justify-center rounded px-4 font-label text-label text-on-surface-variant hover:bg-surface-dim focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded bg-primary px-6 font-label text-label text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Save Contract
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Mock Trading Margin Form ───────────────────────────────────────────────

function TradingMarginForm() {
  return (
    <div className="rounded-2xl border border-outline-variant/30 bg-white shadow-elevation-1">
      <div className="border-b border-outline-variant/30 px-6 py-4">
        <h2 className="font-heading font-semibold text-headline-md text-on-surface">
          Trading Pricing/Margin Policy
        </h2>
        <p className="mt-1 font-body text-body-sm text-on-surface-variant">
          Placeholder form for Trading customer margin inputs (Spec 16).
        </p>
      </div>
      <form className="p-6">
        <div className="grid gap-6 md:grid-cols-2">
          {/* Party Selection */}
          <div className="flex flex-col gap-2 md:col-span-2">
            <label className="font-label text-label text-on-surface-variant">
              Customer
            </label>
            <select className="h-11 rounded border border-outline-variant/30 bg-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="">Select a customer...</option>
              <option value="party-4">Nexus Distribution Ltd.</option>
              <option value="party-5">Arcadia Industrial</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-label text-label text-on-surface-variant">
              Target Margin (%)
            </label>
            <input
              type="number"
              step="0.1"
              defaultValue="30.0"
              className="h-11 rounded border border-outline-variant/30 px-3 font-mono text-mono-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-label text-label text-on-surface-variant">
              Margin Floor (%)
            </label>
            <input
              type="number"
              step="0.1"
              defaultValue="20.0"
              className="h-11 rounded border border-outline-variant/30 px-3 font-mono text-mono-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div className="flex flex-col gap-2 md:col-span-2">
            <label className="font-label text-label text-on-surface-variant">
              Pricing Strategy
            </label>
            <select className="h-11 rounded border border-outline-variant/30 bg-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="fixed_markup">Fixed Markup on COGS</option>
              <option value="contract_pricing">Contract Item Pricing</option>
              <option value="volume_tier">Volume Tiered Discount</option>
            </select>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button
            type="button"
            className="flex h-11 items-center justify-center rounded px-4 font-label text-label text-on-surface-variant hover:bg-surface-dim focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded bg-primary px-6 font-label text-label text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Save Policy
          </button>
        </div>
      </form>
    </div>
  );
}
