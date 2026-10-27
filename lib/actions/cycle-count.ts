"use server";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { and, eq, gt, sql } from "drizzle-orm";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";
import { cycleCountEvents, cycleCountLines, cycleCountSessions } from "@/lib/db/schema/cycle_count";
import { items } from "@/lib/db/schema/items";
import { locations } from "@/lib/db/schema/locations";
import { lotLocationBalances } from "@/lib/db/schema/lot_location_balances";
import { lots } from "@/lib/db/schema/lots";
import { inventoryTransactions } from "@/lib/db/schema/transactions";

const defaultRlsDeps: RlsTransactionDeps = { getAuthenticatedSession, pool: rlsPool };

type DbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
};

type Result = { ok: true; sessionId?: string; countNumber?: string } | { ok: false; reason: string };

function countNumber(): string {
  return `CC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function createCycleCount(
  resolver: RequestAuthorizationResolver,
  locationId: string,
  idempotencyKey: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<Result> {
  const perm = await requirePermission(resolver, "cycle_count.create");
  if (perm.kind !== "authorized" || !locationId || !idempotencyKey) return { ok: false, reason: "forbidden" };

  const userId = perm.context.userId;
  const result = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;
    const existing = await db.select({ id: cycleCountSessions.id, countNumber: cycleCountSessions.countNumber })
      .from(cycleCountSessions).where(eq(cycleCountSessions.idempotencyKey, idempotencyKey)).limit(1);
    if (existing[0]) return { ok: true as const, sessionId: existing[0].id, countNumber: existing[0].countNumber };

    const location = await db.select({ id: locations.id }).from(locations)
      .where(and(eq(locations.id, locationId), eq(locations.isActive, true))).limit(1);
    if (!location[0]) return { ok: false as const, reason: "location_not_found" };

    const stockRows = await db.select({
      balanceId: lotLocationBalances.id,
      itemId: items.id,
      lotId: lots.id,
      locationId: locations.id,
      systemQty: lotLocationBalances.qtyRemaining,
      balanceVersion: lotLocationBalances.version,
    }).from(lotLocationBalances)
      .innerJoin(lots, eq(lots.id, lotLocationBalances.lotId))
      .innerJoin(items, eq(items.id, lots.itemId))
      .innerJoin(locations, eq(locations.id, lotLocationBalances.locationId))
      .where(and(eq(lotLocationBalances.locationId, locationId), gt(lotLocationBalances.qtyRemaining, 0)));
    if (stockRows.length === 0) return { ok: false as const, reason: "no_stock_at_location" };

    const [session] = await db.insert(cycleCountSessions).values({
      countNumber: countNumber(), locationId, createdByUserId: userId, idempotencyKey,
    }).returning({ id: cycleCountSessions.id, countNumber: cycleCountSessions.countNumber });
    await db.insert(cycleCountLines).values(stockRows.map((row: any) => ({
      sessionId: session.id,
      balanceId: row.balanceId,
      itemId: row.itemId,
      lotId: row.lotId,
      locationId: row.locationId,
      systemQty: Number(row.systemQty),
      balanceVersion: Number(row.balanceVersion),
    })));
    return { ok: true as const, sessionId: session.id, countNumber: session.countNumber };
  });
  return result.kind === "unauthenticated" ? { ok: false, reason: "forbidden" } : result.value;
}

export async function recordCycleCount(
  resolver: RequestAuthorizationResolver,
  sessionId: string,
  lineId: string,
  countedQty: number,
  note?: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<Result> {
  const perm = await requirePermission(resolver, "cycle_count.count");
  if (perm.kind !== "authorized" || !Number.isInteger(countedQty) || countedQty < 0) return { ok: false, reason: "invalid_count" };
  const result = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;
    const [session] = await db.select({ status: cycleCountSessions.status }).from(cycleCountSessions).where(eq(cycleCountSessions.id, sessionId)).limit(1);
    const [line] = await db.select({ id: cycleCountLines.id, systemQty: cycleCountLines.systemQty }).from(cycleCountLines)
      .where(and(eq(cycleCountLines.id, lineId), eq(cycleCountLines.sessionId, sessionId))).limit(1);
    if (!session || !line) return { ok: false as const, reason: "not_found" };
    if (session.status !== "counting" && session.status !== "rejected") return { ok: false as const, reason: "invalid_status" };
    const variance = countedQty - Number(line.systemQty);
    await db.update(cycleCountLines).set({ countedQty, variance, status: "counted", countedByUserId: perm.context.userId, countedAt: new Date(), updatedAt: new Date() })
      .where(eq(cycleCountLines.id, lineId));
    await db.insert(cycleCountEvents).values({ sessionId, lineId, eventType: "counted", countedQty, note: note?.trim() || null, actorUserId: perm.context.userId });
    return { ok: true as const };
  });
  return result.kind === "unauthenticated" ? { ok: false, reason: "forbidden" } : result.value;
}

export async function submitCycleCount(resolver: RequestAuthorizationResolver, sessionId: string, rlsDeps: RlsTransactionDeps = defaultRlsDeps): Promise<Result> {
  const perm = await requirePermission(resolver, "cycle_count.count");
  if (perm.kind !== "authorized") return { ok: false, reason: "forbidden" };
  const result = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;
    const [session] = await db.select({ status: cycleCountSessions.status }).from(cycleCountSessions).where(eq(cycleCountSessions.id, sessionId)).limit(1);
    const openLines = await db.select({ id: cycleCountLines.id }).from(cycleCountLines).where(and(eq(cycleCountLines.sessionId, sessionId), eq(cycleCountLines.status, "uncounted")));
    if (!session) return { ok: false as const, reason: "not_found" };
    if (session.status !== "counting" && session.status !== "rejected" || openLines.length > 0) return { ok: false as const, reason: openLines.length > 0 ? "uncounted_lines" : "invalid_status" };
    await db.update(cycleCountSessions).set({ status: "submitted", submittedByUserId: perm.context.userId, version: sql`${cycleCountSessions.version} + 1`, updatedAt: new Date() }).where(and(eq(cycleCountSessions.id, sessionId)));
    return { ok: true as const };
  });
  return result.kind === "unauthenticated" ? { ok: false, reason: "forbidden" } : result.value;
}

export async function approveCycleCount(resolver: RequestAuthorizationResolver, sessionId: string, rlsDeps: RlsTransactionDeps = defaultRlsDeps): Promise<Result> {
  const perm = await requirePermission(resolver, "cycle_count.review");
  if (perm.kind !== "authorized") return { ok: false, reason: "forbidden" };
  const result = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;
    const [session] = await db.select({ status: cycleCountSessions.status, createdByUserId: cycleCountSessions.createdByUserId }).from(cycleCountSessions).where(eq(cycleCountSessions.id, sessionId)).limit(1);
    if (!session) return { ok: false as const, reason: "not_found" };
    if (session.createdByUserId === perm.context.userId) return { ok: false as const, reason: "self_approval" };
    if (session.status !== "submitted") return { ok: false as const, reason: "invalid_status" };
    await db.update(cycleCountSessions).set({ status: "approved", approvedByUserId: perm.context.userId, version: sql`${cycleCountSessions.version} + 1`, updatedAt: new Date() }).where(and(eq(cycleCountSessions.id, sessionId), eq(cycleCountSessions.status, "submitted")));
    return { ok: true as const };
  });
  return result.kind === "unauthenticated" ? { ok: false, reason: "forbidden" } : result.value;
}

export async function rejectCycleCount(resolver: RequestAuthorizationResolver, sessionId: string, reason: string, rlsDeps: RlsTransactionDeps = defaultRlsDeps): Promise<Result> {
  const perm = await requirePermission(resolver, "cycle_count.review");
  if (perm.kind !== "authorized") return { ok: false, reason: "forbidden" };
  const result = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;
    const [session] = await db.select({ status: cycleCountSessions.status }).from(cycleCountSessions).where(eq(cycleCountSessions.id, sessionId)).limit(1);
    if (!session) return { ok: false as const, reason: "not_found" };
    if (session.status !== "submitted") return { ok: false as const, reason: "invalid_status" };
    await db.update(cycleCountSessions).set({ status: "rejected", rejectionReason: reason.trim().slice(0, 1000) || "Recount required.", approvedByUserId: perm.context.userId, version: sql`${cycleCountSessions.version} + 1`, updatedAt: new Date() }).where(and(eq(cycleCountSessions.id, sessionId), eq(cycleCountSessions.status, "submitted")));
    return { ok: true as const };
  });
  return result.kind === "unauthenticated" ? { ok: false, reason: "forbidden" } : result.value;
}

export async function postCycleCount(resolver: RequestAuthorizationResolver, sessionId: string, rlsDeps: RlsTransactionDeps = defaultRlsDeps): Promise<Result> {
  const perm = await requirePermission(resolver, "cycle_count.post");
  if (perm.kind !== "authorized") return { ok: false, reason: "forbidden" };
  const result = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;
    const [session] = await db.select({ status: cycleCountSessions.status, countNumber: cycleCountSessions.countNumber }).from(cycleCountSessions).where(eq(cycleCountSessions.id, sessionId)).limit(1);
    const lines = await db.select().from(cycleCountLines).where(eq(cycleCountLines.sessionId, sessionId));
    if (!session) return { ok: false as const, reason: "not_found" };
    if (session.status === "posted") return { ok: true as const };
    if (session.status !== "approved") return { ok: false as const, reason: "invalid_status" };
    const balances = await Promise.all(lines.map((line: any) => db.select({ qtyRemaining: lotLocationBalances.qtyRemaining, qtyCommitted: lotLocationBalances.qtyCommitted, version: lotLocationBalances.version }).from(lotLocationBalances).where(eq(lotLocationBalances.id, line.balanceId)).limit(1)));
    for (let i = 0; i < lines.length; i += 1) {
      const line: any = lines[i];
      const balance: any = balances[i][0];
      if (!balance || Number(balance.version) !== Number(line.balanceVersion)) return { ok: false as const, reason: "stale_snapshot" };
      if (Number(line.countedQty) < Number(balance.qtyCommitted)) return { ok: false as const, reason: "below_committed" };
      if (Number(balance.qtyRemaining) + Number(line.variance ?? 0) < Number(balance.qtyCommitted)) return { ok: false as const, reason: "below_committed" };
    }
    for (let i = 0; i < lines.length; i += 1) {
      const line: any = lines[i];
      const variance = Number(line.variance ?? 0);
      const updatedBalance = await db.update(lotLocationBalances).set({ qtyRemaining: sql`${lotLocationBalances.qtyRemaining} + ${variance}`, version: sql`${lotLocationBalances.version} + 1`, updatedAt: new Date() }).where(and(eq(lotLocationBalances.id, line.balanceId), eq(lotLocationBalances.version, line.balanceVersion))).returning({ id: lotLocationBalances.id });
      if (!updatedBalance[0]) return { ok: false as const, reason: "stale_snapshot" };
      if (variance !== 0) {
        const [lot] = await db.select({ flowType: lots.flowType }).from(lots).where(eq(lots.id, line.lotId)).limit(1);
        await db.insert(inventoryTransactions).values({ transactionNumber: `${session.countNumber}-${String(i + 1).padStart(4, "0")}`, lotId: line.lotId, itemId: line.itemId, movementType: "inventory_reconciliation", fromLocationId: variance < 0 ? line.locationId : null, toLocationId: variance > 0 ? line.locationId : null, qty: Math.abs(variance), flowType: lot.flowType, cycleCountSessionId: sessionId, performedByUserId: perm.context.userId });
      }
      await db.update(cycleCountLines).set({ status: "posted", updatedAt: new Date() }).where(eq(cycleCountLines.id, line.id));
    }
    await db.update(cycleCountSessions).set({ status: "posted", postedByUserId: perm.context.userId, version: sql`${cycleCountSessions.version} + 1`, updatedAt: new Date() }).where(and(eq(cycleCountSessions.id, sessionId), eq(cycleCountSessions.status, "approved")));
    return { ok: true as const };
  });
  return result.kind === "unauthenticated" ? { ok: false, reason: "forbidden" } : result.value;
}

/* eslint-enable @typescript-eslint/no-explicit-any */
