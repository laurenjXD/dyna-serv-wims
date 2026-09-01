"use client";

// Create-WRR form body — header fields, expected lines, and actions.
//
// Split out from page.tsx (2026-08-19 user request) so Inventory Model
// selection can be shared client-side state between the header select and
// WrrLineItems' conditional Item Code label. Vendor Organization is a
// dropdown of real parties (page.tsx fetches the list). PEZA Number is no
// longer collected on this form. CIPL is a real Storage upload (2026-08-19
// follow-up request), not a pasted URL.
//
// Traceability:
//   specs/07-incoming-receiving/design.md §5 (pre-receiving WRR design), §5.1
//     (expected line fields)
//   specs/04-services-and-infrastructure/design.md §10 (Supabase Storage
//     design — `cipl-documents` bucket, object path convention)

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { SupplierPartyOption, WrrItemOption } from "@/lib/db/queries/items";
import type { UploadCiplFileResult } from "@/lib/actions/receiving";
import { WrrLineItems, type ImportedWrrLine } from "./wrr-line-items";
import { CiPlImportModal } from "../../_components/CiPlImportModal";
import { ChevronDown, ExternalLink, FileSpreadsheet, PlusCircle, Search } from "lucide-react";

const CIPL_ACCEPT = "application/pdf,image/png,image/jpeg";

interface WrrNewFormProps {
  action: (formData: FormData) => void;
  vendorParties: SupplierPartyOption[];
  itemOptions: WrrItemOption[];
  onUploadCipl: (wrrId: string, formData: FormData) => Promise<UploadCiplFileResult>;
}

export function WrrNewForm({ action, vendorParties, itemOptions, onUploadCipl }: WrrNewFormProps) {
  const [flowType, setFlowType] = useState("");
  const [vendorPartyId, setVendorPartyId] = useState("");
  const [vendorSearch, setVendorSearch] = useState("");
  const [isVendorOpen, setIsVendorOpen] = useState(false);
  const vendorSearchRef = useRef<HTMLDivElement>(null);

  // Reserved up front (specs/04-services-and-infrastructure/design.md §10.2's
  // path pattern needs a wrr_id before the row exists) so a CIPL file can
  // upload to its final Storage path immediately on selection, without
  // waiting for the whole form to submit. lib/actions/receiving.ts's
  // createWrr reuses this exact id when creating the row (CreateWrrInput.id)
  // so the two agree.
  const [wrrId] = useState(() => crypto.randomUUID());
  const [ciplPath, setCiplPath] = useState<string | null>(null);
  const [ciplFileName, setCiplFileName] = useState<string | null>(null);
  const [ciplStatus, setCiplStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [ciplError, setCiplError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importedLines, setImportedLines] = useState<ImportedWrrLine[]>([]);

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

  async function handleCiplFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCiplFileName(file.name);
    setCiplStatus("uploading");
    setCiplError(null);
    setCiplPath(null);

    const uploadFormData = new FormData();
    uploadFormData.set("file", file);

    const result = await onUploadCipl(wrrId, uploadFormData);
    if (result.ok) {
      setCiplPath(result.path);
      setCiplStatus("done");
    } else {
      setCiplStatus("error");
      setCiplError(result.error);
    }
  }

  return (
    <form action={action} className="mt-6 space-y-6">
      {/* Client-generated WRR id */}
      <input type="hidden" name="id" value={wrrId} />

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
          {selectedVendor?.defaultInventoryModel && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-brand-navy border border-blue-200">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
              Role: {selectedVendor.roles?.join(" / ") ?? "Assigned"}
            </span>
          )}
        </div>

        {/* 2-column balanced grid */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {/* Vendor Organization — dropdown of active vendor/supplier parties */}
          <div>
            <label
              htmlFor="vendorPartyId"
              className="block font-label text-label text-text-grey"
            >
              Vendor Organization{" "}
              <span aria-hidden="true" className="text-brand-red">
                *
              </span>
              <span className="sr-only">(required)</span>
            </label>
            <div className="relative mt-1" ref={vendorSearchRef}>
              <input type="hidden" name="vendorPartyId" value={vendorPartyId} />
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-text-grey" />
              <input
                id="vendorPartyId"
                type="text"
                required
                disabled={vendorParties.length === 0}
                value={vendorSearch || (selectedVendor ? `${selectedVendor.code} — ${selectedVendor.name}` : "")}
                placeholder={vendorParties.length === 0 ? "No active vendor organizations available" : "Search vendor organization…"}
                onFocus={() => vendorParties.length > 0 && setIsVendorOpen(true)}
                onChange={(event) => {
                  setVendorSearch(event.target.value);
                  setVendorPartyId("");
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
                      key={party.id}
                      type="button"
                      onClick={() => {
                        setVendorPartyId(party.id);
                        setVendorSearch(`${party.code} — ${party.name}`);
                        setIsVendorOpen(false);
                        // Auto-assign inventory model based on organization role
                        if (party.defaultInventoryModel) {
                          setFlowType(party.defaultInventoryModel);
                        }
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left font-body text-body-sm text-on-surface hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-brand-navy"
                    >
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-brand-navy">{party.code}</span>
                        <span className="ml-2 truncate text-slate-700">— {party.name}</span>
                      </div>
                      {party.defaultInventoryModel && (
                        <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-700 border border-slate-200 shrink-0">
                          {party.defaultInventoryModel}
                        </span>
                      )}
                    </button>
                  )) : (
                    <p className="px-3 py-3 font-body text-body-sm text-text-grey">No matching vendor organizations.</p>
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
                Create an active Party with the Vendor or Supplier role before creating a WRR.
              </p>
            )}
          </div>

          {/* Inventory Model — auto-assigned conditionally from party role */}
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
              {selectedVendor?.defaultInventoryModel && flowType === selectedVendor.defaultInventoryModel && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Auto-assigned from role
                </span>
              )}
            </div>
            <select
              id="flowType"
              name="flowType"
              required
              value={flowType}
              onChange={(e) => setFlowType(e.target.value)}
              className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-surface-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <option value="">Select inventory model…</option>
              <option value="vmi">VMI (Consignment)</option>
              <option value="trading">Trading (Owned)</option>
              <option value="supplies">Supplies</option>
            </select>
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

          {/* CIPL / Packing List Document */}
          <div>
            <label
              htmlFor="ciplFile"
              className="block font-label text-label text-text-grey"
            >
              CIPL / Packing List Document
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-navy px-4 font-label text-label text-surface-white hover:bg-brand-navy/90 transition-colors shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Auto-Parse Excel / PDF CIPL
              </button>
              <label
                htmlFor="ciplFile"
                className="inline-flex h-11 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 font-label text-label text-slate-700 hover:bg-slate-100 transition-colors"
              >
                {ciplFileName ? "Change File" : "Choose File"}
              </label>
            </div>
            <input
              id="ciplFile"
              type="file"
              accept={CIPL_ACCEPT}
              onChange={handleCiplFileChange}
              className="sr-only"
            />
            <input type="hidden" name="ciplFileUrl" value={ciplPath ?? ""} />
            {ciplStatus === "uploading" && (
              <p className="mt-1.5 font-body text-body-sm text-text-grey">
                Uploading {ciplFileName}…
              </p>
            )}
            {ciplStatus === "done" && (
              <p className="mt-1.5 font-body text-body-sm text-status-available">
                ✓ Attached: {ciplFileName}
              </p>
            )}
            {ciplStatus === "error" && (
              <p role="alert" className="mt-1.5 font-body text-body-sm text-brand-red">
                {ciplError}
              </p>
            )}
            <p className="mt-1 font-body text-[11px] text-text-grey">
              Excel (.xlsx, .csv), PDF, PNG, or JPEG — up to 10MB.
            </p>

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
                  setImportedLines(lines);
                  setCiplStatus("done");
                  setCiplFileName("Parsed Document Lines Applied");
                }}
              />
            )}
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
          <WrrLineItems flowType={flowType} vendorPartyId={vendorPartyId} itemOptions={itemOptions} importedLines={importedLines} />
        </div>
      </div>

      {/* Form actions */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={vendorParties.length === 0 || ciplStatus === "uploading"}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-navy px-7 font-label text-label font-bold text-surface-white shadow-sm hover:bg-brand-navy/90 motion-safe:active:scale-[0.98] transition-all focus:outline-none focus:ring-2 focus:ring-brand-navy disabled:opacity-50"
        >
          {ciplStatus === "uploading" ? "Uploading CIPL…" : "Create Staged WRR"}
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
