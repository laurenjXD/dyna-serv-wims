"use client";

// Create-WRR form body — header fields, expected lines, and actions.
//
// Split out from page.tsx (2026-08-19 user request) so Inventory Model
// selection can be shared client-side state between the header select and
// WrrLineItems' conditional Item Code label. Organization is a dropdown of
// real organizations (page.tsx fetches the list). PEZA Number and manual CIPL
// file attachment are not collected on this form.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §5 (pre-receiving WRR design), §5.1
//     (expected line fields)
//   specs/04-services-and-infrastructure/design.md §10 (Supabase Storage
//     design — `cipl-documents` bucket, object path convention)

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { SupplierPartyOption, WrrItemOption } from "@/lib/db/queries/items";
import { WrrLineItems, type ImportedWrrLine } from "./wrr-line-items";
import { CiPlImportModal } from "../../_components/CiPlImportModal";
import { ChevronDown, ExternalLink, FileSpreadsheet, PlusCircle, Search } from "@/components/ui/icons";
import { useOfflineStatus } from "@/lib/offline/provider";

const BUSINESS_ROLE_LABELS: Record<string, string> = {
  supplier: "Supplier",
  vendor: "Supplier",
  customer: "Customer",
  internal_supplies: "Internal Supplies",
  internal_warehouse: "Internal Supplies",
};

function getBusinessRoleLabel(party: SupplierPartyOption): string {
  return (party.roles ?? [])
    .map((role) => BUSINESS_ROLE_LABELS[role] ?? role)
    .filter(Boolean)
    .join(" / ") || "Organization";
}

interface WrrNewFormProps {
  action: (formData: FormData) => void;
  vendorParties: SupplierPartyOption[];
  itemOptions: WrrItemOption[];
}

export function WrrNewForm({ action, vendorParties, itemOptions }: WrrNewFormProps) {
  const router = useRouter();
  const [flowType, setFlowType] = useState("");
  const [vendorPartyId, setVendorPartyId] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");
  const [isVendorOpen, setIsVendorOpen] = useState(false);
  const vendorSearchRef = useRef<HTMLDivElement>(null);

  // Reserved up front for the auto-parse modal's document context and the
  // deterministic imported-line flow.
  const [wrrId] = useState(() => crypto.randomUUID());
  const [showImportModal, setShowImportModal] = useState(false);
  const [importedLines, setImportedLines] = useState<ImportedWrrLine[]>([]);
  const { connectivity } = useOfflineStatus();
  const offline = connectivity === "offline";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (vendorSearchRef.current && !vendorSearchRef.current.contains(event.target as Node)) {
        setIsVendorOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredVendorParties = vendorParties.filter((party) => {
    const query = vendorSearch.trim().toLowerCase();
    return !query || `${party.code} ${party.name}`.toLowerCase().includes(query);
  });
  const selectedVendor = vendorParties.find((party) => party.id === vendorPartyId);
  const inheritedModel = selectedVendor?.defaultInventoryModel ?? "";

  return (
    <form action={action} className="mt-6 space-y-6">
      {/* Client-generated WRR id */}
      <input type="hidden" name="id" value={wrrId} />

      {/* ── Top Option: Fast Intake via Auto-Parse CIPL (Excel / PDF) ── */}
      <div className="relative overflow-hidden rounded-2xl border border-blue-200/80 bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-surface-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-navy text-surface-white shadow-sm">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-title-sm font-bold text-brand-navy">
                  Auto-Parse Commercial Invoice / Packing List
                </h2>
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 font-label text-xs font-bold uppercase tracking-wider text-brand-navy">
                  Fast Intake Option
                </span>
              </div>
              <p className="mt-0.5 font-body text-body-xs text-text-grey">
                Upload an Excel spreadsheet (.xlsx, .csv) or PDF/image to automatically extract lines, quantities, lot numbers, and invoice references.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setShowImportModal(true)}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-navy px-5 font-label text-label font-bold text-surface-white shadow-sm hover:bg-brand-navy/90 motion-safe:active:scale-[0.98] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Auto-Parse Excel / PDF CIPL
            </button>
          </div>
        </div>

        {importedLines.length > 0 && (
          <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-2.5 text-xs font-medium text-emerald-900">
            <span className="flex items-center gap-1.5 font-bold">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              {importedLines.length} line item(s) parsed and applied below from document
            </span>
            <button
              type="button"
              onClick={() => {
                setImportedLines([]);
              }}
              className="text-emerald-800 underline hover:text-emerald-950 font-bold"
            >
              Clear Parsed Lines
            </button>
          </div>
        )}
      </div>

      {showImportModal && (
        <CiPlImportModal
          wrrId={wrrId}
          itemOptions={itemOptions}
          onClose={() => setShowImportModal(false)}
          onApply={(header, lines) => {
            if (header.ciplReference) {
              const ciplInput = document.getElementById("commercialInvoiceNo") as HTMLInputElement | null;
              if (ciplInput) ciplInput.value = header.ciplReference;
            }
            if (header.ipNumber) {
              const ipInput = document.getElementById("ipNumber") as HTMLInputElement | null;
              if (ipInput) ipInput.value = header.ipNumber;
            }
            if (header.mawbMbl) {
              const mawbInput = document.getElementById("mawbMblNumber") as HTMLInputElement | null;
              if (mawbInput) mawbInput.value = header.mawbMbl;
            }
            setImportedLines(lines);
          }}
        />
      )}

      {/* Header section — clean card container */}
      <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="font-heading text-title-md font-bold text-on-surface">
              Header Information
            </h2>
            <p className="font-body text-body-xs text-text-grey">
              General commercial shipping references and source organization.
            </p>
          </div>
          {selectedVendor?.roles?.length && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-brand-navy border border-blue-200">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
              Role: {getBusinessRoleLabel(selectedVendor)}
            </span>
          )}
        </div>

        {/* 2-column balanced grid */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {/* Organization — dropdown of active receiving source parties */}
          <div>
            <label
              htmlFor="vendorPartyId"
              className="block font-label text-label text-text-grey"
            >
              Organization{" "}
              <span aria-hidden="true" className="text-brand-red">
                *
              </span>
              <span className="sr-only">(required)</span>
            </label>
            <p className="mt-1 min-h-[2.5rem] font-body text-xs leading-5 text-text-grey">Select the organization named on the CIPL; the relationship label identifies VMI Customer or Trading Supplier.</p>
            <div className="relative mt-1" ref={vendorSearchRef}>
              <input type="hidden" name="vendorPartyId" value={vendorPartyId} />
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-text-grey" />
              <input
                id="vendorPartyId"
                type="text"
                required
                disabled={vendorParties.length === 0}
                value={vendorSearch || (selectedVendor ? `${selectedVendor.code} — ${selectedVendor.name}` : "")}
                placeholder={vendorParties.length === 0 ? "No active organizations available" : "Search organization…"}
                onFocus={() => vendorParties.length > 0 && setIsVendorOpen(true)}
                onChange={(event) => {
                  setVendorSearch(event.target.value);
                  setVendorPartyId("");
                  setFlowType("");
                  setIsVendorOpen(true);
                }}
                className="h-11 w-full rounded-lg border border-slate-200 bg-surface-white pl-9 pr-9 font-body text-body-md text-on-surface disabled:cursor-not-allowed disabled:bg-surface-light-grey focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
              />
              <ChevronDown
                className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-grey transition-transform ${isVendorOpen ? "rotate-180" : ""}`}
              />
              {isVendorOpen && vendorParties.length > 0 && (
                <div className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto rounded-xl border border-outline-variant/40 bg-surface-white p-1 shadow-elevation-4">
                  {filteredVendorParties.length > 0 ? filteredVendorParties.map((party) => (
                    <button
                      key={`${party.id}:${party.relationship ?? "legacy"}`}
                      type="button"
                      onClick={() => {
                        if (vendorPartyId !== party.id) setImportedLines([]);
                        setVendorPartyId(party.id);
                        setVendorSearch(`${party.code} — ${party.name}`);
                        setIsVendorOpen(false);
                        if (party.defaultInventoryModel) {
                          setFlowType(party.defaultInventoryModel);
                        } else {
                          setFlowType("");
                        }
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left font-body text-body-sm text-on-surface hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    >
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-brand-navy">{party.code}</span>
                        <span className="ml-2 truncate text-slate-700">— {party.name}</span>
                      </div>
                      {party.roles?.length && (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700 border border-slate-200 shrink-0">
                          {getBusinessRoleLabel(party)}{party.relationship ? ` · ${party.relationship === "vmi_customer" ? "VMI" : party.relationship === "trading_customer" ? "Trading Customer" : "Trading Supplier"}` : ""}
                        </span>
                      )}
                    </button>
                  )) : (
                    <p className="px-3 py-3 font-body text-body-sm text-text-grey">No matching organizations.</p>
                  )}
                  <div className="border-t border-outline-variant/30 bg-[#F0F4FF] p-2.5">
                    <Link
                      href={`/master-data/parties/new${vendorSearch.trim() ? `?code=${encodeURIComponent(vendorSearch.trim())}` : ""}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex min-w-0 items-center justify-between gap-2 rounded-lg border border-brand-navy/30 bg-surface-white px-3 py-2 font-label text-label-xs font-bold text-brand-navy shadow-sm transition-colors hover:bg-brand-navy hover:text-surface-white"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <PlusCircle className="h-4 w-4 shrink-0 text-brand-royal-blue group-hover:text-surface-white" />
                        <span className="truncate">
                          {vendorSearch.trim() ? `+ Enroll "${vendorSearch.trim()}" in Master Data` : "+ Enroll New Organization in Master Data"}
                        </span>
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 shrink-0 text-text-grey group-hover:text-surface-white" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
            {vendorParties.length === 0 && (
              <p className="mt-1 font-body text-body-sm text-status-held">
                No active organizations are available for receiving. Activate an organization with a receiving role before creating a WRR.
              </p>
            )}
          </div>

          {/* Inventory Model — inherited from the selected Organization */}
          <div>
            <div className="flex items-center justify-between">
              <label
                htmlFor="flowType"
                className="block font-label text-label text-text-grey"
              >
                Inventory Model{" "}
                <span aria-hidden="true" className="text-brand-red">
                  *
                </span>
                <span className="sr-only">(required)</span>
              </label>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Inherited from organization
              </span>
            </div>
            <p className="mt-1 min-h-[2.5rem] font-body text-xs leading-5 text-text-grey">
              The Inventory Model is inherited from the organization&apos;s active receiving relationship and cannot be overridden here.
            </p>
            <div className={`mt-1 flex h-11 items-center justify-between rounded-lg border px-3 font-body text-body-md ${inheritedModel ? "border-emerald-200 bg-emerald-50/60 text-on-surface" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
              <span>{inheritedModel === "vmi" ? "VMI (Consignment)" : inheritedModel === "trading" ? "Trading (Owned)" : inheritedModel === "supplies" ? "Supplies" : "Select an organization with one active receiving model"}</span>
              {inheritedModel && <span className="font-label text-xs font-bold uppercase tracking-wide text-emerald-700">Auto</span>}
            </div>
            <input type="hidden" id="flowType" name="flowType" value={inheritedModel} required />
          </div>

          {/* Commercial Invoice No — optional */}
          <div>
            <label
              htmlFor="commercialInvoiceNo"
              className="block font-label text-label text-text-grey"
            >
              Commercial Invoice No.
            </label>
            <input
              id="commercialInvoiceNo"
              name="commercialInvoiceNo"
              type="text"
              placeholder="CIPL / commercial invoice reference"
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-surface-white px-3 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
            />
          </div>

          {/* IP Number — optional */}
          <div>
            <label
              htmlFor="ipNumber"
              className="block font-label text-label text-text-grey"
            >
              IP Number
            </label>
            <input
              id="ipNumber"
              name="ipNumber"
              type="text"
              placeholder="Import permit number"
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-surface-white px-3 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
            />
          </div>

          {/* MAWB/MBL Number — optional */}
          <div>
            <label
              htmlFor="mawbMblNumber"
              className="block font-label text-label text-text-grey"
            >
              MAWB / MBL Number
            </label>
            <input
              id="mawbMblNumber"
              name="mawbMblNumber"
              type="text"
              placeholder="Master Air Waybill / Bill of Lading number"
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-surface-white px-3 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
            />
          </div>
        </div>
      </div>

      {/* Incoming Shipment Details section — clean matching card container */}
      <div className="rounded-2xl border border-slate-200/80 bg-surface-white p-6 shadow-sm space-y-4">
        <div className="border-b border-slate-100 pb-3">
          <h2 className="font-heading text-title-md font-bold text-on-surface">
            Incoming Shipment Details
          </h2>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            At least one line is required. Specify item, shipping lot, expected quantity, unit CBM, and UOM.
          </p>
        </div>
        <div>
          <WrrLineItems
            flowType={flowType}
            vendorPartyId={vendorPartyId}
            itemOptions={itemOptions}
            importedLines={importedLines}
            onRefresh={() => router.refresh()}
          />
        </div>
      </div>

      {/* Form actions */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={vendorParties.length === 0 || offline}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-navy px-7 font-label text-label font-bold text-surface-white shadow-sm hover:bg-brand-navy/90 motion-safe:active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:opacity-50"
        >
          {offline ? "Reconnect to create WRR" : "Create Staged WRR"}
        </button>
        <Link
          href="/receiving"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-200 bg-surface-white px-6 font-label text-label text-slate-700 hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-navy"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
