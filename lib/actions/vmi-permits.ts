"use server";
// VMI permit management commands — createVmiPermit / updateVmiPermit /
// listVmiPermits.
//
// Traceability:
//   lib/db/schema/vmi_billing.ts §1.5 — vmi_permits: partyId, permitNumber,
//     itemScope, validFrom, validTo, monthlyFeeUsd, isActive. Plain,
//     non-version-dated CRUD table — unlike vmi_contract_terms/
//     trading_policies, there is no effective_from/effective_to shape here
//     at all, just an isActive boolean.
//   specs/12-vmi-billing/tasks.md A.8 — "Letter of Authority cadence ...
//     regenerated at every period close ... even though vmi_permits content
//     rarely changes month to month" — permits are standing records, edited
//     in place, not versioned per period.
//   specs/12-vmi-billing/design.md §1.2 — a linked vmi_recurring_fee_lines
//     LOA row mirrors a permit's monthly_fee_usd (FR-5.2); that linkage is
//     out of scope for this module (owned by vmi_recurring_fee_lines'
//     own write path, not built tonight).
//
// listVmiPermits deliberately returns BOTH active and inactive permits for
// a party — an edit screen needs to show permit history (e.g. an expired/
// deactivated permit still referenced by past billing periods), not just
// the currently-active set.
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
// Built against vmi_permits.read/vmi_permits.manage — database-builder's
// parallel migration is adding RLS + these RBAC capabilities. If the
// migration lands with different capability names, this module's three
// requirePermission(...) call sites are the only places to update.

import { eq } from "drizzle-orm";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";
import { vmiPermits } from "@/lib/db/schema/vmi_billing";

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

function isBlank(value: string | undefined | null): boolean {
  return value === undefined || value === null || value.trim().length === 0;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type VmiPermitSnapshot = {
  id: string;
  partyId: string;
  permitNumber: string;
  itemScope: string;
  validFrom: string; // 'YYYY-MM-DD'
  validTo: string; // 'YYYY-MM-DD'
  monthlyFeeUsd: string;
  isActive: boolean;
};

export type CreateVmiPermitInput = {
  partyId: string;
  permitNumber: string;
  itemScope: string;
  validFrom: string; // 'YYYY-MM-DD'
  validTo: string; // 'YYYY-MM-DD'
  monthlyFeeUsd: string;
  isActive?: boolean; // defaults true, matches schema default
};

export type CreateVmiPermitResult =
  | { ok: true; permit: VmiPermitSnapshot }
  | { ok: false; errors: string[] };

export type UpdateVmiPermitInput = {
  permitNumber?: string;
  itemScope?: string;
  validFrom?: string;
  validTo?: string;
  monthlyFeeUsd?: string;
  isActive?: boolean;
};

export type UpdateVmiPermitResult =
  | { ok: true; permit: VmiPermitSnapshot }
  | { ok: false; errors: string[] };

export type ListVmiPermitsResult =
  | { ok: true; permits: VmiPermitSnapshot[] }
  | { ok: false; errors: string[] };

function toSnapshot(row: AnyRecord): VmiPermitSnapshot {
  return {
    id: row.id,
    partyId: row.partyId,
    permitNumber: row.permitNumber,
    itemScope: row.itemScope,
    validFrom: row.validFrom,
    validTo: row.validTo,
    monthlyFeeUsd: row.monthlyFeeUsd,
    isActive: row.isActive,
  };
}

// ---------------------------------------------------------------------------
// createVmiPermit — input validation
// ---------------------------------------------------------------------------

interface ValidatedCreateInput {
  partyId: string;
  permitNumber: string;
  itemScope: string;
  validFrom: string;
  validTo: string;
  monthlyFeeUsd: string;
  isActive: boolean;
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
  if (isBlank(raw.permitNumber)) {
    errors.push("permit_number_required");
  }
  if (isBlank(raw.itemScope)) {
    errors.push("item_scope_required");
  }
  if (isBlank(raw.validFrom)) {
    errors.push("valid_from_required");
  }
  if (isBlank(raw.validTo)) {
    errors.push("valid_to_required");
  }
  if (isBlank(raw.monthlyFeeUsd)) {
    errors.push("monthly_fee_usd_required");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      partyId: raw.partyId,
      permitNumber: raw.permitNumber,
      itemScope: raw.itemScope,
      validFrom: raw.validFrom,
      validTo: raw.validTo,
      monthlyFeeUsd: raw.monthlyFeeUsd,
      isActive: typeof raw.isActive === "boolean" ? raw.isActive : true,
    },
  };
}

// ---------------------------------------------------------------------------
// createVmiPermit
// ---------------------------------------------------------------------------

export async function createVmiPermit(
  resolver: RequestAuthorizationResolver,
  input: unknown,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<CreateVmiPermitResult> {
  // Step 1: base authorization — vmi_permits.manage.
  const perm = await requirePermission(resolver, "vmi_permits.manage");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  // Step 2: input validation — BEFORE any DB access.
  const validation = validateCreateInput(input);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }
  const data = validation.data;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    const [insertedRow] = (await db
      .insert(vmiPermits)
      .values({
        partyId: data.partyId,
        permitNumber: data.permitNumber,
        itemScope: data.itemScope,
        validFrom: data.validFrom,
        validTo: data.validTo,
        monthlyFeeUsd: data.monthlyFeeUsd,
        isActive: data.isActive,
      })
      .returning()) as AnyRecord[];

    return { ok: true as const, permit: toSnapshot(insertedRow) };
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// updateVmiPermit — input validation
// ---------------------------------------------------------------------------

interface ValidatedUpdateInput {
  permitNumber?: string;
  itemScope?: string;
  validFrom?: string;
  validTo?: string;
  monthlyFeeUsd?: string;
  isActive?: boolean;
}

function validateUpdateInput(
  input: unknown,
): { ok: true; data: ValidatedUpdateInput } | { ok: false; errors: string[] } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: ["invalid_input"] };
  }
  const raw = input as AnyRecord;

  return {
    ok: true,
    data: {
      permitNumber:
        typeof raw.permitNumber === "string" ? raw.permitNumber : undefined,
      itemScope:
        typeof raw.itemScope === "string" ? raw.itemScope : undefined,
      validFrom:
        typeof raw.validFrom === "string" ? raw.validFrom : undefined,
      validTo: typeof raw.validTo === "string" ? raw.validTo : undefined,
      monthlyFeeUsd:
        typeof raw.monthlyFeeUsd === "string" ? raw.monthlyFeeUsd : undefined,
      isActive:
        typeof raw.isActive === "boolean" ? raw.isActive : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// updateVmiPermit — plain guarded update (not version-dated).
// ---------------------------------------------------------------------------

export async function updateVmiPermit(
  resolver: RequestAuthorizationResolver,
  permitId: string,
  input: unknown,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<UpdateVmiPermitResult> {
  // Step 1: base authorization — vmi_permits.manage.
  const perm = await requirePermission(resolver, "vmi_permits.manage");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  // Step 2: input validation.
  const validation = validateUpdateInput(input);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }
  const data = validation.data;

  if (typeof permitId !== "string" || permitId.length === 0) {
    return { ok: false, errors: ["permit_id_required"] };
  }

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // Step 3: load the existing row.
    const existingRows = (await db
      .select()
      .from(vmiPermits)
      .where(eq(vmiPermits.id, permitId))
      .limit(1)) as AnyRecord[];
    const existing = existingRows[0];
    if (!existing) {
      return { ok: false as const, errors: ["not_found"] };
    }

    // Step 4: plain guarded update — fields not supplied are left
    // unchanged (no version history to close/reopen for this table).
    const [updatedRow] = (await db
      .update(vmiPermits)
      .set({
        permitNumber: data.permitNumber ?? existing.permitNumber,
        itemScope: data.itemScope ?? existing.itemScope,
        validFrom: data.validFrom ?? existing.validFrom,
        validTo: data.validTo ?? existing.validTo,
        monthlyFeeUsd: data.monthlyFeeUsd ?? existing.monthlyFeeUsd,
        isActive: data.isActive ?? existing.isActive,
        updatedAt: new Date(),
      })
      .where(eq(vmiPermits.id, permitId))
      .returning()) as AnyRecord[];

    return { ok: true as const, permit: toSnapshot(updatedRow) };
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// listVmiPermits — returns ALL permits (active and inactive) for one party,
// since an edit screen needs to show permit history, not just the active
// set.
// ---------------------------------------------------------------------------

export async function listVmiPermits(
  resolver: RequestAuthorizationResolver,
  partyId: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<ListVmiPermitsResult> {
  // Step 1: base authorization — vmi_permits.read.
  const perm = await requirePermission(resolver, "vmi_permits.read");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  if (typeof partyId !== "string" || partyId.length === 0) {
    return { ok: false, errors: ["party_id_required"] };
  }

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    const rows = (await db
      .select()
      .from(vmiPermits)
      .where(eq(vmiPermits.partyId, partyId))) as AnyRecord[];

    return { ok: true as const, permits: rows.map(toSnapshot) };
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}
