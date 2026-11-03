"use server";

import { randomUUID } from "node:crypto";
import { normalizePickListErrors } from "@/lib/withdrawal/error-messages";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { commitWithdrawal, requestFifoOverride } from "@/lib/actions/withdrawals";
import { approveCycleCount, createCycleCount, postCycleCount, recordCycleCount, rejectCycleCount, requestCycleCountRecount, submitCycleCount } from "@/lib/actions/cycle-count";

export async function createPickList(formData: FormData): Promise<void> {
  const raw = formData.get("request");
  if (typeof raw !== "string") redirect("/inventory?pickListError=invalid_request");
  let result: Awaited<ReturnType<typeof commitWithdrawal>>;
  try {
    const resolver = await createPageResolver();
    result = await commitWithdrawal(resolver, JSON.parse(raw));
  } catch {
    redirect("/inventory?pickListError=unable_to_reserve_stock");
  }

  if (!result.ok) {
    redirect(`/inventory?pickListError=${encodeURIComponent(normalizePickListErrors(result.errors))}`);
  }

  // Refresh the queues before returning to the Pick Lists confirmation. The
  // operator explicitly chooses Dispatch beside the generated PDF.
  revalidatePath("/inventory");
  revalidatePath("/outgoing");
  revalidatePath("/pick-lists");
  redirect(`/inventory?tab=pick-lists&pickListCreated=${encodeURIComponent(result.pickListId)}`);
}

export async function requestPickListOverride(formData: FormData): Promise<void> {
  const raw = formData.get("request");
  const reason = formData.get("reason");
  if (typeof raw !== "string" || typeof reason !== "string") {
    redirect("/inventory?pickListError=invalid_override_request");
  }

  let result: Awaited<ReturnType<typeof requestFifoOverride>>;
  try {
    result = await requestFifoOverride(
      await createPageResolver(),
      JSON.parse(raw),
      reason,
    );
  } catch {
    redirect("/inventory?pickListError=override_request_failed");
  }
  if (!result.ok) {
    redirect(`/inventory?pickListError=${encodeURIComponent(normalizePickListErrors(result.errors))}`);
  }

  revalidatePath("/inventory");
  revalidatePath("/approvals");
  redirect(`/inventory?overrideRequested=${encodeURIComponent(result.requestNumber)}`);
}

export async function createApprovedPickList(formData: FormData): Promise<void> {
  const raw = formData.get("request");
  if (typeof raw !== "string") redirect("/inventory?pickListError=invalid_approval");

  let result: Awaited<ReturnType<typeof commitWithdrawal>>;
  try {
    result = await commitWithdrawal(await createPageResolver(), JSON.parse(raw));
  } catch {
    redirect("/inventory?pickListError=approval_unavailable");
  }
  if (!result.ok) {
    redirect(`/inventory?pickListError=${encodeURIComponent(normalizePickListErrors(result.errors))}`);
  }

  revalidatePath("/inventory");
  revalidatePath("/outgoing");
  revalidatePath("/approvals");
  redirect(`/inventory?tab=pick-lists&pickListCreated=${encodeURIComponent(result.pickListId)}`);
}

export async function markPickListReadyForDispatch(formData: FormData): Promise<void> {
  const pickListId = formData.get("pickListId");
  if (typeof pickListId !== "string" || !pickListId) {
    redirect("/inventory?tab=pick-lists&pickListError=invalid_pick_list");
  }

  // Kept as a compatibility action for older rendered forms/bookmarks. The
  // old implementation changed allocated -> picked directly, which bypassed
  // the approval gate. Approval now owns that transition.
  redirect(`/pick-lists/${pickListId}/pick`);
}

function cycleCountRedirect(result: { ok: boolean; sessionId?: string; reason?: string }): never {
  const params = new URLSearchParams({ tab: "stock-count" });
  if (result.sessionId) params.set("count", result.sessionId);
  if (!result.ok) params.set("error", result.reason ?? "cycle_count_failed");
  redirect(`/inventory?${params.toString()}`);
}

export async function createCycleCountAction(formData: FormData): Promise<void> {
  cycleCountRedirect(await createCycleCount(await createPageResolver(), String(formData.get("locationId") ?? ""), randomUUID()));
}

export async function recordCycleCountAction(formData: FormData): Promise<void> {
  cycleCountRedirect(await recordCycleCount(await createPageResolver(), String(formData.get("sessionId") ?? ""), String(formData.get("lineId") ?? ""), Number(formData.get("countedQty")), String(formData.get("note") ?? ""), formData.get("zeroConfirmed") === "yes"));
}

export async function submitCycleCountAction(formData: FormData): Promise<void> {
  cycleCountRedirect(await submitCycleCount(await createPageResolver(), String(formData.get("sessionId") ?? ""), formData.get("missingLinesConfirmed") === "yes"));
}

export async function approveCycleCountAction(formData: FormData): Promise<void> {
  cycleCountRedirect(await approveCycleCount(await createPageResolver(), String(formData.get("sessionId") ?? "")));
}

export async function rejectCycleCountAction(formData: FormData): Promise<void> {
  cycleCountRedirect(await rejectCycleCount(await createPageResolver(), String(formData.get("sessionId") ?? ""), String(formData.get("reason") ?? "")));
}

export async function requestCycleCountRecountAction(formData: FormData): Promise<void> {
  cycleCountRedirect(await requestCycleCountRecount(
    await createPageResolver(),
    String(formData.get("sessionId") ?? ""),
    String(formData.get("lineId") ?? ""),
    String(formData.get("reason") ?? ""),
  ));
}

export async function postCycleCountAction(formData: FormData): Promise<void> {
  cycleCountRedirect(await postCycleCount(await createPageResolver(), String(formData.get("sessionId") ?? "")));
}
