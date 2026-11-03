import { and, asc, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";
import { rlsPool } from "@/lib/db/rls-pool";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import * as schema from "@/lib/db/schema";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { AuthorizationContext, RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { items } from "@/lib/db/schema/items";
import { parties, partyRoles } from "@/lib/db/schema/parties";
import { lots } from "@/lib/db/schema/lots";
import { locations } from "@/lib/db/schema/locations";
import { lotLocationBalances } from "@/lib/db/schema/lot_location_balances";
import { inventoryTransactions } from "@/lib/db/schema/transactions";
import { wrrDocuments } from "@/lib/db/schema/wrr";
import { pickLists } from "@/lib/db/schema/pick_lists";
import { inspectionCases } from "@/lib/db/schema/transfers";
import type { OpenRouterTool } from "./openrouter";

const empty = z.object({}).strict();
const itemCodeArgs = z.object({ item_code: z.string().trim().min(1).max(100) }).strict();
const stockArgs = z.object({ item_code: z.string().trim().min(1).max(100).optional(), party_code: z.string().trim().min(1).max(50).optional(), flow_type: z.enum(["vmi", "trading", "supplies"]).optional(), location_code: z.string().trim().min(1).max(100).optional() }).strict();
const lotArgs = z.object({ lot_number: z.string().trim().min(1).max(100) }).strict();
const partyArgs = z.object({ party_code: z.string().trim().min(1).max(50) }).strict();
const transactionsArgs = z.object({ item_code: z.string().trim().min(1).max(100), days: z.number().int().min(1).max(90).optional(), limit: z.number().int().min(1).max(20).optional() }).strict();
const lowStockArgs = z.object({ flow_type: z.enum(["vmi", "trading", "supplies"]).optional() }).strict();
const pendingArgs = z.object({ type: z.enum(["wrr", "pick_list", "inspection"]).optional() }).strict();
const analyticsArgs = lowStockArgs;

const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): OpenRouterTool => ({ type: "function", function: { name, description, parameters: { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false } } });
const definitions: Record<string, { capability: string; tool: OpenRouterTool }> = {
  get_stock_levels: { capability: "inventory.read", tool: tool("get_stock_levels", "Read current on-hand, committed, and available quantities for authorized warehouse stock.", { item_code: { type: "string" }, party_code: { type: "string" }, flow_type: { type: "string", enum: ["vmi", "trading", "supplies"] }, location_code: { type: "string" } }) },
  get_lot_detail: { capability: "inventory.read", tool: tool("get_lot_detail", "Read a lot's current status and per-location quantities.", { lot_number: { type: "string" } }, ["lot_number"]) },
  get_item_info: { capability: "items.read", tool: tool("get_item_info", "Read non-financial item identifiers and handling information.", { item_code: { type: "string" } }, ["item_code"]) },
  get_party_info: { capability: "parties.read", tool: tool("get_party_info", "Read an Organization's name and business roles. Contact and tax information are excluded.", { party_code: { type: "string" } }, ["party_code"]) },
  get_recent_transactions: { capability: "inventory.read", tool: tool("get_recent_transactions", "Read a limited list of recent stock movements for an item.", { item_code: { type: "string" }, days: { type: "integer", minimum: 1, maximum: 90 }, limit: { type: "integer", minimum: 1, maximum: 20 } }, ["item_code"]) },
  get_low_stock_items: { capability: "inventory.read", tool: tool("get_low_stock_items", "Read items whose qty_available is below their reorder level.", { flow_type: { type: "string", enum: ["vmi", "trading", "supplies"] } }) },
  get_pending_items: { capability: "receiving.view", tool: tool("get_pending_items", "Read visible pending receiving, pick-list, or inspection records.", { type: { type: "string", enum: ["wrr", "pick_list", "inspection"] } }) },
  get_analytics_summary: { capability: "reporting.read", tool: tool("get_analytics_summary", "Read non-financial warehouse overview counts.", { flow_type: { type: "string", enum: ["vmi", "trading", "supplies"] } }) },
};

type ToolContext = { resolver: RequestAuthorizationResolver; auth: AuthorizationContext };
type QueryDb = PostgresJsDatabase<typeof schema>;

async function withAuthorizedDb<T>(context: ToolContext, capability: string, fn: (db: QueryDb) => Promise<T>): Promise<T> {
  const grant = await requirePermission(context.resolver, capability);
  if (grant.kind !== "authorized" || grant.context.grants.every((row) => row.scopeKind !== "global")) throw new Error("not_available");
  const result = await withRlsTransaction({ getAuthenticatedSession, pool: rlsPool }, async (tx) => {
    if (!tx.db) throw new Error("database_unavailable");
    return fn(tx.db as QueryDb);
  });
  if (result.kind !== "ok") throw new Error("not_available");
  return result.value;
}

export async function getAuthorizedToolDefinitions(resolver: RequestAuthorizationResolver): Promise<OpenRouterTool[]> {
  const session = await resolver.getContext();
  if (session.kind !== "authorized" || session.context.activeRoleKeys.includes("party_user")) return [];
  const checks = await Promise.all(Object.entries(definitions).map(async ([name, entry]) => {
    const primary = await requirePermission(resolver, entry.capability);
    const reportingRead = name === "get_low_stock_items" ? await requirePermission(resolver, "reporting.read") : null;
    return { name, entry, allowed: primary.kind === "authorized" || reportingRead?.kind === "authorized" };
  }));
  const receiving = checks.some((row) => row.name === "get_pending_items" && row.allowed);
  const pick = (await requirePermission(resolver, "pick_list.read")).kind === "authorized";
  const inspection = (await requirePermission(resolver, "inspection.perform")).kind === "authorized" || (await requirePermission(resolver, "inspection.resolve")).kind === "authorized";
  return checks.filter(({ name, allowed }) => allowed || (name === "get_pending_items" && (receiving || pick || inspection))).map(({ entry }) => entry.tool);
}

export async function executeAuthorizedTool(name: string, rawArgs: unknown, context: ToolContext): Promise<{ data: unknown; source: { title: string; href: string } }> {
  const asOf = new Date().toISOString();
  if (name === "get_stock_levels") {
    const args = stockArgs.parse(rawArgs);
    const data = await withAuthorizedDb(context, "inventory.read", async (db) => {
      const filters = [eq(lots.status, "available")];
      if (args.item_code) filters.push(eq(items.code, args.item_code));
      if (args.flow_type) filters.push(eq(lots.flowType, args.flow_type));
      if (args.party_code) filters.push(eq(parties.code, args.party_code));
      if (args.location_code) filters.push(eq(locations.label, args.location_code));
      return db.select({ item_code: items.code, item_name: items.name, party_code: parties.code, party_name: parties.name, flow_type: lots.flowType, location: locations.label, qty_remaining: lotLocationBalances.qtyRemaining, qty_committed: lotLocationBalances.qtyCommitted })
        .from(lotLocationBalances).innerJoin(lots, eq(lots.id, lotLocationBalances.lotId)).innerJoin(items, eq(items.id, lots.itemId)).innerJoin(locations, eq(locations.id, lotLocationBalances.locationId)).leftJoin(parties, eq(parties.id, lots.ownerPartyId)).where(and(...filters)).orderBy(asc(items.code), asc(lots.createdAt), asc(locations.label)).limit(200);
    });
    return { data: { as_of: asOf, rows: data.map((row) => ({ ...row, qty_available: row.qty_remaining - row.qty_committed })) }, source: { title: "Current inventory", href: "/inventory?tab=stock" } };
  }
  if (name === "get_lot_detail") {
    const args = lotArgs.parse(rawArgs);
    const rows = await withAuthorizedDb(context, "inventory.read", (db) => db.select({ item_code: items.code, item_name: items.name, lot_number: lots.lotNumber, status: lots.status, expiry_date: lots.expiryDate, flow_type: lots.flowType, location: locations.label, qty_remaining: lotLocationBalances.qtyRemaining, qty_committed: lotLocationBalances.qtyCommitted }).from(lots).innerJoin(items, eq(items.id, lots.itemId)).leftJoin(lotLocationBalances, eq(lotLocationBalances.lotId, lots.id)).leftJoin(locations, eq(locations.id, lotLocationBalances.locationId)).where(eq(lots.lotNumber, args.lot_number)).orderBy(asc(lots.createdAt), asc(locations.label)).limit(100));
    return { data: { as_of: asOf, rows: rows.map((row) => ({ ...row, qty_available: (row.qty_remaining ?? 0) - (row.qty_committed ?? 0) })) }, source: { title: "Lot and location balances", href: "/inventory?tab=stock" } };
  }
  if (name === "get_item_info") {
    const args = itemCodeArgs.parse(rawArgs);
    const rows = await withAuthorizedDb(context, "items.read", (db) => db.select({ code: items.code, name: items.name, barcode: items.barcode, uom: items.uom, spq: items.spq, volume_cbm: items.volumeCbm, is_perishable: items.isPerishable, min_reorder_level: items.minReorderLevel }).from(items).where(eq(items.code, args.item_code)).limit(1));
    return { data: { as_of: asOf, item: rows[0] ?? null }, source: { title: "Item record", href: "/enrollment?tab=items" } };
  }
  if (name === "get_party_info") {
    const args = partyArgs.parse(rawArgs);
    const rows = await withAuthorizedDb(context, "parties.read", (db) => db.select({ code: parties.code, name: parties.name, role: partyRoles.role }).from(parties).leftJoin(partyRoles, eq(partyRoles.partyId, parties.id)).where(eq(parties.code, args.party_code)).limit(10));
    return { data: { as_of: asOf, organization: rows.length ? { code: rows[0].code, name: rows[0].name, roles: rows.map((row) => row.role).filter(Boolean) } : null }, source: { title: "Organization record", href: "/enrollment?tab=parties" } };
  }
  if (name === "get_recent_transactions") {
    const args = transactionsArgs.parse(rawArgs);
    const rows = await withAuthorizedDb(context, "inventory.read", async (db) => {
      const [item] = await db.select({ id: items.id }).from(items).where(eq(items.code, args.item_code)).limit(1);
      if (!item) return [];
      const since = new Date(Date.now() - (args.days ?? 30) * 86_400_000);
      return db.select({ transaction_number: inventoryTransactions.transactionNumber, type: inventoryTransactions.movementType, qty: inventoryTransactions.qty, flow_type: inventoryTransactions.flowType, lot_number: lots.lotNumber, from_location: sql<string | null>`(SELECT label FROM public.locations WHERE id = ${inventoryTransactions.fromLocationId})`, to_location: sql<string | null>`(SELECT label FROM public.locations WHERE id = ${inventoryTransactions.toLocationId})`, created_at: inventoryTransactions.createdAt }).from(inventoryTransactions).innerJoin(lots, eq(lots.id, inventoryTransactions.lotId)).where(and(eq(inventoryTransactions.itemId, item.id), gte(inventoryTransactions.createdAt, since))).orderBy(desc(inventoryTransactions.createdAt)).limit(args.limit ?? 10);
    });
    return { data: { as_of: asOf, transactions: rows }, source: { title: "Inventory movement ledger", href: "/outgoing?tab=ledger" } };
  }
  if (name === "get_low_stock_items") {
    const args = lowStockArgs.parse(rawArgs);
    const grant = await requirePermission(context.resolver, "reporting.read");
    const capability = grant.kind === "authorized" && grant.context.grants.some((row) => row.scopeKind === "global") ? "reporting.read" : "inventory.read";
    const rows = await withAuthorizedDb(context, capability, async (db) => {
      const result = await db.execute(sql`SELECT i.code AS item_code, i.name AS item_name, i.min_reorder_level AS reorder_level, SUM(lit.qty_remaining)::bigint AS qty_remaining, SUM(lit.qty_committed)::bigint AS qty_committed, SUM(lit.qty_available)::bigint AS qty_available FROM public.lot_inventory_totals lit JOIN public.lots l ON l.id = lit.lot_id JOIN public.items i ON i.id = l.item_id WHERE l.status = 'available' ${args.flow_type ? sql`AND l.flow_type = ${args.flow_type}` : sql``} GROUP BY i.id, i.code, i.name, i.min_reorder_level HAVING SUM(lit.qty_available) < i.min_reorder_level ORDER BY i.code LIMIT 100`);
      return Array.from(result as unknown as Iterable<Record<string, unknown>>);
    });
    return { data: { as_of: asOf, items: rows }, source: { title: "Low stock overview", href: "/reports" } };
  }
  if (name === "get_pending_items") {
    const args = pendingArgs.parse(rawArgs);
    const results: Record<string, unknown> = {};
    if (!args.type || args.type === "wrr") if ((await requirePermission(context.resolver, "receiving.view")).kind === "authorized") results.wrr = await withAuthorizedDb(context, "receiving.view", (db) => db.select({ number: wrrDocuments.wrrNumber, status: wrrDocuments.status, created_at: wrrDocuments.createdAt }).from(wrrDocuments).where(or(eq(wrrDocuments.status, "staged_pending_arrival"), eq(wrrDocuments.status, "receiving_in_progress"))).orderBy(asc(wrrDocuments.createdAt)).limit(10));
    if (!args.type || args.type === "pick_list") if ((await requirePermission(context.resolver, "pick_list.read")).kind === "authorized") results.pick_lists = await withAuthorizedDb(context, "pick_list.read", (db) => db.select({ number: pickLists.pickListNumber, status: pickLists.status, created_at: pickLists.createdAt }).from(pickLists).where(and(eq(pickLists.status, "allocated"), isNull(pickLists.deletedAt))).orderBy(asc(pickLists.createdAt)).limit(10));
    if (!args.type || args.type === "inspection") {
      const perform = (await requirePermission(context.resolver, "inspection.perform")).kind === "authorized";
      const resolve = (await requirePermission(context.resolver, "inspection.resolve")).kind === "authorized";
      if (perform || resolve) results.inspections = await withAuthorizedDb(context, perform ? "inspection.perform" : "inspection.resolve", (db) => db.select({ status: inspectionCases.status, opened_at: inspectionCases.openedAt }).from(inspectionCases).where(or(eq(inspectionCases.status, "open"), eq(inspectionCases.status, "in_progress"))).orderBy(asc(inspectionCases.openedAt)).limit(10));
    }
    return { data: { as_of: asOf, ...results }, source: { title: "Operations work queues", href: "/inventory" } };
  }
  if (name === "get_analytics_summary") {
    const args = analyticsArgs.parse(rawArgs);
    const data = await withAuthorizedDb(context, "reporting.read", async (db) => {
      const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const flow = args.flow_type ? eq(inventoryTransactions.flowType, args.flow_type) : undefined;
      const [receiptRows, dispatchRows, totalLotRows, committed, inspectionRows, lowStockRows] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(inventoryTransactions).where(and(eq(inventoryTransactions.movementType, "receiving"), gte(inventoryTransactions.createdAt, monthStart), flow)),
        db.select({ count: sql<number>`count(*)` }).from(inventoryTransactions).where(and(eq(inventoryTransactions.movementType, "pick"), gte(inventoryTransactions.createdAt, monthStart), flow)),
        db.select({ count: sql<number>`count(*)` }).from(lots).where(and(eq(lots.status, "available"), args.flow_type ? eq(lots.flowType, args.flow_type) : undefined)),
        db.execute(sql`SELECT coalesce(sum(lit.qty_committed), 0)::bigint AS qty FROM public.lot_inventory_totals lit JOIN public.lots l ON l.id = lit.lot_id WHERE l.status = 'available' ${args.flow_type ? sql`AND l.flow_type = ${args.flow_type}` : sql``}`),
        db.select({ count: sql<number>`count(*)` }).from(inspectionCases).innerJoin(lots, eq(lots.id, inspectionCases.lotId)).where(and(or(eq(inspectionCases.status, "open"), eq(inspectionCases.status, "in_progress")), args.flow_type ? eq(lots.flowType, args.flow_type) : undefined)),
        db.execute(sql`SELECT count(*)::bigint AS count FROM (SELECT i.id FROM public.items i JOIN public.lots l ON l.item_id = i.id JOIN public.lot_inventory_totals lit ON lit.lot_id = l.id WHERE l.status = 'available' ${args.flow_type ? sql`AND l.flow_type = ${args.flow_type}` : sql``} GROUP BY i.id, i.min_reorder_level HAVING sum(lit.qty_available) < i.min_reorder_level) low_stock`),
      ]);
      const committedRows = Array.from(committed as unknown as Iterable<Record<string, unknown>>);
      const lowStockResult = Array.from(lowStockRows as unknown as Iterable<Record<string, unknown>>);
      const qtyCommitted = Number(committedRows[0]?.qty ?? 0);
      const activity = await db.select({ activity_date: sql<string>`DATE(${inventoryTransactions.createdAt})`, count: sql<number>`count(*)` }).from(inventoryTransactions).where(and(gte(inventoryTransactions.createdAt, new Date(Date.now() - 364 * 86_400_000)), args.flow_type ? eq(inventoryTransactions.flowType, args.flow_type) : undefined)).groupBy(sql`DATE(${inventoryTransactions.createdAt})`).orderBy(asc(sql`DATE(${inventoryTransactions.createdAt})`));
      return { receipts_mtd: Number(receiptRows[0]?.count ?? 0), dispatches_mtd: Number(dispatchRows[0]?.count ?? 0), total_lots_in_stock: Number(totalLotRows[0]?.count ?? 0), qty_committed: qtyCommitted, low_stock_item_count: Number(lowStockResult[0]?.count ?? 0), pending_inspection_count: Number(inspectionRows[0]?.count ?? 0), daily_activity: activity.map((row) => ({ date: row.activity_date, count: Number(row.count) })) };
    });
    return { data: { as_of: asOf, ...data }, source: { title: "Reports and analytics", href: "/reports" } };
  }
  throw new Error("not_available");
}

export function getToolArgumentSchema(name: string) {
  switch (name) {
    case "get_stock_levels": return stockArgs;
    case "get_lot_detail": return lotArgs;
    case "get_item_info": return itemCodeArgs;
    case "get_party_info": return partyArgs;
    case "get_recent_transactions": return transactionsArgs;
    case "get_low_stock_items": return lowStockArgs;
    case "get_pending_items": return pendingArgs;
    case "get_analytics_summary": return analyticsArgs;
    default: return empty;
  }
}
