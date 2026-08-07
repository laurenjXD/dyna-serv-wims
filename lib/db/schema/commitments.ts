// `inventory_commitments` & `inventory_commitment_lines` — specs/01-core-data-model/design.md §1.2
//
// These tables are the durable reservation relation for Stage 1 outbound
// commitment. Quantity fields on `lot_location_balances` are maintained in the
// same transaction as these rows; the commitment lines provide ownership,
// release, execution, expiry, and audit linkage rather than acting as a second
// inventory ledger.
//
// Beyond the declared constraints, the active commitment quantity must not
// exceed the selected balance row's `qty_remaining`; this is a cross-row
// invariant enforced by the Stage 1 commitment transaction (which locks or
// version-checks the affected balance and commitment rows), not a
// single-table CHECK constraint — owned by 08's allocation engine.
import { pgTable, uuid, varchar, integer, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { commitmentStatusEnum } from "./enums";
import { pickLists, pickListItems } from "./pick_lists";
import { lotLocationBalances } from "./lot_location_balances";

export const inventoryCommitments = pgTable("inventory_commitments", {
  id: uuid("id").primaryKey().defaultRandom(),
  commitmentNumber: varchar("commitment_number", { length: 50 }).notNull().unique(),
  pickListId: uuid("pick_list_id").references(() => pickLists.id).notNull().unique(), // exactly one commitment per pick list
  status: commitmentStatusEnum("status").default("active").notNull(),
  expiresAt: timestamp("expires_at"),
  createdByUserId: uuid("created_by_user_id").notNull(),
  releasedAt: timestamp("released_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const inventoryCommitmentLines = pgTable("inventory_commitment_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  commitmentId: uuid("commitment_id").references(() => inventoryCommitments.id, { onDelete: "cascade" }).notNull(),
  pickListItemId: uuid("pick_list_item_id").references(() => pickListItems.id).notNull(),
  lotLocationBalanceId: uuid("lot_location_balance_id").references(() => lotLocationBalances.id).notNull(),
  qtyCommitted: integer("qty_committed").notNull(),
  qtyExecuted: integer("qty_executed").default(0).notNull(),
  status: commitmentStatusEnum("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  qtyCommittedPositive: check("qty_committed_positive", sql`${table.qtyCommitted} > 0`),
  qtyExecutedWithinCommitted: check(
    "qty_executed_within_committed",
    sql`${table.qtyExecuted} >= 0 AND ${table.qtyExecuted} <= ${table.qtyCommitted}`
  ),
}));
