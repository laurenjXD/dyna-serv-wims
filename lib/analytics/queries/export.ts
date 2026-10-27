import { sql } from "drizzle-orm";
import type { AnalyticsExecutor, AnalyticsFlow, DateRange } from "./shared";
import { assertDateRange, defaultAnalyticsExecutor, flowPredicate } from "./shared";

export const EXPORT_PAGE_SIZE = 1000;
export type ExportCursor = string | null;
export type ExportPage<T extends Record<string, unknown>> = { rows: T[]; nextCursor: ExportCursor };

function page<T extends Record<string, unknown>>(rows: T[]): ExportPage<T> {
  const nextCursor = rows.length === EXPORT_PAGE_SIZE ? String(rows.at(-1)?.id ?? "") || null : null;
  return { rows, nextCursor };
}

export async function getInventorySnapshotExport(cursor: ExportCursor, flow: AnalyticsFlow, executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  const rows = await executor.execute<{ id: string }>(sql`
    SELECT l.id, l.lot_number, l.flow_type, l.status, l.expiry_date,
      i.code AS item_code, i.name AS item_name, p.name AS owner_party_name,
      lit.qty_available, lit.qty_committed, lit.qty_remaining
    FROM lot_inventory_totals lit
    JOIN lots l ON l.id = lit.lot_id
    JOIN items i ON i.id = l.item_id
    LEFT JOIN parties p ON p.id = l.owner_party_id
    WHERE (${cursor === null ? sql`TRUE` : sql`l.id > ${cursor}`})
      AND ${flowPredicate(sql`l.flow_type`, flow)}
    ORDER BY l.id ASC LIMIT ${EXPORT_PAGE_SIZE}
  `);
  return page(rows);
}

export async function getTransactionLedgerExport(range: DateRange, flow: AnalyticsFlow, cursor: ExportCursor, executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  assertDateRange(range);
  const rows = await executor.execute<{ id: string }>(sql`
    SELECT it.id, it.transaction_number, it.created_at, it.movement_type, it.flow_type, it.qty,
      l.lot_number, CASE WHEN it.flow_type = 'vmi' THEN COALESCE(i.supplier_item_code, i.code) ELSE COALESCE(i.dsgc_item_number, i.code) END AS item_code,
      i.name AS item_name, COALESCE(wd.vendor_party_id, pl.customer_party_id, l.owner_party_id) AS party_id
    FROM inventory_transactions it
    JOIN lots l ON l.id = it.lot_id
    JOIN items i ON i.id = it.item_id
    LEFT JOIN wrr_documents wd ON wd.id = it.wrr_id
    LEFT JOIN pick_lists pl ON pl.id = it.pick_list_id
    WHERE it.created_at >= ${range.startDate} AND it.created_at <= ${range.endDate}
      AND (${cursor === null ? sql`TRUE` : sql`it.id > ${cursor}`})
      AND ${flowPredicate(sql`it.flow_type`, flow)}
    ORDER BY it.id ASC LIMIT ${EXPORT_PAGE_SIZE}
  `);
  return page(rows);
}

export async function getReceivingHistoryExport(range: DateRange, cursor: ExportCursor, executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  assertDateRange(range);
  const rows = await executor.execute<{ id: string }>(sql`
    SELECT wi.id, wd.wrr_number, wd.created_at, wd.confirmed_at, wd.flow_type, wd.status AS wrr_status,
      wd.vendor_party_id, wi.lot_number, wi.item_code, wi.customer_item_code, wi.expected_qty, wi.scanned_qty,
      wil.conformance_status, wil.non_conformance_reason, wil.action_taken
    FROM wrr_items wi
    JOIN wrr_documents wd ON wd.id = wi.wrr_id
    LEFT JOIN wrr_inspection_logs wil ON wil.wrr_item_id = wi.id
    WHERE wd.created_at >= ${range.startDate} AND wd.created_at <= ${range.endDate}
      AND (${cursor === null ? sql`TRUE` : sql`wi.id > ${cursor}`})
    ORDER BY wi.id ASC LIMIT ${EXPORT_PAGE_SIZE}
  `);
  return page(rows);
}

export async function getDispatchHistoryExport(range: DateRange, cursor: ExportCursor, executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  assertDateRange(range);
  const rows = await executor.execute<{ id: string }>(sql`
    SELECT pli.id, pl.pick_list_number, pl.created_at, pl.updated_at, pl.flow_type, pl.status,
      pl.customer_party_id, pli.item_code, pli.customer_item_code, pli.item_description,
      pli.lot_number, pli.location_label, pli.qty, pli.spq, pli.number_of_boxes, pli.unit_price
    FROM pick_list_items pli
    JOIN pick_lists pl ON pl.id = pli.pick_list_id
    WHERE pl.created_at >= ${range.startDate} AND pl.created_at <= ${range.endDate}
      AND (${cursor === null ? sql`TRUE` : sql`pli.id > ${cursor}`})
    ORDER BY pli.id ASC LIMIT ${EXPORT_PAGE_SIZE}
  `);
  return page(rows);
}

export async function getConnectedLotHistoryExport(range: DateRange, cursor: ExportCursor, executor: AnalyticsExecutor = defaultAnalyticsExecutor) {
  assertDateRange(range);
  const rows = await executor.execute<{ source_id: string }>(sql`
    SELECT source_id, lot_number, source_type, item_id, flow_type, event_at, movement_type, qty,
      conformance_status, non_conformance_reason, action_taken, reference,
      qty_received, qty_remaining, qty_committed, qty_available, earliest_confirmed_receiving_at
    FROM lot_history_export
    WHERE event_at >= ${range.startDate} AND event_at <= ${range.endDate}
      AND (${cursor === null ? sql`TRUE` : sql`source_id > ${cursor}::uuid`})
    ORDER BY source_id ASC LIMIT ${EXPORT_PAGE_SIZE}
  `);
  return { rows, nextCursor: rows.length === EXPORT_PAGE_SIZE ? rows.at(-1)?.source_id ?? null : null };
}
