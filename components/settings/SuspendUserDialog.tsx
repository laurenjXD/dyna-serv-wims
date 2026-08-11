// <ConfirmationDialog> (Danger styled) for the Suspend User flow.
//
// Traceability: specs/21-user-profile-and-settings/design.md §2.2 and
// tasks.md Task 21.8.

"use client";

import { useState, type FormEvent } from "react";

export function SuspendUserDialog({
  displayName,
  onCancel,
  onConfirm,
}: {
  displayName: string;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reason.trim()) {
      setError("A reason is required to suspend a user.");
      return;
    }
    setError(null);
    setSubmitting(true);
    const result = await onConfirm(reason.trim());
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Failed to suspend user.");
    }
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="suspend-user-title"
      data-testid="suspend-user-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary/40 p-4"
    >
      <div className="w-full max-w-sm rounded-md bg-white p-6 shadow-elevation-2">
        <h2
          id="suspend-user-title"
          className="font-heading text-headline-md font-semibold text-status-error"
        >
          Suspend {displayName}?
        </h2>
        <p className="mt-2 font-body text-body-md text-on-surface-variant">
          This immediately revokes their access and active sessions. This action is logged.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-4 flex flex-col gap-3">
          <label
            htmlFor="suspend-reason"
            className="font-label text-label uppercase tracking-wide text-on-surface"
          >
            Reason
          </label>
          <textarea
            id="suspend-reason"
            data-testid="suspend-reason-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="rounded border border-outline-variant/30 bg-white px-3 py-2 font-body text-body-md text-on-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />

          {error && (
            <p role="alert" className="font-body text-body-sm text-action-blue">
              {error}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex min-h-11 items-center rounded border-2 border-outline-variant/30 px-4 font-label text-label uppercase tracking-wide text-on-surface hover:bg-surface-dim"
            >
              Cancel
            </button>
            <button
              type="submit"
              data-testid="suspend-confirm"
              disabled={submitting}
              className="flex min-h-11 items-center rounded bg-status-error px-4 font-label text-label uppercase tracking-wide text-white hover:bg-status-error/90 disabled:opacity-60"
            >
              {submitting ? "Suspending…" : "Suspend user"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
