"use client";

import { toUserMessage } from "@/lib/ui/user-messages";
import { useState } from "react";

export function CancelInviteDialog({
  displayName,
  email,
  onCancel,
  onConfirm,
}: {
  displayName: string;
  email: string | null;
  onCancel: () => void;
  onConfirm: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await onConfirm();
      if (!result.ok) setError(toUserMessage(result.error, "The invitation could not be cancelled. Try again. If it happens again, contact an administrator."));
    } catch {
      setError("The invitation could not be cancelled. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="cancel-invite-title"
      data-testid="cancel-invite-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
        <h2
          id="cancel-invite-title"
          className="font-heading text-base font-bold text-slate-900"
        >
          Cancel Invitation for {displayName}?
        </h2>
        <p className="mt-2 font-body text-body-sm text-slate-600 leading-relaxed">
          This will cancel pending account access for{" "}
          <strong className="text-slate-800">{email || displayName}</strong>.
          The account remains inactive and its history is retained. The existing invitation cannot activate this account.
        </p>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-2.5 font-body text-body-sm text-rose-600 border border-rose-200">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="min-h-11 rounded-xl border border-slate-200 px-3.5 py-2 font-label text-label font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Keep Invitation
          </button>
          <button
            type="button"
            data-testid="cancel-invite-confirm"
            onClick={handleConfirm}
            disabled={submitting}
            className="min-h-11 rounded-xl bg-brand-navy px-3.5 py-2 font-label text-label font-bold text-white shadow-xs hover:bg-brand-navy/90 transition-colors disabled:opacity-60"
          >
            {submitting ? "Cancelling…" : "Cancel Invitation"}
          </button>
        </div>
      </div>
    </div>
  );
}
