"use client";

import { useActionState } from "react";
import { issueVmiPeriodAction, type VmiPeriodIssueState } from "../../_actions";

const initialState: VmiPeriodIssueState = {};

export function IssuePeriodForm({ periodId }: { periodId: string }) {
  const [state, formAction, isPending] = useActionState(issueVmiPeriodAction, initialState);
  return (
    <div className="mt-4 border-t border-outline-variant/20 pt-4">
      {state.error && <div className="mb-3 rounded-lg bg-status-held/10 p-3 font-body text-body-sm text-status-held">What happened: The period was not issued. Why it failed: {state.error}. Next action: Resolve the document issue and try again; this draft remains editable.</div>}
      {state.ok && <div className="mb-3 rounded-lg bg-status-available/10 p-3 font-body text-body-sm text-status-available">All four private PDF artifacts were created and the period is now issued.</div>}
      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input type="hidden" name="periodId" value={periodId} />
        <p className="font-body text-body-sm text-text-grey">Administrator-only. Issuing creates the official PDFs and locks this period.</p>
        <button type="submit" disabled={isPending} className="h-11 shrink-0 rounded bg-brand-navy px-5 font-label text-label font-bold text-surface-white hover:bg-brand-navy/90 disabled:opacity-50">{isPending ? "Issuing documents…" : "Issue period"}</button>
      </form>
    </div>
  );
}
