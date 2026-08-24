"use server";
// VMI contract-terms (rate card) management commands —
// createVmiContractTerms / updateVmiContractTerms.
//
// Traceability:
//   specs/12-vmi-billing/tasks.md A.9 — "vmi_contract_terms is an
//     effective-dated version history (effective_from/effective_to/
//     is_active), the same shape trading_policies already uses, not a
//     single mutable row per party ... a rate edit never overwrites
//     history: it closes the current row (effective_to = boundary) and
//     inserts a new one."
//   lib/db/schema/vmi_billing.ts §1.1's own header comment: "Every rate a
//     party is billed under ... lives on this one versioned row together,
//     mirroring 13's trading_policies pattern. A rate edit never overwrites
//     history: it closes the current row (effective_to = boundary) and
//     inserts a new one." / "Application-layer invariant (Task Group C/D,
//     not enforced here): at most one row per party_id with effective_to
//     IS NULL."
//   lib/db/schema/vmi_billing.ts's column comments: cbmThreshold "required
//     app-layer when threshold_type != 'none'"; overThresholdRate "required
//     app-layer when threshold_type = 'included_allowance'".
//
// Reuse note (checked, not reimplemented): lib/billing/vmi-daily-balance.ts
// exports resolveContractTermsForDate, a pure "which version covers date X"
// resolver already consumed by lib/actions/vmi-charge-lines.ts and the
// storage/handling calculation pipeline (C.3/D.1). This module does NOT
// need that resolver for its own writes — updateVmiContractTerms always
// closes THE CURRENTLY OPEN row (effective_to IS NULL), never "whichever
// version covers some arbitrary date," so a plain isNull(effectiveTo) query
// is the correct, narrower lookup here — but it is named here explicitly so
// a future reader doesn't wonder why it isn't reused.
//
// Effective-date choice (documented per this task's own instruction): the
// version boundary is `new Date()` at call time UNLESS the caller supplies
// an explicit `effectiveDate` on the update input (e.g. a backfilled/
// scheduled rate change) — mirrored identically in
// lib/actions/trading-policies.ts's updateTradingPolicy for the same reason
// (13's trading_policies uses the exact same version-history shape).
//
// Design decision (flagged for reviewer, mirrors trading-policies.ts's
// identical choice): createVmiContractTerms REJECTS
// (errors: ['contract_terms_already_exist']) if an open row
// (effective_to IS NULL) already exists for partyId, rather than silently
// creating a second open row for the same party. Revising an existing
// party's rates must go through updateVmiContractTerms, which performs the
// actual close-and-reopen.
//
// Conventions mirrored from lib/actions/vmi-charge-lines.ts and
// lib/actions/trading-pricing.ts (this codebase's established server-action
// pattern): RequestAuthorizationResolver + requirePermission(resolver,
// capability) gate checked BEFORE any DB access; withRlsTransaction(rlsDeps,
// callback) DB-transaction wrapper; typed
// `{ ok: true, ... } | { ok: false, errors: string[] }` result shape;
// decimal() columns handled as opaque strings end-to-end (never parsed to
// Number at the write boundary).
//
// Built against vmi_contract_terms.read/vmi_contract_terms.manage —
// database-builder's parallel migration is adding RLS + these RBAC
// capabilities for vmi_contract_terms/vmi_permits (trading_policies'
// equivalents already live in migrations 0038/0039). If the migration
// lands with different capability names, this module's two
// requirePermission(...) call sites are the only places to update.

import { and, eq, isNull } from "drizzle-orm";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";
import {
  vmiContractTerms,
  vmiBillingTimingEnum,
  vmiCbmThresholdTypeEnum,
} from "@/lib/db/schema/vmi_billing";

const defaultRlsDeps: RlsTransactionDeps = {
  getAuthenticatedSession,
  pool: rlsPool,
};

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy — mirrors withdrawals.ts's / vmi-charge-lines.ts's DbLike.
/* eslint-disable @typescript-eslint/no-explicit-any */
type DbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  execute?: (...args: any[]) => any;
};

type AnyRecord = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

const BILLING_TIMINGS = vmiBillingTimingEnum.enumValues;
type VmiBillingTiming = (typeof BILLING_TIMINGS)[number];
const THRESHOLD_TYPES = vmiCbmThresholdTypeEnum.enumValues;
type VmiCbmThresholdType = (typeof THRESHOLD_TYPES)[number];

function isValidBillingTiming(value: unknown): value is VmiBillingTiming {
  return (
    typeof value === "string" &&
    (BILLING_TIMINGS as readonly string[]).includes(value)
  );
}

function isValidThresholdType(value: unknown): value is VmiCbmThresholdType {
  return (
    typeof value === "string" &&
    (THRESHOLD_TYPES as readonly string[]).includes(value)
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

export type VmiContractTermsSnapshot = {
  id: string;
  partyId: string;
  storageRatePerCbmDay: string;
  billingTiming: VmiBillingTiming;
  cbmThresholdType: VmiCbmThresholdType;
  cbmThreshold: string | null;
  overThresholdRate: string | null;
  handlingInRatePerCbm: string;
  handlingOutRatePerCbm: string;
  documentationDefaultRateUsd: string;
  billingCurrency: string;
  isActive: boolean;
  effectiveFrom: string; // ISO 8601
  effectiveTo: string | null; // ISO 8601, null = currently open-ended
};

export type CreateVmiContractTermsInput = {
  partyId: string;
  storageRatePerCbmDay: string;
  billingTiming?: string; // defaults 'beginning_of_day', matches schema default
  cbmThresholdType?: string; // defaults 'none', matches schema default
  cbmThreshold?: string; // required when cbmThresholdType != 'none'
  overThresholdRate?: string; // required when cbmThresholdType = 'included_allowance'
  handlingInRatePerCbm: string;
  handlingOutRatePerCbm: string;
  documentationDefaultRateUsd: string;
  billingCurrency?: string; // defaults 'USD', matches schema default
};

export type CreateVmiContractTermsResult =
  | { ok: true; contractTerms: VmiContractTermsSnapshot }
  | { ok: false; errors: string[] };

// A version-close-and-reopen writes a wholesale new row, not a column-level
// PATCH. Fields omitted from the input carry over unchanged from the row
// being closed (mirrors vmi-charge-lines.ts's updateVmiChargeLine "existing
// value when the caller didn't supply one" convention).
export type UpdateVmiContractTermsInput = {
  storageRatePerCbmDay?: string;
  billingTiming?: string;
  cbmThresholdType?: string;
  cbmThreshold?: string;
  overThresholdRate?: string;
  handlingInRatePerCbm?: string;
  handlingOutRatePerCbm?: string;
  documentationDefaultRateUsd?: string;
  billingCurrency?: string;
  effectiveDate?: string; // ISO 8601 / 'YYYY-MM-DD'; defaults to now() if omitted
};

export type UpdateVmiContractTermsResult =
  | { ok: true; contractTerms: VmiContractTermsSnapshot }
  | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// Shared: cbm_threshold / over_threshold_rate presence validation (schema
// comment: "required app-layer when threshold_type != 'none'" /
// "required app-layer when threshold_type = 'included_allowance'").
// ---------------------------------------------------------------------------

function validateThresholdFields(
  thresholdType: VmiCbmThresholdType,
  cbmThreshold: string | undefined,
  overThresholdRate: string | undefined,
  errors: string[],
): void {
  if (thresholdType !== "none" && isBlank(cbmThreshold)) {
    errors.push("cbm_threshold_required");
  }
  if (thresholdType === "included_allowance" && isBlank(overThresholdRate)) {
    errors.push("over_threshold_rate_required");
  }
}

function toSnapshot(row: AnyRecord): VmiContractTermsSnapshot {
  return {
    id: row.id,
    partyId: row.partyId,
    storageRatePerCbmDay: row.storageRatePerCbmDay,
    billingTiming: row.billingTiming,
    cbmThresholdType: row.cbmThresholdType,
    cbmThreshold: row.cbmThreshold ?? null,
    overThresholdRate: row.overThresholdRate ?? null,
    handlingInRatePerCbm: row.handlingInRatePerCbm,
    handlingOutRatePerCbm: row.handlingOutRatePerCbm,
    documentationDefaultRateUsd: row.documentationDefaultRateUsd,
    billingCurrency: row.billingCurrency,
    isActive: row.isActive,
    effectiveFrom: toIso(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? toIso(row.effectiveTo) : null,
  };
}

// ---------------------------------------------------------------------------
// createVmiContractTerms — input validation
// ---------------------------------------------------------------------------

interface ValidatedCreateInput {
  partyId: string;
  storageRatePerCbmDay: string;
  billingTiming: VmiBillingTiming;
  cbmThresholdType: VmiCbmThresholdType;
  cbmThreshold?: string;
  overThresholdRate?: string;
  handlingInRatePerCbm: string;
  handlingOutRatePerCbm: string;
  documentationDefaultRateUsd: string;
  billingCurrency: string;
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
  if (isBlank(raw.storageRatePerCbmDay)) {
    errors.push("storage_rate_per_cbm_day_required");
  }
  if (isBlank(raw.handlingInRatePerCbm)) {
    errors.push("handling_in_rate_per_cbm_required");
  }
  if (isBlank(raw.handlingOutRatePerCbm)) {
    errors.push("handling_out_rate_per_cbm_required");
  }
  if (isBlank(raw.documentationDefaultRateUsd)) {
    errors.push("documentation_default_rate_usd_required");
  }

  const billingTiming =
    raw.billingTiming !== undefined ? raw.billingTiming : "beginning_of_day";
  if (!isValidBillingTiming(billingTiming)) {
    errors.push("invalid_billing_timing");
  }

  const cbmThresholdType =
    raw.cbmThresholdType !== undefined ? raw.cbmThresholdType : "none";
  if (!isValidThresholdType(cbmThresholdType)) {
    errors.push("invalid_cbm_threshold_type");
  }

  const cbmThreshold =
    typeof raw.cbmThreshold === "string" ? raw.cbmThreshold : undefined;
  const overThresholdRate =
    typeof raw.overThresholdRate === "string"
      ? raw.overThresholdRate
      : undefined;

  if (isValidThresholdType(cbmThresholdType)) {
    validateThresholdFields(
      cbmThresholdType,
      cbmThreshold,
      overThresholdRate,
      errors,
    );
  }

  const billingCurrency =
    typeof raw.billingCurrency === "string" && raw.billingCurrency.length > 0
      ? raw.billingCurrency
      : "USD";

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      partyId: raw.partyId,
      storageRatePerCbmDay: raw.storageRatePerCbmDay,
      billingTiming: billingTiming as VmiBillingTiming,
      cbmThresholdType: cbmThresholdType as VmiCbmThresholdType,
      cbmThreshold,
      overThresholdRate,
      handlingInRatePerCbm: raw.handlingInRatePerCbm,
      handlingOutRatePerCbm: raw.handlingOutRatePerCbm,
      documentationDefaultRateUsd: raw.documentationDefaultRateUsd,
      billingCurrency,
    },
  };
}

// ---------------------------------------------------------------------------
// createVmiContractTerms
// ---------------------------------------------------------------------------

export async function createVmiContractTerms(
  resolver: RequestAuthorizationResolver,
  input: unknown,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<CreateVmiContractTermsResult> {
  // Step 1: base authorization — vmi_contract_terms.manage.
  const perm = await requirePermission(resolver, "vmi_contract_terms.manage");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  // Step 2: input validation, including cbm_threshold/over_threshold_rate
  // presence — BEFORE any DB access.
  const validation = validateCreateInput(input);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }
  const data = validation.data;
  const userId = perm.context.userId;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // Step 3: "at most one row per party_id with effective_to IS NULL"
    // guard (schema §1.1) — reject rather than silently create a second
    // open row (see header comment).
    const existingRows = (await db
      .select()
      .from(vmiContractTerms)
      .where(
        and(
          eq(vmiContractTerms.partyId, data.partyId),
          isNull(vmiContractTerms.effectiveTo),
        ),
      )) as AnyRecord[];
    if (existingRows.length > 0) {
      return { ok: false as const, errors: ["contract_terms_already_exist"] };
    }

    // Step 4: insert — a brand-new party simply gets one open-ended row.
    const [insertedRow] = (await db
      .insert(vmiContractTerms)
      .values({
        partyId: data.partyId,
        storageRatePerCbmDay: data.storageRatePerCbmDay,
        billingTiming: data.billingTiming,
        cbmThresholdType: data.cbmThresholdType,
        cbmThreshold: data.cbmThreshold ?? null,
        overThresholdRate: data.overThresholdRate ?? null,
        handlingInRatePerCbm: data.handlingInRatePerCbm,
        handlingOutRatePerCbm: data.handlingOutRatePerCbm,
        documentationDefaultRateUsd: data.documentationDefaultRateUsd,
        billingCurrency: data.billingCurrency,
        isActive: true,
        effectiveFrom: new Date(),
        effectiveTo: null,
        createdByUserId: userId,
      })
      .returning()) as AnyRecord[];

    return { ok: true as const, contractTerms: toSnapshot(insertedRow) };
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// updateVmiContractTerms — input validation
// ---------------------------------------------------------------------------

interface ValidatedUpdateInput {
  storageRatePerCbmDay?: string;
  billingTiming?: VmiBillingTiming;
  cbmThresholdType?: VmiCbmThresholdType;
  cbmThreshold?: string;
  overThresholdRate?: string;
  handlingInRatePerCbm?: string;
  handlingOutRatePerCbm?: string;
  documentationDefaultRateUsd?: string;
  billingCurrency?: string;
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

  if (
    raw.billingTiming !== undefined &&
    !isValidBillingTiming(raw.billingTiming)
  ) {
    errors.push("invalid_billing_timing");
  }
  if (
    raw.cbmThresholdType !== undefined &&
    !isValidThresholdType(raw.cbmThresholdType)
  ) {
    errors.push("invalid_cbm_threshold_type");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      storageRatePerCbmDay:
        typeof raw.storageRatePerCbmDay === "string"
          ? raw.storageRatePerCbmDay
          : undefined,
      billingTiming:
        raw.billingTiming !== undefined
          ? (raw.billingTiming as VmiBillingTiming)
          : undefined,
      cbmThresholdType:
        raw.cbmThresholdType !== undefined
          ? (raw.cbmThresholdType as VmiCbmThresholdType)
          : undefined,
      cbmThreshold:
        typeof raw.cbmThreshold === "string" ? raw.cbmThreshold : undefined,
      overThresholdRate:
        typeof raw.overThresholdRate === "string"
          ? raw.overThresholdRate
          : undefined,
      handlingInRatePerCbm:
        typeof raw.handlingInRatePerCbm === "string"
          ? raw.handlingInRatePerCbm
          : undefined,
      handlingOutRatePerCbm:
        typeof raw.handlingOutRatePerCbm === "string"
          ? raw.handlingOutRatePerCbm
          : undefined,
      documentationDefaultRateUsd:
        typeof raw.documentationDefaultRateUsd === "string"
          ? raw.documentationDefaultRateUsd
          : undefined,
      billingCurrency:
        typeof raw.billingCurrency === "string"
          ? raw.billingCurrency
          : undefined,
      effectiveDate:
        typeof raw.effectiveDate === "string" ? raw.effectiveDate : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// updateVmiContractTerms — the real version-close-and-reopen (tasks.md
// A.9 / schema §1.1's own described pattern, implemented for real).
// ---------------------------------------------------------------------------

export async function updateVmiContractTerms(
  resolver: RequestAuthorizationResolver,
  partyId: string,
  input: unknown,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<UpdateVmiContractTermsResult> {
  // Step 1: base authorization — vmi_contract_terms.manage.
  const perm = await requirePermission(resolver, "vmi_contract_terms.manage");
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

  if (typeof partyId !== "string" || partyId.length === 0) {
    return { ok: false, errors: ["party_id_required"] };
  }

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // Step 3: find the current open row for this party.
    const existingRows = (await db
      .select()
      .from(vmiContractTerms)
      .where(
        and(
          eq(vmiContractTerms.partyId, partyId),
          isNull(vmiContractTerms.effectiveTo),
        ),
      )) as AnyRecord[];
    const existing = existingRows[0];
    if (!existing) {
      return { ok: false as const, errors: ["not_found"] };
    }

    // Step 4: merge — fields not supplied carry over from the closing row.
    const cbmThresholdType = data.cbmThresholdType ?? existing.cbmThresholdType;
    const cbmThreshold = data.cbmThreshold ?? existing.cbmThreshold ?? undefined;
    const overThresholdRate =
      data.overThresholdRate ?? existing.overThresholdRate ?? undefined;

    const errors: string[] = [];
    validateThresholdFields(cbmThresholdType, cbmThreshold, overThresholdRate, errors);
    if (errors.length > 0) {
      return { ok: false as const, errors };
    }

    // Step 5: the version boundary — either caller-supplied (backfill/
    // scheduled correction) or "now" (documented choice, see header).
    const boundary = data.effectiveDate ? new Date(data.effectiveDate) : new Date();

    // Step 6: close the current row.
    await db
      .update(vmiContractTerms)
      .set({ effectiveTo: boundary, isActive: false })
      .where(eq(vmiContractTerms.id, existing.id));

    // Step 7: insert the new open-ended version.
    const [insertedRow] = (await db
      .insert(vmiContractTerms)
      .values({
        partyId,
        storageRatePerCbmDay:
          data.storageRatePerCbmDay ?? existing.storageRatePerCbmDay,
        billingTiming: data.billingTiming ?? existing.billingTiming,
        cbmThresholdType,
        cbmThreshold: cbmThreshold ?? null,
        overThresholdRate: overThresholdRate ?? null,
        handlingInRatePerCbm:
          data.handlingInRatePerCbm ?? existing.handlingInRatePerCbm,
        handlingOutRatePerCbm:
          data.handlingOutRatePerCbm ?? existing.handlingOutRatePerCbm,
        documentationDefaultRateUsd:
          data.documentationDefaultRateUsd ??
          existing.documentationDefaultRateUsd,
        billingCurrency: data.billingCurrency ?? existing.billingCurrency,
        isActive: true,
        effectiveFrom: boundary,
        effectiveTo: null,
        createdByUserId: userId,
      })
      .returning()) as AnyRecord[];

    return { ok: true as const, contractTerms: toSnapshot(insertedRow) };
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}
