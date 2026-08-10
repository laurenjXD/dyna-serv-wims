"use server";
// Transfer server actions — createTransfer, updateTransferStatus,
// openInspectionCase, resolveInspectionCase.
//
// Traceability:
//   specs/11-transfer-and-inspection/requirements.md R1.1 — authorized user
//     SHALL be able to request movement from one source to one destination.
//   specs/11-transfer-and-inspection/requirements.md R1.3 — source and
//     destination SHALL be distinct and valid.
//   specs/11-transfer-and-inspection/requirements.md R3.1 — system SHALL
//     maintain a single shared inspection record structure.
//   specs/11-transfer-and-inspection/requirements.md R3.4 — transfer-specific
//     non-conformance SHALL block completion or route to exception path.
//   specs/11-transfer-and-inspection/requirements.md R8.1 — every transfer
//     read and mutation SHALL use current capability, party/flow scope.
//   specs/11-transfer-and-inspection/requirements.md R8.2 — client-supplied
//     values SHALL not establish authorization.
//   specs/11-transfer-and-inspection/design.md §4 — transfer state and
//     command boundaries.
//   specs/11-transfer-and-inspection/design.md §6.1 — inspection contexts
//     and available dispositions per context type.
//   specs/11-transfer-and-inspection/design.md §6.3 — failed inspection
//     disposition table with balance effects.
//   specs/00-steering/tech.md — RBAC always from session, never client params.

import { eq } from "drizzle-orm";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { validateCreateTransfer } from "@/lib/transfer/transfer-validator";
import { validateInspectionDisposition } from "@/lib/transfer/inspection-state";
import {
  transferRequests,
  inspectionCases,
  inspectionDispositions,
} from "@/lib/db/schema/transfers";
import { getTransferRequest } from "@/lib/db/queries/transfers";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";

const defaultRlsDeps: RlsTransactionDeps = {
  getAuthenticatedSession,
  pool: rlsPool,
};

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy. Uses named method properties (not an index signature) so
// that PostgresJsDatabase, which has no index signature, is assignable here.
/* eslint-disable @typescript-eslint/no-explicit-any */
type DbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
};

type AnyRecord = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type CreateTransferActionResult =
  | { ok: true; transferId: string }
  | { ok: false; errors: string[] };

export type UpdateStatusResult =
  | { ok: true }
  | { ok: false; reason: string };

export type OpenCaseResult =
  | { ok: true; caseId: string }
  | { ok: false; reason: string };

export type ResolveCaseResult =
  | { ok: true }
  | { ok: false; errors: string[] };

// ---------------------------------------------------------------------------
// Terminal status mapping for inspection dispositions (design.md §6.3)
// ---------------------------------------------------------------------------

const PASSING_DISPOSITIONS = new Set([
  "store",
  "return_to_stock",
  "return_to_origin",
]);

function terminalStatusForDisposition(dispositionType: string): "passed" | "failed" {
  return PASSING_DISPOSITIONS.has(dispositionType) ? "passed" : "failed";
}

// ---------------------------------------------------------------------------
// createTransfer
// ---------------------------------------------------------------------------

/**
 * Creates a new internal transfer request (status = 'staged').
 * Requires transfer.request capability.
 * Validates input via validateCreateTransfer before any DB write.
 * Returns { ok: true, transferId } on success.
 */
export async function createTransfer(
  resolver: RequestAuthorizationResolver,
  input: unknown,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<CreateTransferActionResult> {
  // 1. Authorization
  const perm = await requirePermission(resolver, "transfer.request");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  // 2. Input validation (before any DB write)
  const validation = validateCreateTransfer(input);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors };
  }

  const data = validation.data;
  const userId = perm.context.userId;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // 3. INSERT into transfer_requests
    const [inserted] = await db
      .insert(transferRequests)
      .values({
        fromLocationId: data.fromLocationId,
        toLocationId: data.toLocationId,
        flowType: data.flowType,
        status: "staged",
        reason: data.reason ?? null,
        requiresApproval: data.requiresApproval ?? false,
        requestedBy: userId,
      })
      .returning();

    // 4. Return result
    return { ok: true, transferId: (inserted as { id: string }).id } as const;
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// updateTransferStatus
// ---------------------------------------------------------------------------

/**
 * Updates the status of a transfer request.
 * Requires transfer.execute capability.
 * Returns { ok: false, reason: 'not_found' } when the transfer does not exist.
 */
export async function updateTransferStatus(
  resolver: RequestAuthorizationResolver,
  transferId: string,
  newStatus: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<UpdateStatusResult> {
  // 1. Authorization
  const perm = await requirePermission(resolver, "transfer.execute");
  if (perm.kind !== "authorized") {
    return { ok: false, reason: "forbidden" };
  }

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // 2. Load transfer
    const transfer = await getTransferRequest(db, transferId);
    if (transfer === null) {
      return { ok: false, reason: "not_found" } as const;
    }

    // 3. UPDATE status
    await db
      .update(transferRequests)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(transferRequests.id, transferId));

    return { ok: true } as const;
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, reason: "forbidden" };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// openInspectionCase
// ---------------------------------------------------------------------------

/**
 * Opens a new inspection case for a transfer line or WRR item.
 * Requires inspection.perform capability.
 * Returns { ok: true, caseId } on success.
 */
export async function openInspectionCase(
  resolver: RequestAuthorizationResolver,
  input: {
    sourceRefType: string;
    sourceRefId: string;
    lotId: string;
    itemId: string;
    partyId: string;
    flowType: string;
    contextType: string;
  },
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<OpenCaseResult> {
  // 1. Authorization
  const perm = await requirePermission(resolver, "inspection.perform");
  if (perm.kind !== "authorized") {
    return { ok: false, reason: "forbidden" };
  }

  const userId = perm.context.userId;
  const now = new Date();

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // 2. INSERT into inspection_cases
    const [inserted] = await db
      .insert(inspectionCases)
      .values({
        contextType: input.contextType,
        sourceRefType: input.sourceRefType,
        sourceRefId: input.sourceRefId,
        lotId: input.lotId,
        itemId: input.itemId,
        partyId: input.partyId,
        flowType: input.flowType,
        status: "open",
        openedBy: userId,
        openedAt: now,
      })
      .returning();

    return { ok: true, caseId: (inserted as { id: string }).id } as const;
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, reason: "forbidden" };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// resolveInspectionCase
// ---------------------------------------------------------------------------

/**
 * Resolves an inspection case with a disposition.
 * Requires inspection.resolve capability (supervisor-only — two-person separation
 * per 02-rbac-roles §3.2; warehouse_staff may open cases but not resolve them).
 * Validates case is 'open' via validateInspectionDisposition before any DB write.
 * Updates case to terminal status and inserts a disposition record.
 */
export async function resolveInspectionCase(
  resolver: RequestAuthorizationResolver,
  caseId: string,
  disposition: {
    dispositionType: string;
    quantityAffected: number;
    notes?: string;
  },
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<ResolveCaseResult> {
  // 1. Authorization — inspection.resolve is supervisor-only (02-rbac-roles §3.2).
  // inspection.perform (warehouse_staff + supervisor) covers opening cases only.
  const perm = await requirePermission(resolver, "inspection.resolve");
  if (perm.kind !== "authorized") {
    return { ok: false, errors: ["forbidden"] };
  }

  const userId = perm.context.userId;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // 2. Load inspection case
    const rows = (await db
      .select()
      .from(inspectionCases)
      .where(eq(inspectionCases.id, caseId))) as AnyRecord[];

    const caseRow = rows.find((r: AnyRecord) => r.id === caseId) ?? null;
    if (caseRow === null) {
      return { ok: false as const, errors: ["not_found"] };
    }

    // 3. Validate disposition via business logic (checks status === 'open', etc.)
    const validationResult = validateInspectionDisposition(
      {
        id: caseRow.id as string,
        status: caseRow.status as string,
        contextType: caseRow.contextType as "inbound" | "transfer",
        sourceRefType: caseRow.sourceRefType as "wrr_item" | "transfer_line",
      },
      {
        dispositionType: disposition.dispositionType,
        quantityAffected: disposition.quantityAffected,
        notes: disposition.notes,
      },
    );
    if (!validationResult.ok) {
      return { ok: false as const, errors: validationResult.errors };
    }

    // 4. Determine terminal status
    const terminalStatus = terminalStatusForDisposition(disposition.dispositionType);
    const now = new Date();

    // 5. UPDATE inspection_cases to terminal status
    await db
      .update(inspectionCases)
      .set({
        status: terminalStatus,
        resolvedBy: userId,
        resolvedAt: now,
      })
      .where(eq(inspectionCases.id, caseId));

    // 6. INSERT inspection disposition record
    await db
      .insert(inspectionDispositions)
      .values({
        inspectionCaseId: caseId,
        dispositionType: disposition.dispositionType,
        quantityAffected: String(disposition.quantityAffected),
        notes: disposition.notes ?? null,
        appliedBy: userId,
        appliedAt: now,
      })
      .returning();

    return { ok: true as const };
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, errors: ["forbidden"] };
  }
  return rlsResult.value;
}
