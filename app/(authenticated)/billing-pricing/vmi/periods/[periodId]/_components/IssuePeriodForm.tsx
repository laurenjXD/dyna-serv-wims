"use client";

import { toUserMessage } from "@/lib/ui/user-messages";
import { useActionState } from "react";
import { issueVmiPeriodAction, type VmiPeriodIssueState } from "../../_actions";

const initialState: VmiPeriodIssueState = {};

export function IssuePeriodForm({ periodId }: { periodId: string }) {
  const [state, formAction, isPending] = useActionState(issueVmiPeriodAction, initialState);
  const friendlyError = state.error
    ? toUserMessage(state.error, "The billing period could not be issued. Refresh the period to check its status before trying again.")
    : null;
  return (
    <div className="mt-4 border-t border-outline-variant/20 pt-4">
      {friendlyError && <div className="mb-3 rounded-xl border border-status-held/30 bg-status-held/10 p-3 font-body text-body-sm text-status-held" role="alert"><p className="font-semibold">The period was not issued.</p><p className="mt-1">{friendlyError}</p></div>}
      {state.ok && <div className="mb-3 rounded-lg bg-status-available/10 p-3 font-body text-body-sm text-status-available">All four PDFs were created. The billing period is now issued.</div>}
      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input type="hidden" name="periodId" value={periodId} />
        <p className="font-body text-body-sm text-text-grey">Administrator-only. Issuing creates the official PDFs and locks this period.</p>
        <button type="submit" disabled={isPending} className="h-11 shrink-0 rounded bg-brand-navy px-5 font-label text-label font-bold text-surface-white hover:bg-brand-navy/90 disabled:opacity-50">{isPending ? "Issuing documents…" : "Issue period"}</button>
      </form>
    </div>
  );
}
