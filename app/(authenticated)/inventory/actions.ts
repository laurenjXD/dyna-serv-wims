"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { commitWithdrawal, markPickListPicked, requestFifoOverride } from "@/lib/actions/withdrawals";

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
    redirect(`/inventory?pickListError=${encodeURIComponent(result.errors.join(","))}`);
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
    redirect(`/inventory?pickListError=${encodeURIComponent(result.errors.join(","))}`);
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
    redirect(`/inventory?pickListError=${encodeURIComponent(result.errors.join(","))}`);
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

  const result = await markPickListPicked(
    await createPageResolver(),
    pickListId,
    [],
  );
  if (!result.ok) {
    redirect(`/inventory?tab=pick-lists&pickListError=${encodeURIComponent(result.errors.join(","))}`);
  }

  revalidatePath("/inventory");
  revalidatePath("/outgoing");
  revalidatePath("/pick-lists");
  redirect(`/inventory?tab=pick-lists&pickListPicked=${encodeURIComponent(pickListId)}`);
}
