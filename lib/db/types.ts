// Inferred TypeScript types for every table in `lib/db/schema/index.ts`.
//
// Convention: for a table exported as `xTable`, this file exports
// `type X = typeof xTable.$inferSelect` (the shape of a row read back from
// the database) and `type NewX = typeof xTable.$inferInsert` (the shape
// accepted on insert, respecting nullable/defaulted columns). This is the
// convention referenced by specs/01-core-data-model/tasks.md item 22; no
// prior file in this repo imports from `lib/db/types`, so this file
// establishes the pattern rather than matching an existing one.
import type {
  parties,
  partyRoles,
  itemCategories,
  items,
  locations,
  lots,
  lotLocationBalances,
  inventoryCommitments,
  inventoryCommitmentLines,
  wrrDocuments,
  wrrItems,
  wrrItemPutawayAllocations,
  wrrInspectionLogs,
  forexRates,
  inventoryTransactions,
  auditLog,
  pickLists,
  pickListItems,
} from "./schema";

// parties
export type Party = typeof parties.$inferSelect;
export type NewParty = typeof parties.$inferInsert;

// party_roles
export type PartyRole = typeof partyRoles.$inferSelect;
export type NewPartyRole = typeof partyRoles.$inferInsert;

// item_categories
export type ItemCategory = typeof itemCategories.$inferSelect;
export type NewItemCategory = typeof itemCategories.$inferInsert;

// items
export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;

// locations
export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;

// lots
export type Lot = typeof lots.$inferSelect;
export type NewLot = typeof lots.$inferInsert;

// lot_location_balances
export type LotLocationBalance = typeof lotLocationBalances.$inferSelect;
export type NewLotLocationBalance = typeof lotLocationBalances.$inferInsert;

// inventory_commitments
export type InventoryCommitment = typeof inventoryCommitments.$inferSelect;
export type NewInventoryCommitment = typeof inventoryCommitments.$inferInsert;

// inventory_commitment_lines
export type InventoryCommitmentLine = typeof inventoryCommitmentLines.$inferSelect;
export type NewInventoryCommitmentLine = typeof inventoryCommitmentLines.$inferInsert;

// wrr_documents
export type WrrDocument = typeof wrrDocuments.$inferSelect;
export type NewWrrDocument = typeof wrrDocuments.$inferInsert;

// wrr_items
export type WrrItem = typeof wrrItems.$inferSelect;
export type NewWrrItem = typeof wrrItems.$inferInsert;

export type WrrItemPutawayAllocation = typeof wrrItemPutawayAllocations.$inferSelect;
export type NewWrrItemPutawayAllocation = typeof wrrItemPutawayAllocations.$inferInsert;

// wrr_inspection_logs
export type WrrInspectionLog = typeof wrrInspectionLogs.$inferSelect;
export type NewWrrInspectionLog = typeof wrrInspectionLogs.$inferInsert;

// forex_rates
export type ForexRate = typeof forexRates.$inferSelect;
export type NewForexRate = typeof forexRates.$inferInsert;

// inventory_transactions
export type InventoryTransaction = typeof inventoryTransactions.$inferSelect;
export type NewInventoryTransaction = typeof inventoryTransactions.$inferInsert;

// audit_log
export type AuditLog = typeof auditLog.$inferSelect;
export type NewAuditLog = typeof auditLog.$inferInsert;

// pick_lists
export type PickList = typeof pickLists.$inferSelect;
export type NewPickList = typeof pickLists.$inferInsert;

// pick_list_items
export type PickListItem = typeof pickListItems.$inferSelect;
export type NewPickListItem = typeof pickListItems.$inferInsert;
