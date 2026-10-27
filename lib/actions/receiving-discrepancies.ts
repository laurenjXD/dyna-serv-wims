"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auditLog, receivingDiscrepancies } from "@/lib/db/schema";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { revalidatePath } from "next/cache";

const RESOLUTIONS = ["vendor_short_shipped", "backorder_expected", "replacement_requested", "credit_claim_filed", "variance_accepted", "other"] as const;

export type DiscrepancyResolution = typeof RESOLUTIONS[number];

export async function resolveReceivingDiscrepancy(
  discrepancyId: string,
  resolution: string,
  notes: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resolver = await createPageResolver();
  const permission = await requirePermission(resolver, "receiving.discrepancy_resolve");
  if (permission.kind !== "authorized") return { ok: false, error: "Only supervisors or administrators can resolve OS&D discrepancies." };
  if (!RESOLUTIONS.includes(resolution as DiscrepancyResolution)) return { ok: false, error: "Choose a valid discrepancy resolution." };

  const [updated] = await db.update(receivingDiscrepancies).set({
    status: "resolved",
    resolution,
    resolutionNotes: notes.trim() || null,
    resolvedByUserId: permission.context.userId,
    resolvedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(receivingDiscrepancies.id, discrepancyId), eq(receivingDiscrepancies.status, "open"))).returning({ id: receivingDiscrepancies.id, wrrId: receivingDiscrepancies.wrrId });

  if (!updated) return { ok: false, error: "This discrepancy is already resolved or no longer exists." };
  await db.insert(auditLog).values({
    actorUserId: permission.context.userId,
    actorRole: permission.context.activeRoleKeys[0] ?? "supervisor",
    action: "receiving_discrepancy_resolved",
    entityType: "receiving_discrepancies",
    entityId: updated.id,
    diffData: { resolution, notes: notes.trim() || null },
    correlationId: `OSD-${Date.now()}`,
  }).catch(() => {});
  revalidatePath(`/receiving/${updated.wrrId}`);
  return { ok: true };
}
