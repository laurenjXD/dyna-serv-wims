"use client";

import { useActionState } from "react";
import { addSampleData, type SampleDataState } from "../_actions";

export function SampleDataButton() {
  const [state, formAction, pending] = useActionState<
    SampleDataState,
    FormData
  >(addSampleData, null);

  return (
    <div className="mt-4 rounded-md border border-outline-variant/30 bg-surface-light-grey px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-label text-label text-on-surface">
            Sample workflow data
          </p>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            Add three sample organizations, three linked items, and three staged
            WRRs. No inventory is received or changed.
          </p>
        </div>
        <form action={formAction}>
          <button
            type="submit"
            disabled={pending}
            className="flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-brand-red"
          >
            {pending ? "Adding sample data…" : "Add Sample Data"}
          </button>
        </form>
      </div>
      {state?.ok && (
        <p
          className="mt-3 font-body text-body-sm text-status-success"
          role="status"
        >
          {state.message}
        </p>
      )}
      {state?.ok === false && (
        <p
          className="mt-3 font-body text-body-sm text-status-alert"
          role="alert"
        >
          {state.error}
        </p>
      )}
    </div>
  );
}
