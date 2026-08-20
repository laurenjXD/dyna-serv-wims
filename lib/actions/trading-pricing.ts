"use server";
// Trading price freeze command — freezeTradingPrice.
//
// Traceability:
//   specs/13-trading-orders-and-pricing/requirements.md
//     R2.2 — "The resolved buy_cost, sell_price, and computed margin are
//             frozen into an immutable, hashed trading_invoice_lines row
//             (direction = 'sale') at that moment ... never recomputed
//             afterward even if the underlying trading_policies row later
//             changes."
//     R2.3 — "Price overrides at resolution time require
//             trading.price_override and a mandatory written reason,
//             appended to an immutable audit log."
//     §2 — "No configured rate card, no sale ... never a silent fallback to
//           items.selling_price."
//   specs/13-trading-orders-and-pricing/design.md
//     §2 — trading_invoice_lines column shapes; "No updatedAt — a frozen
//          row is never edited".
//     §3 — TradingPriceSnapshot contract; "Immutable after locked_at; a
//          later price correction creates a new trading_invoice_lines row,
//          never edits history."
//     §5 — "Overrides: trading.price_override plus a mandatory written
//          reason, appended to an immutable audit log." / "Missing rate
//          blocks the freeze" (fx_rate_required).
//     §6 — capability vocabulary: trading_policies.read, trading_policies.manage
//          (= price_set), trading_prices.read_internal (= margin_view),
//          trading_prices.override.
//   specs/13-trading-orders-and-pricing/tasks.md Task 4, bullets 4-6.
//
// Consumed, not reimplemented:
//   lib/billing/trading-price-resolution.ts's resolveActiveTradingPolicy.
//   lib/billing/trading-margin-calc.ts's computeTradingPriceLine — the
//     decimal-safe margin/currency/forex math.
//
// Conventions mirrored from lib/actions/withdrawals.ts (this codebase's
// established server-action pattern): RequestAuthorizationResolver +
// requirePermission(resolver, capability) gate checked BEFORE any DB
// access; withRlsTransaction(rlsDeps, callback) DB-transaction wrapper;
// a private hashSnapshot(data) = sha256(JSON.stringify(data)).hex helper
// (own copy here — not imported from withdrawals.ts, which does not export
// its private helper).
//
// Scope decision (flagged, not silently assumed — see the test file's own
// header comment for the full reasoning): the override flow here always
// overrides a RESOLVED, active trading_policies row's sell_price. It never
// supplies a substitute buy_cost/currency basis for a pair with NO
// underlying policy row at all — design.md §5's "sell_price_is_override"
// framing is a property of an existing policy/resolution, not a
// from-scratch bypass.

import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type {
  AuthorizationContext,
  RequestAuthorizationResolver,
} from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";
import { tradingPolicies, tradingInvoiceLines } from "@/lib/db/schema/trading_pricing";
import { forexRates } from "@/lib/db/schema/forex";
import { auditLog } from "@/lib/db/schema/audit";
import {
  resolveActiveTradingPolicy,
  type TradingPolicyRow,
} from "@/lib/billing/trading-price-resolution";
import { computeTradingPriceLine } from "@/lib/billing/trading-margin-calc";

const defaultRlsDeps: RlsTransactionDeps = {
  getAuthenticatedSession,
  pool: rlsPool,
};

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy — mirrors withdrawals.ts's DbLike.
/* eslint-disable @typescript-eslint/no-explicit-any */
type DbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  execute?: (...args: any[]) => any;
};

type AnyRecord = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

function hashSnapshot(data: unknown): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

// buy_cost/margin_amount are OPTIONAL on the wire contract: they are present
// only when the caller holds trading_prices.read_internal (design.md §5's
// margin-visibility rule — "Administrator & Supervisor"). A caller without
// that capability (e.g. a warehouse_staff picker who only holds the base
// trading_policies.read grant used to resolve/freeze a price during their
// own pick-list commit) gets these two keys OMITTED from the object
// entirely, never present-but-null — this project's established
// internal/customer-projection convention (design.md §5, §7a; `12`'s and
// `16`'s equivalent redaction rules use the same "omitted not nulled"
// phrasing). See hasTradingPriceInternalVisibility below.
export type TradingPriceSnapshot = {
  trading_invoice_line_id: string;
  pick_list_item_id: string;
  item_id: string;
  party_id: string;
  buy_cost?: string;
  sell_price: string;
  margin_amount?: string;
  currency: string;
  snapshot_hash: string;
  locked_at: string; // ISO 8601
};

// ---------------------------------------------------------------------------
// Internal-pricing visibility gate (design.md §5's margin-visibility rule)
//
// Gates on trading_prices.read_internal OR trading_prices.override. Per
// supabase/migrations/0036_trading_pricing_rbac_capabilities.sql, these two
// capabilities are always co-granted to the same two roles (supervisor,
// administrator) and never granted independently in this codebase's seed
// data — a caller authorized to override a resolved sell price is, by
// construction, always also authorized to view the cost/margin it is priced
// against. Checked directly against the already-resolved AuthorizationContext
// (no second resolver round trip) rather than a fresh requirePermission call,
// since both capabilities are global-scoped (no party/flow narrowing
// applies here).
// ---------------------------------------------------------------------------

function hasTradingPriceInternalVisibility(context: AuthorizationContext): boolean {
  return context.grants.some(
    (grant) =>
      grant.resource === "trading_prices" &&
      (grant.action === "read_internal" || grant.action === "override"),
  );
}

export type FreezeTradingPriceInput = {
  partyId: string;
  itemId: string;
  pickListItemId: string;
  qty: string;
  override?: { sellPrice: string; reason: string };
};

export type FreezeTradingPriceResult =
  | { ok: true; snapshot: TradingPriceSnapshot }
  | { ok: false; errors: string[]; partyId?: string; itemId?: string };

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

interface ValidatedFreezeInput {
  partyId: string;
  itemId: string;
  pickListItemId: string;
  qty: string;
  override?: { sellPrice: string; reason: string };
}

function validateFreezeInput(
  input: unknown,
): { ok: true; data: ValidatedFreezeInput } | { ok: false; errors: string[] } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: ["invalid_input"] };
  }

  const raw = input as AnyRecord;
  const errors: string[] = [];

  if (typeof raw.partyId !== "string" || raw.partyId.length === 0) {
    errors.push("party_id_required");
  }
  if (typeof raw.itemId !== "string" || raw.itemId.length === 0) {
    errors.push("item_id_required");
  }
  if (typeof raw.pickListItemId !== "string" || raw.pickListItemId.length === 0) {
    errors.push("pick_list_item_id_required");
  }
  if (typeof raw.qty !== "string" || raw.qty.length === 0) {
    errors.push("qty_required");
  }

  let override: { sellPrice: string; reason: string } | undefined;
  if (raw.override !== undefined) {
    if (typeof raw.override !== "object" || raw.override === null) {
      errors.push("invalid_override");
    } else {
      const rawOverride = raw.override as AnyRecord;
      if (typeof rawOverride.sellPrice !== "string" || rawOverride.sellPrice.length === 0) {
        errors.push("override_sell_price_required");
      }
      // Reason presence/emptiness is deliberately NOT enforced here — it is
      // gated AFTER the trading_prices.override capability check below, so
      // an unauthorized caller never learns whether their reason would have
      // been accepted (§5, R2.3).
      override = {
        sellPrice: typeof rawOverride.sellPrice === "string" ? rawOverride.sellPrice : "",
        reason: typeof rawOverride.reason === "string" ? rawOverride.reason : "",
      };
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      partyId: raw.partyId,
      itemId: raw.itemId,
      pickListItemId: raw.pickListItemId,
      qty: raw.qty,
      override,
    },
  };
}

// ---------------------------------------------------------------------------
// Forex resolution
//
// forex_rates (lib/db/schema/forex.ts) models only the USD<->PHP pair
// (design.md §5's evidenced case: buy USD from a supplier, sell PHP to a
// customer). Any other buy/sell currency pair has no resolvable rate today
// — treated as a missing rate (fx_rate_required), never guessed at.
// ---------------------------------------------------------------------------

function parseDecimalToTicks(value: string, scale: number): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [intPartRaw, fracPartRaw = ""] = unsigned.split(".");
  const intPart = intPartRaw === "" ? "0" : intPartRaw;
  const fracPart = fracPartRaw.padEnd(scale, "0").slice(0, scale);
  const magnitude = BigInt(intPart + fracPart);
  return negative ? -magnitude : magnitude;
}

function formatTicksToDecimal(ticks: bigint, scale: number): string {
  const negative = ticks < 0n;
  const abs = negative ? -ticks : ticks;
  const factor = 10n ** BigInt(scale);
  const intPart = abs / factor;
  const fracPart = (abs % factor).toString().padStart(scale, "0");
  return `${negative ? "-" : ""}${intPart.toString()}.${fracPart}`;
}

function invertDecimalString(value: string, scale = 8): string {
  const ticks = parseDecimalToTicks(value, scale);
  if (ticks === 0n) return `0.${"0".repeat(scale)}`;
  const numerator = 10n ** BigInt(scale * 2);
  const inverted = numerator / ticks;
  return formatTicksToDecimal(inverted, scale);
}

function resolveForexRate(
  rows: AnyRecord[],
  buyCurrency: string,
  sellCurrency: string,
): { rate: string; source: string } | undefined {
  if (rows.length === 0) return undefined;

  const latest = rows.reduce((best: AnyRecord, row: AnyRecord) => {
    const bestDate = new Date(best.effectiveDate).getTime();
    const rowDate = new Date(row.effectiveDate).getTime();
    return rowDate > bestDate ? row : best;
  }, rows[0]);

  const source = `forex_rates:${latest.source ?? "manual"}`;

  if (buyCurrency === "USD" && sellCurrency === "PHP") {
    return { rate: String(latest.usdToPhpRate), source };
  }
  if (buyCurrency === "PHP" && sellCurrency === "USD") {
    return { rate: invertDecimalString(String(latest.usdToPhpRate)), source };
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// freezeTradingPrice
//
// Resolves the active trading_policies row (or blocks with a clean
// no_rate_configured rejection naming both party and item), computes the
// decimal-safe price line via computeTradingPriceLine (applying an
// authorized override when supplied), and inserts one immutable, hashed
// trading_invoice_lines row (direction='sale'). An override additionally
// writes an audit_log row recording the override price and reason.
//
// Requires trading_policies.read. Overrides additionally require
// trading_prices.override plus a mandatory non-empty written reason.
// Never partially writes: missing rate card and missing-forex-rate cases
// return a clean rejection with zero DB writes.
// ---------------------------------------------------------------------------

export async function freezeTradingPrice(
  resolver: RequestAuthorizationResolver,
  input: unknown,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<FreezeTradingPriceResult> {
  // Step 1: base authorization — trading_policies.read (design.md §6).
  const basePerm = await requirePermission(resolver, "trading_policies.read");
  if (basePerm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  // Step 2: input validation.
  const validation = validateFreezeInput(input);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }
  const data = validation.data;

  // Step 3: override-specific authorization + mandatory-reason gate —
  // BEFORE any DB access (design.md §5, R2.3).
  if (data.override) {
    const overridePerm = await requirePermission(resolver, "trading_prices.override");
    if (overridePerm.kind !== "authorized") {
      return { ok: false, errors: ["forbidden"] };
    }
    if (data.override.reason.trim().length === 0) {
      return { ok: false, errors: ["override_reason_required"] };
    }
  }

  const userId = basePerm.context.userId;
  const actorRole = basePerm.context.activeRoleKeys[0] ?? "unknown";

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // Step 4: load this (party, item) pair's full policy version history
    // and resolve the active row (lib/billing/trading-price-resolution.ts
    // — never "the latest row").
    const policyRows = (await db
      .select()
      .from(tradingPolicies)
      .where(
        and(
          eq(tradingPolicies.partyId, data.partyId),
          eq(tradingPolicies.itemId, data.itemId),
        ),
      )) as AnyRecord[];

    const policies: TradingPolicyRow[] = policyRows.map((row) => ({
      id: row.id,
      partyId: row.partyId,
      itemId: row.itemId,
      buyCost: row.buyCost,
      buyCurrency: row.buyCurrency,
      marginType: row.marginType,
      marginValue: row.marginValue,
      sellPrice: row.sellPrice,
      sellPriceIsOverride: row.sellPriceIsOverride,
      sellCurrency: row.sellCurrency,
      fxSource: row.fxSource ?? null,
      isActive: row.isActive,
      effectiveFrom:
        row.effectiveFrom instanceof Date
          ? row.effectiveFrom
          : new Date(row.effectiveFrom),
      effectiveTo: row.effectiveTo
        ? row.effectiveTo instanceof Date
          ? row.effectiveTo
          : new Date(row.effectiveTo)
        : null,
    }));

    const resolved = resolveActiveTradingPolicy(
      policies,
      data.partyId,
      data.itemId,
      new Date(),
    );

    if (!resolved.ok) {
      return {
        ok: false as const,
        errors: ["no_rate_configured"],
        partyId: resolved.partyId,
        itemId: resolved.itemId,
      };
    }

    const policy = resolved.policy;

    // Step 5: forex rate resolution — only when buy/sell currencies differ.
    // A missing rate blocks the freeze with no silent fallback (design.md
    // §5, §7 "no silent stale/unknown rate").
    let fxRate: { rate: string; source: string } | undefined;
    if (policy.buyCurrency !== policy.sellCurrency) {
      const forexRows = (await db.select().from(forexRates)) as AnyRecord[];
      const resolvedRate = resolveForexRate(
        forexRows,
        policy.buyCurrency,
        policy.sellCurrency,
      );
      if (!resolvedRate) {
        return { ok: false as const, errors: ["fx_rate_required"] };
      }
      fxRate = resolvedRate;
    }

    // Step 6: decimal-safe price computation — never hand-derived here.
    const computed = computeTradingPriceLine({
      buyCost: policy.buyCost,
      buyCurrency: policy.buyCurrency,
      marginType: policy.marginType,
      marginValue: policy.marginValue,
      sellCurrency: policy.sellCurrency,
      sellPriceIsOverride: data.override !== undefined,
      overrideSellPrice: data.override?.sellPrice,
      fxRate,
    });

    if (!computed.ok) {
      return { ok: false as const, errors: [computed.error] };
    }

    // Step 7: insert the immutable, hashed trading_invoice_lines row
    // (direction='sale'). No update path exists anywhere in this module —
    // a later trading_policies change never rewrites a frozen row; a price
    // correction would insert a NEW row, never edit this one.
    const lockedAt = new Date();
    const snapshotHash = hashSnapshot({
      direction: "sale",
      pickListItemId: data.pickListItemId,
      partyId: data.partyId,
      itemId: data.itemId,
      qty: data.qty,
      buyCost: computed.buyCost,
      sellPrice: computed.sellPrice,
      marginAmount: computed.marginAmount,
      currency: computed.currency,
      sourcePolicyId: policy.id,
      lockedAt: lockedAt.toISOString(),
    });

    const [insertedLine] = (await db
      .insert(tradingInvoiceLines)
      .values({
        direction: "sale",
        pickListItemId: data.pickListItemId,
        partyId: data.partyId,
        itemId: data.itemId,
        qty: data.qty,
        buyCost: computed.buyCost,
        sellPrice: computed.sellPrice,
        marginAmount: computed.marginAmount,
        currency: computed.currency,
        sourcePolicyId: policy.id,
        snapshotHash,
        lockedAt,
        createdByUserId: userId,
      })
      .returning()) as AnyRecord[];

    const lineId = (insertedLine as { id: string }).id;

    // Step 8: override audit — the override price and reason are appended
    // to an immutable audit log, never inferred from a status column flip
    // (R2.3). trading_invoice_lines itself has no override-reason column,
    // so this is the only place the reason is persisted.
    if (data.override) {
      await db.insert(auditLog).values({
        actorUserId: userId,
        actorRole,
        action: "trading_price_override",
        entityType: "trading_invoice_lines",
        entityId: lineId,
        beforeData: { formulaSellPrice: policy.sellPrice },
        afterData: {
          sellPrice: data.override.sellPrice,
          reason: data.override.reason,
        },
        correlationId: randomUUID(),
      });
    }

    // Step 9: internal-pricing redaction (design.md §5) — buy_cost and
    // margin_amount are included only for a caller with
    // trading_prices.read_internal (or the co-granted trading_prices.override
    // — see hasTradingPriceInternalVisibility). The DB row inserted above
    // ALWAYS carries the real computed values regardless of this check; only
    // the value returned to the caller is affected. Keys are omitted
    // entirely, never set to null/undefined while present.
    const canSeeInternalPricing = hasTradingPriceInternalVisibility(basePerm.context);

    const snapshot: TradingPriceSnapshot = {
      trading_invoice_line_id: lineId,
      pick_list_item_id: data.pickListItemId,
      item_id: data.itemId,
      party_id: data.partyId,
      ...(canSeeInternalPricing ? { buy_cost: computed.buyCost } : {}),
      sell_price: computed.sellPrice,
      ...(canSeeInternalPricing ? { margin_amount: computed.marginAmount } : {}),
      currency: computed.currency,
      snapshot_hash: snapshotHash,
      locked_at: lockedAt.toISOString(),
    };

    return { ok: true as const, snapshot };
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}
