"use client";

import { useState } from "react";
import type { SupplierPartyOption } from "@/lib/db/queries/items";

type InventoryModel = "vmi" | "trading" | "supplies";

const MODEL_LABELS: Record<InventoryModel, string> = {
  vmi: "VMI (Consignment)",
  trading: "Trading (Owned)",
  supplies: "Supplies",
};

export function WrrHeaderFields({
  vendors,
  initialVendorPartyId,
  initialFlowType,
}: {
  vendors: SupplierPartyOption[];
  initialVendorPartyId: string;
  initialFlowType: InventoryModel;
}) {
  const [vendorPartyId, setVendorPartyId] = useState(initialVendorPartyId);
  const selectedVendor = vendors.find((vendor) => vendor.id === vendorPartyId);
  const inheritedModel = selectedVendor?.defaultInventoryModel ?? "";

  return (
    <>
      <label className="block font-label text-label text-text-grey">
        Organization
        <select
          name="vendorPartyId"
          value={vendorPartyId}
          onChange={(event) => setVendorPartyId(event.target.value)}
          className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-surface-white px-3 font-body text-body-md text-on-surface"
        >
          {vendors.map((vendor) => (
            <option key={`${vendor.id}:${vendor.relationship ?? "legacy"}`} value={vendor.id}>
              {vendor.code} — {vendor.name} ({vendor.relationship === "vmi_customer" ? "Customer · VMI" : vendor.relationship === "trading_customer" ? "Customer · Trading" : vendor.relationship === "internal_supplies" ? "Internal Supplies" : "Supplier · Trading"})
            </option>
          ))}
        </select>
      </label>
      <label className="block font-label text-label text-text-grey">
        Inventory Model
        <div className={`mt-1 flex h-11 items-center justify-between rounded border px-3 font-body text-body-md ${inheritedModel ? "border-emerald-200 bg-emerald-50/60 text-on-surface" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
          <span>{inheritedModel ? MODEL_LABELS[inheritedModel] : "Organization has no unique active receiving model"}</span>
          {inheritedModel && <span className="font-label text-xs font-bold uppercase tracking-wide text-emerald-700">Inherited</span>}
        </div>
        <input type="hidden" name="flowType" value={inheritedModel || initialFlowType} />
        <span className="mt-1 block font-body text-body-xs text-text-grey">
          This value is inherited from the selected organization and cannot be overridden.
        </span>
      </label>
    </>
  );
}
