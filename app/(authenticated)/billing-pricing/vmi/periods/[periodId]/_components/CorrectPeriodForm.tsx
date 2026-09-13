"use client";
import Link from "next/link";
import { useActionState } from "react";
import { correctVmiPeriodAction, type VmiPeriodCorrectionState } from "../../_actions";
export function CorrectPeriodForm({ periodId }: { periodId: string }) {
  const [state, action, pending] = useActionState(correctVmiPeriodAction, {} as VmiPeriodCorrectionState);
  return <div className="mt-4 border-t border-outline-variant/20 pt-4"><p className="font-body text-body-sm text-text-grey">A correction voids this issued period and creates a new revision draft. Historical PDFs remain preserved.</p>{state.error && <p className="mt-2 font-body text-body-sm text-status-held">{state.error}</p>}{state.replacementId ? <Link href={`/billing-pricing/vmi/periods/${state.replacementId}`} className="mt-3 inline-flex font-label text-label font-bold text-brand-blue hover:underline">Review correction draft</Link> : <form action={action} className="mt-3"><input type="hidden" name="periodId" value={periodId} /><button disabled={pending} className="h-11 rounded border border-brand-navy px-4 font-label text-label font-bold text-brand-navy disabled:opacity-50">{pending ? "Creating correction…" : "Correct and reissue"}</button></form>}</div>;
}
