"use server";
// VMI charge-line entry commands — createVmiChargeLine / updateVmiChargeLine.
//
// Traceability:
//   specs/12-vmi-billing/tasks.md D.2 — "Implement charge-line entry
//     commands ... Create/edit a vmi_charge_lines row (documentation,
//     pre-filled from contract.documentation_default_rate_usd, editable;
//     delivery, blank, required manual PHP amount; ad-hoc types, free
//     entry). Reject edits once the line's period has closed."
//   specs/12-vmi-billing/requirements.md FR-4 — Handling, Documentation, and
//     Delivery charges (FR-4.2/4.3/4.4).
//   specs/12-vmi-billing/requirements.md FR-1.3 — the documentation default
//     is resolved BY DATE against vmi_contract_terms' version history,
//     exactly like storage/handling — never "whatever the contract
//     currently says."
//   specs/12-vmi-billing/design.md §1.4 — vmi_charge_lines column shapes;
//     'auto' = pre-filled from contract.documentation_default_rate_usd,
//     still editable; 'manual' = no contract-derived default exists at all
//     (delivery, and every ad-hoc type).
//   specs/12-vmi-billing/design.md §2.4 — "'manual' is reserved for charge
//     types with no contract-derived default at all" — documentation is
//     ALWAYS source = 'auto', override or not.
//   specs/12-vmi-billing/design.md §0/§1.4 — a plain FK can't enforce "the
//     referenced generated_documents row has document_type =
//     'acknowledgement_receipt'"; that validator is this module's own
//     responsibility.
//   specs/12-vmi-billing/design.md §4 — RLS boundaries: vmi_charge_lines
//     writeable by Office Admin/Supervisor only, and only for
//     vmi_billing_periods rows not yet closed. Charge-line entry is not
//     named as period-close/payment-recording (the two Administrator-only
//     actions), so the base reporting.financial_read gate applies here
//     (mirrors trading-pricing.ts's precedent of gating on the base read
//     capability for a non-close/payment command).
//
// Consumed, not reimplemented: lib/billing/vmi-daily-balance.ts's
// resolveContractTermsForDate — the same effective-dated version-history
// resolver already used by storage (C.3) and handling (D.1), reused here for
// documentation's contract-derived default rate.
//
// Conventions mirrored from lib/actions/trading-pricing.ts and
// lib/actions/withdrawals.ts (this codebase's established server-action
// pattern): RequestAuthorizationResolver + requirePermission(resolver,
// capability) gate checked BEFORE any DB access; withRlsTransaction(rlsDeps,
// callback) DB-transaction wrapper.

import { and, eq, gte, lte } from "drizzle-orm";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";
import {
  vmiChargeLines,
  vmiChargeTypeEnum,
  vmiContractTerms,
  vmiBillingPeriods,
} from "@/lib/db/schema/vmi_billing";
import { generatedDocuments } from "@/lib/db/schema/documents";
import { resolveContractTermsForDate } from "@/lib/billing/vmi-daily-balance";

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

const CHARGE_TYPES = vmiChargeTypeEnum.enumValues;
type VmiChargeType = (typeof CHARGE_TYPES)[number];

function isValidChargeType(value: unknown): value is VmiChargeType {
  return (
    typeof value === "string" &&
    (CHARGE_TYPES as readonly string[]).includes(value)
  );
}

function isBlank(value: string | undefined | null): boolean {
  return value === undefined || value === null || value.trim().length === 0;
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(value as string);
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VmiChargeLineSnapshot = {
  id: string;
  partyId: string;
  acknowledgementReceiptId: string;
  chargeType: string;
  amount: string;
  currency: string;
  source: "auto" | "manual";
  chargeDate: string;
};

export type CreateVmiChargeLineInput = {
  partyId: string;
  acknowledgementReceiptId: string;
  chargeType: string; // validated at runtime against the 8 allowed values
  chargeDate: string; // 'YYYY-MM-DD'
  amount?: string; // omitted/blank only ever accepted for 'documentation'
  notes?: string;
};

export type CreateVmiChargeLineResult =
  | { ok: true; chargeLine: VmiChargeLineSnapshot }
  | { ok: false; errors: string[] };

export type UpdateVmiChargeLineInput = {
  chargeLineId: string;
  amount?: string;
  chargeDate?: string;
  notes?: string;
};

export type UpdateVmiChargeLineResult =
  | { ok: true; chargeLine: VmiChargeLineSnapshot }
  | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// Shared: resolve amount/currency/source for a given (already-validated as
// existing/allowed) charge type.
// ---------------------------------------------------------------------------

interface ResolvedChargeAmount {
  amount: string;
  currency: string;
  source: "auto" | "manual";
}

// Whether a raw (possibly blank/undefined) amount is acceptable for this
// charge type WITHOUT yet resolving a contract default. 'documentation' is
// the only type that may omit amount at this stage — every other type
// (delivery, and every ad-hoc type) requires a non-blank amount up front,
// rejected before any DB access at all (FR-4.3/4.4).
function amountRequiredUpfront(
  chargeType: VmiChargeType,
  rawAmount: string | undefined,
): boolean {
  if (chargeType === "documentation") return false;
  return isBlank(rawAmount);
}

// design.md §2.4: delivery is always PHP, every other non-documentation
// (ad-hoc) type is USD; both are always source = 'manual' since neither has
// a contract-derived default.
function resolveNonDocumentationCharge(
  chargeType: VmiChargeType,
  amount: string,
): ResolvedChargeAmount {
  if (chargeType === "delivery") {
    return { amount, currency: "PHP", source: "manual" };
  }
  return { amount, currency: "USD", source: "manual" };
}

// ---------------------------------------------------------------------------
// createVmiChargeLine — input validation
// ---------------------------------------------------------------------------

interface ValidatedCreateInput {
  partyId: string;
  acknowledgementReceiptId: string;
  chargeType: VmiChargeType;
  chargeDate: string;
  amount?: string;
  notes?: string;
}

function validateCreateInput(
  input: unknown,
):
  | { ok: true; data: ValidatedCreateInput }
  | { ok: false; errors: string[] } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: ["invalid_input"] };
  }
  const raw = input as AnyRecord;
  const errors: string[] = [];

  if (typeof raw.partyId !== "string" || raw.partyId.length === 0) {
    errors.push("party_id_required");
  }
  if (
    typeof raw.acknowledgementReceiptId !== "string" ||
    raw.acknowledgementReceiptId.length === 0
  ) {
    errors.push("acknowledgement_receipt_id_required");
  }
  if (typeof raw.chargeDate !== "string" || raw.chargeDate.length === 0) {
    errors.push("charge_date_required");
  }
  if (!isValidChargeType(raw.chargeType)) {
    errors.push("invalid_charge_type");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const chargeType = raw.chargeType as VmiChargeType;
  const amount = typeof raw.amount === "string" ? raw.amount : undefined;
  const notes = typeof raw.notes === "string" ? raw.notes : undefined;

  // Amount-required-upfront rejection, before any DB access (FR-4.3/4.4).
  if (amountRequiredUpfront(chargeType, amount)) {
    return { ok: false, errors: ["amount_required"] };
  }

  return {
    ok: true,
    data: {
      partyId: raw.partyId,
      acknowledgementReceiptId: raw.acknowledgementReceiptId,
      chargeType,
      chargeDate: raw.chargeDate,
      amount,
      notes,
    },
  };
}

// ---------------------------------------------------------------------------
// updateVmiChargeLine — input validation
// ---------------------------------------------------------------------------

interface ValidatedUpdateInput {
  chargeLineId: string;
  amount?: string;
  chargeDate?: string;
  notes?: string;
}

function validateUpdateInput(
  input: unknown,
):
  | { ok: true; data: ValidatedUpdateInput }
  | { ok: false; errors: string[] } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: ["invalid_input"] };
  }
  const raw = input as AnyRecord;
  const errors: string[] = [];

  if (typeof raw.chargeLineId !== "string" || raw.chargeLineId.length === 0) {
    errors.push("charge_line_id_required");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      chargeLineId: raw.chargeLineId,
      amount: typeof raw.amount === "string" ? raw.amount : undefined,
      chargeDate:
        typeof raw.chargeDate === "string" ? raw.chargeDate : undefined,
      notes: typeof raw.notes === "string" ? raw.notes : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// createVmiChargeLine
// ---------------------------------------------------------------------------

export async function createVmiChargeLine(
  resolver: RequestAuthorizationResolver,
  input: unknown,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<CreateVmiChargeLineResult> {
  // Step 1: base authorization — reporting.financial_read (design.md §4).
  const perm = await requirePermission(resolver, "reporting.financial_read");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  // Step 2: input validation, including the amount-required-upfront gate —
  // BEFORE any DB access.
  const validation = validateCreateInput(input);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }
  const data = validation.data;
  const userId = perm.context.userId;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // Step 3: AR document validation (design.md §0/§1.4 correction) — the
    // referenced generated_documents row must exist and be an actual
    // acknowledgement_receipt, a constraint a plain FK cannot express.
    const arRows = (await db
      .select()
      .from(generatedDocuments)
      .where(eq(generatedDocuments.id, data.acknowledgementReceiptId))
      .limit(1)) as AnyRecord[];
    const arRow = arRows[0];
    if (!arRow || arRow.documentType !== "acknowledgement_receipt") {
      return {
        ok: false as const,
        errors: ["invalid_acknowledgement_receipt"],
      };
    }

    // Step 4: closed-period guard (design.md §4) — only an EXISTING
    // 'issued'/'voided' period row covering charge_date blocks; no row at
    // all is never treated as closed.
    const periodRows = (await db
      .select()
      .from(vmiBillingPeriods)
      .where(
        and(
          eq(vmiBillingPeriods.partyId, data.partyId),
          lte(vmiBillingPeriods.periodStartDate, data.chargeDate),
          gte(vmiBillingPeriods.periodEndDate, data.chargeDate),
        ),
      )) as AnyRecord[];
    const closed = periodRows.some(
      (row) => row.status === "issued" || row.status === "voided",
    );
    if (closed) {
      return { ok: false as const, errors: ["period_closed"] };
    }

    // Step 5: resolve amount/currency/source per charge type (FR-4.2's
    // documentation default, resolved BY DATE against vmi_contract_terms'
    // version history per FR-1.3 — never "the current row").
    let resolved: ResolvedChargeAmount;
    if (data.chargeType === "documentation") {
      if (!isBlank(data.amount)) {
        resolved = {
          amount: data.amount as string,
          currency: "USD",
          source: "auto",
        };
      } else {
        const contractRows = (await db
          .select()
          .from(vmiContractTerms)
          .where(eq(vmiContractTerms.partyId, data.partyId))) as AnyRecord[];
        const versions = contractRows.map((row) => ({
          ...row,
          effectiveFrom: toDate(row.effectiveFrom),
          effectiveTo: row.effectiveTo ? toDate(row.effectiveTo) : null,
        }));
        const contract = resolveContractTermsForDate(
          versions,
          data.chargeDate,
        );
        if (!contract) {
          // Out of scope for the RED cycle this module was written against
          // (no test exercises this branch): no vmi_contract_terms version
          // resolves for chargeDate at all, and no amount was supplied.
          return {
            ok: false as const,
            errors: ["documentation_rate_not_found"],
          };
        }
        resolved = {
          amount: String((contract as AnyRecord).documentationDefaultRateUsd),
          currency: "USD",
          source: "auto",
        };
      }
    } else {
      // amount is guaranteed non-blank here by validateCreateInput's
      // amountRequiredUpfront check.
      resolved = resolveNonDocumentationCharge(
        data.chargeType,
        data.amount as string,
      );
    }

    // Step 6: insert.
    const [insertedRow] = (await db
      .insert(vmiChargeLines)
      .values({
        partyId: data.partyId,
        acknowledgementReceiptId: data.acknowledgementReceiptId,
        chargeType: data.chargeType,
        amount: resolved.amount,
        currency: resolved.currency,
        source: resolved.source,
        chargeDate: data.chargeDate,
        notes: data.notes ?? null,
        recordedByUserId: userId,
      })
      .returning()) as AnyRecord[];

    const chargeLine: VmiChargeLineSnapshot = {
      id: insertedRow.id,
      partyId: insertedRow.partyId,
      acknowledgementReceiptId: insertedRow.acknowledgementReceiptId,
      chargeType: insertedRow.chargeType,
      amount: insertedRow.amount,
      currency: insertedRow.currency,
      source: insertedRow.source,
      chargeDate: insertedRow.chargeDate,
    };

    return { ok: true as const, chargeLine };
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// updateVmiChargeLine
// ---------------------------------------------------------------------------

export async function updateVmiChargeLine(
  resolver: RequestAuthorizationResolver,
  input: unknown,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<UpdateVmiChargeLineResult> {
  // Step 1: base authorization — reporting.financial_read (design.md §4).
  const perm = await requirePermission(resolver, "reporting.financial_read");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  // Step 2: input validation.
  const validation = validateUpdateInput(input);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }
  const data = validation.data;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // Step 3: load the existing row.
    const existingRows = (await db
      .select()
      .from(vmiChargeLines)
      .where(eq(vmiChargeLines.id, data.chargeLineId))
      .limit(1)) as AnyRecord[];
    const existing = existingRows[0];
    if (!existing) {
      return { ok: false as const, errors: ["not_found"] };
    }

    const effectiveChargeDate = data.chargeDate ?? existing.chargeDate;

    // Step 4: the SAME closed-period guard applies to edits (design.md §4,
    // tasks.md D.2's "Reject edits once the line's period has closed").
    const periodRows = (await db
      .select()
      .from(vmiBillingPeriods)
      .where(
        and(
          eq(vmiBillingPeriods.partyId, existing.partyId),
          lte(vmiBillingPeriods.periodStartDate, effectiveChargeDate),
          gte(vmiBillingPeriods.periodEndDate, effectiveChargeDate),
        ),
      )) as AnyRecord[];
    const closed = periodRows.some(
      (row) => row.status === "issued" || row.status === "voided",
    );
    if (closed) {
      return { ok: false as const, errors: ["period_closed"] };
    }

    // Step 5: re-apply the same amount/currency/source rules the existing
    // row's (immutable, not part of this input contract) charge type
    // requires.
    const chargeType = existing.chargeType as VmiChargeType;
    const rawAmount = data.amount !== undefined ? data.amount : existing.amount;

    let resolved: ResolvedChargeAmount;
    if (chargeType === "documentation") {
      if (!isBlank(rawAmount)) {
        resolved = {
          amount: rawAmount as string,
          currency: "USD",
          source: "auto",
        };
      } else {
        const contractRows = (await db
          .select()
          .from(vmiContractTerms)
          .where(
            eq(vmiContractTerms.partyId, existing.partyId),
          )) as AnyRecord[];
        const versions = contractRows.map((row) => ({
          ...row,
          effectiveFrom: toDate(row.effectiveFrom),
          effectiveTo: row.effectiveTo ? toDate(row.effectiveTo) : null,
        }));
        const contract = resolveContractTermsForDate(
          versions,
          effectiveChargeDate,
        );
        if (!contract) {
          return {
            ok: false as const,
            errors: ["documentation_rate_not_found"],
          };
        }
        resolved = {
          amount: String((contract as AnyRecord).documentationDefaultRateUsd),
          currency: "USD",
          source: "auto",
        };
      }
    } else {
      if (isBlank(rawAmount)) {
        return { ok: false as const, errors: ["amount_required"] };
      }
      resolved = resolveNonDocumentationCharge(
        chargeType,
        rawAmount as string,
      );
    }

    const notes = data.notes !== undefined ? data.notes : (existing.notes ?? null);

    // Step 6: update.
    const [updatedRow] = (await db
      .update(vmiChargeLines)
      .set({
        amount: resolved.amount,
        currency: resolved.currency,
        source: resolved.source,
        chargeDate: effectiveChargeDate,
        notes,
      })
      .where(eq(vmiChargeLines.id, data.chargeLineId))
      .returning()) as AnyRecord[];

    const chargeLine: VmiChargeLineSnapshot = {
      id: updatedRow.id,
      partyId: existing.partyId,
      acknowledgementReceiptId: existing.acknowledgementReceiptId,
      chargeType,
      amount: updatedRow.amount,
      currency: updatedRow.currency,
      source: updatedRow.source,
      chargeDate: updatedRow.chargeDate,
    };

    return { ok: true as const, chargeLine };
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}
