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
      invalid_end_customer: "The selected end customer is inactive or is not enrolled with the End Customer role.",
      organization_inactive_or_not_found: "The selected Organization is inactive or no longer enrolled.",
      organization_relationship_required: "The selected Organization is not authorized for this Inventory Model.",
      end_customer_inactive_or_not_found: "The selected End Customer is inactive or no longer enrolled.",
      end_customer_relationship_required: "The selected Organization is not enrolled as an End Customer.",
      stale_record: "This record changed in another session. Refresh the page and try again.",
      invalid_transition: "This workflow step is no longer available. Refresh the page to see the current state.",
      insufficient_stock: "Stock changed or is no longer available. Refresh the inventory and try again.",
      duplicate_operation: "This operation was already completed. The original result is shown.",
      no_rate_configured: "No active Trading price is configured for this organization and item.",
      fx_rate_required: "A current exchange rate is required before this Trading withdrawal can be created.",
      price_invalid: "The configured Trading price is invalid. Contact an administrator before retrying.",
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
  if (!itemId) return { ok: false as const, error: "Invalid item ID" };

  try {
    const { db } = await import("@/lib/db/client");
    const { getItem } = await import("@/lib/db/queries/items");
    const { getItemMovementHistory, listStockView } = await import("@/lib/db/queries/inventory");
    const item = await getItem(db, itemId);
    if (!item) {
      return { ok: false as const, error: "Item not found in master records." };
    }

    const movements = await getItemMovementHistory(db, itemId);
    const stockRows = (await listStockView(db)).filter((row) => row.itemId === itemId);

    return {
      ok: true as const,
      item,
      movements,
      stockRows,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      ok: false as const,
      error: `Failed to load item audit details: ${errorMsg}`,
    };
  }
}

