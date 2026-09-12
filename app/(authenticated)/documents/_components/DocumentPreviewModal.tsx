"use client";

import { useState, useEffect } from "react";
import {
  X,
  Printer,
  Download,
  FileText,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  RotateCw,
} from "lucide-react";

export interface PreviewDocData {
  id: string;
  documentNumber: string;
  title: string;
  documentType: string;
  status: string;
  snapshotHash?: string | null;
  generatedAt?: string | Date | null;
  actorName?: string | null;
  organizationName?: string | null;
  previewUrl?: string | null;
  downloadUrl?: string | null;
  error?: {
    whatHappened: string;
    whyItFailed: string;
    nextAction: string;
  } | null;
}

interface DocumentPreviewModalProps {
  doc: PreviewDocData | null;
  onClose: () => void;
  onReprint?: (doc: PreviewDocData) => void;
}

export function DocumentPreviewModal({
  doc,
  onClose,
  onReprint,
}: DocumentPreviewModalProps) {
  const [showMetadata, setShowMetadata] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [activeTab, setActiveTab] = useState<"primary" | "secondary">("primary");

  // Reset tab when doc changes
  useEffect(() => {
    setActiveTab("primary");
  }, [doc?.id, doc?.documentType]);

  // Close on Escape key
  useEffect(() => {
    if (!doc) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [doc, onClose]);

  if (!doc) return null;

  // Resolve active document URLs and titles based on switcher
  const isWrrGroup = doc.documentType === "wrr" || doc.documentType === "inbound_receipt";
  const isPickGroup = doc.documentType === "pick_list" || doc.documentType === "acknowledgement_receipt";

  let activeTitle = doc.title;
  let activeNumber = doc.documentNumber;
  let activePreviewUrl = doc.previewUrl;
  let activeDownloadUrl = doc.downloadUrl;

  if (isWrrGroup) {
    if (activeTab === "primary") {
      activeTitle = "Warehouse Receiving Report (WRR)";
      activeNumber = doc.documentNumber.startsWith("IGR-") ? `WRR-${doc.documentNumber.replace(/^IGR-/, "")}` : doc.documentNumber;
      activePreviewUrl = `/receiving/${doc.id}/print`;
      activeDownloadUrl = `/receiving/${doc.id}/print`;
    } else {
      activeTitle = "Inbound Goods Turnover Receipt";
      activeNumber = `IGR-${doc.documentNumber.replace(/^WRR-/, "").replace(/^IGR-/, "")}`;
      activePreviewUrl = `/receiving/${doc.id}/receipt`;
      activeDownloadUrl = `/receiving/${doc.id}/receipt`;
    }
  } else if (isPickGroup) {
    if (activeTab === "primary") {
      activeTitle = "Pick List Work Order";
      activeNumber = doc.documentNumber;
      activePreviewUrl = `/pick-lists/${doc.id}/print`;
      activeDownloadUrl = `/pick-lists/${doc.id}/print`;
    } else {
      activeTitle = "Imported Delivery Request Authorization (DRA)";
      activeNumber = `DRA-${doc.documentNumber.replace(/^PL-/, "")}`;
      activePreviewUrl = doc.downloadUrl?.startsWith("http") ? doc.downloadUrl : doc.previewUrl;
      activeDownloadUrl = activePreviewUrl;
    }
  }

  const handlePrint = () => {
    if (activePreviewUrl) {
      const printWindow = window.open(activePreviewUrl, "_blank");
      printWindow?.focus();
    } else {
      window.print();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-2 sm:p-4 backdrop-blur-md"
    >
      <div className="relative flex h-[94vh] w-full max-w-6xl flex-col rounded-3xl border border-outline-variant/30 bg-surface-white shadow-elevation-3 overflow-hidden">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between border-b border-outline-variant/30 bg-surface px-6 py-3.5 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-navy/10 text-brand-navy">
              <FileText size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2
                  id="preview-modal-title"
                  className="truncate font-heading text-headline-sm font-extrabold text-on-surface"
                >
                  {activeTitle}
                </h2>
                <span className="rounded bg-brand-navy/10 px-2 py-0.5 font-mono text-[11px] font-bold text-brand-navy">
                  {activeNumber}
                </span>

                {/* In-Modal Document Switcher for WRR / Inbound Receipt */}
                {isWrrGroup && (
                  <div className="ml-2 flex items-center rounded-xl border border-brand-navy/20 bg-brand-navy/5 p-0.5 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setActiveTab("primary")}
                      className={`rounded-lg px-2.5 py-1 transition-all ${
                        activeTab === "primary"
                          ? "bg-brand-navy text-white shadow-sm"
                          : "text-brand-navy hover:bg-brand-navy/10"
                      }`}
                    >
                      WRR Report
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("secondary")}
                      className={`rounded-lg px-2.5 py-1 transition-all ${
                        activeTab === "secondary"
                          ? "bg-brand-navy text-white shadow-sm"
                          : "text-brand-navy hover:bg-brand-navy/10"
                      }`}
                    >
                      Turnover Receipt
                    </button>
                  </div>
                )}

                {/* In-Modal Document Switcher for Pick List / DRA (only if DRA attached) */}
                {isPickGroup && doc.downloadUrl && doc.downloadUrl.startsWith("http") && (
                  <div className="ml-2 flex items-center rounded-xl border border-brand-navy/20 bg-brand-navy/5 p-0.5 text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setActiveTab("primary")}
                      className={`rounded-lg px-2.5 py-1 transition-all ${
                        activeTab === "primary"
                          ? "bg-brand-navy text-white shadow-sm"
                          : "text-brand-navy hover:bg-brand-navy/10"
                      }`}
                    >
                      Pick List
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("secondary")}
                      className={`rounded-lg px-2.5 py-1 transition-all ${
                        activeTab === "secondary"
                          ? "bg-brand-navy text-white shadow-sm"
                          : "text-brand-navy hover:bg-brand-navy/10"
                      }`}
                    >
                      Attached DRA
                    </button>
                  </div>
                )}
              </div>
              {doc.organizationName && (
                <p className="truncate font-body text-body-xs text-text-grey mt-0.5">
                  Organization: <strong className="text-on-surface">{doc.organizationName}</strong>
                </p>
              )}
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center rounded-xl border border-outline-variant/30 bg-surface-light-grey/40 px-1 py-0.5">
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.max(70, z - 10))}
                className="h-8 w-8 rounded-lg font-bold text-text-grey hover:bg-surface-white hover:text-on-surface"
                title="Zoom Out"
              >
                -
              </button>
              <span className="px-2 font-mono text-mono-xs text-text-grey font-bold">
                {zoomLevel}%
              </span>
              <button
                type="button"
                onClick={() => setZoomLevel((z) => Math.min(130, z + 10))}
                className="h-8 w-8 rounded-lg font-bold text-text-grey hover:bg-surface-white hover:text-on-surface"
                title="Zoom In"
              >
                +
              </button>
            </div>

            {onReprint && doc.status === "ready" && (
              <button
                type="button"
                onClick={() => onReprint(doc)}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-status-pending/40 bg-status-pending/10 px-3 font-label text-label font-bold text-status-pending hover:bg-status-pending/20 focus:outline-none focus:ring-2 focus:ring-status-pending transition-colors"
              >
                <RotateCw size={15} />
                Reprint
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const linkToCopy = doc.downloadUrl?.startsWith("http")
                  ? doc.downloadUrl
                  : typeof window !== "undefined"
                  ? `${window.location.origin}${doc.previewUrl || ""}`
                  : "";
                if (linkToCopy && typeof navigator !== "undefined") {
                  navigator.clipboard.writeText(linkToCopy);
                  alert(`Document link for ${doc.documentNumber} copied to clipboard!`);
                }
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3 font-label text-label font-bold text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy transition-colors"
              title="Copy Link"
            >
              Share
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3 font-label text-label font-bold text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy transition-colors"
            >
              <Printer size={15} />
              Print
            </button>

            {doc.downloadUrl && (
              <a
                href={doc.downloadUrl}
                download
                target={doc.downloadUrl.startsWith("http") ? "_blank" : undefined}
                rel={doc.downloadUrl.startsWith("http") ? "noopener noreferrer" : undefined}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-navy px-3.5 font-label text-label font-bold text-surface-white hover:bg-brand-navy/90 focus:outline-none focus:ring-2 focus:ring-brand-navy transition-colors"
              >
                <Download size={15} />
                Download
              </a>
            )}

            <button
              type="button"
              onClick={onClose}
              className="ml-1 inline-flex h-9 w-9 items-center justify-center rounded-xl text-text-grey hover:bg-surface-light-grey hover:text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
              aria-label="Close preview modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex flex-1 flex-col overflow-y-auto bg-slate-200/70 p-4 sm:p-6">
          {/* Error State */}
          {doc.error ? (
            <div className="my-auto mx-auto max-w-2xl rounded-2xl border border-status-held/30 bg-surface-white p-6 shadow-elevation-2">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 shrink-0 text-status-held" size={24} />
                <div className="space-y-3">
                  <div>
                    <h3 className="font-heading text-headline-sm font-bold text-status-held">
                      {doc.error.whatHappened}
                    </h3>
                    <p className="mt-1 font-body text-body-md text-on-surface">
                      <strong>Why it failed:</strong> {doc.error.whyItFailed}
                    </p>
                  </div>
                  <div className="rounded-xl border border-outline-variant/30 bg-surface-light-grey/40 p-3 font-body text-body-sm text-text-grey">
                    <strong>Next Action / Solution:</strong> {doc.error.nextAction}
                  </div>
                </div>
              </div>
            </div>
          ) : doc.previewUrl ? (
            <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-start transition-all">
              <div
                className="w-full rounded-xl bg-surface-white shadow-elevation-3 transition-transform duration-150 origin-top overflow-hidden border border-outline-variant/30 min-h-[75vh]"
                style={{ transform: `scale(${zoomLevel / 100})` }}
              >
                {doc.previewUrl.match(/\.(jpeg|jpg|png|webp|gif)(\?.*)?$/i) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={doc.previewUrl}
                    alt={`Preview ${doc.documentNumber}`}
                    className="max-h-[75vh] w-auto mx-auto object-contain p-4"
                  />
                ) : (
                  <iframe
                    src={doc.previewUrl}
                    title={`Preview ${doc.documentNumber}`}
                    className="h-[75vh] w-full border-0 bg-surface-white"
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="mx-auto my-auto flex max-w-md flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant/40 bg-surface-white p-8 text-center shadow-elevation-1">
              <FileText size={48} className="text-brand-navy" />
              <p className="mt-3 font-body text-body-md text-on-surface font-semibold">
                Digital document preview rendered inline from authoritative snapshot.
              </p>
              <p className="mt-1 font-mono text-mono-md font-bold text-brand-navy">
                {doc.documentNumber}
              </p>
              <button
                type="button"
                onClick={handlePrint}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-brand-navy px-5 font-label text-label font-bold text-surface-white hover:bg-brand-navy/90"
              >
                <Printer size={16} /> Print Document
              </button>
            </div>
          )}

          {/* Metadata Inspector Drawer */}
          <div className="mt-4 rounded-2xl border border-outline-variant/30 bg-surface-light-grey/40">
            <button
              type="button"
              onClick={() => setShowMetadata(!showMetadata)}
              className="flex w-full items-center justify-between px-4 py-3 font-label text-label text-on-surface focus:outline-none"
            >
              <span className="flex items-center gap-2 font-bold">
                <ShieldCheck size={18} className="text-brand-navy" />
                Snapshot Metadata & Hash Verification
              </span>
              {showMetadata ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {showMetadata && (
              <div className="border-t border-outline-variant/20 px-4 py-3 font-body text-body-sm text-text-grey">
                <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="font-label text-label text-text-grey">Document ID</dt>
                    <dd className="font-mono text-mono-sm text-on-surface">{doc.id}</dd>
                  </div>
                  <div>
                    <dt className="font-label text-label text-text-grey">Status</dt>
                    <dd className="font-mono text-mono-sm uppercase text-on-surface">{doc.status}</dd>
                  </div>
                  <div>
                    <dt className="font-label text-label text-text-grey">SHA-256 Snapshot Hash</dt>
                    <dd className="break-all font-mono text-mono-sm text-on-surface">
                      {doc.snapshotHash ?? "Authoritative generated hash"}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-label text-label text-text-grey">Generated Date (Asia/Manila)</dt>
                    <dd className="font-mono text-mono-sm text-on-surface">
                      {doc.generatedAt ? new Date(doc.generatedAt).toLocaleString("en-PH") : "N/A"}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
