// `inventory_transactions` — specs/01-core-data-model/design.md §1.2
// One table, differentiated by `movement_type` — never split into separate
// per-flow tables (see tech.md's cross-cutting architecture principles).
//
// `wrrId` links an incoming transaction to its source `wrr_documents` row
// (and, through `wrr_documents.vendor_party_id`, to the vendor party).
// `pickListId` is the symmetric link for outgoing transactions (added
// 2026-08-07): it points to the `pick_lists` row that was dispatched, and
// through `pick_lists.customer_party_id` resolves to the customer party.
// A given row is either an incoming movement (`wrrId` populated, `pickListId`
// null) or an outgoing/dispatch movement (`pickListId` populated, `wrrId`
// null); movement types outside those two (e.g. `putaway`, `transfer`,
// `inventory_reconciliation`) may leave both null.
import { pgTable, uuid, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { flowTypeEnum, movementTypeEnum } from "./enums";
import { lots } from "./lots";
import { items } from "./items";
import { locations } from "./locations";
import { wrrDocuments } from "./wrr";
import { pickLists } from "./pick_lists";

export const inventoryTransactions = pgTable("inventory_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  transactionNumber: varchar("transaction_number", { length: 50 }).notNull().unique(),
  lotId: uuid("lot_id").references(() => lots.id).notNull(),
  itemId: uuid("item_id").references(() => items.id).notNull(),
  movementType: movementTypeEnum("movement_type").notNull(),
  fromLocationId: uuid("from_location_id").references(() => locations.id),
  toLocationId: uuid("to_location_id").references(() => locations.id),
  qty: integer("qty").notNull(),
  flowType: flowTypeEnum("flow_type").notNull(),
  commercialInvoiceNo: varchar("commercial_invoice_no", { length: 100 }), // Associated with incoming WRR receipts
  arReferenceNo: varchar("ar_reference_no", { length: 100 }), // Associated with outgoing Dispatch/Withdrawal
  wrrId: uuid("wrr_id").references(() => wrrDocuments.id),
  pickListId: uuid("pick_list_id").references(() => pickLists.id), // Added 2026-08-07: mirrors wrrId for outgoing/dispatch movements; set only for movement_type = 'pick', pointing to the dispatched pick_lists row
  performedByUserId: uuid("performed_by_user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
