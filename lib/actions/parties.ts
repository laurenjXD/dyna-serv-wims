"use server";
// Party server actions — create, update, deactivate, role management, contact.
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md R1, R2, R1.9, R6.1, R6.3, R6.8
//   specs/06-party-and-item-enrollment/design.md §4 (Command boundary), §5 (Party model),
//     §5a (Contact Party email action)
//   specs/00-steering/tech.md — RBAC from session, never from client params

import { and, eq, ne } from "drizzle-orm";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import { parsePartyInput } from "@/lib/enrollment/party-schema";
import {
  validatePartyRoleValue,
  checkDuplicatePartyRole,
} from "@/lib/enrollment/party-roles";
import {
  validatePartyEmailPresence,
  buildContactPartyPayload,
} from "@/lib/enrollment/contact-party";
import type { ContactPartyEmailPayload } from "@/lib/enrollment/contact-party";
import { parties, partyRoles } from "@/lib/db/schema/parties";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";

const defaultRlsDeps: RlsTransactionDeps = {
  getAuthenticatedSession,
  pool: rlsPool,
};

// Re-export for callers that import from this module.
export type { ContactPartyEmailPayload };

// ---------------------------------------------------------------------------
// Shared result types
// ---------------------------------------------------------------------------

export type ActionCreateResult =
  | { ok: true; data: { id: string } }
  | { ok: false; error: string }
  | { ok: false; fieldErrors: Record<string, string> };

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string }
  | { ok: false; fieldErrors: Record<string, string> };

export type ActionSimpleResult = { ok: true } | { ok: false; error: string };

// Minimal structural type that both the real Drizzle db instance and test
// stubs satisfy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbLike = { [key: string]: (...args: any[]) => any };

// ---------------------------------------------------------------------------
// Authorization helper — returns a forbidden result or null if authorized.
// ---------------------------------------------------------------------------
async function checkPermission(
  resolver: RequestAuthorizationResolver,
  capability: string,
): Promise<{ ok: false; error: string } | null> {
  const perm = await requirePermission(resolver, capability);
  if (perm.kind !== "authorized") {
    return { ok: false, error: "Forbidden" };
  }
  return null;
}

// ---------------------------------------------------------------------------
// createParty
// ---------------------------------------------------------------------------

/**
 * Creates a party. Requires parties.manage.
 * Validates input via parsePartyInput, then inserts via db.
 */
export async function createParty(
  resolver: RequestAuthorizationResolver,
  input: unknown,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<ActionCreateResult> {
  const denied = await checkPermission(resolver, "parties.manage");
  if (denied) return denied;

  const parsed = parsePartyInput(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const err of parsed.errors) {
      fieldErrors[err.field] = err.message;
    }
    return { ok: false, fieldErrors };
  }

  const data = parsed.data;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // Duplicate-code check (code has a DB-level UNIQUE constraint) —
    // without this, a collision throws a raw, uncaught Postgres
    // constraint-violation error straight out of the Server Action instead
    // of a friendly field error. Same pattern as createLocation's label
    // uniqueness check (lib/actions/locations.ts).
    const existing = await db
      .select({ id: parties.id })
      .from(parties)
      .where(eq(parties.code, data.code));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((existing as any[]).length > 0) {
      return {
        ok: false,
        fieldErrors: { code: "This party code is already in use." },
      } satisfies ActionCreateResult;
    }

    const [inserted] = await db
      .insert(parties)
      .values({
        code: data.code,
        name: data.name,
        contactPerson: data.contactPerson ?? undefined,
        email: data.email ?? undefined,
        phone: data.phone ?? undefined,
        taxId: data.taxId ?? undefined,
        // Schema column is address_1 (address1 in Drizzle) — there is no
        // "address" column. This previously silently dropped every party's
        // address on save.
        address1: data.address ?? undefined,
        notes: data.notes ?? undefined,
        isActive: data.isActive,
      })
      .returning({ id: parties.id });

    return { ok: true, data: { id: inserted.id } } satisfies ActionCreateResult;
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, error: "Forbidden" };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// updateParty
// ---------------------------------------------------------------------------

/**
 * Updates a party. Requires parties.manage.
 * Stale-edit guard: compares submittedUpdatedAt against the current DB row's
 * updated_at — returns { ok: false, error: "Conflict" } on mismatch.
 */
export async function updateParty(
  resolver: RequestAuthorizationResolver,
  id: string,
  input: unknown,
  submittedUpdatedAt: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<ActionResult> {
  const denied = await checkPermission(resolver, "parties.manage");
  if (denied) return denied;

  const parsed = parsePartyInput(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const err of parsed.errors) {
      fieldErrors[err.field] = err.message;
    }
    return { ok: false, fieldErrors };
  }

  const data = parsed.data;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // Fetch current row for stale-edit check
    const [currentRow] = await db
      .select({ id: parties.id, updated_at: parties.updatedAt })
      .from(parties)
      .where(eq(parties.id, id))
      .limit(1);

    if (!currentRow) {
      return { ok: false, error: "Not found" } satisfies ActionResult;
    }

    // Stale-edit guard
    const dbTimestamp = (currentRow as { updated_at: Date }).updated_at.getTime();
    const submittedTimestamp = new Date(submittedUpdatedAt).getTime();
    if (dbTimestamp !== submittedTimestamp) {
      return { ok: false, error: "Conflict" } satisfies ActionResult;
    }

    // Duplicate-code check, excluding this row itself — same reasoning as
    // createParty above.
    const collision = await db
      .select({ id: parties.id })
      .from(parties)
      .where(and(eq(parties.code, data.code), ne(parties.id, id)));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((collision as any[]).length > 0) {
      return {
        ok: false,
        fieldErrors: { code: "This party code is already in use." },
      } satisfies ActionResult;
    }

    await db
      .update(parties)
      .set({
        code: data.code,
        name: data.name,
        contactPerson: data.contactPerson ?? undefined,
        email: data.email ?? undefined,
        phone: data.phone ?? undefined,
        taxId: data.taxId ?? undefined,
        // Schema column is address_1 (address1 in Drizzle) — see createParty.
        address1: data.address ?? undefined,
        notes: data.notes ?? undefined,
        isActive: data.isActive,
      })
      .where(eq(parties.id, id))
      .returning({ id: parties.id });

    return { ok: true } satisfies ActionResult;
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, error: "Forbidden" };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// deactivateParty
// ---------------------------------------------------------------------------

/**
 * Deactivates a party (sets is_active = false). Requires parties.manage.
 * Warn-not-block: deactivation succeeds even when the party has operational
 * records — blocking only applies to new use of the inactive party in
 * downstream workflows, not to the deactivation action itself.
 */
export async function deactivateParty(
  resolver: RequestAuthorizationResolver,
  id: string,
  deps?: {
    partyHasOperationalRecords?: (
      db: DbLike,
      partyId: string,
    ) => Promise<boolean>;
  },
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<ActionSimpleResult> {
  const denied = await checkPermission(resolver, "parties.manage");
  if (denied) return denied;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // Evaluate impact (warn-not-block — result is intentionally unused here;
    // the downstream UI/UX layer uses it to present a warning, not a gate).
    if (deps?.partyHasOperationalRecords) {
      await deps.partyHasOperationalRecords(db, id);
    }

    await db
      .update(parties)
      .set({ isActive: false })
      .where(eq(parties.id, id))
      .returning({ id: parties.id });

    return { ok: true } satisfies ActionSimpleResult;
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, error: "Forbidden" };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// addPartyRole
// ---------------------------------------------------------------------------

/**
 * Adds a party_roles record. Requires parties.manage.
 * Validates role value via validatePartyRoleValue, checks duplicates via
 * checkDuplicatePartyRole (no DB-level unique constraint — server must enforce).
 */
export async function addPartyRole(
  resolver: RequestAuthorizationResolver,
  partyId: string,
  role: unknown,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<ActionSimpleResult> {
  const denied = await checkPermission(resolver, "parties.manage");
  if (denied) return denied;

  // Validate the role value (rejects application-user role names)
  const roleValidation = validatePartyRoleValue(role);
  if (!roleValidation.valid) {
    return { ok: false, error: roleValidation.reason };
  }

  const validRole = role as string;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // Fetch existing roles for duplicate detection
    const existingRows = await db
      .select({ role: partyRoles.role })
      .from(partyRoles)
      .where(eq(partyRoles.partyId, partyId));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existingRoleValues = (existingRows as any[]).map(
      (r) => r.role,
    ) as import("@/lib/enrollment/party-roles").PartyRoleValue[];

    const duplicateCheck = checkDuplicatePartyRole(
      existingRoleValues,
      validRole as import("@/lib/enrollment/party-roles").PartyRoleValue,
    );
    if (duplicateCheck.isDuplicate) {
      return { ok: false, error: duplicateCheck.reason } satisfies ActionSimpleResult;
    }

    await db
      .insert(partyRoles)
      .values({ partyId, role: validRole })
      .returning({ id: partyRoles.id });

    return { ok: true } satisfies ActionSimpleResult;
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, error: "Forbidden" };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// removePartyRole
// ---------------------------------------------------------------------------

/**
 * Removes a party_roles record by its row id. Requires parties.manage.
 */
export async function removePartyRole(
  resolver: RequestAuthorizationResolver,
  partyId: string,
  roleRowId: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<ActionSimpleResult> {
  const denied = await checkPermission(resolver, "parties.manage");
  if (denied) return denied;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // Scope DELETE by both roleRowId AND partyId — prevents cross-party deletion
    // by a caller who supplies a roleRowId belonging to a different party.
    await db
      .delete(partyRoles)
      .where(and(eq(partyRoles.id, roleRowId), eq(partyRoles.partyId, partyId)));

    return { ok: true } satisfies ActionSimpleResult;
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, error: "Forbidden" };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// contactParty
// ---------------------------------------------------------------------------

/**
 * Sends a Contact Party operational email. Requires parties.manage.
 * Resolves party.email server-side; rejects if null/empty.
 * sendEmail is injectable so tests can stub the Resend pipeline call.
 * Failure from sendEmail is caught (fail-open per 04-services design) —
 * the action never blocks, holds, or reverses party record state on send failure.
 */
export async function contactParty(
  resolver: RequestAuthorizationResolver,
  partyId: string,
  sendEmail: (payload: ContactPartyEmailPayload) => Promise<void>,
  message?: string | null,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<ActionSimpleResult> {
  const denied = await checkPermission(resolver, "parties.manage");
  if (denied) return denied;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // Resolve party email server-side — recipient is never client-supplied (R6.3)
    const [partyRow] = await db
      .select({
        id: parties.id,
        email: parties.email,
        contact_person: parties.contactPerson,
      })
      .from(parties)
      .where(eq(parties.id, partyId))
      .limit(1);

    if (!partyRow) {
      return { ok: false, error: "Party not found." } satisfies ActionSimpleResult;
    }

    const raw = partyRow as {
      id: string;
      email: string | null;
      contact_person: string | null;
    };

    // Validate email presence (R1.9)
    const emailCheck = validatePartyEmailPresence(raw.email);
    if (!emailCheck.ok) {
      return emailCheck;
    }

    // Build payload with server-resolved data only (R6.3)
    const payload = buildContactPartyPayload(
      {
        id: raw.id,
        email: raw.email as string,
        contactPerson: raw.contact_person ?? null,
      },
      message,
    );

    // Invoke 04's existing Resend pipeline — fail-open (design.md §5a step 5)
    try {
      await sendEmail(payload);
    } catch {
      // Silently swallow send errors — party record state is never altered by
      // a send failure. Retry is handled by 04's async-retry infrastructure.
    }

    return { ok: true } satisfies ActionSimpleResult;
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, error: "Forbidden" };
  }
  return rlsResult.value;
}
