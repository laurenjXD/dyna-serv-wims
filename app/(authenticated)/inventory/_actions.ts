"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { commitWithdrawal } from "@/lib/actions/withdrawals";
import { getPickListErrorMessage } from "@/lib/withdrawal/error-messages";

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
    return { ok: false, error: getPickListErrorMessage("invalid_request").description };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return { ok: false, error: getPickListErrorMessage("invalid_request").description };
  }

  const result = await commitWithdrawal(await createPageResolver(), payload);
  if (!result.ok) {
    return { ok: false, error: getPickListErrorMessage(result.errors).description };
  }

  revalidatePath("/inventory");
  revalidatePath("/outgoing");
  redirect("/outgoing");
}

export async function parseDraDocumentAction(formData: FormData) {
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return { ok: false, error: "Choose a DRA file to upload." };
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
    console.error("DRA import failed", err);
    return {
      ok: false,
      error: "The DRA file could not be read. Check that it is a valid Excel, CSV, or PDF file, then upload it again.",
    };
  }
}

export async function getItemAuditDetailAction(itemId: string) {
  if (!itemId) return { ok: false as const, error: "Choose an item to view its history." };

  try {
    const { db } = await import("@/lib/db/client");
    const { getItem } = await import("@/lib/db/queries/items");
    const { getItemMovementHistory, listStockView } = await import("@/lib/db/queries/inventory");
    const item = await getItem(db, itemId);
    if (!item) {
      return { ok: false as const, error: "This item is no longer available. Refresh inventory and choose another item." };
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
    console.error("Item history failed to load", err);
    return {
      ok: false as const,
      error: "Item history could not be loaded. Try again.",
    };
  }
}

