"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { pickLists, pickListItems } from "@/lib/db/schema/pick_lists";
import { getStorageClient } from "@/lib/supabase/storage";
import { reportLocationShortage } from "@/lib/actions/withdrawals";

function validReceipt(file: File) {
  return file.size > 0 && file.size <= 10 * 1024 * 1024 && ["application/pdf", "image/png", "image/jpeg"].includes(file.type);
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120) || "receipt";
}

export async function uploadDeliveryReceipt(formData: FormData) {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "pick_list.execute");
  if (permission.kind !== "authorized") redirect("/outgoing?tab=ledger&receiptUpload=forbidden");
  const pickListId = String(formData.get("pickListId") ?? "");
  const file = formData.get("deliveryReceipt");
  if (!pickListId || !(file instanceof File) || !validReceipt(file)) redirect("/outgoing?tab=ledger&receiptUpload=invalid");
  const path = `pick-list/${pickListId}/${randomUUID()}-${safeName(file.name)}`;
  const storage = await getStorageClient();
  const upload = await storage.from("delivery-receipts").upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) redirect("/outgoing?tab=ledger&receiptUpload=failed");
  await db.update(pickLists).set({ deliveryReceiptPath: path, deliveryReceiptStatus: "uploaded", deliveryReceiptUploadedAt: new Date(), updatedAt: new Date() }).where(eq(pickLists.id, pickListId));
  revalidatePath("/outgoing");
  revalidatePath("/pick-lists");
  redirect("/outgoing?tab=ledger&receiptUpload=success");
}

export async function approvePickList(formData: FormData) {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "pick_list.execute");
  if (permission.kind !== "authorized") redirect("/inventory?tab=pick-lists&error=forbidden");
  const pickListId = String(formData.get("pickListId") ?? "");
  if (pickListId) {
    await db
      .update(pickLists)
      .set({ status: "picked", updatedAt: new Date() })
      .where(eq(pickLists.id, pickListId));
  }
  revalidatePath("/inventory");
  revalidatePath("/outgoing");
  revalidatePath(`/pick-lists/${pickListId}/dispatch`);
  redirect(`/pick-lists/${pickListId}/dispatch?result=approved`);
}

export async function updateQueuedPickListLineItems(formData: FormData) {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "pick_list.execute");
  const pickListId = String(formData.get("pickListId") ?? "");
  if (permission.kind !== "authorized") redirect(`/inventory?tab=pick-lists&error=forbidden`);
  
  const payload = String(formData.get("lineItemsPayload") ?? "");
  if (!pickListId || !payload) {
    redirect(`/pick-lists/${pickListId}/edit?error=invalid_payload`);
  }

  try {
    const parsed = JSON.parse(payload) as Array<{
      lineId: string;
      qty: number;
      spq: number;
      numberOfBoxes: number;
    }>;

    for (const line of parsed) {
      if (line.lineId && Number(line.qty) >= 0) {
        await db
          .update(pickListItems)
          .set({
            qty: line.qty,
            spq: line.spq,
            numberOfBoxes: line.numberOfBoxes,
          })
          .where(eq(pickListItems.id, line.lineId));
      }
    }

    await db.update(pickLists).set({ updatedAt: new Date() }).where(eq(pickLists.id, pickListId));
  } catch {
    redirect(`/pick-lists/${pickListId}/edit?error=save_failed`);
  }

  revalidatePath("/inventory");
  revalidatePath("/pick-lists");
  revalidatePath(`/pick-lists/${pickListId}/dispatch`);
  revalidatePath(`/pick-lists/${pickListId}/print`);
  redirect(`/pick-lists/${pickListId}/dispatch?result=updated`);
}

export async function reportPickListShortage(formData: FormData) {
  const resolver = await createPageResolver();
  const pickListId = String(formData.get("pickListId") ?? "");
  const pickListItemId = String(formData.get("shortageLineId") ?? "");
  const actualFoundQty = Number(formData.get("actualFoundQty") ?? 0);

  const res = await reportLocationShortage(resolver, {
    pickListId,
    pickListItemId,
    actualFoundQty,
  });

  if (!res.ok) {
    redirect(
      `/pick-lists/${pickListId}/dispatch?result=error&reason=${encodeURIComponent(
        res.error ?? "shortage_failed",
      )}`,
    );
  }

  revalidatePath(`/pick-lists/${pickListId}/dispatch`);
  redirect(`/pick-lists/${pickListId}/dispatch?shortageReported=true`);
}

export async function deletePickList(formData: FormData) {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "pick_list.execute");
  if (permission.kind !== "authorized") redirect("/pick-lists?error=forbidden");
  const pickListId = String(formData.get("pickListId") ?? "");
  if (pickListId) {
    await db.update(pickLists).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(pickLists.id, pickListId));
  }
  revalidatePath("/pick-lists");
  revalidatePath("/inventory");
  redirect("/pick-lists?deleted=success");
}

