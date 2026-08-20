"use server";

import { redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { commitWithdrawal } from "@/lib/actions/withdrawals";

export async function createPickList(formData: FormData): Promise<void> {
  const raw = formData.get("request");
  if (typeof raw !== "string") redirect("/inventory?pickListError=invalid_request");
  try {
    const resolver = await createPageResolver();
    const result = await commitWithdrawal(resolver, JSON.parse(raw));
    if (result.ok) redirect(`/pick-lists/${result.pickListId}/pick`);
  } catch {
    redirect("/inventory?pickListError=unable_to_reserve_stock");
  }
  redirect("/inventory?pickListError=unable_to_reserve_stock");
}
