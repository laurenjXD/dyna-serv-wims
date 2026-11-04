"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { commitWithdrawal } from "@/lib/actions/withdrawals";
import { requirePermission } from "@/lib/rbac/guard";
import { z } from "zod";
import type { DraParseResult } from "@/lib/parsers/dra-parser";

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
      provisional_item_code: "This item needs its enrolled supplier/DSGC item code before a pick list can be created.",
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
      carton_traceability_incomplete: "There are not enough registered carton labels for this allocation.",
      carton_traceability_conflict: "The carton allocation changed before the pick list was committed.",
    };
    return { ok: false, error: messages[result.errors[0]] ?? "Pick list was not created. Please try again." };
  }

  revalidatePath("/inventory");
  revalidatePath("/outgoing");
  redirect("/outgoing");
}

const columnIndex = z.number().int().min(0).max(1023).optional();
const draOptionsSchema = z.object({
  sheetName: z.string().min(1).max(255).optional(),
  headerRowIndex: z.number().int().min(0).max(9999).optional(),
  columnMap: z.object({
    itemCode: columnIndex, customerItemCode: columnIndex, itemDescription: columnIndex,
    requestedQty: columnIndex, packageCount: columnIndex, spq: columnIndex,
    uom: columnIndex, remarks: columnIndex,
  }).strict().optional(),
}).strict().refine((options) => {
  const indexes = Object.values(options.columnMap ?? {}).filter((index) => index !== undefined);
  return indexes.length === new Set(indexes).size;
}, "Each column can be mapped to only one field.");

export async function parseDraDocumentAction(formData: FormData): Promise<{
  ok: boolean; error?: string; parseResult?: DraParseResult;
}> {
  try {
    const permission = await requirePermission(await createPageResolver(), "pick_list.generate");
    if (permission.kind !== "authorized") {
      return { ok: false, error: "You do not have access to import a DRA. Ask an administrator for pick-list generation access." };
    }
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "The DRA file is empty or missing. Choose an Excel, CSV, or searchable PDF file." };
    }
    if (!/\.(xlsx|xls|csv|pdf)$/i.test(file.name)) {
      return { ok: false, error: "This file format is not supported. Choose an Excel (.xlsx or .xls), CSV, or searchable PDF file." };
    }
    if (file.size > 10 * 1024 * 1024) {
      return { ok: false, error: "The DRA exceeds 10 MB. Choose a smaller release document and try again." };
    }
    let rawOptions: unknown = {};
    const serializedOptions = formData.get("options");
    if (serializedOptions !== null) {
      if (typeof serializedOptions !== "string" || serializedOptions.length > 8192) {
        return { ok: false, error: "The column mapping is invalid. Review the worksheet, header row, and column selections." };
      }
      try { rawOptions = JSON.parse(serializedOptions); }
      catch { return { ok: false, error: "The column mapping could not be read. Review the column selections and try again." }; }
    }
    const options = draOptionsSchema.safeParse(rawOptions);
    if (!options.success) {
      return { ok: false, error: "The column mapping is invalid. Select a valid header row and a different column for each field." };
    }

    const { parseDraDocument } = await import("@/lib/parsers/dra-parser");
    const parseResult = await parseDraDocument(Buffer.from(await file.arrayBuffer()), file.name, options.data);
    if (!parseResult.ok) return {
      ok: false, parseResult,
      error: "The DRA could not be read with these settings. Review spreadsheet columns or choose a readable, searchable document.",
    };
    return { ok: true, parseResult };
  } catch {
    return {
      ok: false,
      error: "The DRA could not be processed. Check your connection and choose a readable file, then retry.",
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

