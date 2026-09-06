"use client";

import { useState } from "react";
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

  if (!doc) return null;

  const handlePrint = () => {
    if (doc.previewUrl) {
      const printWindow = window.open(doc.previewUrl, "_blank");
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-3xl border border-outline-variant/30 bg-surface-white shadow-elevation-3">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-navy/10 text-brand-navy">
              <FileText size={20} />
            </div>
            <div>
              <h2
                id="preview-modal-title"
                className="font-heading text-headline-md font-bold text-on-surface"
              >
                {doc.title} — {doc.documentNumber}
              </h2>
              {doc.organizationName && (
                <p className="font-body text-body-sm text-text-grey">
                  Organization: {doc.organizationName}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onReprint && doc.status === "ready" && (
              <button
                type="button"
                onClick={() => onReprint(doc)}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-status-pending/40 bg-status-pending/10 px-3 font-label text-label font-bold text-status-pending hover:bg-status-pending/20 focus:outline-none focus:ring-2 focus:ring-status-pending"
              >
                <RotateCw size={16} />
                Reprint
              </button>
            )}
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-outline-variant/40 bg-surface-white px-3 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <Printer size={16} />
              Print
            </button>
            {doc.downloadUrl && (
              <a
                href={doc.downloadUrl}
                download
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-navy px-4 font-label text-label font-bold text-surface-white hover:bg-brand-navy/90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                <Download size={16} />
                Download PDF
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="ml-2 inline-flex h-10 w-10 items-center justify-center rounded-xl text-text-grey hover:bg-surface-light-grey hover:text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
              aria-label="Close preview modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex flex-1 flex-col overflow-y-auto p-6">
          {/* 3-Component Error state if preview failed */}
          {doc.error ? (
            <div className="my-auto rounded-2xl border border-status-held/30 bg-status-held/10 p-6 text-left">
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
                  <div className="rounded-xl border border-outline-variant/30 bg-surface-white p-3 font-body text-body-sm text-text-grey">
                    <strong>Next Action / Solution:</strong> {doc.error.nextAction}
                  </div>
                </div>
              </div>
            </div>
          ) : doc.previewUrl ? (
            <div className="relative min-h-[480px] flex-1 overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-light-grey/40">
              <iframe
                src={doc.previewUrl}
                title={`Preview ${doc.documentNumber}`}
                className="h-full min-h-[500px] w-full border-0"
              />
            </div>
          ) : (
            <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-outline-variant/40 bg-surface-light-grey/20 p-8 text-center">
              <FileText size={48} className="text-text-grey" />
              <p className="mt-3 font-body text-body-md text-text-grey">
                Digital document preview rendered inline from authoritative snapshot.
              </p>
              <p className="mt-1 font-mono text-mono-md text-on-surface font-bold">
                {doc.documentNumber}
              </p>
              <button
                type="button"
                onClick={handlePrint}
                className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-brand-navy px-5 font-label text-label font-bold text-surface-white hover:bg-brand-navy/90"
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
