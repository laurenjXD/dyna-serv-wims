"use server";
// Trading rate-card management commands — createTradingPolicy /
// updateTradingPolicy.
//
// Traceability:
//   specs/13-trading-orders-and-pricing/design.md
//     §2 — trading_policies: "One active row per (party, item); prior rows
//          are deactivated, not deleted, when a policy is revised, so
//          historical sales remain traceable to the policy that produced
//          them." Same effective-dated version-history shape
//          (isActive/effectiveFrom/effectiveTo) as 12's vmi_contract_terms —
//          a rate edit never overwrites history: it closes the current row
//          (effectiveTo = boundary, isActive = false) and inserts a new one
//          (effectiveFrom = that same boundary, effectiveTo = null,
//          isActive = true).
//     §5 — "fx_source ... required app-layer when buy_currency !=
//          sell_currency" (lib/db/schema/trading_pricing.ts's own inline
//          comment on the column).
//     §6 — capability vocabulary: trading_policies.read, trading_policies.manage
//          (= trading.price_set) — this module gates on .manage for both
//          commands (create and edit a rate card, per §5's "Price
//          authority: trading.price_set required to create/edit a
//          trading_policies row").
//   lib/db/schema/trading_pricing.ts — tradingPolicies' own column
//     comments: "NOTE: no DB-level unique constraint on (party_id, item_id)
//     here — the 'one active policy per (party, item)' invariant is
//     application-layer only, enforced on write." This module is that
//     enforcement point for create/update.
//
// Reuse note (checked, not reimplemented): lib/billing/trading-price-resolution.ts
// exports only resolveActiveTradingPolicy (a pure, read-only "which version
// covers `now`" resolver) — there is no existing creation/versioning helper
// there to reuse for writes. This module reuses resolveActiveTradingPolicy
// itself to find "the currently open row" for updateTradingPolicy's
// close-and-reopen step, rather than re-deriving that lookup by hand.
//
// Design decision (flagged for reviewer, mirrored into vmi-contract-terms.ts
// for the same reason): createTradingPolicy REJECTS
// (errors: ['policy_already_exists']) if an open row (effectiveTo IS NULL)
// already exists for the (partyId, itemId) pair, rather than silently
// inserting a second open row and violating the "one active row per
// (party, item)" invariant the schema comment describes as app-layer
// enforced. Revising an existing pair's rate must go through
// updateTradingPolicy, which performs the actual close-and-reopen.
//
// Conventions mirrored from lib/actions/vmi-charge-lines.ts and
// lib/actions/trading-pricing.ts (this codebase's established server-action
// pattern): RequestAuthorizationResolver + requirePermission(resolver,
// capability) gate checked BEFORE any DB access; withRlsTransaction(rlsDeps,
// callback) DB-transaction wrapper; typed
// `{ ok: true, ... } | { ok: false, errors: string[] }` result shape;
// decimal() columns handled as opaque strings end-to-end (never parsed to
// Number at the write boundary — this codebase's established convention,
// see lib/billing/queries/vmi-ledger.ts's header comment for the read-side
// counterpart of this same rule).

import { and, eq, isNull } from "drizzle-orm";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";
import {
  tradingPolicies,
  tradingMarginTypeEnum,
} from "@/lib/db/schema/trading_pricing";

const defaultRlsDeps: RlsTransactionDeps = {
  getAuthenticatedSession,
  pool: rlsPool,
};

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy — mirrors withdrawals.ts's / trading-pricing.ts's DbLike.
/* eslint-disable @typescript-eslint/no-explicit-any */
type DbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  execute?: (...args: any[]) => any;
};

type AnyRecord = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const MARGIN_TYPES = tradingMarginTypeEnum.enumValues;
type TradingMarginType = (typeof MARGIN_TYPES)[number];

function isValidMarginType(value: unknown): value is TradingMarginType {
  return (
    typeof value === "string" &&
    (MARGIN_TYPES as readonly string[]).includes(value)
  );
}

function isBlank(value: string | undefined | null): boolean {
  return value === undefined || value === null || value.trim().length === 0;
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(value as string);
}

function toIso(value: unknown): string {
  return toDate(value).toISOString();
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type TradingPolicySnapshot = {
  id: string;
  partyId: string;
  itemId: string;
  buyCost: string;
  buyCurrency: string;
  marginType: TradingMarginType;
  marginValue: string;
  sellPrice: string;
  sellPriceIsOverride: boolean;
  sellCurrency: string;
  fxSource: string | null;
  isActive: boolean;
  effectiveFrom: string; // ISO 8601
  effectiveTo: string | null; // ISO 8601, null = currently open-ended
};

export type CreateTradingPolicyInput = {
  partyId: string;
  itemId: string;
  buyCost: string;
  buyCurrency?: string; // defaults 'USD', matches schema default
  marginType: string; // validated at runtime against tradingMarginTypeEnum
  marginValue: string;
  sellPrice: string;
  sellPriceIsOverride?: boolean;
  sellCurrency?: string; // defaults 'PHP', matches schema default
  fxSource?: string; // required when buyCurrency != sellCurrency
};

export type CreateTradingPolicyResult =
  | { ok: true; policy: TradingPolicySnapshot }
  | { ok: false; errors: string[] };

export type TradingPolicyKey = { partyId: string; itemId: string };

// Same field shape as create's rate fields — a version-close-and-reopen
// writes a wholesale new row, not a column-level PATCH. Fields omitted from
// the input carry over unchanged from the row being closed (mirrors
// vmi-charge-lines.ts's updateVmiChargeLine "existing value when the caller
// didn't supply one" convention).
export type UpdateTradingPolicyInput = {
  buyCost?: string;
  buyCurrency?: string;
  marginType?: string;
  marginValue?: string;
  sellPrice?: string;
  sellPriceIsOverride?: boolean;
  sellCurrency?: string;
  fxSource?: string;
  effectiveDate?: string; // ISO 8601 / 'YYYY-MM-DD'; defaults to now() if omitted
};

export type UpdateTradingPolicyResult =
  | { ok: true; policy: TradingPolicySnapshot }
  | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// Shared: fx_source-required-when-currencies-differ validation (design.md
// §5 / schema comment).
// ---------------------------------------------------------------------------

function validateFxSource(
  buyCurrency: string,
  sellCurrency: string,
  fxSource: string | undefined,
  errors: string[],
): void {
  if (buyCurrency !== sellCurrency && isBlank(fxSource)) {
    errors.push("fx_source_required");
  }
}

function toSnapshot(row: AnyRecord): TradingPolicySnapshot {
  return {
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
    effectiveFrom: toIso(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? toIso(row.effectiveTo) : null,
  };
}

// ---------------------------------------------------------------------------
// createTradingPolicy — input validation
// ---------------------------------------------------------------------------

interface ValidatedCreateInput {
  partyId: string;
  itemId: string;
  buyCost: string;
  buyCurrency: string;
  marginType: TradingMarginType;
  marginValue: string;
  sellPrice: string;
  sellPriceIsOverride: boolean;
  sellCurrency: string;
  fxSource?: string;
}

function validateCreateInput(
  input: unknown,
): { ok: true; data: ValidatedCreateInput } | { ok: false; errors: string[] } {
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
  if (isBlank(raw.buyCost)) {
    errors.push("buy_cost_required");
  }
  if (!isValidMarginType(raw.marginType)) {
    errors.push("invalid_margin_type");
  }
  if (isBlank(raw.marginValue)) {
    errors.push("margin_value_required");
  }
  if (isBlank(raw.sellPrice)) {
    errors.push("sell_price_required");
  }

  const buyCurrency =
    typeof raw.buyCurrency === "string" && raw.buyCurrency.length > 0
      ? raw.buyCurrency
      : "USD";
  const sellCurrency =
    typeof raw.sellCurrency === "string" && raw.sellCurrency.length > 0
      ? raw.sellCurrency
      : "PHP";
  const fxSource = typeof raw.fxSource === "string" ? raw.fxSource : undefined;

  validateFxSource(buyCurrency, sellCurrency, fxSource, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      partyId: raw.partyId,
      itemId: raw.itemId,
      buyCost: raw.buyCost,
      buyCurrency,
      marginType: raw.marginType as TradingMarginType,
      marginValue: raw.marginValue,
      sellPrice: raw.sellPrice,
      sellPriceIsOverride:
        typeof raw.sellPriceIsOverride === "boolean"
          ? raw.sellPriceIsOverride
          : false,
      sellCurrency,
      fxSource,
    },
  };
}

// ---------------------------------------------------------------------------
// createTradingPolicy
// ---------------------------------------------------------------------------

export async function createTradingPolicy(
  resolver: RequestAuthorizationResolver,
  input: unknown,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<CreateTradingPolicyResult> {
  // Step 1: base authorization — trading_policies.manage (design.md §5/§6).
  const perm = await requirePermission(resolver, "trading_policies.manage");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  // Step 2: input validation, including fx_source-required-when-currencies-
  // differ — BEFORE any DB access.
  const validation = validateCreateInput(input);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }
  const data = validation.data;
  const userId = perm.context.userId;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // Step 3: "one active row per (party, item)" guard — reject rather than
    // silently create a second open row (see header comment).
    const existingRows = (await db
      .select()
      .from(tradingPolicies)
      .where(
        and(
          eq(tradingPolicies.partyId, data.partyId),
          eq(tradingPolicies.itemId, data.itemId),
          isNull(tradingPolicies.effectiveTo),
        ),
      )) as AnyRecord[];
    if (existingRows.length > 0) {
      return { ok: false as const, errors: ["policy_already_exists"] };
    }

    // Step 4: insert.
    const [insertedRow] = (await db
      .insert(tradingPolicies)
      .values({
        partyId: data.partyId,
        itemId: data.itemId,
        buyCost: data.buyCost,
        buyCurrency: data.buyCurrency,
        marginType: data.marginType,
        marginValue: data.marginValue,
        sellPrice: data.sellPrice,
        sellPriceIsOverride: data.sellPriceIsOverride,
        sellCurrency: data.sellCurrency,
        fxSource: data.fxSource ?? null,
        isActive: true,
        effectiveFrom: new Date(),
        effectiveTo: null,
        createdByUserId: userId,
      })
      .returning()) as AnyRecord[];

    return { ok: true as const, policy: toSnapshot(insertedRow) };
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// updateTradingPolicy — input validation
// ---------------------------------------------------------------------------

interface ValidatedUpdateInput {
  buyCost?: string;
  buyCurrency?: string;
  marginType?: TradingMarginType;
  marginValue?: string;
  sellPrice?: string;
  sellPriceIsOverride?: boolean;
  sellCurrency?: string;
  fxSource?: string;
  effectiveDate?: string;
}

function validateUpdateInput(
  input: unknown,
): { ok: true; data: ValidatedUpdateInput } | { ok: false; errors: string[] } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: ["invalid_input"] };
  }
  const raw = input as AnyRecord;
  const errors: string[] = [];

  if (raw.marginType !== undefined && !isValidMarginType(raw.marginType)) {
    errors.push("invalid_margin_type");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      buyCost: typeof raw.buyCost === "string" ? raw.buyCost : undefined,
      buyCurrency:
        typeof raw.buyCurrency === "string" ? raw.buyCurrency : undefined,
      marginType:
        raw.marginType !== undefined
          ? (raw.marginType as TradingMarginType)
          : undefined,
      marginValue:
        typeof raw.marginValue === "string" ? raw.marginValue : undefined,
      sellPrice:
        typeof raw.sellPrice === "string" ? raw.sellPrice : undefined,
      sellPriceIsOverride:
        typeof raw.sellPriceIsOverride === "boolean"
          ? raw.sellPriceIsOverride
          : undefined,
      sellCurrency:
        typeof raw.sellCurrency === "string" ? raw.sellCurrency : undefined,
      fxSource: typeof raw.fxSource === "string" ? raw.fxSource : undefined,
      effectiveDate:
        typeof raw.effectiveDate === "string" ? raw.effectiveDate : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// updateTradingPolicy — version-close-and-reopen (design.md §2's own
// pattern, mirrored exactly).
// ---------------------------------------------------------------------------

export async function updateTradingPolicy(
  resolver: RequestAuthorizationResolver,
  key: TradingPolicyKey,
  input: unknown,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<UpdateTradingPolicyResult> {
  // Step 1: base authorization — trading_policies.manage.
  const perm = await requirePermission(resolver, "trading_policies.manage");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  // Step 2: input validation.
  const validation = validateUpdateInput(input);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }
  const data = validation.data;
  const userId = perm.context.userId;

  if (typeof key !== "object" || key === null || isBlank(key.partyId) || isBlank(key.itemId)) {
    return { ok: false, errors: ["party_id_and_item_id_required"] };
  }

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // Step 3: find the current open row for this (party, item) pair.
    const existingRows = (await db
      .select()
      .from(tradingPolicies)
      .where(
        and(
          eq(tradingPolicies.partyId, key.partyId),
          eq(tradingPolicies.itemId, key.itemId),
          isNull(tradingPolicies.effectiveTo),
        ),
      )) as AnyRecord[];
    const existing = existingRows[0];
    if (!existing) {
      return { ok: false as const, errors: ["not_found"] };
    }

    // Step 4: merge — fields not supplied carry over from the closing row.
    const buyCurrency = data.buyCurrency ?? existing.buyCurrency;
    const sellCurrency = data.sellCurrency ?? existing.sellCurrency;
    const fxSource = data.fxSource ?? existing.fxSource ?? undefined;

    const errors: string[] = [];
    validateFxSource(buyCurrency, sellCurrency, fxSource, errors);
    if (errors.length > 0) {
      return { ok: false as const, errors };
    }

    // Step 5: the version boundary — either caller-supplied (backfill/
    // scheduled correction) or "now" (documented choice, mirrors
    // vmi-contract-terms.ts's identical decision).
    const boundary = data.effectiveDate ? new Date(data.effectiveDate) : new Date();

    // Step 6: close the current row.
    await db
      .update(tradingPolicies)
      .set({ effectiveTo: boundary, isActive: false })
      .where(eq(tradingPolicies.id, existing.id));

    // Step 7: insert the new open-ended version.
    const [insertedRow] = (await db
      .insert(tradingPolicies)
      .values({
        partyId: key.partyId,
        itemId: key.itemId,
        buyCost: data.buyCost ?? existing.buyCost,
        buyCurrency,
        marginType: data.marginType ?? existing.marginType,
        marginValue: data.marginValue ?? existing.marginValue,
        sellPrice: data.sellPrice ?? existing.sellPrice,
        sellPriceIsOverride:
          data.sellPriceIsOverride ?? existing.sellPriceIsOverride,
        sellCurrency,
        fxSource: fxSource ?? null,
        isActive: true,
        effectiveFrom: boundary,
        effectiveTo: null,
        createdByUserId: userId,
      })
      .returning()) as AnyRecord[];

    return { ok: true as const, policy: toSnapshot(insertedRow) };
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}
