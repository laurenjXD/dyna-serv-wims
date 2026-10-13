"use client";

import React from "react";

export interface SignatureBlock {
  title: string;
  subtitle?: string;
}

export interface MasterDocumentFooterProps {
  showSignatures?: boolean;
  showDisclaimer?: boolean;
  signatureBlocks?: SignatureBlock[];
  disclaimerText?: string;
  className?: string;
}

const DEFAULT_SIGNATURE_BLOCKS: SignatureBlock[] = [
  { title: "Prepared By:", subtitle: "Floor Staff / Receiver" },
  { title: "Checked & QC Verified By:", subtitle: "QC Inspector / Lead" },
  { title: "Authorized Supervisor:", subtitle: "Warehouse Supervisor Approval" },
];

export function MasterDocumentFooter({
  showSignatures = true,
  showDisclaimer = false,
  signatureBlocks = DEFAULT_SIGNATURE_BLOCKS,
  disclaimerText = "Dyna-Serv Warehouse Inventory Management System • Confidential Warehouse Document",
  className = "",
}: MasterDocumentFooterProps) {
  if (!showSignatures && !showDisclaimer) {
    return null;
  }

  return (
    <div className={`master-print-footer mt-8 w-full ${className}`}>
      <style>{`
        @media print {
          .master-print-footer {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Triple / Custom Sign-off lines */}
      {showSignatures && (
        <div
          className={`grid gap-6 ${
            signatureBlocks.length === 2
              ? "grid-cols-2"
              : signatureBlocks.length >= 3
              ? "grid-cols-3"
              : "grid-cols-1"
          }`}
        >
          {signatureBlocks.map((block, idx) => (
            <div key={idx} className="space-y-1">
              <p className="font-heading text-[10px] font-bold uppercase tracking-wider text-slate-700">
                {block.title}
              </p>
              <div className="mt-7 border-b border-slate-900 pb-1" />
              {block.subtitle && (
                <div className="flex justify-between font-mono text-[10px] text-slate-500">
                  <span>{block.subtitle}</span>
                  <span>Date</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Optional Legal / Confidentiality notice */}
      {showDisclaimer && (
        <p className="mt-6 text-center font-mono text-[10px] text-slate-500 print:text-black">
          {disclaimerText}
        </p>
      )}
    </div>
  );
}
