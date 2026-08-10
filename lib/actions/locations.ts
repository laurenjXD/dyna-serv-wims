// Location server actions — create, update, deactivate.
//
// Traceability:
//   specs/06-party-and-item-enrollment/requirements.md R3, R6.1, R6.7
//   specs/06-party-and-item-enrollment/design.md §4 (Command boundary),
//     §6a (Location model and workflows)
//   specs/00-steering/tech.md — RBAC from session, never from client params
//
// Key contract points:
//   - locations.manage is Administrator-only; locations.read is global read gate
//   - Label is always server-computed via generateLocationLabel (never client-supplied)
//   - Label uniqueness is re-validated on both create and edit
//   - Stale-edit uses created_at (locations has no updated_at column in approved §01 schema)
//   - No location mutation may enter the offline queue (requirements.md R7.3, design.md §9)

import { eq, and, ne } from "drizzle-orm";
import type { RequestAuthorizationResolver } from "@/lib/rbac/session";
import { requirePermission } from "@/lib/rbac/guard";
import {
  parseLocationInput,
  generateLocationLabel,
} from "@/lib/enrollment/location-schema";
import { locations } from "@/lib/db/schema/locations";
import { withRlsTransaction } from "@/lib/db/rls-transaction";
import type { RlsTransactionDeps } from "@/lib/db/rls-transaction";
import { rlsPool } from "@/lib/db/rls-pool";
import { getAuthenticatedSession } from "@/lib/auth/get-authenticated-session";

const defaultRlsDeps: RlsTransactionDeps = {
  getAuthenticatedSession,
  pool: rlsPool,
};

// ---------------------------------------------------------------------------
// Shared result types
// ---------------------------------------------------------------------------

export type ActionCreateLocationResult =
  | { ok: true; data: { id: string; label: string } }
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
// Authorization helper
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
// createLocation
// ---------------------------------------------------------------------------

/**
 * Creates a location. Requires locations.manage (Administrator only).
 * Server computes label from rack/level/position via generateLocationLabel;
 * never accepts a client-supplied label.
 * Validates label uniqueness before insert.
 * Returns { ok: true, data: { id, label } } on success so the caller can
 * display the confirmed server-generated label.
 */
export async function createLocation(
  resolver: RequestAuthorizationResolver,
  input: unknown,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<ActionCreateLocationResult> {
  const denied = await checkPermission(resolver, "locations.manage");
  if (denied) return denied;

  // Validate input (parseLocationInput ignores any client-supplied label field)
  const parsed = parseLocationInput(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const err of parsed.errors) {
      fieldErrors[err.field] = err.message;
    }
    return { ok: false, fieldErrors };
  }

  const data = parsed.data;

  // Server-compute the canonical label (design.md §6a Create step 3)
  const label = generateLocationLabel(data.rack, data.level, data.position);

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // Label uniqueness check (design.md §6a Create step 4)
    const existing = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.label, label));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((existing as any[]).length > 0) {
      return {
        ok: false,
        fieldErrors: { label: "Label already in use" },
      } satisfies ActionCreateLocationResult;
    }

    const [inserted] = await db
      .insert(locations)
      .values({
        zone: data.zone,
        rack: data.rack,
        level: data.level,
        position: data.position,
        label,
        locationType: data.locationType,
        maxCbmCapacity: data.maxCbmCapacity,
        isActive: data.isActive,
      })
      .returning({ id: locations.id, label: locations.label });

    const row = inserted as { id: string; label: string };

    return {
      ok: true,
      data: { id: row.id, label: row.label },
    } satisfies ActionCreateLocationResult;
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, error: "Forbidden" };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// updateLocation
// ---------------------------------------------------------------------------

/**
 * Updates a location. Requires locations.manage.
 * Stale-edit guard uses created_at (locations has no updated_at column in
 * the approved 01-core-data-model schema).
 * Recomputes and re-validates label uniqueness when rack/level/position change.
 */
export async function updateLocation(
  resolver: RequestAuthorizationResolver,
  id: string,
  input: unknown,
  submittedUpdatedAt: string,
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<ActionResult> {
  const denied = await checkPermission(resolver, "locations.manage");
  if (denied) return denied;

  const parsed = parseLocationInput(input);
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

    // Fetch current row for stale-edit check (uses created_at as version token)
    const [currentRow] = await db
      .select({
        id: locations.id,
        label: locations.label,
        created_at: locations.createdAt,
      })
      .from(locations)
      .where(eq(locations.id, id))
      .limit(1);

    if (!currentRow) {
      return { ok: false, error: "Not found" } satisfies ActionResult;
    }

    const row = currentRow as { id: string; label: string; created_at: Date };

    // Stale-edit guard (created_at used as version token for locations)
    const dbTimestamp = row.created_at.getTime();
    const submittedTimestamp = new Date(submittedUpdatedAt).getTime();
    if (dbTimestamp !== submittedTimestamp) {
      return { ok: false, error: "Conflict" } satisfies ActionResult;
    }

    // Recompute label and re-validate uniqueness, excluding current row's id
    const newLabel = generateLocationLabel(data.rack, data.level, data.position);
    const collision = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.label, newLabel), ne(locations.id, id)));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((collision as any[]).length > 0) {
      return {
        ok: false,
        fieldErrors: { label: "Label already in use" },
      } satisfies ActionResult;
    }

    await db
      .update(locations)
      .set({
        zone: data.zone,
        rack: data.rack,
        level: data.level,
        position: data.position,
        label: newLabel,
        locationType: data.locationType,
        maxCbmCapacity: data.maxCbmCapacity,
        isActive: data.isActive,
      })
      .where(eq(locations.id, id))
      .returning({ id: locations.id });

    return { ok: true } satisfies ActionResult;
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, error: "Forbidden" };
  }
  return rlsResult.value;
}

// ---------------------------------------------------------------------------
// deactivateLocation
// ---------------------------------------------------------------------------

/**
 * Deactivates a location (sets is_active = false). Requires locations.manage.
 * Warn-not-block: succeeds even when locationHasOperationalRecords returns true.
 * Existing lot_location_balances are NOT recomputed or reassigned — deactivation
 * only gates new use of the inactive location in putaway/placement workflows.
 */
export async function deactivateLocation(
  resolver: RequestAuthorizationResolver,
  id: string,
  deps?: {
    locationHasOperationalRecords?: (
      db: DbLike,
      locationId: string,
    ) => Promise<boolean>;
  },
  rlsDeps: RlsTransactionDeps = defaultRlsDeps,
): Promise<ActionSimpleResult> {
  const denied = await checkPermission(resolver, "locations.manage");
  if (denied) return denied;

  const rlsResult = await withRlsTransaction(rlsDeps, async (tx) => {
    const db = tx.db as DbLike;

    // Evaluate impact (warn-not-block — result is intentionally unused here)
    if (deps?.locationHasOperationalRecords) {
      await deps.locationHasOperationalRecords(db, id);
    }

    await db
      .update(locations)
      .set({ isActive: false })
      .where(eq(locations.id, id))
      .returning({ id: locations.id });

    return { ok: true } satisfies ActionSimpleResult;
  });

  if (rlsResult.kind === "unauthenticated") {
    return { ok: false, error: "Forbidden" };
  }
  return rlsResult.value;
}
