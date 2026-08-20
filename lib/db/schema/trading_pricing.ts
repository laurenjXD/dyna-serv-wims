// `trading_policies` & `trading_invoice_lines` — specs/13-trading-orders-and-pricing/design.md §2
//
// trading_policies is the rate card (R1): one active row per (party, item),
// prior rows deactivated (never deleted) when a policy is revised, so
// historical sales stay traceable to the policy that produced them.
//
// trading_invoice_lines is the frozen transaction record (R2/R3): covers
// both direction='purchase' (supplier invoice ingestion, §4) and
// direction='sale' (the frozen price snapshot handed to 08/10) rows in one
// table. Immutable after locked_at — a later price correction creates a new
// row, never edits history.
import {
  pgTable,
  uuid,
  varchar,
  decimal,
  boolean,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { parties } from "./parties";
import { items } from "./items";
import { pickListItems } from "./pick_lists";

export const tradingMarginTypeEnum = pgEnum("trading_margin_type", [
  "percentage",
  "fixed_amount",
]);

export const tradingInvoiceDirectionEnum = pgEnum(
  "trading_invoice_direction",
  ["purchase", "sale"],
);

// R1 — the rate card. One active row per (party, item); prior rows are
// deactivated, not deleted, when a policy is revised, so historical sales
// remain traceable to the policy that produced them.
//
// NOTE: no DB-level unique constraint on (party_id, item_id) here — the
// "one active policy per (party, item)" invariant is application-layer
// only, enforced on write (isActive transition) by Task 4's price
// resolution engine, per design.md §2's explicit comment. A partial unique
// index would need conditional logic beyond a plain UNIQUE, matching this
// project's established preference for application-layer enforcement of
// "one active X" invariants.
export const tradingPolicies = pgTable(
  "trading_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partyId: uuid("party_id")
      .references(() => parties.id)
      .notNull(), // customer
    itemId: uuid("item_id")
      .references(() => items.id)
      .notNull(),

    buyCost: decimal("buy_cost", { precision: 12, scale: 4 }).notNull(),
    buyCurrency: varchar("buy_currency", { length: 3 })
      .notNull()
      .default("USD"),

    marginType: tradingMarginTypeEnum("margin_type").notNull(),
    marginValue: decimal("margin_value", {
      precision: 10,
      scale: 4,
    }).notNull(), // e.g. 15.00 (%) or a flat $/unit

    // Derived by default (buy_cost adjusted by margin); a trading.price_set
    // holder may override directly — sellPriceIsOverride distinguishes the
    // two for audit/display, never silently blurred together.
    sellPrice: decimal("sell_price", { precision: 12, scale: 4 }).notNull(),
    sellPriceIsOverride: boolean("sell_price_is_override")
      .default(false)
      .notNull(),
    sellCurrency: varchar("sell_currency", { length: 3 })
      .notNull()
      .default("PHP"),
    fxSource: varchar("fx_source", { length: 50 }), // required when buyCurrency != sellCurrency, enforced app-layer per design.md §5

    isActive: boolean("is_active").default(true).notNull(),
    effectiveFrom: timestamp("effective_from").defaultNow().notNull(),
    effectiveTo: timestamp("effective_to"), // set when superseded, never deleted

    createdByUserId: uuid("created_by_user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    // Indexes for party, item, and policy lookup (tasks.md Task 2). No
    // unique constraint — see the "one active policy" comment above.
    partyIdx: index("trading_policies_party_id_idx").on(table.partyId),
    itemIdx: index("trading_policies_item_id_idx").on(table.itemId),
    partyItemIdx: index("trading_policies_party_item_idx").on(
      table.partyId,
      table.itemId,
    ),
  }),
);

// R2/R3 — the frozen transaction record. direction='purchase' rows come from
// supplier invoice import (§4); direction='sale' rows are the frozen price
// snapshot handed to 08/10.
export const tradingInvoiceLines = pgTable(
  "trading_invoice_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    direction: tradingInvoiceDirectionEnum("direction").notNull(),

    // Sale rows: FK to the pick_list_item this price was frozen for.
    // Purchase rows: null (no pick-list exists yet for an inbound purchase).
    pickListItemId: uuid("pick_list_item_id").references(
      () => pickListItems.id,
    ),
    // Purchase rows: the supplier's own invoice number (e.g. 'PR260026P').
    // Sale rows: null.
    supplierInvoiceRef: varchar("supplier_invoice_ref", { length: 100 }),

    partyId: uuid("party_id")
      .references(() => parties.id)
      .notNull(), // customer (sale) or supplier (purchase)
    itemId: uuid("item_id")
      .references(() => items.id)
      .notNull(),
    qty: decimal("qty", { precision: 12, scale: 4 }).notNull(),

    // Snapshotted from trading_policies at freeze time — never recomputed if
    // the policy later changes.
    buyCost: decimal("buy_cost", { precision: 12, scale: 4 }).notNull(),
    sellPrice: decimal("sell_price", { precision: 12, scale: 4 }), // null for purchase rows
    marginAmount: decimal("margin_amount", { precision: 14, scale: 4 }), // null for purchase rows

    currency: varchar("currency", { length: 3 }).notNull(),
    sourcePolicyId: uuid("source_policy_id").references(
      () => tradingPolicies.id,
    ), // null for purchase rows
    snapshotHash: varchar("snapshot_hash", { length: 64 }).notNull(), // SHA-256 of the line data

    hsCode: varchar("hs_code", { length: 20 }),
    lockedAt: timestamp("locked_at").notNull(),
    createdByUserId: uuid("created_by_user_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // No updatedAt — a frozen row is never edited (design.md §3).
  },
  (table) => ({
    // Indexes for party, item, direction, date, and policy lookup
    // (tasks.md Task 2).
    partyIdx: index("trading_invoice_lines_party_id_idx").on(table.partyId),
    itemIdx: index("trading_invoice_lines_item_id_idx").on(table.itemId),
    directionIdx: index("trading_invoice_lines_direction_idx").on(
      table.direction,
    ),
    lockedAtIdx: index("trading_invoice_lines_locked_at_idx").on(
      table.lockedAt,
    ),
    sourcePolicyIdx: index("trading_invoice_lines_source_policy_id_idx").on(
      table.sourcePolicyId,
    ),
    pickListItemIdx: index("trading_invoice_lines_pick_list_item_id_idx").on(
      table.pickListItemId,
    ),
  }),
);
