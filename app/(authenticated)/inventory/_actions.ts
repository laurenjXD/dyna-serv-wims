"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { commitWithdrawal } from "@/lib/actions/withdrawals";

export type GeneratePickListState =
  | { ok: false; error: string }
  | { ok: true };

/**
 * The inventory builder submits a suggested FIFO/FEFO plan. commitWithdrawal
 * re-reads and verifies every line in its own RLS transaction; this wrapper
 * only supplies the session-bound resolver and refreshes both downstream
 * queues after a durable reservation succeeds.
 */
export async function generatePickList(
  _previous: GeneratePickListState | null,
  formData: FormData,
): Promise<GeneratePickListState> {
  const raw = formData.get("payload");
  if (typeof raw !== "string") {
    return { ok: false, error: "The pick-list request is incomplete. Refresh and try again." };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { ok: false, error: "The pick-list request is invalid. Refresh and try again." };
  }

  const result = await commitWithdrawal(await createPageResolver(), payload);
  if (!result.ok) {
    const messages: Record<string, string> = {
      forbidden: "You do not have permission to generate pick lists.",
      provisional_item_code: "This item needs its DSGC/supplier item code before a pick list can be created.",
      unable_to_reserve_stock: "Stock changed or is no longer available. Refresh the inventory and try again.",
    };
    return { ok: false, error: messages[result.errors[0]] ?? "Pick list was not created. Please try again." };
  }

  revalidatePath("/inventory");
  revalidatePath("/outgoing");
  redirect("/outgoing");
}

export async function parseDraDocumentAction(formData: FormData) {
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return { ok: false, error: "No file was uploaded." };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const { parseDraDocument } = await import("@/lib/parsers/dra-parser");
    const parseResult = await parseDraDocument(buffer, file.name);

    return {
      ok: true,
      parseResult,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `DRA processing error: ${errorMsg}`,
    };
  }
}

export async function getItemAuditDetailAction(itemId: string) {
  if (!itemId) return { ok: false, error: "Invalid item ID" };

  try {
    const resolver = await createPageResolver();
    const { getItemDetail } = await import("@/lib/db/queries/items");
    const { getItemMovementHistory } = await import("@/lib/db/queries/inventory");
    const item = await getItemDetail(resolver.db, itemId);
    if (!item) {
      return { ok: false, error: "Item not found in master records." };
    }

    const movements = await getItemMovementHistory(resolver.db, itemId);

    return {
      ok: true,
      item,
      movements,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Failed to load item audit details: ${errorMsg}`,
    };
  }
}

