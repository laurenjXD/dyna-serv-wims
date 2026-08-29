"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AlertTriangle, X, Search, PlusCircle, RefreshCw } from "lucide-react";

interface ScanDiscrepancyModalProps {
  isOpen: boolean;
  onClose: () => void;
  scannedBarcode?: string;
  reason?: string;
  contextType: "receiving" | "dispatch" | "transfer";
  contextRef?: string;
}

export function ScanDiscrepancyModal({
  isOpen,
  onClose,
  scannedBarcode,
  reason = "unknown_error",
  contextType,
  contextRef,
}: ScanDiscrepancyModalProps) {
  if (!isOpen) return null;

  const getDetails = (reasonCode: string) => {
    switch (reasonCode) {
      case "unknown_item":
        return {
          title: "Unregistered Item Barcode",
          description: "This barcode was not found in the Dyna-Serv Master Items database. The item must be enrolled before it can be received.",
          recommendation: "Enroll this item in Master Data or verify if the vendor used an internal part number.",
          canEnroll: true,
        };
      case "no_match":
        return {
          title: "Barcode Not on this Document",
          description: `The scanned barcode does not match any item or lot listed on ${contextType === "receiving" ? "WRR" : "Pick List"} ${contextRef || ""}.`,
          recommendation: "Check if this carton belongs to a different shipment or purchase order.",
          canEnroll: false,
        };
      case "duplicate_unit_scan":
      case "duplicate":
        return {
          title: "Duplicate Unit Scan",
          description: "This specific carton or unit label has already been scanned and recorded in the system.",
          recommendation: "Ensure you are not scanning the same box twice. If this is a new physical box, verify if a duplicate QR code was printed.",
          canEnroll: false,
        };
      case "over_quantity":
        return {
          title: "Quantity Exceeds Expected Baseline",
          description: "All expected cartons/units for this line item have already been scanned.",
          recommendation: "If physical delivery has extra excess boxes, use the Overage Intake workflow or set aside for supervisor verification.",
          canEnroll: false,
        };
      case "flow_type_mismatch":
        return {
          title: "Flow Type Mismatch",
          description: "The scanned item belongs to a different flow type (e.g. VMI vs. Trading vs. Supplies) than this document.",
          recommendation: "Segregate this carton into the appropriate flow staging lane.",
          canEnroll: false,
        };
      case "wrong_item":
      case "wrong_lot":
        return {
          title: "Incorrect Item / Lot Scanned",
          description: "The scanned box does not match the allocated Item Code or FIFO Lot Number for this pick list.",
          recommendation: "Return this box to its storage rack and verify the exact location and lot number shown on the pick list.",
          canEnroll: false,
        };
      default:
        return {
          title: "Scan Discrepancy Detected",
          description: `The scanned barcode could not be processed: ${reasonCode.replace(/_/g, " ")}.`,
          recommendation: "Verify the physical label and try scanning again, or contact a warehouse supervisor.",
          canEnroll: false,
        };
    }
  };

  const details = getDetails(reason);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="discrepancy-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-3">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/30 bg-status-held/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-status-held/20 text-status-held">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 id="discrepancy-modal-title" className="font-heading text-title-md font-bold text-on-surface">
                {details.title}
              </h3>
              <p className="font-body text-body-xs text-text-grey">Floor Scan Validation Error</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-2 text-text-grey hover:bg-surface-light-grey hover:text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="space-y-4 p-5">
          {/* Scanned Barcode Display */}
          {scannedBarcode && (
            <div className="rounded-xl border border-outline-variant/40 bg-surface-light-grey/60 p-3">
              <span className="block font-label text-label-xs uppercase tracking-wider text-text-grey">
                Scanned Value / Barcode:
              </span>
              <span className="mt-1 block font-mono text-mono-md font-bold text-brand-navy break-all">
                {scannedBarcode}
              </span>
            </div>
          )}

          {/* Description & Explanation */}
          <div className="space-y-2">
            <p className="font-body text-body-md text-on-surface">
              {details.description}
            </p>
            <div className="rounded-lg border-l-4 border-status-pending bg-status-pending/10 p-3">
              <p className="font-body text-body-sm font-semibold text-on-surface">
                Recommended Action:
              </p>
              <p className="mt-0.5 font-body text-body-sm text-text-grey">
                {details.recommendation}
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer / Quick Actions */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-outline-variant/30 bg-surface-light-grey/30 px-5 py-4">
          {details.canEnroll && (
            <Link
              href="/inventory"
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-brand-royal-blue px-4 font-label text-label font-bold text-surface-white hover:bg-brand-royal-blue/90 focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <PlusCircle className="h-4 w-4" />
              Enroll Item
            </Link>
          )}

          <Link
            href="/inventory?tab=stock-view"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border border-outline-variant/50 bg-surface-white px-4 font-label text-label font-semibold text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            <Search className="h-4 w-4" />
            Lookup Stock
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-primary px-5 font-label text-label font-bold text-surface-white hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            <RefreshCw className="h-4 w-4" />
            Dismiss & Resume
          </button>
        </div>
      </div>
    </div>
  );
}
