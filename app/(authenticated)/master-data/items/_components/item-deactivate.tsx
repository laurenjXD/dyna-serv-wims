"use client";

// Self-contained deactivation section for the item detail page.
// Importable from a Server Component.
//
// Traceability:
//   specs/06-party-and-item-enrollment/design.md §6

import { useActionState, useState } from "react";
import { deactivateItemAction } from "../_actions";

export function DeactivateItemSection({ itemId }: { itemId: string }) {
  const [state, formAction, isPending] = useActionState(
    deactivateItemAction,
    {},
  );
  const [confirmed, setConfirmed] = useState(false);

  if (state.ok) {
    return (
      <p className="font-body text-body-md text-status-success">
        Item has been deactivated. Reload the page to see the updated status.
      </p>
    );
  }

  return (
    <div>
      {!confirmed ? (
        <button
          type="button"
          onClick={() => setConfirmed(true)}
          className="flex h-11 items-center justify-center rounded border border-status-error px-4 font-label text-label text-status-error hover:bg-status-error/5 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-status-error"
        >
          Deactivate Item
        </button>
      ) : (
        <form action={formAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="id" value={itemId} />
          <p className="font-body text-body-md text-on-surface">
            Deactivate this item? It will no longer appear in item selection
            lists for new transactions.
          </p>
          <button
            type="button"
            onClick={() => setConfirmed(false)}
            className="flex h-11 items-center px-2 font-label text-label text-on-surface-variant underline focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex h-11 items-center justify-center rounded bg-status-error px-4 font-label text-label text-white hover:opacity-90 active:scale-[0.97] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-status-error"
          >
            {isPending ? "Deactivating…" : "Confirm Deactivate"}
          </button>
        </form>
      )}
      {state.error && (
        <p role="alert" className="mt-2 font-body text-body-sm text-action-blue">
          {state.error}
        </p>
      )}
    </div>
  );
}
