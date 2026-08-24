// `wrr_documents`, `wrr_items`, `wrr_inspection_logs` — specs/01-core-data-model/design.md §1.2
//
// Note: `wrr_advance_notices` (design.md §6) is a separate, not-yet
// independently `db-migration-verifier`-verified schema amendment and is
// intentionally NOT scaffolded here — it is added once its own
// verification pass is complete.
import { pgTable, uuid, varchar, text, integer, decimal, timestamp, index, unique, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { flowTypeEnum, wrrStatusEnum, conformanceStatusEnum, nonConformanceReasonEnum } from "./enums";
import { parties } from "./parties";
import { items } from "./items";
import { locations } from "./locations";

export const wrrDocuments = pgTable("wrr_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  wrrNumber: varchar("wrr_number", { length: 50 }).notNull().unique(), // e.g. 'WRR-2026-00001'
  commercialInvoiceNo: varchar("commercial_invoice_no", { length: 100 }), // Commercial Invoice / CIPL reference
  ciplFileUrl: text("cipl_file_url"), // Attached PDF/Image CIPL document in Supabase Storage
  pezaNumber: varchar("peza_number", { length: 100 }), // PEZA Permit Number (manual)
  ipNumber: varchar("ip_number", { length: 100 }), // Import Permit (IP) Number
  mawbMblNumber: varchar("mawb_mbl_number", { length: 100 }), // MAWB / MBL (Master Air Waybill / Bill of Lading) — added 2026-08-07
  vendorPartyId: uuid("vendor_party_id").references(() => parties.id).notNull(),
  flowType: flowTypeEnum("flow_type").notNull(),
  status: wrrStatusEnum("status").default("staged_pending_arrival").notNull(),
  stagedByUserId: uuid("staged_by_user_id").notNull(),
  confirmedByUserId: uuid("confirmed_by_user_id"),
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const wrrItems = pgTable("wrr_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  wrrId: uuid("wrr_id").references(() => wrrDocuments.id, { onDelete: "cascade" }).notNull(),
  itemId: uuid("item_id").references(() => items.id), // Nullable: CIPL may reference an item not yet enrolled; resolved via 06's enrollment flow before receipt confirmation (07 design.md §6, §8 requires resolved item data as a commit prerequisite)
  itemCode: varchar("item_code", { length: 100 }), // Supplier Part Number from CIPL
  customerItemCode: varchar("customer_item_code", { length: 100 }), // Customer Part Number from CIPL
  lotNumber: varchar("lot_number", { length: 100 }).notNull(), // Source business lot number from the WRR
  expectedQty: integer("expected_qty").notNull(),
  scannedQty: integer("scanned_qty").default(0).notNull(),
  unitCbm: decimal("unit_cbm", { precision: 10, scale: 4 }).notNull(),
  uom: varchar("uom", { length: 50 }).notNull(),
  disposition: text("disposition").default("store").notNull(), // 'store' | 'inspect'; CHECK constraint in migration 0012
  // Legacy single-location compatibility field. Split receiving uses
  // wrrItemPutawayAllocations as the placement source of truth.
  putawayLocationId: uuid("putaway_location_id").references(() => locations.id),
  // Added 2026-08-10 (migration 0021): per-line immediate-commit idempotency
  // gate. Set once, via a conditional UPDATE ... WHERE committed_at IS NULL,
  // by the transaction that creates this line's lots/lot_location_balances/
  // inventory_transactions rows. See 07 design.md §9.
  committedAt: timestamp("committed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Staged, non-inventory putaway plan for a split WRR line receipt. */
export const wrrItemPutawayAllocations = pgTable("wrr_item_putaway_allocations", {
  id: uuid("id").primaryKey().defaultRandom(),
  wrrItemId: uuid("wrr_item_id").references(() => wrrItems.id, { onDelete: "cascade" }).notNull(),
  locationId: uuid("location_id").references(() => locations.id).notNull(),
  qty: integer("qty").notNull(),
  createdByUserId: uuid("created_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  oneLocationPerLine: unique("wrr_item_putaway_allocations_line_location_unique").on(table.wrrItemId, table.locationId),
  positiveQty: check("wrr_item_putaway_allocations_qty_positive", sql`${table.qty} > 0`),
  lineIndex: index("wrr_item_putaway_allocations_wrr_item_id_idx").on(table.wrrItemId),
}));

export const wrrInspectionLogs = pgTable("wrr_inspection_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  wrrId: uuid("wrr_id").references(() => wrrDocuments.id, { onDelete: "cascade" }).notNull(),
  wrrItemId: uuid("wrr_item_id").references(() => wrrItems.id),
  itemId: uuid("item_id").references(() => items.id).notNull(),
  vendorPartyId: uuid("vendor_party_id").references(() => parties.id).notNull(), // For Vendor Conformance Analytics
  inspectorUserId: uuid("inspector_user_id").notNull(),
  conformanceStatus: conformanceStatusEnum("conformance_status").notNull(), // conformance vs non_conformance
  nonConformanceReason: nonConformanceReasonEnum("non_conformance_reason"), // Reason dropdown
  remarks: text("remarks"), // Free-text remarks / TDC details
  evidencePhotoUrl: text("evidence_photo_url"), // Photo evidence attachment in Supabase storage
  actionTaken: varchar("action_taken", { length: 50 }), // 'accepted_with_variance', 'quarantined', 'returned_to_vendor'
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Migration 0025_wrr_item_unit_scans.sql — specs/18-barcode-integration
// design.md §2.2: tracks which per-unit printed labels (WRRUnitLabelGenerator's
// `wrr_item_unit` payload, one unique unit_id per physical label) have
// already been scanned against a given wrr_items line, so a repeat scan of
// the exact same label can be rejected as a duplicate rather than silently
// counted as a second, distinct unit. The UNIQUE (wrr_item_id, unit_id)
// constraint is the real enforcement mechanism, not application logic.
export const wrrItemUnitScans = pgTable("wrr_item_unit_scans", {
  id: uuid("id").primaryKey().defaultRandom(),
  wrrItemId: uuid("wrr_item_id").references(() => wrrItems.id).notNull(),
  unitId: uuid("unit_id").notNull(), // the label's own unique per-unit identifier
  scannedAt: timestamp("scanned_at").defaultNow().notNull(),
  // References auth.users; Drizzle cannot import the auth schema directly —
  // FK is declared in the migration.
  scannedByUserId: uuid("scanned_by_user_id"),
}, (table) => ({
  uniqueUnit: unique("wrr_item_unit_scans_unique_unit").on(table.wrrItemId, table.unitId),
  wrrItemIdx: index("wrr_item_unit_scans_wrr_item_id_idx").on(table.wrrItemId),
}));
