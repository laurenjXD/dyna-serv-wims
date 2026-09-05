"use client";

import { useState } from "react";
import { RotateCw, X, AlertCircle } from "lucide-react";
import { requestDocumentReprintAction } from "../_actions";

interface DocumentReprintDialogProps {
  documentId: string;
  documentNumber: string;
  onClose: () => void;
  onSuccess: (result: { watermarkText: string; documentNumber: string }) => void;
}

export function DocumentReprintDialog({
  documentId,
  documentNumber,
  onClose,
  onSuccess,
}: DocumentReprintDialogProps) {
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await requestDocumentReprintAction({
        documentId,
        reason: reason.trim() || undefined,
      });

      if (res.ok) {
        onSuccess({
          watermarkText: res.data.watermarkText,
          documentNumber: res.data.documentNumber,
        });
      } else {
        setErrorMsg(res.error || "Failed to initiate reprint");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reprint-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-lg rounded-3xl border border-outline-variant/30 bg-surface-white p-6 shadow-elevation-3">
        <div className="flex items-center justify-between border-b border-outline-variant/30 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-status-pending/10 text-status-pending">
              <RotateCw size={20} />
            </div>
            <div>
              <h3 id="reprint-dialog-title" className="font-heading text-headline-sm font-bold text-on-surface">
                Confirm Document Reprint
              </h3>
              <p className="font-body text-body-sm text-text-grey">{documentNumber}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-text-grey hover:bg-surface-light-grey hover:text-on-surface"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="rounded-xl border border-status-pending/30 bg-status-pending/10 p-3">
            <p className="font-body text-body-sm text-on-surface">
              <strong>Audit Notice:</strong> Reprints are logged permanently in the system event log. The output document will bear a mandatory diagonal <strong>REPRINT — [Timestamp]</strong> watermark.
            </p>
          </div>

          <div>
            <label htmlFor="reprint-reason" className="block font-label text-label font-bold text-on-surface">
              Reason for Reprint (Optional)
            </label>
            <input
              id="reprint-reason"
              type="text"
              placeholder="e.g. Lost original, customer copy damaged..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 h-11 w-full rounded-xl border border-outline-variant/40 bg-surface-white px-3 font-body text-body-md text-on-surface focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
            />
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 rounded-xl bg-status-held/10 p-3 font-body text-body-sm text-status-held">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-11 rounded-xl border border-outline-variant/40 px-4 font-label text-label font-medium text-text-grey hover:bg-surface-light-grey hover:text-on-surface"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-navy px-5 font-label text-label font-bold text-surface-white hover:bg-brand-navy/90 disabled:opacity-50"
            >
              <RotateCw size={16} />
              {isSubmitting ? "Logging..." : "Confirm & Reprint"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
