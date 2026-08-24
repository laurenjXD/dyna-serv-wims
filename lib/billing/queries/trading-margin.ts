// Trading margin ledger query — office `/billing-pricing` page (Trading tab).
//
// Reads exclusively from `trading_invoice_lines` (lib/db/schema/trading_pricing.ts),
// `direction = 'sale'` rows only — the frozen price snapshot handed to 08/10
// at pick-list-item sale time (design.md §3: "Immutable after locked_at — a
// later price correction creates a new row, never edits history"). This
// module never recomputes sellPrice/buyCost from the live `trading_policies`
// rate card or from `items.selling_price`/`items.buying_price` — the whole
// point of the snapshot is that it does not drift if the current policy or
// item price later changes.
//
// Cross-party by design: this is an office (`reporting.financial_read`)
// surface, not a party-scoped portal read. No party-scoping filter is
// applied here; the caller's own party never narrows this query. The page
// gates access before calling this module.
//
// Margin visibility (design.md §5/§7a — "final identifiers owned by 02":
// `trading_prices.read_internal` = `trading.margin_view`, always co-granted
// with `trading_prices.override`): `cogs`/`marginPct` are OMITTED from the
// row entirely (never present-but-null) for a caller who holds
// `reporting.financial_read` but not `trading_prices.read_internal`/
// `trading_prices.override` — this project's established internal/customer-
// projection convention (see lib/actions/trading-pricing.ts's
// `hasTradingPriceInternalVisibility`, reused here rather than
// reimplemented).

import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { tradingInvoiceLines } from "@/lib/db/schema/trading_pricing";
import { pickListItems, pickLists } from "@/lib/db/schema/pick_lists";
import { parties } from "@/lib/db/schema/parties";
import { items } from "@/lib/db/schema/items";
import { hasTradingPriceInternalVisibility } from "@/lib/rbac/trading-visibility";
import type { AuthorizationContext } from "@/lib/rbac/session";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TradingMarginRow = {
  id: string; // trading_invoice_lines.id — stable React list key
  orderNumber: string;
  party: string;
  item: string;
  lot: string;
  qty: number;
  sellPrice: number;
  // Omitted (not present, never null) for a caller without
  // trading_prices.read_internal/override — see module header.
  cogs?: number;
  marginPct?: number;
};

// Minimal structural type the real Drizzle db instance and test stubs both
// satisfy (matches lib/db/queries/ledgers.ts's DbLike precedent).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = { select: (...args: any[]) => any };

// ---------------------------------------------------------------------------
// Internal raw-row type
// ---------------------------------------------------------------------------

type RawTradingRow = {
  id: string;
  order_number: string | null;
  party_name: string;
  item_name: string;
  lot_number: string | null;
  qty: string;
  sell_price: string | null; // null only for direction='purchase' rows — excluded by the WHERE clause, guarded anyway
  buy_cost: string;
};

// ---------------------------------------------------------------------------
// monthDateBounds — pure helper. `month` is 0-indexed (matches
// `Date.getMonth()` / the page's `MONTHS` array). Returns the calendar
// month's [start, end) boundary as Date instances, comparable against the
// `locked_at` timestamp column (this codebase's established convention —
// see lib/db/queries/withdrawals.ts's `gte(...createdAt, dateRange.startDate)`
// / `lte(...)` pattern).
// ---------------------------------------------------------------------------

export function monthDateBounds(month: number, year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month, 1)),
    end: new Date(Date.UTC(year, month + 1, 1)),
  };
}

// ---------------------------------------------------------------------------
// marginPct — pure helper: (sellPrice - cogs) / sellPrice * 100, guarded
// against a zero sellPrice (a $0 sale line is not expected in practice, but
// a divide-by-zero must never throw or produce Infinity/NaN on this
// financial surface).
// ---------------------------------------------------------------------------

export function computeMarginPct(sellPrice: number, cogs: number): number {
  if (sellPrice === 0) return 0;
  return ((sellPrice - cogs) / sellPrice) * 100;
}

// ---------------------------------------------------------------------------
// getTradingMarginLedger
// ---------------------------------------------------------------------------

export async function getTradingMarginLedger(
  month: number,
  year: number,
  context: AuthorizationContext,
  database: DbLike = db,
): Promise<TradingMarginRow[]> {
  const canSeeInternalPricing = hasTradingPriceInternalVisibility(context);
  const { start, end } = monthDateBounds(month, year);

  const rawRows: RawTradingRow[] = await database
    .select({
      id: tradingInvoiceLines.id,
      order_number: pickLists.pickListNumber,
      party_name: parties.name,
      item_name: items.name,
      lot_number: pickListItems.lotNumber,
      qty: tradingInvoiceLines.qty,
      sell_price: tradingInvoiceLines.sellPrice,
      buy_cost: tradingInvoiceLines.buyCost,
    })
    .from(tradingInvoiceLines)
    .innerJoin(parties, eq(parties.id, tradingInvoiceLines.partyId))
    .innerJoin(items, eq(items.id, tradingInvoiceLines.itemId))
    .leftJoin(pickListItems, eq(pickListItems.id, tradingInvoiceLines.pickListItemId))
    .leftJoin(pickLists, eq(pickLists.id, pickListItems.pickListId))
    .where(
      and(
        eq(tradingInvoiceLines.direction, "sale"),
        gte(tradingInvoiceLines.lockedAt, start),
        lt(tradingInvoiceLines.lockedAt, end),
      ),
    );

  return rawRows.map((raw) => {
    const sellPrice = Number(raw.sell_price ?? 0);
    const cogs = Number(raw.buy_cost);
    return {
      id: raw.id,
      orderNumber: raw.order_number ?? "",
      party: raw.party_name,
      item: raw.item_name,
      lot: raw.lot_number ?? "",
      qty: Number(raw.qty),
      sellPrice,
      ...(canSeeInternalPricing
        ? { cogs, marginPct: computeMarginPct(sellPrice, cogs) }
        : {}),
    };
  });
}
