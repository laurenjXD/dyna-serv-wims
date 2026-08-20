"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { commitWithdrawal } from "@/lib/actions/withdrawals";

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

  // Refresh every queue that presents the committed pick list before
  // navigating. The warehouse operator starts from Active Picks, then
  // explicitly enters the floor scan flow for the selected list.
  revalidatePath("/inventory");
  revalidatePath("/outgoing");
  revalidatePath("/pick-lists");
  redirect("/outgoing");
}
